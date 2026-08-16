/**
 * World Bank Indicators Sync — Development indicators per country (TRULY FREE)
 * =============================================================================
 *
 * Source: https://api.worldbank.org/v2/country/{iso2}/indicator/{code}?format=json
 *   • No API key, no auth, no billing.
 *   • Returns 1,400+ development indicators for ~249 countries.
 *
 * What this gives SGTX:
 *   The existing `onboarding/restcountries-sync.ts` only fetches the country
 *   list (name, capital, region, income level, flag). This module enriches
 *   each country with actual economic + logistics data that the SGTX Brain
 *   uses for corridor scoring + trade-readiness checks:
 *
 *     NY.GDP.PCAP.CD       GDP per capita (current USD)
 *     NE.TRD.GNFS.ZS       Trade (% of GDP)
 *     LP.LPI.OVRL.XQ       Logistics Performance Index (overall) — CRITICAL
 *     IC.BUS.EASE.XQ       Ease of Doing Business rank (1 = best)
 *     TM.TAX.MRCH.WM.AR.ZS Mean tariff rate applied, weighted, all products (%)
 *
 * Implementation notes:
 *   • Caching is in-memory only (Map with 24h TTL) — the task spec explicitly
 *     forbids new Prisma models and limits us to Vercel Hobby's 2-cron budget.
 *   • World Bank returns `[meta, [data]]` where `data` is sorted by date desc.
 *     We pick the most recent non-null observation in the requested window.
 *   • Many country/indicator combos legitimately return `[]` (e.g. Taiwan,
 *     small island states). We surface `null` rather than throw.
 *   • Bulk sync batches 20 countries at a time (5 indicators × 20 countries
 *     = 100 in-flight requests per batch) — well within the World Bank's
 *     soft rate limit (~10 req/sec per IP).
 *
 * Endpoints exposed:
 *   • GET  /api/sgtx/onboarding/worldbank-indicators?country=EG
 *   • GET  /api/sgtx/onboarding/worldbank-indicators/sync        — status
 *   • POST /api/sgtx/onboarding/worldbank-indicators/sync        — refresh (CRON_SECRET)
 *
 * Public endpoint. No API key, no billing.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";
import { UNLOCODE_COUNTRY_CODES } from "@/lib/sgtx/shipping/unlocode-sync";

const WORLDBANK_BASE = "https://api.worldbank.org/v2";

/** Date window (inclusive) for indicator fetches. */
const INDICATOR_DATE_WINDOW = "2020:2024";

/** In-memory cache TTL (24h — indicators are revised quarterly at most). */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Per-page cap on World Bank API requests. */
const PER_PAGE = 50;

/** Batch size for bulk sync — kept at 20 per the task spec. */
const SYNC_BATCH_SIZE = 20;

/** Polite gap between batches (ms) to stay well under World Bank rate limit. */
const BATCH_DELAY_MS = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single indicator observation — value + the year it was reported. */
export interface IndicatorObservation {
  value: number;
  year: number;
}

/** Result of `getCountryIndicator()`. `null` when no data is available. */
export type CountryIndicatorResult = IndicatorObservation | null;

/** Logistics profile for a country, used by corridor scoring + Brain. */
export interface CountryLogisticsProfile {
  countryIso: string;
  gdpPerCapita: number | null;      // USD, current
  tradePctGdp: number | null;        // % of GDP
  lpi: number | null;                // 1 (worst) – 5 (best)
  easeOfDoingBusinessRank: number | null; // 1 (best) – 190 (worst)
  tariffRate: number | null;          // % weighted mean applied
  fetchedAt: string;                  // ISO timestamp
  source: "worldbank-live" | "cache";
}

/** Result returned from `syncWorldBankIndicators()`. */
export interface WorldBankIndicatorsSyncResult {
  ok: boolean;
  countriesProcessed: number;
  indicatorsFetched: number;
  cachedEntries: number;
  errors: string[];
  durationMs: number;
}

/** Supported indicator codes (curated for SGTX's logistics focus). */
export type WorldBankIndicatorCode =
  | "NY.GDP.PCAP.CD"
  | "NE.TRD.GNFS.ZS"
  | "LP.LPI.OVRL.XQ"
  | "IC.BUS.EASE.XQ"
  | "TM.TAX.MRCH.WM.AR.ZS";

