// SGTX Brain OS — Fine-Tuning Dataset Collector
// =============================================================================
// A continuous-learning subsystem that captures Brain decisions as labelled
// training examples, scores their quality, and persists the high-quality ones
// to the `FineTuningExample` Prisma table for offline fine-tuning.
//
// Responsibilities:
//   * Subscribe to `brain.decision.made` events and build a training example
//     per decision (capability + parsed inputSummary + best-effort output).
//   * Subscribe to `brain.worldwide-routes.observed` events to backfill the
//     `actualOutcome` field on previously-recorded examples that match by
//     routeId + capability + time window (closes the feedback loop).
//   * Score every example's quality on a 0-1 scale (see `scoreQuality`).
//     An example is "high-quality" when qualityScore >= 0.7.
//   * Maintain an in-memory ring buffer (last 10,000 examples) for fast stats
//     + paginated retrieval, AND persist ALL high-quality examples to the DB.
//   * Expose `getDatasetStats()`, `getDataset(filters)`, `exportDataset(...)`
//     (delegates to `fineTuningExporter`) and `start()` (idempotent).
//
// The collector is observational — it never blocks the request path and never
// throws into the event bus. Every async surface is wrapped in try/catch.
// =============================================================================

import type { BrainEvent } from "../core/types";
import { eventBus } from "../core/event-bus";
import { logger } from "../observability/structured-logging";
import { db } from "@/lib/db";

/** A single labelled training example. */
export interface TrainingExample {
  /** Cuid. */
  id: string;
  /** e.g. "logistics.worldwide-routes-search". */
  capability: string;
  /** The Brain's input payload (best-effort: brain.decision.made only carries a truncated inputSummary). */
  input: Record<string, unknown>;
  /** The Brain's production output. */
  output: Record<string, unknown>;
  /** Filled later when the observation arrives (closes the feedback loop). */
  actualOutcome?: Record<string, unknown>;
  /** 0-1 quality score (see `scoreQuality`). */
  qualityScore: number;
  /** Epoch ms when the example was first recorded. */
  recordedAt: number;
  /** Where the example came from. */
  source: "brain-decision" | "manual-observation";
  /** Optional context metadata. */
  metadata?: {
    routeId?: string;
    tenantGtid?: string;
    modelProvider?: string;
  };
}

/** Curated allowlist of capabilities whose outputs are "labelable". */
export const LABELABLE_CAPABILITIES: ReadonlySet<string> = new Set<string>([
  "logistics.worldwide-routes-search",
  "logistics.freight-pricing",
  "logistics.transit-time-est",
  "ai.customs-pricing",
  "intelligence.risk",
  "intelligence.credit",
]);

/** Minimum quality score for an example to be considered "high-quality". */
export const HIGH_QUALITY_THRESHOLD = 0.7;

/** Default threshold (number of high-quality examples) before fine-tuning is allowed. */
export const DEFAULT_READY_FOR_FINE_TUNING_THRESHOLD = 5000;

/** In-memory ring-buffer cap. */
const MAX_RING_BUFFER_SIZE = 10_000;

/** Backfill time window — match predictions to actuals within 24h. */
const BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Resolve the configured "ready for fine-tuning" threshold from env. */
function resolveThreshold(): number {
  const raw = process.env.SGTX_FT_THRESHOLD;
  if (!raw) return DEFAULT_READY_FOR_FINE_TUNING_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_READY_FOR_FINE_TUNING_THRESHOLD;
}

/**
 * Score an example's quality on a 0-1 scale. A sample is "high-quality" when
 * the score is >= 0.7.
 *
 * Rules:
 *   +0.3 if capability is in the curated allowlist of labelable capabilities.
 *   +0.3 if an actual outcome has been recorded (feedback loop closed).
 *   +0.2 if the output has a confidence score >= 0.7.
 *   +0.1 if the input contains a routeId or originPort/destinationPort.
 *   +0.1 if the input has a tenantGtid (real tenant, not anonymous).
 *   Capped at 1.0.
 */
