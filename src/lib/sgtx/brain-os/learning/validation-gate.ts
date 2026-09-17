// SGTX Brain OS — Validation Gate
// New knowledge must be validated before production deployment.
// Validates candidate models against held-out test sets + constitutional rules,
// and supports shadow evaluation against the production model.

import type { ModelAdapter, InferenceRequest } from "../core/types";
import { moduleRegistry } from "../core/module-registry";
import { modelRegistry } from "./model-registry";
import { now } from "../core/utils";

interface ValidateInput {
  modelId: string;
  testCases: { input: any; expected: any }[];
  constitutionalRules?: Array<{ name: string; check: (output: any) => boolean }>;
}

interface ValidateResult {
  passed: boolean;
  accuracy: number;
  constitutionalViolations: string[];
  recommendation: "deploy" | "hold" | "reject";
  sampleSize: number;
  details: { caseIndex: number; passed: boolean; expected: any; actual: any }[];
  evaluatedAt: string;
}

interface ShadowEvaluateInput {
  candidateModelId: string;
  productionModelId: string;
  sampleSize: number;
}

interface ShadowEvaluateResult {
  agreement: number;
  candidateLatencyMs: number;
  productionLatencyMs: number;
  sampleSize: number;
  recommendation: string;
  evaluatedAt: string;
}

// Resolve a model to its adapter via moduleRegistry
function resolveAdapter(modelId: string): ModelAdapter {
  // Try direct adapter lookup first
  const direct = moduleRegistry.getAdapter(modelId);
  if (direct) return direct;

  // Then look up by model name in the adapters list
  const model = modelRegistry.getModel(modelId);
  if (model) {
    for (const a of moduleRegistry.listAdapters()) {
      if (a.model === model.modelName || a.id === model.modelName) {
        const adapter = moduleRegistry.getAdapter(a.id);
        if (adapter) return adapter;
      }
    }
  }
  throw new Error(`No adapter resolvable for model ${modelId}`);
}

class ValidationGateImpl {
  /**
   * Validate a candidate model against a held-out test set + constitutional rules.
   * Returns pass/fail, accuracy, constitutional violations, and a deploy/hold/reject recommendation.
   */
  async validate(input: ValidateInput): Promise<ValidateResult> {
    const model = modelRegistry.getModel(input.modelId);
    if (!model) {
      return {
        passed: false,
        accuracy: 0,
        constitutionalViolations: [`Model ${input.modelId} not registered`],
        recommendation: "reject",
        sampleSize: 0,
        details: [],
        evaluatedAt: now(),
      };
    }

    let adapter: ModelAdapter;
    try {
      adapter = resolveAdapter(input.modelId);
    } catch (err: any) {
      return {
        passed: false,
        accuracy: 0,
        constitutionalViolations: [`Adapter resolution failed: ${err.message}`],
        recommendation: "reject",
        sampleSize: 0,
        details: [],
        evaluatedAt: now(),
      };
    }

    const details: ValidateResult["details"] = [];
    let correct = 0;
    const constitutionalViolations: string[] = [];

    for (let i = 0; i < input.testCases.length; i++) {
      const tc = input.testCases[i];
      let actual: any;
      try {
        const request: InferenceRequest = {
          systemPrompt: "You are being validated. Return JSON only.",
          userPrompt: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
          authority: "A3",
          responseFormat: "json",
        };
        const result = await adapter.infer(request);
        actual = result.structured ?? this.tryParseJson(result.content) ?? result.content;
      } catch (err: any) {
        actual = { __error: err.message };
      }

      const passed = this.deepEqual(actual, tc.expected);
      if (passed) correct++;
      details.push({ caseIndex: i, passed, expected: tc.expected, actual });

      // Constitutional rule checks
      if (input.constitutionalRules) {
        for (const rule of input.constitutionalRules) {
          try {
            if (!rule.check(actual)) {
              constitutionalViolations.push(`Case ${i}: ${rule.name}`);
            }
          } catch {
            constitutionalViolations.push(`Case ${i}: ${rule.name} (check threw)`);
          }
        }
      }
    }

    const accuracy = input.testCases.length > 0 ? correct / input.testCases.length : 0;
    const hasViolations = constitutionalViolations.length > 0;
    const passed = accuracy >= 0.8 && !hasViolations;

    let recommendation: ValidateResult["recommendation"];
    if (hasViolations || accuracy < 0.5) {
      recommendation = "reject";
      modelRegistry.markRejected(input.modelId);
    } else if (passed) {
      recommendation = "deploy";
      modelRegistry.markValidated(input.modelId);
    } else {
      recommendation = "hold";
    }

    // Update model metrics
    model.performanceMetrics.accuracy = accuracy;
    model.performanceMetrics.sampleSize = input.testCases.length;

    return {
      passed,
      accuracy,
      constitutionalViolations,
      recommendation,
      sampleSize: input.testCases.length,
      details,
      evaluatedAt: now(),
    };
  }

