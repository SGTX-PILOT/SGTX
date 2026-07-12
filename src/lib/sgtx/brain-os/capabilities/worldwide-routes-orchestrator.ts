// SGTX Brain OS — Worldwide Routes Orchestrator
// =============================================================================
// A Brain capability module that orchestrates the worldwide port-routes
// database. Exposes 5 capabilities the Brain orchestrator can invoke:
//
//   * logistics.worldwide-routes         — paginated, filterable route listing
//   * logistics.worldwide-routes-stats   — aggregate worldwide stats
//   * logistics.worldwide-routes-search  — ranked route search with filters
//   * logistics.worldwide-routes-sync    — daily refresh (drift + DB persist)
//   * logistics.worldwide-routes-learn   — observed-outcome learning loop
//
// Learning loop: the orchestrator maintains a per-route `LearningAdjustment`
// map keyed by routeId. When `logistics.worldwide-routes-learn` is invoked
// with `{ routeId, actualPriceUsd, actualTransitDays, predictedPriceUsd,
// predictedTransitDays }`, the orchestrator computes the prediction error and
// applies an exponential moving average (alpha=0.2) to the price-correction
// pct and transit-correction days. Every subsequent `getRoutePrice()` call
// (re-exported here) automatically applies the active correction so the
// Brain's predictions converge on reality over time.
//
// Daily sync: the orchestrator re-computes every route's price with a ±3%
// market-drift random walk, updates `lastUpdated`, persists every route to
// the `WorldwidePortRoute` Prisma table via `db.worldwidePortRoute.upsert`,
// and writes a `WorldwideRoutesSyncLog` row for audit. A `brain.decision.made`
// event is published so the LearningLoop's shadow pipeline can observe it.
// =============================================================================

import type { BrainModule } from "../core/types";
import { eventBus } from "../core/event-bus";
import { db } from "@/lib/db";
import { shadowPipeline } from "../learning/shadow-pipeline";
import {
  type WorldwideRoute,
  type LearningAdjustment,
  type WorldwideStats,
  type PortPairReference,
  getAllRoutes,
  getRoutesByLane,
  getRoutePrice as _getRoutePrice,
  getRouteAdjustment,
  setRouteAdjustment,
  getAllRouteAdjustments,
  clearAllRouteAdjustments,
  getWorldwideStats as _getWorldwideStats,
  getPortPairReference as _getPortPairReference,
  setLastFullSyncAt,
  invalidateRouteCache,
  getPortByCode,
  getLineByCode,
  WORLDWIDE_PORTS,
  WORLDWIDE_SHIPPING_LINES,
} from "@/lib/sgtx/shipping/worldwide-port-routes";

// ============ Types ============

