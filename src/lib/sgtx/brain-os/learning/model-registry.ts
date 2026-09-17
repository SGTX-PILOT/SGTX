// SGTX Brain OS — Model Registry
// Versioned model registry with deployment lifecycle: candidate → shadow → canary → production.
// Provides promotion gates, demotion, and auto-promotion evaluation based on accuracy metrics.

import type { ModelVersion } from "../core/types";
import { eventBus } from "../core/event-bus";
import { generateId, now } from "../core/utils";
import { feedbackLoop } from "./feedback-loop";

type DeploymentStage = "shadow" | "canary" | "production";

interface RegisterCandidateInput {
  modelName: string;
  version: string;
}

interface PromotionEvaluation {
  shouldPromote: boolean;
  reason: string;
  candidateAccuracy: number;
  productionAccuracy: number;
  sampleSize: number;
}

class ModelRegistryImpl {
  private versions = new Map<string, ModelVersion>();
  private productionModel: ModelVersion | undefined;
  private shadowModels = new Set<string>();
  private canaryModels = new Set<string>();
  // Live performance tracking per canary model (populated by external observers)
  private canaryObservations = new Map<string, { correct: number; total: number; latencySumMs: number }>();

  /** Register a new candidate model. Defaults to "candidate" status pending validation. */
  async registerCandidate(input: RegisterCandidateInput): Promise<ModelVersion> {
    const id = generateId(`model-${input.modelName}`);
    const model: ModelVersion = {
      id,
      modelName: input.modelName,
      version: input.version,
      status: "candidate",
      performanceMetrics: {
        accuracy: 0,
        latencyMs: 0,
        costPerInference: 0,
        sampleSize: 0,
      },
      validationStatus: "pending",
    };
    this.versions.set(id, model);
    return model;
  }

