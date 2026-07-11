// SGTX Brain OS — Learning Loop
// The Brain continuously learns from outcome feedback.
// Records successes + failures, derives knowledge, and improves over time.

import type { LearningFeedback, KnowledgeEntry } from "../core/types";
import { eventBus } from "../core/event-bus";

class LearningLoopImpl {
  private feedbackStore: LearningFeedback[] = [];
  private knowledgeBase: Map<string, KnowledgeEntry> = new Map();
  private maxFeedback = 100000;
  private started = false;

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
}

export const learningLoop = new LearningLoopImpl();