/** Filtered + paginated route listing result. */
export interface RouteListResult {
  routes: WorldwideRoute[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: RouteFilters;
}

/** Filter options for the route listing + search capabilities. */
export interface RouteFilters {
  originRegion?: string;
  destinationRegion?: string;
  shippingLine?: string;
  originPort?: string;
  destinationPort?: string;
  alliance?: string;
  serviceType?: string;
  reeferRequired?: boolean;
  minPrice40Std?: number;
  maxPrice40Std?: number;
  maxTransitDays?: number;
}

/** Search result entry — route plus a relevance score. */
export interface RankedRoute {
  route: WorldwideRoute;
  score: number;
  rank: number;
  reasons: string[];
}

/** Result returned by the search capability. */
export interface RouteSearchResult {
  query: {
    origin?: string;
    destination?: string;
    shippingLine?: string;
    filters: RouteFilters;
  };
  results: RankedRoute[];
  total: number;
  bestPrice40Std?: number;
  fastestTransitDays?: number;
}

/** Result returned by the daily sync capability. */
export interface SyncResult {
  syncedAt: string;
  routesCount: number;
  linesCount: number;
  portsCount: number;
  errors: string[];
  durationMs: number;
  driftApplied: number; // average absolute drift % across all routes
  brainLearningUpdates: number;
}

/** Result returned by the learning-observe capability. */
export interface LearnResult {
  routeId: string;
  applied: boolean;
  newAdjustment: LearningAdjustment;
  predicted: { price40Std: number; transitDays: number };
  actual: { price40Std?: number; transitDays?: number };
  errorPct: { price: number; transit: number };
}

/** Input shape for the learn capability. */
export interface LearnInput {
  routeId: string;
  actualPriceUsd?: number;
  actualTransitDays?: number;
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
  containerType?: "20STD" | "40STD" | "40HC" | "20RF" | "40RF";
}

// ============ Learning Loop Constants ============

/** EMA alpha — weight given to the new observation. 0.2 = slow learner. */
const EMA_ALPHA = 0.2;
/** Maximum correction magnitude (price % / transit days). Prevents runaway. */
const MAX_PRICE_CORRECTION_PCT = 0.5; // ±50%
const MAX_TRANSIT_CORRECTION_DAYS = 7;
/** Daily market drift range (±3% per sync). */
const DAILY_DRIFT_PCT = 0.03;

// ============ Helpers ============

/**
 * Mulberry32 RNG. Used to add deterministic-but-time-varying drift to the
 * daily sync (so each sync produces a slightly different price ladder).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Clamp a number to the [min, max] range. */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Apply filters to a route. Returns true if the route passes every filter.
 */
function routeMatchesFilters(route: WorldwideRoute, f: RouteFilters): boolean {
  if (f.originRegion && route.originRegion !== f.originRegion) return false;
  if (f.destinationRegion && route.destinationRegion !== f.destinationRegion) return false;
  if (f.shippingLine && route.shippingLine !== f.shippingLine.toUpperCase()) return false;
  if (f.originPort && route.originPort !== f.originPort.toUpperCase()) return false;
  if (f.destinationPort && route.destinationPort !== f.destinationPort.toUpperCase()) return false;
  if (f.alliance && route.alliance !== f.alliance) return false;
  if (f.serviceType && route.serviceType !== f.serviceType.toUpperCase()) return false;
  if (f.reeferRequired && route.price40Reefer === 0) return false;
  if (f.minPrice40Std != null && route.price40Std < f.minPrice40Std) return false;
  if (f.maxPrice40Std != null && route.price40Std > f.maxPrice40Std) return false;
  if (f.maxTransitDays != null && route.transitDays > f.maxTransitDays) return false;
  return true;
}

// ============ Learning Adjustment Logic ============

/**
 * Compute a new learning adjustment from an observed outcome. Uses EMA with
 * alpha=0.2 so each new observation shifts the correction 20% toward the
 * current error. Clamps the correction to ±50% / ±7 days to prevent runaway.
 *
 * @param current - The current adjustment (or `undefined` for first observation).
 * @param predicted - The Brain's predicted price (40'STD USD) and/or transit days.
 * @param actual - The observed actual price and/or transit days.
 * @returns The new EMA-updated adjustment.
 */
export function computeLearnedAdjustment(
  current: LearningAdjustment | undefined,
  predicted: { price40Std?: number; transitDays?: number },
  actual: { price40Std?: number; transitDays?: number },
): LearningAdjustment {
  const sampleCount = (current?.sampleCount ?? 0) + 1;

  let priceErrorPct = 0;
  if (
    predicted.price40Std != null &&
    actual.price40Std != null &&
    predicted.price40Std > 0
  ) {
    // Positive error = actual > predicted → raise correction so future
    // predictions shift up. Negative = actual < predicted → lower.
    priceErrorPct = (actual.price40Std - predicted.price40Std) / predicted.price40Std;
  }

  let transitErrorDays = 0;
  if (predicted.transitDays != null && actual.transitDays != null) {
    transitErrorDays = actual.transitDays - predicted.transitDays;
  }

  // EMA update: new = old + alpha * (observation - old). The "observation" is
  // the previous correction plus this observation's raw error.
  const prevPriceCorr = current?.priceCorrectionPct ?? 0;
  const prevTransitCorr = current?.transitCorrectionDays ?? 0;
  const newPriceCorr = clamp(
    prevPriceCorr + EMA_ALPHA * (priceErrorPct - prevPriceCorr),
    -MAX_PRICE_CORRECTION_PCT,
    MAX_PRICE_CORRECTION_PCT,
  );
  const newTransitCorr = clamp(
    prevTransitCorr + EMA_ALPHA * (transitErrorDays - prevTransitCorr),
    -MAX_TRANSIT_CORRECTION_DAYS,
    MAX_TRANSIT_CORRECTION_DAYS,
  );

  return {
    priceCorrectionPct: newPriceCorr,
    transitCorrectionDays: newTransitCorr,
    sampleCount,
    lastUpdated: new Date().toISOString(),
  };
}

// ============ Public Capability Functions ============

/**
 * Get a paginated, filterable list of worldwide routes. Sort is stable
 * (routeId ascending). Page index is 1-based.
 */
export async function listWorldwideRoutes(input: {
  page?: number;
  pageSize?: number;
  filters?: RouteFilters;
}): Promise<RouteListResult> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = clamp(input.pageSize ?? 50, 1, 500);
  const filters: RouteFilters = input.filters ?? {};

