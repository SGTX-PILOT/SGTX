// SGTX Brain OS — The Orchestrator
// The intelligence kernel that controls ALL SGTX features.
// Every feature, add-on, and compliance module is invoked through the Brain.
// The Brain learns continuously from outcome feedback.

import type { BrainEvent } from "./types";
import { eventBus } from "./event-bus";
import { moduleRegistry } from "./module-registry";
import { checkRateLimit, isRateLimited } from "./rate-limiter";

/**
 * Module-level guard for `startBackgroundJobs()`. Prevents every API
 * worker from re-initialising the worldwide-routes learner + scheduler on
 * every request.
 */
let backgroundJobsStarted = false;

class BrainOrchestratorImpl {
  private initialized = false;
  private startedAt: string | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.startedAt = new Date().toISOString();

    // Subscribe to ALL trade lifecycle events for autonomous orchestration
    const events = [
      "trade.created", "trade.quote.submitted", "trade.contract.signed",
      "trade.milestone.confirmed", "trade.feelock.frozen", "trade.dispute.filed",
      "trade.settled", "trade.distressed", "compliance.checked",
      "compliance.violation", "market.price.updated", "sanctions.hit",
      "force.majeure.detected", "brain.decision.made", "brain.learning.feedback",
      "eu.pesticides.synced", "codex.pesticides.synced", "nowlun.data.synced",
      "customs.clearance.approved", "customs.clearance.rejected",
      "qc.inspection.passed", "qc.inspection.failed",
      "payment.settled", "payment.failed",
    ];
    for (const evt of events) {
      eventBus.subscribe("brain-orchestrator", evt, (e) => this.onEvent(e));
    }

    // Register ALL Brain capability modules (compliance + AI + worldwide-routes
    // + fine-tuning). Without this, brainOrchestrator.invoke() throws
    // "No module registered for capability: ..." on every call. This is the
    // single wiring point that makes the 56+ capabilities available to every
    // API route. Safe to call multiple times — moduleRegistry.register() is
    // idempotent (upserts by module id).
    try {
      const { registerAllCapabilities } = await import("../capabilities/all-capabilities");
      await registerAllCapabilities();
    } catch (e) {
      // Capability registration must not fatal-block orchestrator init —
      // individual routes will surface "No module registered" errors with
      // actionable messages. Log for observability.
      try {
        const { logger } = await import("../observability/structured-logging");
        logger.warn("brain-orchestrator: capability registration failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      } catch { /* logger optional */ }
    }

    // Start learning loop
    try {
      const { learningLoop } = await import("../learning/learning-loop");
      await learningLoop.start();
    } catch { /* learning loop optional during bootstrap */ }

    // Start the worldwide-routes learner (subscribes to brain.decision.made
    // for the logistics.worldwide-routes-* capabilities + the
    // brain.worldwide-routes.observed event). Idempotent.
    try {
      const { worldwideRoutesLearner } = await import("../learning/worldwide-routes-learner");
      worldwideRoutesLearner.start();
    } catch { /* worldwide-routes learner optional during bootstrap */ }

    // Start the daily worldwide-routes sync scheduler. Reads the latest
    // WorldwideRoutesSyncLog row and either fires immediately (stale) or
    // schedules the next tick for lastSync + 24h. Idempotent.
    try {
      const { initDailyRoutesSyncCron } = await import("../scheduler/daily-routes-sync");
      await initDailyRoutesSyncCron();
    } catch { /* daily-routes-sync optional during bootstrap */ }

    // Start the fine-tuning dataset collector (Task FT). Subscribes to
    // `brain.decision.made` to capture training examples + to
    // `brain.worldwide-routes.observed` to backfill actual outcomes. The
    // collector persists high-quality examples (qualityScore >= 0.7) to the
    // `FineTuningExample` Prisma table for offline fine-tuning. Idempotent.
    try {
      const { datasetCollector } = await import("../learning/dataset-collector");
      datasetCollector.start();
    } catch { /* dataset collector optional during bootstrap */ }
  }

  /**
   * Start background jobs that depend on optional subsystems (scheduler,
   * learner). Exposed so API routes can call it on first request if the
   * orchestrator was initialised before the subsystems were registered.
   * Idempotent — guarded by a module-level flag.
   */
  async startBackgroundJobs(): Promise<void> {
    if (backgroundJobsStarted) return;
    backgroundJobsStarted = true;
    try {
      const { worldwideRoutesLearner } = await import("../learning/worldwide-routes-learner");
      worldwideRoutesLearner.start();
    } catch { /* optional */ }
    try {
      const { initDailyRoutesSyncCron } = await import("../scheduler/daily-routes-sync");
      await initDailyRoutesSyncCron();
    } catch { /* optional */ }
  }

  /** The Brain's primary control mechanism — invoke a capability. */
  async invoke(capability: string, input: any): Promise<any> {
    if (!this.initialized) await this.initialize();

    // Per-tenant rate limit on AI-intensive capabilities
    // (intelligence.*, market.*). A denied call throws a typed 429-style
    // error so the calling route can surface it cleanly to the client.
    if (isRateLimited(capability)) {
      const tenantGtid =
        (input && (input.tenantGtid || input.callerGtid)) ||
        (input && input.metadata && input.metadata.tenantGtid) ||
        "anonymous";
      const decision = checkRateLimit(tenantGtid, capability);
      if (!decision.allowed) {
        await eventBus.publish(
          "brain.rate-limited",
          capability,
          { capability, tenantGtid, resetAt: decision.resetAt },
          { source: "brain-orchestrator", tenantGtid },
        ).catch(() => {});
        const retryAfterSec = Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000));
        const err = new Error(
          `Rate limit exceeded for ${tenantGtid} on ${capability}. Retry after ${retryAfterSec}s.`,
        );
        (err as Error & { status?: number; code?: string; retryAfter?: number }).status = 429;
        (err as Error & { status?: number; code?: string; retryAfter?: number }).code = "RATE_LIMITED";
        (err as Error & { status?: number; code?: string; retryAfter?: number }).retryAfter = retryAfterSec;
        throw err;
      }
    }