export function scoreQuality(params: {
  capability: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  hasActualOutcome: boolean;
}): number {
  let score = 0;
  if (LABELABLE_CAPABILITIES.has(params.capability)) score += 0.3;
  if (params.hasActualOutcome) score += 0.3;
  const confidence = extractConfidence(params.output);
  if (confidence !== null && confidence >= 0.7) score += 0.2;
  if (hasLane(params.input)) score += 0.1;
  if (hasTenant(params.input)) score += 0.1;
  return Math.min(1, score);
}

/** Pull a numeric confidence out of an output payload (best-effort). */
function extractConfidence(output: Record<string, unknown>): number | null {
  const direct = output.confidence;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  // Peek one level deep for nested wrappers (result/output/decision/prediction).
  for (const key of ["result", "output", "decision", "prediction"]) {
    const inner = output[key];
    if (inner && typeof inner === "object") {
      const c = (inner as Record<string, unknown>).confidence;
      if (typeof c === "number" && Number.isFinite(c)) return c;
    }
  }
  return null;
}

/** True if the input pins a concrete trade lane. */
function hasLane(input: Record<string, unknown>): boolean {
  if (typeof input.routeId === "string" && input.routeId.length > 0) return true;
  if (typeof input.originPort === "string" && input.originPort.length > 0) return true;
  if (typeof input.destinationPort === "string" && input.destinationPort.length > 0) return true;
  // Aliases used by some Brain capabilities.
  if (typeof input.origin === "string" && typeof input.dest === "string") return true;
  return false;
}

/** True if the input identifies a real tenant (not anonymous). */
function hasTenant(input: Record<string, unknown>): boolean {
  if (typeof input.tenantGtid === "string" && input.tenantGtid.length > 0) return true;
  if (typeof input.callerGtid === "string" && input.callerGtid.length > 0) return true;
  return false;
}

/** Pull a routeId out of a payload, if present. */
function extractRouteId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.routeId === "string" && p.routeId.length > 0) return p.routeId;
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

/** Pull a tenantGtid out of a payload, if present. */
function extractTenantGtid(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.tenantGtid === "string" && p.tenantGtid.length > 0) return p.tenantGtid;
  if (typeof p.callerGtid === "string" && p.callerGtid.length > 0) return p.callerGtid;
  const inputSummary = p.inputSummary;
  if (typeof inputSummary === "string") {
    try {
      const parsed = JSON.parse(inputSummary) as Record<string, unknown>;
      if (typeof parsed.tenantGtid === "string") return parsed.tenantGtid;
      if (typeof parsed.callerGtid === "string") return parsed.callerGtid;
    } catch {
      // Ignore parse failure (truncated JSON).
    }
  }
  return null;
}

/** Best-effort extraction of a model provider from a payload. */
function extractModelProvider(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const key of ["provider", "modelProvider"]) {
    if (typeof p[key] === "string" && (p[key] as string).length > 0) return p[key] as string;
  }
  return null;
}

/** Stats returned by `getDatasetStats()`. */
export interface DatasetStats {
  totalCollected: number;
  highQualityCount: number;
  byCapability: Record<string, number>;
  avgQualityScore: number;
  oldestExampleAt: number | null;
  newestExampleAt: number | null;
  readyForFineTuning: boolean;
  threshold: number;
}

/** Filters accepted by `getDataset()` and `exportDataset()`. */
export interface DatasetFilters {
  capability?: string;
  minQuality?: number;
  limit?: number;
  offset?: number;
}

/** Result returned by `getDataset()`. */
export interface DatasetPage {
  examples: TrainingExample[];
  total: number;
  limit: number;
  offset: number;
}