  const all = getAllRoutes();
  const filtered = filters
    ? all.filter((r) => routeMatchesFilters(r, filters))
    : all;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const routes = filtered.slice(start, start + pageSize);

  return { routes, total, page, pageSize, totalPages, filters };
}

/**
 * Get aggregated worldwide stats: total ports, lines, routes, schedules,
 * region coverage, and average price by trade lane.
 */
export async function getWorldwideStats(): Promise<WorldwideStats> {
  return _getWorldwideStats();
}

/**
 * Search worldwide routes by origin/destination/line with optional filters.
 * Returns ranked results (cheapest first, with tiebreak on fastest transit).
 * Each result includes a relevance score and human-readable match reasons.
 */
export async function searchWorldwideRoutes(input: {
  origin?: string;
  destination?: string;
  shippingLine?: string;
  filters?: RouteFilters;
  limit?: number;
}): Promise<RouteSearchResult> {
  const origin = input.origin?.toUpperCase();
  const destination = input.destination?.toUpperCase();
  const shippingLine = input.shippingLine?.toUpperCase();
  const filters: RouteFilters = input.filters ?? {};
  const limit = clamp(input.limit ?? 20, 1, 200);

  let candidates: WorldwideRoute[] = getAllRoutes();

  // If origin+destination specified, prefer the direct lane first; fall back
  // to transshipment routes via the same regions if no direct lane exists.
  if (origin && destination) {
    const direct = candidates.filter(
      (r) => r.originPort === origin && r.destinationPort === destination,
    );
    if (direct.length > 0) {
      candidates = direct;
    } else {
      // No direct route — relax to origin country → destination country.
      const oPort = getPortByCode(origin);
      const dPort = getPortByCode(destination);
      if (oPort && dPort) {
        candidates = candidates.filter(
          (r) =>
            r.originCountry === oPort.country && r.destinationCountry === dPort.country,
        );
      } else {
        candidates = [];
      }
    }
  } else if (origin) {
    candidates = candidates.filter((r) => r.originPort === origin);
  } else if (destination) {
    candidates = candidates.filter((r) => r.destinationPort === destination);
  }

  if (shippingLine) {
    candidates = candidates.filter((r) => r.shippingLine === shippingLine);
  }

  // Apply remaining filters (price/transit/reefer/etc.)
  candidates = candidates.filter((r) => routeMatchesFilters(r, filters));

  // Rank: cheapest 40'STD first, tiebreak on fastest transit, then on
  // highest confidence.
  const ranked: RankedRoute[] = candidates
    .map((route) => {
      const reasons: string[] = [];
      if (origin && route.originPort === origin) reasons.push("direct-origin-match");
      if (destination && route.destinationPort === destination) reasons.push("direct-dest-match");
      if (shippingLine && route.shippingLine === shippingLine) reasons.push("line-match");
      if (route.serviceType === "DIRECT") reasons.push("direct-service");
      if (route.alliance && route.alliance !== "standalone") reasons.push(`${route.alliance}-alliance`);

      // Score: lower price = higher score. Normalize to 0..1.
      const score =
        1 / (1 + route.price40Std / 1000) +
        1 / (1 + route.transitDays / 10) +
        route.confidence * 0.1;

      return { route, score, rank: 0, reasons };
    })
    .sort((a, b) => {
      if (a.route.price40Std !== b.route.price40Std) {
        return a.route.price40Std - b.route.price40Std;
      }
      if (a.route.transitDays !== b.route.transitDays) {
        return a.route.transitDays - b.route.transitDays;
      }
      return b.route.confidence - a.route.confidence;
    })
    .slice(0, limit)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    query: {
      origin,
      destination,
      shippingLine,
      filters,
    },
    results: ranked,
    total: candidates.length,
    bestPrice40Std: ranked.length > 0 ? ranked[0].route.price40Std : undefined,
    fastestTransitDays: ranked.length > 0
      ? ranked.reduce((min, r) => Math.min(min, r.route.transitDays), Infinity)
      : undefined,
  };
}

