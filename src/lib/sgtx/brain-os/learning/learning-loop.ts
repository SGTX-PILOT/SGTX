// SGTX Brain OS — Learning Loop
// The Brain continuously learns from outcome feedback.
// Records successes + failures, derives knowledge, and improves over time.
//
// Shadow model pipeline: on start() the loop activates the singleton
// ShadowPipeline and subscribes to `brain.decision.made` events. Every 100th
// production inference is sampled, a candidate model is run in parallel,
// and the agreement rate is logged + surfaced via the event bus. The
// candidate resolver delegates to the StaticFallbackAdapter — a
// deterministic, always-available baseline model that's useful for
// agreement telemetry (and a real promotion candidate when its agreement
// rate is consistently high).

import type { LearningFeedback, KnowledgeEntry, BrainEvent } from "../core/types";
import { eventBus } from "../core/event-bus";
import { shadowPipeline, type ShadowModelOutput } from "./shadow-pipeline";

class LearningLoopImpl {
  private feedbackStore: LearningFeedback[] = [];
  private knowledgeBase: Map<string, KnowledgeEntry> = new Map();
  private maxFeedback = 100000;
  private started = false;
  private lastShadowLogAt = 0;
  private readonly shadowLogIntervalMs = 60_000; // log agreement rate at most once per minute

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Subscribe to outcome events for auto-feedback collection
    const outcomeEvents = [
      "trade.contract.signed", "trade.dispute.filed", "trade.settled",
      "customs.clearance.approved", "customs.clearance.rejected",
      "qc.inspection.passed", "qc.inspection.failed",
      "payment.settled", "payment.failed",
    ];
    for (const evt of outcomeEvents) {
      eventBus.subscribe("learning-loop", evt, (e) => this.onOutcomeEvent(e));
    }

    // Activate the shadow model pipeline — sample 1-in-100 production
    // inferences and run a candidate model in parallel for agreement-rate
    // telemetry. The candidate resolver delegates to the
    // StaticFallbackAdapter; a real candidate model can be installed later
    // via `shadowPipeline.setResolver(...)`.
    this.activateShadowPipeline();

