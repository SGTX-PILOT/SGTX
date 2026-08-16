// SGTX Brain OS — Worldwide Routes Learner
// =============================================================================
// A learning subsystem that observes Brain decisions for the worldwide-routes
// capability set (search + sync) and feeds prediction/actual pairs back into
// the shadow pipeline for offline agreement telemetry.
//
// Responsibilities:
//   * Subscribe to `brain.decision.made` events for capabilities
//     `logistics.worldwide-routes-search` and `logistics.worldwide-routes-sync`
//     (filtered at the subscriber level — the EventBus has no native filter).
//   * Maintain an in-memory Map<routeId, prediction> for the most recent
//     prediction per route so actuals can be paired with predictions when
//     they arrive later.
//   * Listen for `brain.worldwide-routes.observed` events carrying actual
//     outcomes (actualPriceUsd / actualTransitDays) and record the
//     prediction-vs-actual error. Each observation is mirrored into the
//     shadow pipeline via `shadowPipeline.observe(...)` so the existing
//     sampling/comparison/agreement-rate telemetry covers worldwide routes.
//   * Expose `getLearningStats()` for dashboards and `recordObservation()`
//     for external systems (e.g. the /api/sgtx/worldwide-routes/learn route)
//     to feed actuals.
//
// The learner is observational only — it never blocks the request path and
// never mutates production state. Every async surface is wrapped in
// try/catch; a failure in the shadow pipeline never propagates to the
// caller.
// =============================================================================

import type { BrainEvent } from "../core/types";
import { eventBus } from "../core/event-bus";
import { logger } from "../observability/structured-logging";
import { shadowPipeline } from "./shadow-pipeline";

/** Capabilities whose decisions this learner tracks. */
const TRACKED_CAPABILITIES = new Set<string>([
  "logistics.worldwide-routes-search",
  "logistics.worldwide-routes-sync",
]);

/** A prediction we recorded for a route (awaiting an actual outcome). */
export interface WorldwideRoutePrediction {
  routeId: string;
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
  actualPriceUsd?: number;
  actualTransitDays?: number;
  recordedAt: string;
}

/** An external observation of an actual outcome for a route. */
export interface WorldwideRouteObservation {
  routeId: string;
  actualPriceUsd: number;
  actualTransitDays: number;
  /** Optional — overrides the prediction we recorded earlier. */
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
}

/** Dashboard summary of the learner's recent accuracy. */
export interface WorldwideRouteLearningStats {
  trackedRoutes: number;
  observedOutcomes: number;
  avgPriceErrorPct: number | null;
  avgTransitErrorDays: number | null;
  lastObservationAt: string | null;
}

interface ObservationRecord {
  routeId: string;
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
  actualPriceUsd: number;
  actualTransitDays: number;
  priceErrorPct: number | null;
  transitErrorDays: number | null;
  recordedAt: string;
}

/** Pull a routeId from a brain.decision.made payload, if present. */
function extractRouteId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const direct = p.routeId;
  if (typeof direct === "string" && direct.length > 0) return direct;
  const input = p.input;
  if (input && typeof input === "object") {
    const inputObj = input as Record<string, unknown>;
    if (typeof inputObj.routeId === "string") return inputObj.routeId;
  }
  // The orchestrator publishes inputSummary as a truncated JSON string. Try
  // to parse it for a routeId field — best-effort, never throws.
  const inputSummary = p.inputSummary;
  if (typeof inputSummary === "string") {
    try {
      const parsed = JSON.parse(inputSummary) as Record<string, unknown>;
      if (typeof parsed.routeId === "string") return parsed.routeId;
    } catch {
      // inputSummary is truncated JSON — parse will often fail. Ignore.
    }
  }
  return null;
}

/** Pull predicted price/transit from a brain.decision.made payload. */
function extractPrediction(payload: unknown): {
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
} {
  if (!payload || typeof payload !== "object") return {};
  const p = payload as Record<string, unknown>;
  const result: { predictedPriceUsd?: number; predictedTransitDays?: number } = {};
  // The orchestrator's brain.decision.made event only carries a success flag
  // + truncated inputSummary, so the prediction lives in `result` or
  // `output` if the capability module chose to echo it back. Best-effort.
  for (const key of ["result", "output", "decision", "prediction"]) {
    const inner = p[key];
    if (inner && typeof inner === "object") {
      const o = inner as Record<string, unknown>;
      if (typeof o.predictedPriceUsd === "number") result.predictedPriceUsd = o.predictedPriceUsd;
      if (typeof o.predictedTransitDays === "number") result.predictedTransitDays = o.predictedTransitDays;
      if (typeof o.priceUsd === "number" && result.predictedPriceUsd === undefined) {
        result.predictedPriceUsd = o.priceUsd;
      }
      if (typeof o.transitDays === "number" && result.predictedTransitDays === undefined) {
        result.predictedTransitDays = o.transitDays;
      }
    }
  }
  return result;
}

