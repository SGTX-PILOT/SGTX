/**
 * UN/LOCODE Full-World Sync Orchestrator (249 countries round-robin)
 * ====================================================================
 *
 * The base `syncUnlocode(countryCode?)` in `unlocode-sync.ts` fetches ONE
 * country per call from `https://service.unece.org/trade/locode/loc{CC}.csv`.
 * This module wraps it into a round-robin orchestrator that cycles through
 * all 249 ISO 3166-1 alpha-2 country codes on a rolling basis so SGTX has
 * worldwide port/location coverage.
 *
 * ── Round-robin cursor ──────────────────────────────────────────────────
 * The cursor is IMPLICIT — it is derived from the per-country
 * `min(syncedAt)` aggregation on the `UnlocodeEntry` table. The next
 * country to sync is either:
 *   1. The first never-synced country (alphabetical) — highest priority, OR
 *   2. The country with the oldest `syncedAt` (the stalest data).
 *
 * This means the cursor survives process restarts, deploys, and cold
 * starts without any extra persistence model.
 *
 * ── Target throughput ───────────────────────────────────────────────────
 * 5 countries per daily cron tick × 249 countries ÷ 5 = ~50 days for a
 * full worldwide refresh. Acceptable — port data changes slowly.
 *
 * ── Defensive design ────────────────────────────────────────────────────
 * UNECE (service.unece.org) sits behind Cloudflare and frequently returns
 * 403 bot-challenge responses. Every public function in this module:
 *   • catches its own errors,
 *   • logs via `@/lib/sgtx/logger`,
 *   • never throws to the caller.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  syncUnlocode,
  UNLOCODE_COUNTRY_CODES,
  type UnlocodeSyncResult,
} from "@/lib/sgtx/shipping/unlocode-sync";

/** Total number of ISO 3166-1 alpha-2 officially assigned country codes (249). */
export const TOTAL_COUNTRIES = UNLOCODE_COUNTRY_CODES.length;

/**
 * Default batch size — how many countries a single daily cron tick syncs.
 * 5/day × ~50 days = full worldwide refresh.
 */
export const DEFAULT_BATCH_SIZE = 5;

/**
 * Maximum acceptable age (days) before a country's UN/LOCODE entries are
 * considered "stale" and prioritised for re-sync. 60 days matches the
 * ~50-day full refresh cycle with a safety margin.
 */
export const STALENESS_THRESHOLD_DAYS = 60;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FullSyncProgress {
  totalCountries: number;
  /** Distinct country codes with ≥1 row in `UnlocodeEntry`. */
  syncedCountries: number;
  /** Distinct country codes with ≥1 row refreshed within STALENESS_THRESHOLD_DAYS. */
  freshCountries: number;
  /** Country codes in the 249-list with ZERO rows. */
  neverSyncedCountries: string[];
  lastCountrySynced: string | null;
  lastSyncedAt: string | null;
  nextCountryToSync: string;
  /** Next N countries in the round-robin queue (oldest first). */
  nextBatch: string[];
  /** Estimated days for a full refresh at DEFAULT_BATCH_SIZE per day. */
  estimatedFullRefreshDays: number;
  /** ISO timestamp of the stalest country's most recent sync. */
  oldestSyncedAt: string | null;
}

export interface CountrySyncResult {
  countryCode: string;
  ok: boolean;
  upserted: number;
  parsed: number;
  errors: string[];
  durationMs: number;
}