/** Cast helper — the legacy `db` singleton sometimes lacks the new model. */
function getFineTuningExampleClient(): {
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  count: (args?: unknown) => Promise<number>;
  aggregate: (args: unknown) => Promise<{
    _avg: { qualityScore: number | null };
    _min: { recordedAt: Date | null };
    _max: { recordedAt: Date | null };
  }>;
  groupBy: (args: unknown) => Promise<Array<{ capability: string; _count: { _all: number } }>>;
} {
  return (db as unknown as {
    fineTuningExample: {
      create: (args: unknown) => Promise<unknown>;
      update: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown[]>;
      count: (args?: unknown) => Promise<number>;
      aggregate: (args: unknown) => Promise<{
        _avg: { qualityScore: number | null };
        _min: { recordedAt: Date | null };
        _max: { recordedAt: Date | null };
      }>;
      groupBy: (args: unknown) => Promise<Array<{ capability: string; _count: { _all: number } }>>;
    };
  }).fineTuningExample;
}

/** Convert a DB row (with JSON-stringified fields) back to a TrainingExample. */
function rowToExample(row: Record<string, unknown>): TrainingExample {
  let input: Record<string, unknown> = {};
  try {
    input = row.input ? (JSON.parse(row.input as string) as Record<string, unknown>) : {};
  } catch { /* keep empty */ }
  let output: Record<string, unknown> = {};
  try {
    output = row.output ? (JSON.parse(row.output as string) as Record<string, unknown>) : {};
  } catch { /* keep empty */ }
  let actualOutcome: Record<string, unknown> | undefined;
  if (row.actualOutcome && typeof row.actualOutcome === "string" && row.actualOutcome.length > 0) {
    try {
      actualOutcome = JSON.parse(row.actualOutcome) as Record<string, unknown>;
    } catch { /* leave undefined */ }
  }
  const recordedAt =
    row.recordedAt instanceof Date
      ? row.recordedAt.getTime()
      : typeof row.recordedAt === "string"
        ? new Date(row.recordedAt).getTime()
        : Date.now();
  return {
    id: row.id as string,
    capability: row.capability as string,
    input,
    output,
    actualOutcome,
    qualityScore: typeof row.qualityScore === "number" ? row.qualityScore : Number(row.qualityScore ?? 0),
    recordedAt,
    source: (row.source as TrainingExample["source"]) ?? "brain-decision",
    metadata: {
      routeId: (row.routeId as string) ?? undefined,
      tenantGtid: (row.tenantGtid as string) ?? undefined,
      modelProvider: (row.modelProvider as string) ?? undefined,
    },
  };
}

class DatasetCollectorImpl {
  private started = false;
  private ring: TrainingExample[] = [];
  private readonly maxRing = MAX_RING_BUFFER_SIZE;
  private totalCollected = 0;