class WorldwideRoutesLearnerImpl {
  private started = false;
  private predictions = new Map<string, WorldwideRoutePrediction>();
  private observations: ObservationRecord[] = [];
  private readonly maxObservations = 10_000;
  private lastObservationAt: string | null = null;

  /**
   * Wire EventBus subscriptions. Idempotent — safe to call multiple times
   * (subsequent calls are no-ops). The subscriber filter is applied here
   * (on the handler) rather than in the EventBus itself, which has no
   * native filter primitive.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    eventBus.subscribe(
      "worldwide-routes-learner",
      "brain.decision.made",
      (e) => this.onBrainDecision(e),
    );
    eventBus.subscribe(
      "worldwide-routes-learner",
      "brain.worldwide-routes.observed",
      (e) => this.onObserved(e),
    );
    logger.info("worldwide-routes learner started", {
      component: "worldwide-routes-learner",
      trackedCapabilities: Array.from(TRACKED_CAPABILITIES),
    });
  }

  /** Whether `start()` has been called. */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Handler for `brain.decision.made`. Filters by capability and records
   * the most recent prediction for each routeId so the actual can be
   * paired with it later.
   */
  private onBrainDecision(event: BrainEvent): void {
    try {
      const capability = (event.payload as { capability?: string } | null)?.capability;
      if (!capability || !TRACKED_CAPABILITIES.has(capability)) return;
      const routeId = extractRouteId(event.payload);
      if (!routeId) return;
      const prediction = extractPrediction(event.payload);
      const existing = this.predictions.get(routeId);
      this.predictions.set(routeId, {
        routeId,
        predictedPriceUsd: prediction.predictedPriceUsd ?? existing?.predictedPriceUsd,
        predictedTransitDays:
          prediction.predictedTransitDays ?? existing?.predictedTransitDays,
        actualPriceUsd: existing?.actualPriceUsd,
        actualTransitDays: existing?.actualTransitDays,
        recordedAt: new Date().toISOString(),
      });
    } catch (err) {
      // Never let the brain-decision path break.
      logger.warn("worldwide-routes learner: failed to handle brain.decision.made", {
        component: "worldwide-routes-learner",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Handler for `brain.worldwide-routes.observed` events. Records the
   * actual outcome and feeds the prediction/actual pair into the shadow
   * pipeline.
   */
  private onObserved(event: BrainEvent): void {
    try {
      const p = event.payload as {
        routeId?: string;
        actualPriceUsd?: number;
        actualTransitDays?: number;
        predictedPriceUsd?: number;
        predictedTransitDays?: number;
      } | null;
      if (!p || typeof p.routeId !== "string") return;
      if (typeof p.actualPriceUsd !== "number" || typeof p.actualTransitDays !== "number") {
        return;
      }
      this.recordObservation({
        routeId: p.routeId,
        actualPriceUsd: p.actualPriceUsd,
        actualTransitDays: p.actualTransitDays,
        predictedPriceUsd: p.predictedPriceUsd,
        predictedTransitDays: p.predictedTransitDays,
      });
    } catch (err) {
      logger.warn("worldwide-routes learner: failed to handle observed event", {
        component: "worldwide-routes-learner",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Record an external observation of an actual outcome for a route.
   * Pairs the actual with the most recent prediction we recorded (or with
   * the explicitly-provided predictedPriceUsd/predictedTransitDays), then
   * feeds the pair into the shadow pipeline for agreement-rate telemetry.
   *
   * Safe to call from API routes — never throws.
   */
  recordObservation(observation: WorldwideRouteObservation): void {
    try {
      const existing = this.predictions.get(observation.routeId);
      const predictedPriceUsd =
        observation.predictedPriceUsd ?? existing?.predictedPriceUsd;
      const predictedTransitDays =
        observation.predictedTransitDays ?? existing?.predictedTransitDays;

      // Update the prediction map with the actual so future lookups see
      // the most-recent complete record.
      this.predictions.set(observation.routeId, {
        routeId: observation.routeId,
        predictedPriceUsd,
        predictedTransitDays,
        actualPriceUsd: observation.actualPriceUsd,
        actualTransitDays: observation.actualTransitDays,
        recordedAt: new Date().toISOString(),
      });

      // Compute the prediction-vs-actual error.
      const priceErrorPct =
        predictedPriceUsd !== undefined && predictedPriceUsd > 0
          ? Math.abs(observation.actualPriceUsd - predictedPriceUsd) / predictedPriceUsd
          : null;
      const transitErrorDays =
        predictedTransitDays !== undefined
          ? Math.abs(observation.actualTransitDays - predictedTransitDays)
          : null;

      const record: ObservationRecord = {
        routeId: observation.routeId,
        predictedPriceUsd,
        predictedTransitDays,
        actualPriceUsd: observation.actualPriceUsd,
        actualTransitDays: observation.actualTransitDays,
        priceErrorPct,
        transitErrorDays,
        recordedAt: new Date().toISOString(),
      };
      this.observations.push(record);
      if (this.observations.length > this.maxObservations) {
        this.observations.shift();
      }
      this.lastObservationAt = record.recordedAt;

      // CCL-003: Persist observation to Turso so learning survives cold starts.
      // Fire-and-forget — never throws.
      (async () => {
        try {
          const { db } = await import("@/lib/db");
          await db.worldwideRouteObservation.create({
            data: {
              routeId: observation.routeId,
              predictedPriceUsd: predictedPriceUsd ?? 0,
              predictedTransitDays: predictedTransitDays ?? 0,
              actualPriceUsd: observation.actualPriceUsd ?? null,
              actualTransitDays: observation.actualTransitDays ?? null,
              priceDeviationPct: priceErrorPct,
              transitDeviationDays: transitErrorDays,
              observationSource: "brain-sync",
            },
          }).catch(() => {});
        } catch {}
      })();

      // Feed the prediction/actual pair into the shadow pipeline. The
      // pipeline samples 1-in-100 internally so this is cheap. We pass the
      // prediction as the production output and include the actual in the
      // raw payload — the pipeline's candidate resolver will produce its
      // own candidate; the actual is preserved for offline forensics.
      try {
        void shadowPipeline
          .observe(
            "logistics.worldwide-routes-search",
            { routeId: observation.routeId },
            {
              predictedPriceUsd,
              predictedTransitDays,
              actualPriceUsd: observation.actualPriceUsd,
              actualTransitDays: observation.actualTransitDays,
              priceErrorPct,
              transitErrorDays,
            },
            record.recordedAt,
          )
          .catch(() => {
            // Shadow pipeline is observational — never propagate.
          });
      } catch {
        // As above.
      }

      logger.info("worldwide-routes learner: observation recorded", {
        component: "worldwide-routes-learner",
        routeId: observation.routeId,
        priceErrorPct,
        transitErrorDays,
      });
    } catch (err) {
      logger.error("worldwide-routes learner: recordObservation failed", {
        component: "worldwide-routes-learner",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Return a snapshot of the learner's recent accuracy. */
  getLearningStats(): WorldwideRouteLearningStats {
    const observedOutcomes = this.observations.length;
    let avgPriceErrorPct: number | null = null;
    let avgTransitErrorDays: number | null = null;
    if (observedOutcomes > 0) {
      const priceErrors = this.observations
        .map((o) => o.priceErrorPct)
        .filter((v): v is number => v !== null);
      const transitErrors = this.observations
        .map((o) => o.transitErrorDays)
        .filter((v): v is number => v !== null);
      if (priceErrors.length > 0) {
        avgPriceErrorPct =
          priceErrors.reduce((sum, v) => sum + v, 0) / priceErrors.length;
      }
      if (transitErrors.length > 0) {
        avgTransitErrorDays =
          transitErrors.reduce((sum, v) => sum + v, 0) / transitErrors.length;
      }
    }
    return {
      trackedRoutes: this.predictions.size,
      observedOutcomes,
      avgPriceErrorPct,
      avgTransitErrorDays,
      lastObservationAt: this.lastObservationAt,
    };
  }

  /** Look up the most recent prediction for a route (used by the learn route). */
  getPrediction(routeId: string): WorldwideRoutePrediction | undefined {
    return this.predictions.get(routeId);
  }

  /** Return the most recent N observations (oldest first). */
  getRecentObservations(limit = 100): ObservationRecord[] {
    return this.observations.slice(-limit);
  }
}

/** Singleton learner — wires subscriptions on first `start()` call. */
export const worldwideRoutesLearner = new WorldwideRoutesLearnerImpl();