    const result = await moduleRegistry.invoke(capability, input);
    await eventBus.publish("brain.decision.made", capability, {
      capability, inputSummary: JSON.stringify(input).substring(0, 200), success: true,
    }, { source: "brain-orchestrator" });
    return result;
  }

  /** Autonomous event handler — the Brain reacts to trade events. */
  private async onEvent(event: BrainEvent): Promise<void> {
    try {
      switch (event.type) {
        case "trade.created":
          await this.invoke("compliance.precheck", event.payload).catch(() => {});
          await this.invoke("force-majeure.assess", event.payload).catch(() => {});
          await this.invoke("dispute.predict", event.payload).catch(() => {});
          break;
        case "trade.quote.submitted":
          await this.invoke("market.validate-price", event.payload).catch(() => {});
          break;
        case "trade.contract.signed":
          await this.invoke("learning.record-success", { decisionId: event.payload?.decisionId, outcome: "Contract signed" }).catch(() => {});
          break;
        case "trade.milestone.confirmed":
          await this.invoke("dispute.predict", event.payload).catch(() => {});
          await this.invoke("readiness.update", event.payload).catch(() => {});
          break;
        case "trade.dispute.filed":
          await this.invoke("learning.record-failure", { decisionId: event.payload?.riskAssessmentId, outcome: "Dispute filed" }).catch(() => {});
          await this.invoke("dispute.root-cause", event.payload).catch(() => {});
          break;
        case "trade.feelock.frozen":
          await this.invoke("learning.record-success", { decisionId: event.payload?.decisionId, outcome: `FeeLock frozen at ${event.payload?.feeRate}%` }).catch(() => {});
          break;
        case "customs.clearance.rejected":
          await this.invoke("learning.record-failure", { decisionId: event.payload?.decisionId, outcome: "Customs rejected" }).catch(() => {});
          break;
        case "qc.inspection.failed":
          await this.invoke("learning.record-failure", { decisionId: event.payload?.decisionId, outcome: "QC failed" }).catch(() => {});
          break;
        case "payment.failed":
          await this.invoke("learning.record-failure", { decisionId: event.payload?.decisionId, outcome: "Payment failed" }).catch(() => {});
          break;
        case "sanctions.hit":
          await eventBus.publish("compliance.violation", event.aggregateId, { type: "sanctions_hit", severity: "critical", ...event.payload }, { source: "brain-orchestrator", causationId: event.id });
          break;
        case "force.majeure.detected":
          if (event.payload?.recommendedAction === "suspend" || event.payload?.recommendedAction === "cancel") {
            await eventBus.publish("compliance.violation", event.aggregateId, { type: "force_majeure", severity: "high", ...event.payload }, { source: "brain-orchestrator", causationId: event.id });
          }
          break;
      }
    } catch { /* non-blocking */ }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      startedAt: this.startedAt,
      modules: moduleRegistry.count(),
      capabilities: moduleRegistry.listCapabilities().length,
      eventBus: eventBus.getMetrics(),
    };
  }
}

export const brainOrchestrator = new BrainOrchestratorImpl();
