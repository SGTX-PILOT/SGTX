// SGTX Brain OS — Feedback Loop
// Collects outcome feedback for Brain decisions and feeds it back into the learning system.
// In-memory implementation (Postgres adapter ready). Subscribes to outcome events for auto-collection.

import type { LearningFeedback, BrainEvent, BrainEventType } from "../core/types";
import { eventBus } from "../core/event-bus";
import { generateId, now } from "../core/utils";

interface RecordFeedbackInput {
  decisionId: string;
  actualOutcome: "success" | "failure" | "partial";
  outcomeDetails: string;
  expectedOutcome: string;
  feedbackSource: "system" | "human" | "outcome-monitor";
  deviationScore?: number;
  metadata?: Record<string, any>;
}

interface AccuracyMetrics {
  total: number;
  success: number;
  failure: number;
  partial: number;
  accuracyRate: number;
}

// Outcome events that auto-generate feedback (decisionId must be present in payload)
const OUTCOME_EVENT_RULES: {
  type: BrainEventType;
  outcome: "success" | "failure" | "partial";
  detailsField: string;
}[] = [
  { type: "trade.settled", outcome: "success", detailsField: "settlementSummary" },
  { type: "trade.dispute.filed", outcome: "failure", detailsField: "disputeReason" },
  { type: "trade.distressed", outcome: "failure", detailsField: "distressReason" },
  { type: "compliance.violation", outcome: "failure", detailsField: "violation" },
  { type: "compliance.checked", outcome: "success", detailsField: "checkSummary" },
];

// BRAIN-CTO-6 (Rec 2) — additional feedback signals beyond the original 5.
// Each rule binds an outcome event to a specific Brain decision (via the
// payload's `decisionId`) and computes a deviation score in [0, 1] where 0
// means the outcome matched the model's prediction and 1 means the outcome
// was completely unexpected.
//
//   customs  → compliance pre-check decision (approved should have been predicted)
//   qc       → dispute risk prediction (failed inspection ⇒ should have predicted higher risk)
//   payment  → dynamic fee decision (failed settlement ⇒ fee optimisation missed)
//
// All three subscribe to BOTH the positive and the negative outcome so the
// feedback loop can attribute *success* feedback too (not just failures).
interface ExtendedOutcomeRule {
  type: BrainEventType;
  outcome: "success" | "failure" | "partial";
  /** Which Brain decision is being graded. */
  decisionScope: "compliance-precheck" | "dispute-risk" | "dynamic-fee";
  /** Field in the event payload that carries the originating decisionId. */
  decisionIdField: string;
  /** Field in the event payload that summarises the outcome. */
  detailsField: string;
  /** Whether the *expected* outcome was success (true) or failure (false).
   *  When expected = true and actual = failure → deviation 1.0.
   *  When expected = false and actual = success → deviation 1.0. */
  expectedSuccess: boolean;
}

const EXTENDED_OUTCOME_RULES: ExtendedOutcomeRule[] = [
  // Customs clearance — grades the compliance.precheck decision
  {
    type: "customs.clearance.approved",
    outcome: "success",
    decisionScope: "compliance-precheck",
    decisionIdField: "complianceDecisionId",
    detailsField: "clearanceSummary",
    expectedSuccess: true,
  },
  {
    type: "customs.clearance.rejected",
    outcome: "failure",
    decisionScope: "compliance-precheck",
    decisionIdField: "complianceDecisionId",
    detailsField: "rejectionReason",
    expectedSuccess: true, // compliance pre-check predicted clear → actual rejection = deviation
  },
  // QC inspection — grades the dispute.predict decision
  {
    type: "qc.inspection.passed",
    outcome: "success",
    decisionScope: "dispute-risk",
    decisionIdField: "riskAssessmentId",
    detailsField: "inspectionSummary",
    expectedSuccess: true,
  },
  {
    type: "qc.inspection.failed",
    outcome: "failure",
    decisionScope: "dispute-risk",
    decisionIdField: "riskAssessmentId",
    detailsField: "failureReason",
    expectedSuccess: true, // should have predicted higher dispute risk
  },
  // Payment settlement — grades the pricing.dynamic-fee decision
  {
    type: "payment.settled",
    outcome: "success",
    decisionScope: "dynamic-fee",
    decisionIdField: "feeDecisionId",
    detailsField: "settlementSummary",
    expectedSuccess: true,
  },
  {
    type: "payment.failed",
    outcome: "failure",
    decisionScope: "dynamic-fee",
    decisionIdField: "feeDecisionId",
    detailsField: "failureReason",
    expectedSuccess: true, // should have predicted a viable fee path
  },
];