  /**
   * Promote a model through deployment stages.
   * Shadow: run alongside production, compare results, no user impact.
   * Canary: route X% traffic, monitor for regressions.
   * Production: full deployment (demotes any prior production model to "deprecated").
   */
  async promote(modelId: string, stage: DeploymentStage): Promise<void> {
    const model = this.versions.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not registered`);
    if (model.status === "deprecated") {
      throw new Error(`Cannot promote deprecated model ${modelId}`);
    }

    if (stage === "shadow") {
      // Remove from other live sets
      this.canaryModels.delete(modelId);
      model.status = "shadow";
    } else if (stage === "canary") {
      this.shadowModels.delete(modelId);
      model.status = "canary";
      this.canaryModels.add(modelId);
      if (!this.canaryObservations.has(modelId)) {
        this.canaryObservations.set(modelId, { correct: 0, total: 0, latencySumMs: 0 });
      }
    } else if (stage === "production") {
      // Demote prior production model
      if (this.productionModel && this.productionModel.id !== modelId) {
        this.productionModel.status = "deprecated";
        this.productionModel.deployedAt = undefined;
        await eventBus.publish(
          "brain.model.deployed",
          this.productionModel.id,
          { modelId: this.productionModel.id, action: "demoted", from: "production", to: "deprecated" },
          { source: "model-registry" },
        );
      }
      this.shadowModels.delete(modelId);
      this.canaryModels.delete(modelId);
      model.status = "production";
      model.deployedAt = now();
      this.productionModel = model;

      await eventBus.publish(
        "brain.model.deployed",
        model.id,
        { modelId: model.id, modelName: model.modelName, version: model.version, stage: "production" },
        { source: "model-registry" },
      );
    }
  }

  /** Demote a model out of any live stage into "deprecated". */
  async demote(modelId: string): Promise<void> {
    const model = this.versions.get(modelId);
    if (!model) throw new Error(`Model ${modelId} not registered`);

    const priorStage = model.status;
    this.shadowModels.delete(modelId);
    this.canaryModels.delete(modelId);
    this.canaryObservations.delete(modelId);

    if (this.productionModel?.id === modelId) {
      this.productionModel = undefined;
    }

    model.status = "deprecated";
    model.deployedAt = undefined;

    await eventBus.publish(
      "brain.model.deployed",
      model.id,
      { modelId: model.id, action: "demoted", from: priorStage, to: "deprecated" },
      { source: "model-registry" },
    );
  }

  /** Get the current production model (if any). */
  getProductionModel(): ModelVersion | undefined {
    return this.productionModel;
  }

  /** List models, optionally filtered by status. */
  getModels(stage?: ModelVersion["status"]): ModelVersion[] {
    const all = Array.from(this.versions.values());
    return stage ? all.filter(m => m.status === stage) : all;
  }

  /** Record a canary observation (correctness + latency). Called by validation/shadow evaluators. */
  recordCanaryObservation(modelId: string, correct: boolean, latencyMs: number): void {
    const obs = this.canaryObservations.get(modelId);
    if (!obs) return;
    obs.total += 1;
    if (correct) obs.correct += 1;
    obs.latencySumMs += latencyMs;
  }

  /**
   * Evaluate whether a canary model should be auto-promoted to production.
   * Requires minSampleSize observations AND accuracy improvement >= improvementThreshold
   * over the current production model's accuracy (derived from feedback loop).
   */
  async evaluatePromotion(
    modelId: string,
    minSampleSize: number,
    improvementThreshold: number,
  ): Promise<PromotionEvaluation> {
    const model = this.versions.get(modelId);
    if (!model) {
      return { shouldPromote: false, reason: `Model ${modelId} not registered`, candidateAccuracy: 0, productionAccuracy: 0, sampleSize: 0 };
    }
    if (model.status !== "canary") {
      return {
        shouldPromote: false,
        reason: `Model is in ${model.status} stage (canary required)`,
        candidateAccuracy: model.performanceMetrics.accuracy,
        productionAccuracy: this.productionModel?.performanceMetrics.accuracy ?? 0,
        sampleSize: model.performanceMetrics.sampleSize,
      };
    }

    const obs = this.canaryObservations.get(modelId);
    const sampleSize = obs?.total ?? 0;
    const candidateAccuracy = sampleSize > 0 ? obs!.correct / sampleSize : 0;
    const candidateLatencyMs = sampleSize > 0 ? obs!.latencySumMs / sampleSize : 0;

    // Update model metrics in-place so they're queryable
    model.performanceMetrics.accuracy = candidateAccuracy;
    model.performanceMetrics.latencyMs = candidateLatencyMs;
    model.performanceMetrics.sampleSize = sampleSize;

    // Derive production accuracy from feedback loop if production model is associated with a module
    const productionAccuracy =
      this.productionModel?.performanceMetrics.accuracy ??
      feedbackLoop.getAccuracyMetrics().accuracyRate;

    if (sampleSize < minSampleSize) {
      return {
        shouldPromote: false,
        reason: `Insufficient samples: ${sampleSize}/${minSampleSize}`,
        candidateAccuracy,
        productionAccuracy,
        sampleSize,
      };
    }

    const improvement = candidateAccuracy - productionAccuracy;
    if (improvement < improvementThreshold) {
      return {
        shouldPromote: false,
        reason: `Improvement ${(improvement * 100).toFixed(2)}% below threshold ${(improvementThreshold * 100).toFixed(2)}%`,
        candidateAccuracy,
        productionAccuracy,
        sampleSize,
      };
    }

    return {
      shouldPromote: true,
      reason: `Candidate accuracy ${(candidateAccuracy * 100).toFixed(2)}% beats production ${(productionAccuracy * 100).toFixed(2)}% by ${(improvement * 100).toFixed(2)}% over ${sampleSize} samples`,
      candidateAccuracy,
      productionAccuracy,
      sampleSize,
    };
  }

  /** Mark a model as validated (called by validation-gate). */
  markValidated(modelId: string): void {
    const model = this.versions.get(modelId);
    if (model) model.validationStatus = "validated";
  }

  /** Mark a model as rejected (called by validation-gate). */
  markRejected(modelId: string): void {
    const model = this.versions.get(modelId);
    if (model) model.validationStatus = "rejected";
  }

  /** Direct accessor. */
  getModel(modelId: string): ModelVersion | undefined {
    return this.versions.get(modelId);
  }

  /** Reset all registry state (for testing). */
  reset(): void {
    this.versions.clear();
    this.productionModel = undefined;
    this.shadowModels.clear();
    this.canaryModels.clear();
    this.canaryObservations.clear();
  }
}

export const modelRegistry = new ModelRegistryImpl();
export { ModelRegistryImpl };