/** Metadata for each curated indicator. */
interface IndicatorMeta {
  code: WorldBankIndicatorCode;
  label: string;
  unit: string;
}

/** All indicators this module syncs. */
export const WORLD_BANK_INDICATORS: readonly IndicatorMeta[] = Object.freeze([
  { code: "NY.GDP.PCAP.CD", label: "GDP per capita", unit: "USD" },
  { code: "NE.TRD.GNFS.ZS", label: "Trade % of GDP", unit: "%" },
  { code: "LP.LPI.OVRL.XQ", label: "Logistics Performance Index", unit: "1-5" },
  { code: "IC.BUS.EASE.XQ", label: "Ease of Doing Business rank", unit: "1-190" },
  { code: "TM.TAX.MRCH.WM.AR.ZS", label: "Mean tariff rate (applied, weighted)", unit: "%" },
]);

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache — `Map<key, { value, expiresAt }>` with 24h TTL
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const indicatorCache = new Map<string, CacheEntry<IndicatorObservation | null>>();

function cacheKey(countryIso: string, indicatorCode: string): string {
  return `${countryIso.toUpperCase()}|${indicatorCode}`;
}

function getCached(key: string): IndicatorObservation | null | undefined {
  const entry = indicatorCache.get(key);
  if (!entry) return undefined; // miss
  if (Date.now() > entry.expiresAt) {
    indicatorCache.delete(key);
    return undefined; // stale
  }
  return entry.value;
}