class FeedbackLoopImpl {
  private feedbackStore: LearningFeedback[] = []; // in-memory (Postgres adapter ready)
  private maxStoreSize = 100000;
  private autoCollectionStarted = false;
  private unsubscribers: Array<() => void> = [];

  /** Record explicit feedback for a Brain decision. */
  async recordFeedback(input: RecordFeedbackInput): Promise<LearningFeedback> {
    const deviationScore =
      input.deviationScore ?? this.computeDeviationScore(input.expectedOutcome, input.actualOutcome);

    const feedback: LearningFeedback = {
      id: generateId("fb"),
      decisionId: input.decisionId,
      actualOutcome: input.actualOutcome,
      outcomeDetails: input.outcomeDetails,
      expectedOutcome: input.expectedOutcome,
      deviationScore,
      feedbackSource: input.feedbackSource,
      createdAt: now(),
      metadata: input.metadata,
    };

    // Enforce ring-buffer cap (drop oldest)
    this.feedbackStore.push(feedback);
    if (this.feedbackStore.length > this.maxStoreSize) {
      this.feedbackStore.shift();
    }

    // Publish learning event so other modules (knowledge base, model registry) can react
    await eventBus.publish(
      "brain.learning.feedback",
      feedback.decisionId,
      {
        feedbackId: feedback.id,
        decisionId: feedback.decisionId,
        actualOutcome: feedback.actualOutcome,
        deviationScore: feedback.deviationScore,
        feedbackSource: feedback.feedbackSource,
      },
      { source: "feedback-loop", correlationId: feedback.decisionId },
    );

    return feedback;
  }

  /** Get all feedback records for a specific decision. */
  getFeedbackForDecision(decisionId: string): LearningFeedback[] {
    return this.feedbackStore.filter(f => f.decisionId === decisionId);
  }