/**
 * Apply a daily market-drift random walk to every route's price ladder,
 * update `lastUpdated`, persist every route to the `WorldwidePortRoute`
 * Prisma table, and write a `WorldwideRoutesSyncLog` row for audit.
 *
 * Drift model: each route's 40'STD price is multiplied by `(1 + δ)` where
 * `δ ∈ [-0.03, +0.03]` is sampled from a mulberry32 RNG seeded by
 * `routeId + syncedAt`. This means the drift is deterministic for a given
 * sync timestamp — re-running the sync at the same timestamp produces the
 * same drift, but the timestamp differs every day so the walk progresses.
 *
 * The Brain's learning adjustments are preserved (not reset) — they
 * represent cumulative EMA corrections learned from observed outcomes and
 * should carry forward across syncs.
 */
export async function syncWorldwideRoutes(): Promise<SyncResult> {
  const startedAt = Date.now();
  const syncedAt = new Date().toISOString();
  const errors: string[] = [];
  let routesCount = 0;
  let linesCount = 0;
  let portsCount = 0;
  let driftSum = 0;
  let brainLearningUpdates = 0;

  try {
    // Seed the RNG with the sync timestamp so drift varies per-day but is
    // deterministic for a given sync.
    const seedBase = Date.now();
    const rng = mulberry32(seedBase);

    // Get the current route set.
    const routes = getAllRoutes();
    routesCount = routes.length;

    // Collect unique lines + ports for the sync-log counts.
    const lineSet = new Set<string>();
    const portSet = new Set<string>();
    for (const r of routes) {
      lineSet.add(r.shippingLine);
      portSet.add(r.originPort);
      portSet.add(r.destinationPort);
    }
    linesCount = lineSet.size;
    portsCount = portSet.size;

    // Apply drift + persist each route. We upsert in batches of 50 to keep
    // the SQLite transaction size reasonable.
    const batchSize = 50;
    for (let i = 0; i < routes.length; i += batchSize) {
      const batch = routes.slice(i, i + batchSize);
      try {
        await db.$transaction(
          batch.map((r) => {
            // Sample a per-route drift in [-3%, +3%] for this sync.
            const drift = (rng() * 2 - 1) * DAILY_DRIFT_PCT;
            driftSum += Math.abs(drift);

            // Apply drift to all 5 price fields. The drift is multiplicative
            // and centered on the current stored value (not the base value),
            // so the random walk compounds day-over-day.
            const driftFactor = 1 + drift;
            const price20Std = Math.max(1, Math.round(r.price20Std * driftFactor));
            const price40Std = Math.max(1, Math.round(r.price40Std * driftFactor));
            const price40Hc = Math.max(1, Math.round(r.price40Hc * driftFactor));
            const price20Reefer = r.price20Reefer > 0 ? Math.max(1, Math.round(r.price20Reefer * driftFactor)) : 0;
            const price40Reefer = r.price40Reefer > 0 ? Math.max(1, Math.round(r.price40Reefer * driftFactor)) : 0;

            // Update the in-memory route so subsequent queries see the drift.
            r.price20Std = price20Std;
            r.price40Std = price40Std;
            r.price40Hc = price40Hc;
            r.price20Reefer = price20Reefer;
            r.price40Reefer = price40Reefer;
            r.lastUpdated = syncedAt;

            return db.worldwidePortRoute.upsert({
              where: { routeId: r.routeId },
              create: {
                routeId: r.routeId,
                originPort: r.originPort,
                originName: r.originName,
                originCountry: r.originCountry,
                originRegion: r.originRegion,
                destinationPort: r.destinationPort,
                destinationName: r.destinationName,
                destinationCountry: r.destinationCountry,
                destinationRegion: r.destinationRegion,
                shippingLine: r.shippingLine,
                shippingLineName: r.shippingLineName,
                alliance: r.alliance ?? null,
                service: r.service,
                transitDays: r.transitDays,
                frequencyPerWeek: r.frequencyPerWeek,
                serviceType: r.serviceType,
                transshipmentPort: r.transshipmentPort ?? null,
                price20Std,
                price40Std,
                price40Hc,
                price20Reefer,
                price40Reefer,
                currency: "USD",
                priceValidityDays: r.priceValidityDays,
                confidence: r.confidence,
                source: r.source,
                lastUpdated: new Date(syncedAt),
              },
              update: {
                price20Std,
                price40Std,
                price40Hc,
                price20Reefer,
                price40Reefer,
                transitDays: r.transitDays,
                frequencyPerWeek: r.frequencyPerWeek,
                confidence: r.confidence,
                lastUpdated: new Date(syncedAt),
              },
            });
          }),
        );
      } catch (e: any) {
        errors.push(`batch ${i}-${i + batch.length}: ${e?.message ?? String(e)}`);
      }
    }

    // Update the global sync timestamp so future `getAllRoutes()` calls
    // stamp new routes with the latest sync time.
    setLastFullSyncAt(syncedAt);
    // Invalidate the cache so the next call regenerates with the new
    // lastUpdated timestamp.
    invalidateRouteCache();

    // Count active learning adjustments so the sync-log can surface how
    // many routes have been "learned" so far.
    brainLearningUpdates = getAllRouteAdjustments().length;

    // Write a sync-log row for audit.
    try {
      await db.worldwideRoutesSyncLog.create({
        data: {
          syncedAt: new Date(syncedAt),
          routesCount,
          linesCount,
          portsCount,
          errors: JSON.stringify(errors.slice(0, 50)),
          durationMs: Date.now() - startedAt,
          driftApplied: routesCount > 0 ? driftSum / routesCount : 0,
          brainLearningUpdates,
        },
      });
    } catch (e: any) {
      errors.push(`sync-log: ${e?.message ?? String(e)}`);
    }

    // Publish a brain.decision.made event so the LearningLoop's shadow
    // pipeline can observe this sync as a "production inference".
    try {
      await eventBus.publish(
        "brain.decision.made",
        "worldwide-routes-sync",
        {
          capability: "logistics.worldwide-routes-sync",
          decisionId: `sync_${syncedAt}`,
          routesCount,
          linesCount,
          portsCount,
          driftApplied: routesCount > 0 ? driftSum / routesCount : 0,
          brainLearningUpdates,
          inputSummary: `sync ${syncedAt} routes=${routesCount} lines=${linesCount} ports=${portsCount}`,
        },
        { source: "worldwide-routes-orchestrator" },
      );
    } catch {
      // Non-fatal — event-bus errors must never break the sync.
    }
  } catch (e: any) {
    errors.push(`fatal: ${e?.message ?? String(e)}`);
  }

  return {
    syncedAt,
    routesCount,
    linesCount,
    portsCount,
    errors,
    durationMs: Date.now() - startedAt,
    driftApplied: routesCount > 0 ? driftSum / routesCount : 0,
    brainLearningUpdates,
  };
}