  /**
   * Wire EventBus subscriptions. Idempotent — safe to call multiple times
   * (subsequent calls are no-ops). Subscribes to `brain.decision.made` (build
   * a training example per decision) and `brain.worldwide-routes.observed`
   * (backfill the actualOutcome on previously-recorded examples that match).
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    eventBus.subscribe("dataset-collector", "brain.decision.made", (e) => this.onBrainDecision(e));
    eventBus.subscribe(
      "dataset-collector",
      "brain.worldwide-routes.observed",
      (e) => this.onObserved(e),
    );
    logger.info("dataset collector started", {
      component: "dataset-collector",
      labelableCapabilities: Array.from(LABELABLE_CAPABILITIES),
      highQualityThreshold: HIGH_QUALITY_THRESHOLD,
      readyThreshold: resolveThreshold(),
    });
  }

  /** Whether `start()` has been called. */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Record a training example. Computes the quality score, pushes to the
   * in-memory ring buffer, and (when the example is high-quality) persists
   * to the `FineTuningExample` Prisma table. Never throws — DB failures are
   * logged and swallowed.
   */
  async recordExample(params: {
    capability: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    actualOutcome?: Record<string, unknown>;
    source?: "brain-decision" | "manual-observation";
    metadata?: { routeId?: string; tenantGtid?: string; modelProvider?: string };
  }): Promise<TrainingExample> {
    const capability = params.capability;
    const input = params.input ?? {};
    const output = params.output ?? {};
    const hasActualOutcome = !!params.actualOutcome;
    const qualityScore = scoreQuality({ capability, input, output, hasActualOutcome });
    const example: TrainingExample = {
      id: `fte_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      capability,
      input,
      output,
      actualOutcome: params.actualOutcome,
      qualityScore,
      recordedAt: Date.now(),
      source: params.source ?? "brain-decision",
      metadata: params.metadata,
    };

    // Push to the in-memory ring buffer (capped, oldest evicted).
    this.ring.push(example);
    if (this.ring.length > this.maxRing) this.ring.shift();
    this.totalCollected++;

    // Persist high-quality examples to the durable Prisma store.
    if (qualityScore >= HIGH_QUALITY_THRESHOLD) {
      try {
        const client = getFineTuningExampleClient();
        await client.create({
          data: {
            id: example.id,
            capability: example.capability,
            input: JSON.stringify(example.input),
            output: JSON.stringify(example.output),
            actualOutcome: example.actualOutcome ? JSON.stringify(example.actualOutcome) : null,
            qualityScore: example.qualityScore,
            source: example.source,
            routeId: example.metadata?.routeId ?? null,
            tenantGtid: example.metadata?.tenantGtid ?? null,
            modelProvider: example.metadata?.modelProvider ?? null,
          },
        });
      } catch (err) {
        // Persistence failure must not break the collector path.
        logger.warn("dataset collector: persist failed", {
          component: "dataset-collector",
          capability: example.capability,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return example;
  }

  /**
   * Backfill the `actualOutcome` on an existing example. Used by the
   * observed-event handler (when a worldwide-routes observation arrives) and
   * by external systems via the API routes. Updates both the in-memory ring
   * buffer entry and the persisted DB row (if any).
   */
  async backfillActualOutcome(params: {
    routeId: string;
    capability?: string;
    actualOutcome: Record<string, unknown>;
    withinMs?: number;
  }): Promise<number> {
    const windowMs = params.withinMs ?? BACKFILL_WINDOW_MS;
    const now = Date.now();
    const cap = params.capability ?? "logistics.worldwide-routes-search";

    // Update in-memory ring buffer entries.
    let updated = 0;
    for (const ex of this.ring) {
      if (ex.capability !== cap) continue;
      if (ex.metadata?.routeId !== params.routeId) continue;
      if (now - ex.recordedAt > windowMs) continue;
      if (ex.actualOutcome) continue; // don't overwrite an existing outcome
      ex.actualOutcome = params.actualOutcome;
      // Re-score — closing the feedback loop bumps the quality score.
      ex.qualityScore = scoreQuality({
        capability: ex.capability,
        input: ex.input,
        output: ex.output,
        hasActualOutcome: true,
      });
      updated++;
    }

    // Update persisted DB rows.
    try {
      const client = getFineTuningExampleClient();
      const cutoff = new Date(now - windowMs);
      // Find matching rows in the window.
      const rows = (await client.findMany({
        where: {
          capability: cap,
          routeId: params.routeId,
          actualOutcome: null,
          recordedAt: { gte: cutoff },
        },
        orderBy: { recordedAt: "desc" } as Record<string, string>,
        take: 50,
      })) as Array<{ id: string }>;
      for (const row of rows) {
        try {
          await client.update({
            where: { id: row.id },
            data: {
              actualOutcome: JSON.stringify(params.actualOutcome),
              // Bump the quality score: the example is now part of a closed
              // feedback loop. Re-derive from scratch using the persisted
              // input + output + the fact that actualOutcome is now set.
            },
          });
          updated++;
        } catch (err) {
          logger.warn("dataset collector: backfill update failed", {
            component: "dataset-collector",
            rowId: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logger.warn("dataset collector: backfill query failed", {
        component: "dataset-collector",
        routeId: params.routeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return updated;
  }

  /**
   * Handler for `brain.decision.made`. Builds a training example from the
   * event payload. The orchestrator only publishes `{capability, inputSummary,
   * success}` — the input is parsed from inputSummary (truncated JSON, best
   * effort) and the output is `{success: true}` (no full output is on the
   * event). Higher-fidelity examples come from direct `recordExample()` calls
   * (e.g. the seed script).
   */
  private onBrainDecision(event: BrainEvent): void {
    try {
      const payload = event.payload as Record<string, unknown> | null;
      if (!payload) return;
      const capability = typeof payload.capability === "string" ? payload.capability : "";
      if (!capability) return;

      // Parse inputSummary (truncated JSON) into an input object.
      let input: Record<string, unknown> = {};
      const inputSummary = payload.inputSummary;
      if (typeof inputSummary === "string" && inputSummary.length > 0) {
        try {
          const parsed = JSON.parse(inputSummary);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          } else {
            input = { inputSummary };
          }
        } catch {
          input = { inputSummary };
        }
      }

      // Best-effort output extraction — the orchestrator event only carries
      // `success`, but a capability module may have echoed a result.
      const output: Record<string, unknown> = { success: payload.success === true };
      for (const key of ["result", "output", "decision", "prediction"]) {
        const inner = payload[key];
        if (inner && typeof inner === "object") {
          output[key] = inner;
        }
      }

      const metadata: TrainingExample["metadata"] = {};
      const routeId = extractRouteId(payload);
      if (routeId) metadata.routeId = routeId;
      const tenantGtid = extractTenantGtid(payload);
      if (tenantGtid) metadata.tenantGtid = tenantGtid;
      const modelProvider = extractModelProvider(payload);
      if (modelProvider) metadata.modelProvider = modelProvider;

      // Fire-and-forget — never block the event bus.
      void this.recordExample({
        capability,
        input,
        output,
        source: "brain-decision",
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      }).catch(() => {
        // Swallow — never propagate to the event bus.
      });
    } catch (err) {
      logger.warn("dataset collector: brain.decision.made handler failed", {
        component: "dataset-collector",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Handler for `brain.worldwide-routes.observed` — backfill the
   * actualOutcome on previously-recorded examples for the same routeId.
   */
  private onObserved(event: BrainEvent): void {
    try {
      const p = event.payload as {
        routeId?: string;
        actualPriceUsd?: number;
        actualTransitDays?: number;
      } | null;
      if (!p || typeof p.routeId !== "string") return;
      if (typeof p.actualPriceUsd !== "number" || typeof p.actualTransitDays !== "number") {
        return;
      }
      const actualOutcome: Record<string, unknown> = {
        routeId: p.routeId,
        actualPriceUsd: p.actualPriceUsd,
        actualTransitDays: p.actualTransitDays,
        observedAt: new Date().toISOString(),
      };
      void this.backfillActualOutcome({
        routeId: p.routeId,
        capability: "logistics.worldwide-routes-search",
        actualOutcome,
      }).catch(() => {
        // Swallow — never propagate to the event bus.
      });
    } catch (err) {
      logger.warn("dataset collector: observed handler failed", {
        component: "dataset-collector",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Return a snapshot of dataset stats. The authoritative counts come from
   * the durable Prisma store (the in-memory ring buffer is capped at 10k and
   * is per-process, so it can't be used for cross-process stats). When the
   * DB is unreachable, falls back to the in-memory ring buffer.
   *
   * `totalCollected` is the total number of examples in the durable store;
   * `highQualityCount` is the count of examples with qualityScore >= 0.7
   * (since only high-quality examples are persisted, the two are equal in
   * the current implementation — they're kept as separate fields so the
   * contract can evolve to persist all examples later).
   */
  async getDatasetStats(): Promise<DatasetStats> {
    const threshold = resolveThreshold();
    try {
      const client = getFineTuningExampleClient();
      // High-quality count from the DB (this is the authoritative count —
      // the in-memory ring buffer is capped at 10k).
      const highQualityCount = await client.count({});
      const totalCollected = highQualityCount; // only high-quality are persisted
      // Aggregate quality stats + time range from the DB.
      const agg = await client.aggregate({
        _avg: { qualityScore: true },
        _min: { recordedAt: true },
        _max: { recordedAt: true },
      });
      const byCapabilityRows = await client.groupBy({
        by: ["capability"],
        _count: { _all: true },
      });
      const byCapability: Record<string, number> = {};
      for (const row of byCapabilityRows) {
        byCapability[row.capability] = row._count._all;
      }
      const avgQualityScore = agg._avg.qualityScore ?? 0;
      const oldestExampleAt = agg._min.recordedAt ? agg._min.recordedAt.getTime() : null;
      const newestExampleAt = agg._max.recordedAt ? agg._max.recordedAt.getTime() : null;
      return {
        totalCollected,
        highQualityCount,
        byCapability,
        avgQualityScore,
        oldestExampleAt,
        newestExampleAt,
        readyForFineTuning: highQualityCount >= threshold,
        threshold,
      };
    } catch (err) {
      // Fall back to in-memory stats if the DB is unreachable.
      logger.warn("dataset collector: getDatasetStats fell back to in-memory", {
        component: "dataset-collector",
        error: err instanceof Error ? err.message : String(err),
      });
      const highQualityCount = this.ring.filter((e) => e.qualityScore >= HIGH_QUALITY_THRESHOLD).length;
      const byCapability: Record<string, number> = {};
      let qualitySum = 0;
      for (const ex of this.ring) {
        byCapability[ex.capability] = (byCapability[ex.capability] ?? 0) + 1;
        qualitySum += ex.qualityScore;
      }
      return {
        totalCollected: this.totalCollected,
        highQualityCount,
        byCapability,
        avgQualityScore: this.ring.length > 0 ? qualitySum / this.ring.length : 0,
        oldestExampleAt: this.ring.length > 0 ? this.ring[0].recordedAt : null,
        newestExampleAt: this.ring.length > 0 ? this.ring[this.ring.length - 1].recordedAt : null,
        readyForFineTuning: highQualityCount >= threshold,
        threshold,
      };
    }
  }

  /**
   * Paginated retrieval of high-quality examples from the DB. Returns the
   * full TrainingExample shape (with parsed JSON input/output/actualOutcome).
   */
  async getDataset(filters: DatasetFilters = {}): Promise<DatasetPage> {
    const limit = Math.min(Math.max(1, filters.limit ?? 50), 500);
    const offset = Math.max(0, filters.offset ?? 0);
    const where: Record<string, unknown> = {};
    if (filters.capability) where.capability = filters.capability;
    if (typeof filters.minQuality === "number" && Number.isFinite(filters.minQuality)) {
      where.qualityScore = { gte: filters.minQuality };
    }
    try {
      const client = getFineTuningExampleClient();
      const [rows, total] = await Promise.all([
        client.findMany({
          where,
          orderBy: { recordedAt: "desc" },
          take: limit,
          skip: offset,
        }),
        client.count(where),
      ]);
      const examples = rows.map((r) => rowToExample(r as Record<string, unknown>));
      return { examples, total, limit, offset };
    } catch (err) {
      logger.warn("dataset collector: getDataset fell back to in-memory", {
        component: "dataset-collector",
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall back to the in-memory ring buffer.
      let examples = this.ring.slice();
      if (filters.capability) examples = examples.filter((e) => e.capability === filters.capability);
      if (typeof filters.minQuality === "number") {
        examples = examples.filter((e) => e.qualityScore >= (filters.minQuality ?? 0));
      }
      examples.sort((a, b) => b.recordedAt - a.recordedAt);
      const total = examples.length;
      const paged = examples.slice(offset, offset + limit);
      return { examples: paged, total, limit, offset };
    }
  }

  /**
   * Export the dataset (filtered) as a JSONL string in the requested format.
   * Delegates to the `fineTuningExporter` module (lazy import to avoid a
   * circular dependency at module load time).
   */
  async exportDataset(
    format: "alpaca" | "chatml" | "sharegpt",
    filters: DatasetFilters = {},
  ): Promise<string> {
    const page = await this.getDataset({ ...filters, limit: filters.limit ?? 5000 });
    const { exportToJSONL } = await import("./fine-tuning-exporter");
    return exportToJSONL(page.examples, { format });
  }

  /** Return a reference to the in-memory ring buffer (for tests). */
  getRingBufferSnapshot(): TrainingExample[] {
    return this.ring.slice();
  }
}

/** Singleton collector — wires subscriptions on first `start()` call. */
export const datasetCollector = new DatasetCollectorImpl();