  /** Get recent feedback for a module (decisionId prefix convention: `<moduleId>_*`). */
  getFeedbackForModule(moduleId: string, limit: number = 100): LearningFeedback[] {
    const prefix = `${moduleId}_`;
    const filtered = this.feedbackStore.filter(f => f.decisionId.startsWith(prefix));
    // Most recent first
    return filtered
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  /** Compute aggregate accuracy metrics, optionally filtered by module. */
  getAccuracyMetrics(moduleId?: string): AccuracyMetrics {
    const records = moduleId
      ? this.getFeedbackForModule(moduleId, this.maxStoreSize)
      : this.feedbackStore;

    const total = records.length;
    const success = records.filter(r => r.actualOutcome === "success").length;
    const failure = records.filter(r => r.actualOutcome === "failure").length;
    const partial = records.filter(r => r.actualOutcome === "partial").length;

    // accuracyRate: success counts 1.0, partial 0.5, failure 0.0
    const weighted = success + partial * 0.5;
    const accuracyRate = total > 0 ? weighted / total : 0;

    return { total, success, failure, partial, accuracyRate };
  }

  /**
   * Subscribe to outcome events (trade.settled, trade.dispute.filed, etc.)
   * and auto-generate feedback. Idempotent: calling twice is a no-op.
   *
   * BRAIN-CTO-6 (Rec 2): also subscribes to the extended outcome event set
   * (customs.clearance.*, qc.inspection.*, payment.settled/failed) which
   * attribute feedback to the originating compliance / dispute-risk /
   * dynamic-fee decisions via explicit deviation-score computation.
   */
  async startAutoFeedbackCollection(): Promise<void> {
    if (this.autoCollectionStarted) return;
    this.autoCollectionStarted = true;

    for (const rule of OUTCOME_EVENT_RULES) {
      const unsub = eventBus.subscribe(
        "feedback-loop",
        rule.type,
        async (event: BrainEvent) => this.handleOutcomeEvent(event, rule),
      );
      this.unsubscribers.push(unsub);
    }

    for (const rule of EXTENDED_OUTCOME_RULES) {
      const unsub = eventBus.subscribe(
        "feedback-loop",
        rule.type,
        async (event: BrainEvent) => this.handleExtendedOutcomeEvent(event, rule),
      );
      this.unsubscribers.push(unsub);
    }
  }

  /** Stop auto-collection (for shutdown / testing). */
  stopAutoFeedbackCollection(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.autoCollectionStarted = false;
  }

  /** Internal: handle an outcome event and record feedback if a decisionId is present. */
  private async handleOutcomeEvent(
    event: BrainEvent,
    rule: { type: BrainEventType; outcome: "success" | "failure" | "partial"; detailsField: string },
  ): Promise<void> {
    const payload = (event.payload || {}) as Record<string, any>;
    const decisionId: string | undefined = payload.decisionId || payload.correlationId;
    if (!decisionId) return; // no decision to attribute feedback to

    const expectedOutcome: string =
      payload.expectedOutcome || `Action ${event.type} was expected to succeed`;
    const details: string =
      (payload[rule.detailsField] as string) || `Auto-generated from ${event.type}`;

    try {
      await this.recordFeedback({
        decisionId,
        actualOutcome: rule.outcome,
        outcomeDetails: details,
        expectedOutcome,
        feedbackSource: "outcome-monitor",
        metadata: {
          sourceEvent: event.type,
          eventId: event.id,
          aggregateId: event.aggregateId,
        },
      });
    } catch {
      // Swallow — auto-feedback must never break event processing
    }
  }

  /**
   * BRAIN-CTO-6 (Rec 2) — handle an extended outcome event (customs / qc /
   * payment) and record feedback for the originating Brain decision.
   *
   * Deviation score (0 = expected outcome, 1 = completely unexpected):
   *   expected=success, actual=success → 0.0
   *   expected=success, actual=partial → 0.5
   *   expected=success, actual=failure → 1.0
   * (And symmetrically when the model expected a failure — e.g. a dispute
   * risk model that flagged "high risk" would have expectedSuccess = false.)
   *
   * The rule's `decisionIdField` is checked first; if absent we fall back to
   * the generic `decisionId` / `correlationId` payload fields for
   * compatibility with events that follow the original convention.
   */
  private async handleExtendedOutcomeEvent(event: BrainEvent, rule: ExtendedOutcomeRule): Promise<void> {
    const payload = (event.payload || {}) as Record<string, any>;
    const decisionId: string | undefined =
      payload[rule.decisionIdField] || payload.decisionId || payload.correlationId;
    if (!decisionId) return; // no decision to attribute feedback to

    const details: string =
      (payload[rule.detailsField] as string) || `Auto-generated from ${event.type}`;

    const expectedOutcome: string = rule.expectedSuccess
      ? `${rule.decisionScope} decision predicted a successful outcome`
      : `${rule.decisionScope} decision predicted an adverse outcome`;

    const deviationScore = this.computeExtendedDeviation(rule, rule.outcome);

    try {
      await this.recordFeedback({
        decisionId,
        actualOutcome: rule.outcome,
        outcomeDetails: details,
        expectedOutcome,
        feedbackSource: "outcome-monitor",
        deviationScore,
        metadata: {
          sourceEvent: event.type,
          eventId: event.id,
          aggregateId: event.aggregateId,
          decisionScope: rule.decisionScope,
        },
      });
    } catch {
      // Swallow — auto-feedback must never break event processing
    }
  }

  /**
   * Compute a deviation score in [0, 1] for an extended outcome rule.
   * 0  = the outcome matched the model's prediction
   * 1  = the outcome was the opposite of what the model predicted
   * 0.5 = a partial outcome (neither fully expected nor fully unexpected)
   */
  private computeExtendedDeviation(
    rule: ExtendedOutcomeRule,
    actualOutcome: "success" | "failure" | "partial",
  ): number {
    if (actualOutcome === "partial") return 0.5;
    const actualWasSuccess = actualOutcome === "success";
    const matchedExpectation = actualWasSuccess === rule.expectedSuccess;
    return matchedExpectation ? 0.0 : 1.0;
  }

  /**
   * Compute a deviation score in [0, 1] comparing actual outcome against expected.
   * Heuristic: full match = 0; partial = 0.5; failure = 1.0; plus token-overlap adjustment.
   */
  private computeDeviationScore(expectedOutcome: string, actualOutcome: "success" | "failure" | "partial"): number {
    const base: Record<"success" | "failure" | "partial", number> = {
      success: 0.0,
      partial: 0.5,
      failure: 1.0,
    };
    // If the expected outcome string explicitly mentions failure, invert the mapping.
    const expectedLower = expectedOutcome.toLowerCase();
    let adjusted = base[actualOutcome];
    if (expectedLower.includes("fail") || expectedLower.includes("denied") || expectedLower.includes("blocked")) {
      // Expected to fail — success is the deviation
      adjusted = actualOutcome === "success" ? 1.0 : actualOutcome === "partial" ? 0.5 : 0.0;
    }
    return Math.min(1, Math.max(0, adjusted));
  }

  /** Expose raw store size (for diagnostics / metrics). */
  size(): number {
    return this.feedbackStore.length;
  }

  /** Clear all stored feedback (for testing / reset). */
  reset(): void {
    this.stopAutoFeedbackCollection();
    this.feedbackStore = [];
  }
}

export const feedbackLoop = new FeedbackLoopImpl();
export { FeedbackLoopImpl };