export interface BatchSyncResult {
  ok: boolean;
  totalRequested: number;
  totalProcessed: number;
  totalUpserted: number;
  totalParsed: number;
  results: CountrySyncResult[];
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Round-robin cursor logic
// ─────────────────────────────────────────────────────────────────────────────

interface CountryAgg {
  countryCode: string;
  oldestSyncedAt: Date;
  count: number;
}

/**
 * Aggregate per-country `min(syncedAt)` from the `UnlocodeEntry` table.
 * Returns a Map keyed by countryCode (uppercase). Failures are non-fatal —
 * returns an empty Map (treated as "everything needs syncing").
 */
async function aggregatePerCountry(): Promise<Map<string, CountryAgg>> {
  try {
    const rows = await db.unlocodeEntry.groupBy({
      by: ["countryCode"],
      _min: { syncedAt: true },
      _count: true,
    });
    const map = new Map<string, CountryAgg>();
    for (const r of rows) {
      const cc = (r.countryCode || "").toUpperCase();
      if (!cc) continue;
      const oldest = r._min.syncedAt;
      if (!oldest) continue;
      map.set(cc, {
        countryCode: cc,
        oldestSyncedAt: oldest,
        count: r._count,
      });
    }
    return map;
  } catch (err) {
    logger.warn("unlocode-full-sync: aggregatePerCountry failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}

/**
 * Compute the ordered round-robin queue of countries that need syncing:
 *   1. Never-synced countries first, alphabetical (from the 249 list).
 *   2. Then countries sorted by ascending `min(syncedAt)` (stalest first).
 *   3. Country codes present in the DB but NOT in the 249-list are skipped
 *      (defensive — shouldn't happen but legacy data might have stray rows).
 */
async function buildSyncQueue(): Promise<{ queue: string[]; agg: Map<string, CountryAgg> }> {
  const agg = await aggregatePerCountry();
  const neverSynced: string[] = [];
  const synced: { cc: string; oldest: Date }[] = [];

  for (const cc of UNLOCODE_COUNTRY_CODES) {
    const a = agg.get(cc);
    if (!a) {
      neverSynced.push(cc);
    } else {
      synced.push({ cc, oldest: a.oldestSyncedAt });
    }
  }

  // Stalest-first ordering for already-synced countries.
  synced.sort((a, b) => a.oldest.getTime() - b.oldest.getTime());

  const queue = [...neverSynced, ...synced.map((s) => s.cc)];
  return { queue, agg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return worldwide UN/LOCODE sync progress. The "next country to sync" is
 * the head of the round-robin queue (oldest syncedAt or first never-synced
 * country alphabetically). Never throws.
 */
export async function getFullSyncProgress(): Promise<FullSyncProgress> {
  const { queue, agg } = await buildSyncQueue();

  let lastCountrySynced: string | null = null;
  let lastSyncedAt: string | null = null;
  let oldestSyncedAt: string | null = null;

  if (agg.size > 0) {
    // Most recent min(syncedAt) across all countries = "last synced".
    let mostRecent: CountryAgg | null = null;
    let oldest: CountryAgg | null = null;
    for (const a of agg.values()) {
      if (!mostRecent || a.oldestSyncedAt > mostRecent.oldestSyncedAt) mostRecent = a;
      if (!oldest || a.oldestSyncedAt < oldest.oldestSyncedAt) oldest = a;
    }
    if (mostRecent) {
      lastCountrySynced = mostRecent.countryCode;
      lastSyncedAt = mostRecent.oldestSyncedAt.toISOString();
    }
    if (oldest) {
      oldestSyncedAt = oldest.oldestSyncedAt.toISOString();
    }
  }

  const freshCutoff = new Date(Date.now() - STALENESS_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  let freshCountries = 0;
  for (const a of agg.values()) {
    if (a.oldestSyncedAt >= freshCutoff) freshCountries++;
  }

  const neverSyncedCountries = queue.filter(
    (cc) => !agg.has(cc),
  );

  const nextCountryToSync = queue[0] ?? UNLOCODE_COUNTRY_CODES[0];
  const nextBatch = queue.slice(0, DEFAULT_BATCH_SIZE);

  return {
    totalCountries: TOTAL_COUNTRIES,
    syncedCountries: agg.size,
    freshCountries,
    neverSyncedCountries,
    lastCountrySynced,
    lastSyncedAt,
    nextCountryToSync,
    nextBatch,
    estimatedFullRefreshDays: Math.ceil(TOTAL_COUNTRIES / DEFAULT_BATCH_SIZE),
    oldestSyncedAt,
  };
}

/**
 * Sync ONE country on demand. Wrapper around `syncUnlocode` that normalises
 * the country code + never throws.
 */
export async function syncCountry(countryCode: string): Promise<CountrySyncResult> {
  const cc = (countryCode || "").toUpperCase().trim();
  const start = Date.now();
  if (!cc || cc.length !== 2 || !UNLOCODE_COUNTRY_CODES.includes(cc)) {
    const msg = `invalid country code: ${countryCode}`;
    logger.warn("unlocode-full-sync: syncCountry rejected", { countryCode, msg });
    return {
      countryCode: cc || "?",
      ok: false,
      upserted: 0,
      parsed: 0,
      errors: [msg],
      durationMs: Date.now() - start,
    };
  }

  try {
    const result: UnlocodeSyncResult = await syncUnlocode(cc);
    return {
      countryCode: cc,
      ok: result.ok,
      upserted: result.upserted,
      parsed: result.parsed,
      errors: result.errors,
      durationMs: result.durationMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("unlocode-full-sync: syncCountry threw", { countryCode: cc, error: msg });
    return {
      countryCode: cc,
      ok: false,
      upserted: 0,
      parsed: 0,
      errors: [msg],
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Sync the NEXT country in the round-robin queue (oldest syncedAt or first
 * never-synced country). Designed for the daily cron tick — syncs ONE
 * country per call. Never throws.
 */
export async function syncNextCountry(): Promise<{
  countryCode: string;
  result: CountrySyncResult;
  queueSizeBefore: number;
}> {
  const { queue } = await buildSyncQueue();
  const queueSizeBefore = queue.length;
  const next = queue[0] ?? UNLOCODE_COUNTRY_CODES[0];
  const result = await syncCountry(next);
  logger.info("unlocode-full-sync: syncNextCountry done", {
    countryCode: next,
    ok: result.ok,
    upserted: result.upserted,
    durationMs: result.durationMs,
    queueSizeBefore,
  });
  return { countryCode: next, result, queueSizeBefore };
}

/**
 * Sync a batch of countries sequentially. Skips + logs on per-country
 * failure, continues to the next. Designed for the daily cron (5
 * countries per call ≈ 30s) or an external scheduler.
 *
 * If `countryCodes` is empty, syncs the next DEFAULT_BATCH_SIZE countries
 * from the round-robin queue.
 */
export async function syncBatch(countryCodes?: string[]): Promise<BatchSyncResult> {
  const start = Date.now();
  let codes: string[];

  if (!countryCodes || countryCodes.length === 0) {
    // Default: pull the next N from the round-robin queue.
    const { queue } = await buildSyncQueue();
    codes = queue.slice(0, DEFAULT_BATCH_SIZE);
    if (codes.length === 0) {
      codes = UNLOCODE_COUNTRY_CODES.slice(0, DEFAULT_BATCH_SIZE);
    }
  } else {
    codes = countryCodes.map((c) => c.toUpperCase().trim());
  }

  const totalRequested = codes.length;
  const results: CountrySyncResult[] = [];
  let totalProcessed = 0;
  let totalUpserted = 0;
  let totalParsed = 0;

  for (const cc of codes) {
    const r = await syncCountry(cc);
    results.push(r);
    if (r.ok || r.upserted > 0) totalProcessed++;
    totalUpserted += r.upserted;
    totalParsed += r.parsed;
    // Brief pause between countries to be polite to UNECE / Cloudflare.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const ok = results.every((r) => r.ok);
  logger.info("unlocode-full-sync: syncBatch done", {
    totalRequested,
    totalProcessed,
    totalUpserted,
    totalParsed,
    ok,
    durationMs: Date.now() - start,
    failures: results.filter((r) => !r.ok).map((r) => r.countryCode),
  });

  return {
    ok,
    totalRequested,
    totalProcessed,
    totalUpserted,
    totalParsed,
    results,
    durationMs: Date.now() - start,
  };
}