    // Subscribe to brain.decision.made — every successful capability
    // invocation fires this event, and we feed it into the shadow pipeline
    // as the "production inference" observation.
    eventBus.subscribe("learning-loop", "brain.decision.made", (e) => this.onBrainDecision(e));
  }

  /**
   * Wire the ShadowPipeline's candidate resolver + activate it. The
   * resolver delegates to the StaticFallbackAdapter (deterministic rule-
   * based baseline), constructing a synthetic InferenceRequest from the
   * capability + input. Failures degrade to null (the pipeline skips the
   * sample silently rather than counting it as a disagreement).
   */
  private activateShadowPipeline(): void {
    try {
      shadowPipeline.setResolver(
        async (capability: string, input: unknown): Promise<ShadowModelOutput | null> => {
          try {
            const { staticFallbackAdapter } = await import("../adapters/model-adapters");
            const inputStr =
              typeof input === "string"
                ? input
                : JSON.stringify(input ?? {}).slice(0, 800);
            const result = await staticFallbackAdapter.infer({
              systemPrompt: `Shadow candidate evaluation for capability: ${capability}`,
              userPrompt: inputStr,
              authority: "A1",
            });
            // The static adapter returns a free-text `content`. Wrap it as
            // a decision so the canonical-field comparator falls through to
            // JSON-structural equality (against production outputs that
            // also lack canonical fields). When production *does* expose a
            // canonical field (probability/riskLevel/etc.), the candidate
            // won't have it — this counts as a disagreement, which is the
            // honest signal: the static baseline isn't a real replacement
            // for the AI model, just a deterministic floor.
            return {
              provider: "static-baseline",
              model: "rules-v1",
              decision: { shadowContent: result.content },
              raw: result,
            };
          } catch {
            return null;
          }
        },
      );
      shadowPipeline.start();
    } catch {
      // Shadow pipeline is observational — never block the LearningLoop on
      // an adapter import failure.
    }
  }

  /**
   * Feed every successful Brain capability invocation into the shadow
   * pipeline. The pipeline samples internally (1-in-100) so this is cheap.
   */
  private async onBrainDecision(event: BrainEvent): Promise<void> {
    try {
      const capability = (event.payload as { capability?: string })?.capability;
      if (!capability) return;
      // The orchestrator publishes inputSummary (truncated JSON) — pass it
      // as the input to the candidate resolver. The full input isn't
      // available here, but the candidate is a static-rule baseline that
      // only inspects the capability name + a stringified input.
      const inputSummary = (event.payload as { inputSummary?: string })?.inputSummary;
      await shadowPipeline.observe(capability, inputSummary, event.payload, event.id);
      this.maybeLogShadowStats();
    } catch {
      // Never let the shadow path break the LearningLoop.
    }
  }

  /**
   * Throttled log of the shadow-pipeline agreement rate. Once per minute,
   * surface the current stats so operators can see the candidate's
   * agreement trend in the application logs.
   */
  private maybeLogShadowStats(): void {
    const now = Date.now();
    if (now - this.lastShadowLogAt < this.shadowLogIntervalMs) return;
    this.lastShadowLogAt = now;
    const stats = shadowPipeline.getStats();
    if (stats.sampledEvaluations === 0) return;
    const pct = (stats.agreementRate * 100).toFixed(1);
    console.log(
      `[brain-os.shadow] sampled=${stats.sampledEvaluations} ` +
        `agreements=${stats.agreements} disagreements=${stats.disagreements} ` +
        `agreementRate=${pct}% totalInferences=${stats.totalInferences}`,
    );
  }

  /** Record feedback for a Brain decision. */
  async recordFeedback(input: {
    decisionId: string;
    actualOutcome: "success" | "failure" | "partial";
    outcomeDetails: string;
    expectedOutcome: string;
    feedbackSource?: "system" | "human" | "outcome-monitor";
    deviationScore?: number;
  }): Promise<LearningFeedback> {
    const feedback: LearningFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      decisionId: input.decisionId,
      actualOutcome: input.actualOutcome,
      outcomeDetails: input.outcomeDetails,
      expectedOutcome: input.expectedOutcome,
      deviationScore: input.deviationScore ?? this.computeDeviation(input.actualOutcome, input.expectedOutcome),
      feedbackSource: input.feedbackSource || "system",
      createdAt: new Date().toISOString(),
    };
    this.feedbackStore.push(feedback);
    if (this.feedbackStore.length > this.maxFeedback) this.feedbackStore.shift();

    await eventBus.publish("brain.learning.feedback", feedback.decisionId, feedback, { source: "learning-loop" });

    // Derive knowledge every 50 feedback records
    if (this.feedbackStore.length % 50 === 0) {
      await this.deriveKnowledge();
    }
    return feedback;
  }

  /** Auto-collect feedback from outcome events. */
  private async onOutcomeEvent(event: any): Promise<void> {
    const isFailure = event.type.includes("rejected") || event.type.includes("failed") || event.type.includes("dispute");
    const isSuccess = event.type.includes("signed") || event.type.includes("settled") || event.type.includes("approved") || event.type.includes("passed");

    if (isFailure || isSuccess) {
      await this.recordFeedback({
        decisionId: event.payload?.decisionId || event.id,
        actualOutcome: isFailure ? "failure" : "success",
        outcomeDetails: `${event.type}: ${JSON.stringify(event.payload).substring(0, 200)}`,
        expectedOutcome: "Brain predicted success",
        feedbackSource: "outcome-monitor",
        deviationScore: isFailure ? 0.8 : 0.0,
      });
    }
  }

  /** Derive knowledge patterns from accumulated feedback. */
  private async deriveKnowledge(): Promise<void> {
    // Group feedback by outcome type
    const byOutcome = { success: 0, failure: 0, partial: 0 };
    for (const f of this.feedbackStore) byOutcome[f.actualOutcome]++;

    const total = this.feedbackStore.length;
    if (total === 0) return;

    const successRate = byOutcome.success / total;
    const failureRate = byOutcome.failure / total;

    // Derive knowledge entries
    const entries: KnowledgeEntry[] = [
      {
        id: `kb_brain_accuracy_${Date.now()}`,
        domain: "brain-accuracy",
        pattern: `Brain decision accuracy: ${(successRate * 100).toFixed(1)}% (${byOutcome.success}/${total})`,
        confidence: successRate,
        source: "learning-loop",
        sampleSize: total,
        createdAt: new Date().toISOString(),
      },
      {
        id: `kb_brain_failure_rate_${Date.now()}`,
        domain: "brain-failure-rate",
        pattern: `Brain failure rate: ${(failureRate * 100).toFixed(1)}% (${byOutcome.failure}/${total})`,
        confidence: 1 - failureRate,
        source: "learning-loop",
        sampleSize: total,
        createdAt: new Date().toISOString(),
      },
    ];

    for (const entry of entries) {
      this.knowledgeBase.set(entry.id, entry);
    }
  }

  private computeDeviation(actual: string, expected: string): number {
    if (actual === "success" && expected.includes("success")) return 0.0;
    if (actual === "failure" && expected.includes("success")) return 0.8;
    if (actual === "partial") return 0.5;
    return 0.3;
  }

  getAccuracyMetrics(): { total: number; success: number; failure: number; partial: number; accuracyRate: number } {
    const total = this.feedbackStore.length;
    if (total === 0) return { total: 0, success: 0, failure: 0, partial: 0, accuracyRate: 0 };
    const success = this.feedbackStore.filter(f => f.actualOutcome === "success").length;
    const failure = this.feedbackStore.filter(f => f.actualOutcome === "failure").length;
    const partial = this.feedbackStore.filter(f => f.actualOutcome === "partial").length;
    return { total, success, failure, partial, accuracyRate: success / total };
  }

  getKnowledgeBase(): KnowledgeEntry[] { return Array.from(this.knowledgeBase.values()); }
  getFeedback(decisionId?: string): LearningFeedback[] {
    if (decisionId) return this.feedbackStore.filter(f => f.decisionId === decisionId);
    return this.feedbackStore.slice(-100);
  }

  /** Snapshot of the shadow model pipeline's agreement-rate telemetry. */
  getShadowStats() {
    return shadowPipeline.getStats();
  }

  /** Per-capability agreement breakdown — useful for dashboards. */
  getShadowBreakdown() {
    return shadowPipeline.getPerCapabilityBreakdown();
  }
}

export { shadowPipeline } from "./shadow-pipeline";
export const learningLoop = new LearningLoopImpl();