/**
 * Record an observed outcome for a route and update its learning adjustment
 * via EMA. Publishes a `brain.decision.made` event (so the LearningLoop's
 * shadow pipeline can observe the prediction) and feeds the observation
 * through `shadowPipeline.observe()` for downstream agreement telemetry.
 *
 * The Brain compares predicted vs actual and adjusts a per-route correction
 * factor. Every subsequent `getRoutePrice()` call (in
 * `worldwide-port-routes.ts`) applies the correction automatically.
 */
export async function learnWorldwideRoute(input: LearnInput): Promise<LearnResult> {
  const routeId = input.routeId;
  if (!routeId) {
    throw new Error("learnWorldwideRoute requires { routeId }");
  }

  // Find the route in the active set.
  const route = getAllRoutes().find((r) => r.routeId === routeId);
  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  // Determine the predicted price/transit. Use the input's predicted values
  // if provided, otherwise fall back to the route's stored values.
  const predictedPrice = input.predictedPriceUsd ?? route.price40Std;
  const predictedTransit = input.predictedTransitDays ?? route.transitDays;

  // Compute the new adjustment.
  const current = getRouteAdjustment(routeId);
  const newAdj = computeLearnedAdjustment(
    current,
    { price40Std: predictedPrice, transitDays: predictedTransit },
    { price40Std: input.actualPriceUsd, transitDays: input.actualTransitDays },
  );
  setRouteAdjustment(routeId, newAdj);

  // Compute the error percentages for the response.
  const priceErrorPct =
    predictedPrice > 0 && input.actualPriceUsd != null
      ? (input.actualPriceUsd - predictedPrice) / predictedPrice
      : 0;
  const transitErrorPct =
    predictedTransit > 0 && input.actualTransitDays != null
      ? (input.actualTransitDays - predictedTransit) / predictedTransit
      : 0;

  // Publish a brain.decision.made event so the LearningLoop can capture the
  // observation. The decisionId is the routeId so subsequent outcome events
  // can be correlated.
  try {
    await eventBus.publish(
      "brain.decision.made",
      routeId,
      {
        capability: "logistics.worldwide-routes-learn",
        decisionId: routeId,
        routeId,
        predicted: { price40Std: predictedPrice, transitDays: predictedTransit },
        actual: { price40Std: input.actualPriceUsd, transitDays: input.actualTransitDays },
        newAdjustment: newAdj,
        inputSummary: `learn ${routeId} pred=${predictedPrice}/${predictedTransit}d act=${input.actualPriceUsd}/${input.actualTransitDays}d`,
      },
      { source: "worldwide-routes-orchestrator" },
    );
  } catch {
    // Non-fatal — event-bus errors must never break the learn loop.
  }

  // Feed through the shadow pipeline for agreement telemetry.
  try {
    await shadowPipeline.observe(
      "logistics.worldwide-routes-learn",
      { routeId, predicted: { price40Std: predictedPrice, transitDays: predictedTransit } },
      { actual: { price40Std: input.actualPriceUsd, transitDays: input.actualTransitDays } },
      routeId,
    );
  } catch {
    // Non-fatal — shadow pipeline errors must never break the learn loop.
  }

  return {
    routeId,
    applied: true,
    newAdjustment: newAdj,
    predicted: { price40Std: predictedPrice, transitDays: predictedTransit },
    actual: { price40Std: input.actualPriceUsd, transitDays: input.actualTransitDays },
    errorPct: { price: priceErrorPct, transit: transitErrorPct },
  };
}