function setCached(
  key: string,
  value: IndicatorObservation | null,
  ttlMs: number = CACHE_TTL_MS,
): void {
  indicatorCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Exposed for tests + status route. */
export function clearWorldBankIndicatorCache(): void {
  indicatorCache.clear();
}

/** Exposed for the status route — returns current cache size. */
export function worldBankIndicatorCacheSize(): number {
  return indicatorCache.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// API response shape
// ─────────────────────────────────────────────────────────────────────────────

interface WorldBankIndicatorApiResponse {
  // World Bank wraps the payload: `[ [meta], [observations...] ]`.
  // An empty result returns `[ [meta], [] ]` or `[null, null]`.
  0?: unknown;
  1?: Array<{
    indicator?: { id?: string; value?: string };
    country?: { id?: string; value?: string };
    countryiso3code?: string;
    date?: string;          // e.g. "2023"
    value?: number | null;  // null when no observation
    unit?: string;
    obsStatus?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch — one country + one indicator → most-recent non-null observation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the most recent non-null observation for `indicatorCode` in
 * `countryIso` (ISO 3166-1 alpha-2). Returns `null` when the World Bank has
 * no data (which is common for small island states + Taiwan).
 *
 * Defensive: never throws. Network / parse errors return `null`.
 */
export async function getCountryIndicator(
  countryIso: string,
  indicatorCode: WorldBankIndicatorCode,
): Promise<CountryIndicatorResult> {
  const cc = (countryIso ?? "").toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(cc)) {
    logger.warn("worldbank-indicators: invalid countryIso", { countryIso });
    return null;
  }

  const key = cacheKey(cc, indicatorCode);
  const cached = getCached(key);
  if (cached !== undefined) {
    return cached;
  }

  const url =
    `${WORLDBANK_BASE}/country/${encodeURIComponent(cc)}/indicator/${encodeURIComponent(indicatorCode)}` +
    `?format=json&per_page=${PER_PAGE}&date=${INDICATOR_DATE_WINDOW}`;

  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      // 403 / 429 / 5xx — cache negative result for a shorter TTL (1h) to
      // avoid hammering the API when an endpoint is misbehaving.
      setCached(key, null, 60 * 60 * 1000);
      if (res) {
        logger.warn("worldbank-indicators: non-200", {
          countryIso: cc,
          indicatorCode,
          status: res.status,
        });
      }
      return null;
    }

    const data = (await res.json()) as WorldBankIndicatorApiResponse;
    const rows = Array.isArray(data) ? data[1] : data["1"];
    if (!Array.isArray(rows) || rows.length === 0) {
      // Legitimate empty response for some country/indicator pairs.
      setCached(key, null);
      return null;
    }

    // World Bank sorts by date descending — first non-null value wins.
    for (const row of rows) {
      if (row && typeof row.value === "number" && Number.isFinite(row.value)) {
        const year = row.date ? parseInt(row.date, 10) : NaN;
        const observation: IndicatorObservation = {
          value: row.value,
          year: Number.isFinite(year) ? year : new Date().getFullYear(),
        };
        setCached(key, observation);
        return observation;
      }
    }

    // All rows had null values — cache as no-data.
    setCached(key, null);
    return null;
  } catch (err) {
    logger.warn("worldbank-indicators: fetch failed", {
      countryIso: cc,
      indicatorCode,
      error: err instanceof Error ? err.message : String(err),
    });
    // Don't cache on unexpected throw — next request should retry.
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logistics profile — composes 4 indicators into a single object for the Brain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compose a country's logistics profile by fetching the 4 core indicators
 * (LPI, Trade % of GDP, mean tariff rate, GDP per capita). Used by the SGTX
 * Brain corridor-scorer + trade-readiness checks.
 *
 * Each missing indicator is `null` — the caller can decide how to handle.
 */
export async function getCountryLogisticsProfile(
  countryIso: string,
): Promise<CountryLogisticsProfile> {
  const cc = (countryIso ?? "").toUpperCase().trim();
  const profile: CountryLogisticsProfile = {
    countryIso: cc,
    gdpPerCapita: null,
    tradePctGdp: null,
    lpi: null,
    easeOfDoingBusinessRank: null,
    tariffRate: null,
    fetchedAt: new Date().toISOString(),
    source: "worldbank-live",
  };

  if (!/^[A-Z]{2}$/.test(cc)) {
    return profile;
  }

  try {
    const [gdp, trade, lpi, ease, tariff] = await Promise.all([
      getCountryIndicator(cc, "NY.GDP.PCAP.CD"),
      getCountryIndicator(cc, "NE.TRD.GNFS.ZS"),
      getCountryIndicator(cc, "LP.LPI.OVRL.XQ"),
      getCountryIndicator(cc, "IC.BUS.EASE.XQ"),
      getCountryIndicator(cc, "TM.TAX.MRCH.WM.AR.ZS"),
    ]);

    profile.gdpPerCapita = gdp?.value ?? null;
    profile.tradePctGdp = trade?.value ?? null;
    profile.lpi = lpi?.value ?? null;
    profile.easeOfDoingBusinessRank = ease?.value ?? null;
    profile.tariffRate = tariff?.value ?? null;
    profile.source = "cache";
    return profile;
  } catch (err) {
    logger.warn("worldbank-indicators: getCountryLogisticsProfile failed", {
      countryIso: cc,
      error: err instanceof Error ? err.message : String(err),
    });
    return profile;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk sync — iterate all ~249 countries × 5 indicators, batched 20 at a time
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bulk refresh of all 5 indicators for every country in
 * `UNLOCODE_COUNTRY_CODES` (249 entries). Batches 20 countries in parallel to
 * stay well within the World Bank API's soft rate limit.
 *
 * Defensive: never throws. Returns a summary with errors[] for diagnostics.
 */
export async function syncWorldBankIndicators(): Promise<WorldBankIndicatorsSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let countriesProcessed = 0;
  let indicatorsFetched = 0;

  const allCountries = [...UNLOCODE_COUNTRY_CODES];

  for (let i = 0; i < allCountries.length; i += SYNC_BATCH_SIZE) {
    const batch = allCountries.slice(i, i + SYNC_BATCH_SIZE);

    // Each country fetches all 5 indicators in parallel inside the batch.
    await Promise.all(
      batch.map(async (countryIso) => {
        try {
          const results = await Promise.all(
            WORLD_BANK_INDICATORS.map((meta) =>
              getCountryIndicator(countryIso, meta.code),
            ),
          );
          for (const r of results) {
            if (r !== null) indicatorsFetched++;
          }
          countriesProcessed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${countryIso}: ${msg}`);
        }
      }),
    );

    // Polite gap between batches.
    if (i + SYNC_BATCH_SIZE < allCountries.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  logger.info("worldbank-indicators sync completed", {
    countriesProcessed,
    indicatorsFetched,
    cacheSize: indicatorCache.size,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    countriesProcessed,
    indicatorsFetched,
    cachedEntries: indicatorCache.size,
    errors,
    durationMs: Date.now() - start,
  };
}