  /**
   * Shadow evaluation: run candidate alongside production for N requests and compare agreement.
   * Uses synthetic probes derived from feedback history (or random samples) — never user traffic.
   */
  async shadowEvaluate(input: ShadowEvaluateInput): Promise<ShadowEvaluateResult> {
    const candidateModel = modelRegistry.getModel(input.candidateModelId);
    const productionModel = modelRegistry.getModel(input.productionModelId);
    if (!candidateModel || !productionModel) {
      return {
        agreement: 0,
        candidateLatencyMs: 0,
        productionLatencyMs: 0,
        sampleSize: 0,
        recommendation: `reject: model not found (candidate=${!!candidateModel}, production=${!!productionModel})`,
        evaluatedAt: now(),
      };
    }

    let candidateAdapter: ModelAdapter;
    let productionAdapter: ModelAdapter;
    try {
      candidateAdapter = resolveAdapter(input.candidateModelId);
      productionAdapter = resolveAdapter(input.productionModelId);
    } catch (err: any) {
      return {
        agreement: 0,
        candidateLatencyMs: 0,
        productionLatencyMs: 0,
        sampleSize: 0,
        recommendation: `reject: ${err.message}`,
        evaluatedAt: now(),
      };
    }

    // Generate synthetic probe inputs (deterministic, derived from model name)
    const probes = this.generateProbes(candidateModel.modelName, input.sampleSize);

    let agreements = 0;
    let candidateLatencySum = 0;
    let productionLatencySum = 0;

    for (const probe of probes) {
      const request: InferenceRequest = {
        systemPrompt: "Shadow evaluation probe. Return JSON only.",
        userPrompt: probe,
        authority: "A3",
        responseFormat: "json",
      };

      let candidateOutput: any;
      let productionOutput: any;
      let candidateMs = 0;
      let productionMs = 0;

      try {
        const c = await candidateAdapter.infer(request);
        candidateMs = c.latencyMs;
        candidateOutput = c.structured ?? this.tryParseJson(c.content) ?? c.content;
      } catch (err: any) {
        candidateOutput = { __error: err.message };
      }

      try {
        const p = await productionAdapter.infer(request);
        productionMs = p.latencyMs;
        productionOutput = p.structured ?? this.tryParseJson(p.content) ?? p.content;
      } catch (err: any) {
        productionOutput = { __error: err.message };
      }

      candidateLatencySum += candidateMs;
      productionLatencySum += productionMs;

      if (this.deepEqual(candidateOutput, productionOutput)) {
        agreements++;
      }

      // Feed observation into the registry so evaluatePromotion can use it
      modelRegistry.recordCanaryObservation(input.candidateModelId, this.deepEqual(candidateOutput, productionOutput), candidateMs);
    }

    const sampleSize = probes.length;
    const agreement = sampleSize > 0 ? agreements / sampleSize : 0;
    const candidateLatencyMs = sampleSize > 0 ? candidateLatencySum / sampleSize : 0;
    const productionLatencyMs = sampleSize > 0 ? productionLatencySum / sampleSize : 0;

    let recommendation: string;
    if (agreement >= 0.95 && candidateLatencyMs <= productionLatencyMs * 1.2) {
      recommendation = "deploy: high agreement and acceptable latency";
    } else if (agreement >= 0.85) {
      recommendation = "hold: moderate agreement — extend shadow period";
    } else {
      recommendation = "reject: agreement below 85% — investigate divergence";
    }

    // Update model metrics with shadow results
    candidateModel.performanceMetrics.accuracy = agreement;
    candidateModel.performanceMetrics.latencyMs = candidateLatencyMs;
    candidateModel.performanceMetrics.sampleSize = sampleSize;

    return {
      agreement,
      candidateLatencyMs,
      productionLatencyMs,
      sampleSize,
      recommendation,
      evaluatedAt: now(),
    };
  }

  /** Best-effort deep equality (handles primitives, arrays, plain objects). */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a == b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => this.deepEqual(v, b[i]));
    }
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => this.deepEqual(a[k], b[k]));
  }

  private tryParseJson(s: string): any {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  /** Generate deterministic synthetic probe prompts for shadow evaluation. */
  private generateProbes(seed: string, count: number): string[] {
    const probes: string[] = [];
    const baseInputs = [
      "Assess risk for trade: coffee, EG→DE, $50k",
      "Classify HS code for: laptop, 14-inch, with battery",
      "Required documents for: SA→AE, beef, sea freight",
      "Quote fee for: cotton, IN→US, $120k, letter of credit",
      "Compliance check: wood furniture, CN→DE, FSC required?",
      "Sanctions screening: buyer in AE, seller in EG",
      "Force majeure assessment: port strike at Rotterdam",
      "Estimate duty: electronics, CN→US, HS 8471, $80k",
      "Required insurance: chemicals, BR→IN, sea freight",
      "Phyto requirement: oranges, ES→SA",
    ];
    for (let i = 0; i < count; i++) {
      const base = baseInputs[i % baseInputs.length];
      probes.push(`${base} [probe ${i} seed=${seed}]`);
    }
    return probes;
  }
}

export const validationGate = new ValidationGateImpl();
export { ValidationGateImpl };