// ============ Brain Module ============

/**
 * Brain module that orchestrates the worldwide port-routes database.
 * Exposes 5 capabilities (list / stats / search / sync / learn) and wires
 * the learning loop into the Brain's event bus + shadow pipeline.
 */
export const worldwideRoutesModule: BrainModule = {
  id: "worldwide-routes-brain",
  name: "Worldwide Port Routes Brain",
  version: "1.0.0",
  type: "capability",
  authority: "A3",
  description:
    "Worldwide port-routes database (80+ ports × 30+ shipping lines × 400+ routes) with deterministic prices, transit times, daily market-drift sync, and continuous per-route learning",
  capabilities: [
    "logistics.worldwide-routes",
    "logistics.worldwide-routes-stats",
    "logistics.worldwide-routes-search",
    "logistics.worldwide-routes-sync",
    "logistics.worldwide-routes-learn",
    "logistics.port-pair-reference",
  ],
  async invoke(capability: string, input: any): Promise<any> {
    switch (capability) {
      case "logistics.worldwide-routes":
        return listWorldwideRoutes({
          page: input?.page,
          pageSize: input?.pageSize,
          filters: input?.filters,
        });
      case "logistics.worldwide-routes-stats":
        return getWorldwideStats();
      case "logistics.worldwide-routes-search":
        return searchWorldwideRoutes({
          origin: input?.origin ?? input?.originPort,
          destination: input?.destination ?? input?.destinationPort,
          shippingLine: input?.shippingLine ?? input?.line,
          filters: input?.filters,
          limit: input?.limit,
        });
      case "logistics.worldwide-routes-sync":
        return syncWorldwideRoutes();
      case "logistics.worldwide-routes-learn":
        return learnWorldwideRoute({
          routeId: input?.routeId,
          actualPriceUsd: input?.actualPriceUsd,
          actualTransitDays: input?.actualTransitDays,
          predictedPriceUsd: input?.predictedPriceUsd,
          predictedTransitDays: input?.predictedTransitDays,
          containerType: input?.containerType,
        });
      case "logistics.port-pair-reference":
        return getPortPairReference(input?.origin, input?.dest);
      default:
        throw new Error(`Unknown capability: ${capability}`);
    }
  },
};

// ============ Re-exports ============

// Re-export the public API of the underlying database module so consumers
// can import everything from a single entry point.
export {
  getAllRoutes,
  getRoutesByLane,
  getRouteAdjustment,
  getAllRouteAdjustments,
  clearAllRouteAdjustments,
  getPortByCode,
  getLineByCode,
  WORLDWIDE_PORTS,
  WORLDWIDE_SHIPPING_LINES,
} from "@/lib/sgtx/shipping/worldwide-port-routes";

/**
 * Get the active price ladder for a single route, applying any learning
 * correction currently stored. Re-exported from the database module so
 * consumers can import everything from the orchestrator entry point.
 */
export function getRoutePrice(route: WorldwideRoute) {
  return _getRoutePrice(route);
}

/**
 * Compute an aggregated indicative reference for a port pair (origin → dest),
 * averaged across all shipping lines servicing the lane. Re-exported from the
 * database module so API routes can import it directly without going through
 * the Brain orchestrator (faster path for read-only reference lookups).
 *
 * Returns `null` if no routes exist for the requested port pair.
 */
export function getPortPairReference(
  originPort: string,
  destPort: string,
): PortPairReference | null {
  return _getPortPairReference(originPort, destPort);
}

// Re-export the reference types so consumers can import them from the
// orchestrator entry point alongside the function.
export type { PortPairReference, PortPairReferenceLine } from "@/lib/sgtx/shipping/worldwide-port-routes";
