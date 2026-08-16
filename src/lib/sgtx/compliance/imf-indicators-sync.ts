/**
 * IMF SDMX Macro Indicators — FREE, no API key, no auth
 * =======================================================
 *
 * Source: International Monetary Fund — Data API (SDMX 2.1 REST)
 *   Base URL: https://dataservices.imf.org/REST/SDMX_XML.svc/
 *   CompactData endpoint:
 *     /CompactData/{DATABASE}/{FREQ}.{REF_AREA}.{INDICATOR}?startPeriod=YYYY&endPeriod=YYYY
 *
 * What it gives SGTX
 * ------------------
 *   Macro indicators per country for emerging-market risk scoring:
 *     • PCPI_IX  — Consumer Price Index (CPI, inflation proxy)
 *     • NGDP_R   — Real Gross Domestic Product (annual, LCU)
 *     • TXG_FOB  — Exports, Goods, FOB (USD)
 *     • TMG_CIF  — Imports, Goods, CIF (USD)
 *     • BCA      — Current Account Balance (USD)
 *
 *   Used by the Brain's emerging-market risk scoring for shipment
 *   destination pre-screening: high inflation + deteriorating trade
 *   balance + falling GDP → higher landed-cost risk + FX-volatility
 *   warning.
 *
 * Implementation notes
 * --------------------
 *   • The IMF SDMX REST API is documented at
 *     https://developer.imf.org/api-guide
 *   • The CompactData endpoint returns SDMX-ML XML. We parse it with a
 *     lightweight regex (no heavy XML deps) — extracting <Series
 *     REF_AREA="US" ...><Obs TIME_PERIOD="2024" OBS_VALUE="..."/></Series>.
 *   • For each of the 20 partner countries we issue 5 indicator fetches
 *     (one per indicator code). All requests use the shared 15s
 *     `fetchWithTimeout` helper.
 *   • Per-country, per-indicator try/catch — a single parse failure never
 *     blocks the rest.
 *   • Cached in-memory with a 24h TTL.
 *   • `getCountryRiskScore()` returns a composite 0-100 score derived
 *     from inflation + real-GDP + trade balance.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "@/lib/sgtx/compliance/free-fetch";

const IMF_SDMX_BASE = "https://dataservices.imf.org/REST/SDMX_XML.svc";
const IMF_DATABASE = "IFS"; // International Financial Statistics

/** 24-hour cache TTL. */
const IMF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Indicator codes (IMF IFS series keys). */
export const IMF_INDICATORS = {
  PCPI_IX: "PCPI_IX", // Consumer Price Index (2010 = 100, period-average)
  NGDP_R:  "NGDP_R",  // Real GDP (LCU, annual)
  TXG_FOB: "TXG_FOB", // Exports of goods, FOB (USD)
  TMG_CIF: "TMG_CIF", // Imports of goods, CIF (USD)
  BCA:     "BCA",     // Current account balance (USD)
} as const;

export type IndicatorCode = keyof typeof IMF_INDICATORS | string;

/**
 * The 20 trading countries SGTX caches IMF indicators for. The IMF SDMX
 * API uses ISO-2 (alpha-2) country codes for the `REF_AREA` dimension.
 */
const IMF_COUNTRIES: string[] = [
  "US", // United States
  "CN", // China
  "DE", // Germany (EU anchor)
  "JP", // Japan
  "GB", // United Kingdom
  "FR", // France
  "IN", // India
  "NL", // Netherlands
  "HK", // Hong Kong SAR
  "KR", // Korea
  "IT", // Italy
  "CA", // Canada
  "MX", // Mexico
  "AE", // United Arab Emirates
  "SA", // Saudi Arabia
  "SG", // Singapore
  "ES", // Spain
  "BR", // Brazil
  "EG", // Egypt
  "TR", // Türkiye
];

export interface ImfIndicatorRecord {
  countryIso: string;     // ISO-2 (US, CN, DE, …)
  indicator: string;       // Indicator code (PCPI_IX, NGDP_R, …)
  latestValue: number | null;
  latestYear: number | null;
  series: Array<{ year: number; value: number }>; // recent observations
  unit: string;           // best-effort unit label
  fetchedAt: string;
  source: string;
}

export interface ImfSyncResult {
  ok: boolean;
  countriesAttempted: number;
  countriesSucceeded: number;
  indicatorsCached: number;
  errors: string[];
  durationMs: number;
}

export interface ImfCountryRiskResult {
  ok: boolean;
  countryIso: string;
  /** 0-100 composite score. 0 = very low risk, 100 = very high risk. */
  riskScore: number;
  components: {
    inflationScore: number | null;
    gdpGrowthScore: number | null;
    tradeBalanceScore: number | null;
  };
  inputs: {
    cpiLatest: number | null;
    cpiYear: number | null;
    gdpLatest: number | null;
    gdpYear: number | null;
    tradeBalanceUsd: number | null;
    tradeBalanceYear: number | null;
  };
  source: string;
  cached: boolean;
}

/**
 * Cache layout: outer map keyed by ISO-2 country code; inner map keyed by
 * indicator code; value is the full record.
 */
const indicatorCache = new Map<string, Map<string, ImfIndicatorRecord>>();
let lastSyncedAt: number | null = null;

function isCacheFresh(): boolean {
  if (lastSyncedAt === null) return false;
  return Date.now() - lastSyncedAt < IMF_CACHE_TTL_MS;
}

/**
 * Build the IMF CompactData URL for one country × one indicator. We pull
 * a wide window (last 5 completed years) so we can compute deltas for the
 * risk score (inflation YoY, GDP growth).
 */
function buildCompactDataUrl(countryIso2: string, indicator: string): string {
  const now = new Date().getFullYear();
  const startYear = now - 5;
  const endYear = now - 1;
  // Pattern: CompactData/IFS/M.{REF_AREA}.{INDICATOR}?startPeriod=YYYY&endPeriod=YYYY
  return (
    `${IMF_SDMX_BASE}/CompactData/${IMF_DATABASE}` +
    `/M.${encodeURIComponent(countryIso2)}.${encodeURIComponent(indicator)}` +
    `?startPeriod=${startYear}&endPeriod=${endYear}`
  );
}

/**
 * Regex-parse the IMF SDMX-ML CompactData response.
 *
 * The shape we care about:
 *   <DataSet>
 *     <Series REF_AREA="US" INDICATOR="PCPI_IX" ...>
 *       <Obs TIME_PERIOD="2024" OBS_VALUE="123.45" />
 *       ...
 *     </Series>
 *   </DataSet>
 *
 * IMF occasionally uses @UNIT_MULT, @FREQ, and other attributes; we ignore
 * those for the lightweight parser and just take the latest (highest
 * TIME_PERIOD) Obs per Series.
 */
function parseImfCompactXml(
  xml: string,
  countryIso2: string,
  indicator: string,
): ImfIndicatorRecord {
  const series: Array<{ year: number; value: number }> = [];
  const obsRegex =
    /<Obs\b[^>]*\bTIME_PERIOD\s*=\s*"(\d{4})"[^>]*\bOBS_VALUE\s*=\s*"(-?\d+(?:\.\d+)?)"[^>]*\/?>/g;
  // Some IMF releases place OBS_VALUE before TIME_PERIOD.
  const obsRegexReverse =
    /<Obs\b[^>]*\bOBS_VALUE\s*=\s*"(-?\d+(?:\.\d+)?)"[^>]*\bTIME_PERIOD\s*=\s*"(\d{4})"[^>]*\/?>/g;
  // Also accept the SDMX-ML <Obs TIME_PERIOD=".." OBS_VALUE=".."></Obs> (with a child Value).
  const obsRegexChild =
    /<Obs\b[^>]*\bTIME_PERIOD\s*=\s*"(\d{4})"[^>]*>[\s\S]*?<ObsValue\s+value\s*=\s*"(-?\d+(?:\.\d+)?)"[^>]*\/?>/g;

  let m: RegExpExecArray | null;
  while ((m = obsRegex.exec(xml)) !== null) {
    const year = parseInt(m[1], 10);
    const value = parseFloat(m[2]);
    if (Number.isFinite(year) && Number.isFinite(value)) {
      series.push({ year, value });
    }
  }
  while ((m = obsRegexReverse.exec(xml)) !== null) {
    const year = parseInt(m[2], 10);
    const value = parseFloat(m[1]);
    if (Number.isFinite(year) && Number.isFinite(value)) {
      series.push({ year, value });
    }
  }
  while ((m = obsRegexChild.exec(xml)) !== null) {
    const year = parseInt(m[1], 10);
    const value = parseFloat(m[2]);
    if (Number.isFinite(year) && Number.isFinite(value)) {
      series.push({ year, value });
    }
  }

  // De-duplicate by year, keeping the latest observed value (max value
  // for the year — IMF sometimes publishes both preliminary and revised).
  const byYear = new Map<number, number>();
  for (const { year, value } of series) {
    const existing = byYear.get(year);
    if (existing === undefined || value > existing) byYear.set(year, value);
  }
  const deduped = Array.from(byYear.entries())
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);

  let latestYear: number | null = null;
  let latestValue: number | null = null;
  if (deduped.length > 0) {
    const last = deduped[deduped.length - 1];
    latestYear = last.year;
    latestValue = last.value;
  }

  // Best-effort unit label based on indicator.
  const unit =
    indicator === IMF_INDICATORS.PCPI_IX ? "index (2010=100)"
    : indicator === IMF_INDICATORS.NGDP_R ? "LCU (annual, real)"
    : indicator === IMF_INDICATORS.TXG_FOB ? "USD (FOB)"
    : indicator === IMF_INDICATORS.TMG_CIF ? "USD (CIF)"
    : indicator === IMF_INDICATORS.BCA ? "USD"
    : "unknown";

  return {
    countryIso: countryIso2.toUpperCase(),
    indicator,
    latestValue,
    latestYear,
    series: deduped,
    unit,
    fetchedAt: new Date().toISOString(),
    source: "dataservices.imf.org",
  };
}

async function fetchIndicator(
  countryIso2: string,
  indicator: string,
): Promise<ImfIndicatorRecord | null> {
  const url = buildCompactDataUrl(countryIso2, indicator);
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "application/xml,text/xml,application/json" },
  });
  if (!res || !res.ok) {
    return null;
  }
  const body = await res.text();
  if (!body || body.length === 0) return null;
  try {
    return parseImfCompactXml(body, countryIso2, indicator);
  } catch (err) {
    logger.warn("imf-indicators: XML parse failed", {
      country: countryIso2,
      indicator,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Bulk refresh the IMF indicator cache for all 20 partner countries × 5
 * indicators. Safe to call from a cron or operator POST. Never throws.
 */
export async function syncImfIndicators(): Promise<ImfSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const indicatorsList = Object.values(IMF_INDICATORS);
  let countriesSucceeded = 0;
  let indicatorsCached = 0;

  for (const iso of IMF_COUNTRIES) {
    let countryGotAny = false;
    for (const indicator of indicatorsList) {
      try {
        const record = await fetchIndicator(iso, indicator);
        if (!record || record.latestValue === null) {
          // Not all countries publish all 5 indicators — soft-fail.
          continue;
        }
        let inner = indicatorCache.get(iso);
        if (!inner) {
          inner = new Map();
          indicatorCache.set(iso, inner);
        }
        inner.set(indicator, record);
        indicatorsCached++;
        countryGotAny = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${iso}/${indicator}: ${msg}`);
        logger.debug("imf-indicators: per-indicator fetch failed", {
          country: iso,
          indicator,
          error: msg,
        });
      }
    }
    if (countryGotAny) countriesSucceeded++;
    logger.info("imf-indicators: synced country", {
      country: iso,
      indicatorsCached: countryGotAny ? indicatorsList.length : 0,
    });
  }

  if (countriesSucceeded > 0) {
    lastSyncedAt = Date.now();
  }

  const status: "SUCCESS" | "PARTIAL" | "FAILED" =
    countriesSucceeded === IMF_COUNTRIES.length
      ? "SUCCESS"
      : countriesSucceeded === 0
        ? "FAILED"
        : "PARTIAL";

  await logSync({
    integration: "imf-indicators",
    source: "dataservices.imf.org",
    durationMs: Date.now() - start,
    recordsUpserted: indicatorsCached,
    status,
    errors,
  });

  logger.info("imf-indicators sync completed", {
    countriesAttempted: IMF_COUNTRIES.length,
    countriesSucceeded,
    indicatorsCached,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    countriesAttempted: IMF_COUNTRIES.length,
    countriesSucceeded,
    indicatorsCached,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Look up the latest cached indicator value for a country. Hits the cache
 * first; if the cache is empty for this country/indicator, attempts a
 * single live fetch.
 *
 * @param countryIso   ISO-2 (US, CN, DE, …) — case-insensitive.
 * @param indicator    Indicator code (PCPI_IX, NGDP_R, TXG_FOB, TMG_CIF, BCA).
 */
export async function getCountryIndicator(
  countryIso: string,
  indicator: string,
): Promise<ImfIndicatorRecord | null> {
  const iso = countryIso.toUpperCase();
  const ind = indicator.toUpperCase();
  if (!iso || !ind) return null;

  const inner = indicatorCache.get(iso);
  if (inner && isCacheFresh()) {
    const cached = inner.get(ind);
    if (cached) return cached;
  }

  // Best-effort live fetch (only for the 20 known partner countries, since
  // the IMF endpoint accepts any ISO-2 but we don't want to encourage
  // arbitrary scraping from operator-triggered GET queries).
  if (IMF_COUNTRIES.includes(iso)) {
    try {
      const record = await fetchIndicator(iso, ind);
      if (record && record.latestValue !== null) {
        let m = indicatorCache.get(iso);
        if (!m) {
          m = new Map();
          indicatorCache.set(iso, m);
        }
        m.set(ind, record);
        if (lastSyncedAt === null) lastSyncedAt = Date.now();
        return record;
      }
    } catch (err) {
      logger.warn("imf-indicators: live lookup failed", {
        country: iso,
        indicator: ind,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Final fallback — return whatever is cached, even if stale.
  return inner?.get(ind) ?? null;
}

/**
 * Compute a composite 0-100 risk score for a country from inflation,
 * real GDP, and trade balance.
 *
 * Methodology (transparent + deterministic):
 *   • Inflation score: derived from CPI YoY growth.
 *       CPI YoY % = (latest CPI / prior-year CPI - 1) × 100
 *       Score = clamp(0..100, inflation% × 2.5)
 *       (Higher inflation → higher risk score. 20% inflation → 50/100.)
 *   • GDP score: derived from YoY real-GDP growth (annual, %).
 *       Score = clamp(0..100, 50 - gdpGrowth% × 5)
 *       (5% growth → 25/100, -5% contraction → 75/100.)
 *   • Trade-balance score: derived from (exports - imports) / GDP proxy.
 *       We use (exports - imports) / imports × 100 as a crude ratio.
 *       Score = clamp(0..100, 50 - ratio% × 1.0)
 *       (5% trade surplus → 45/100, -10% deficit → 60/100.)
 *
 *   Composite = mean of available component scores (only counts the
 *   components for which we have data).
 */
export async function getCountryRiskScore(
  countryIso: string,
): Promise<ImfCountryRiskResult> {
  const iso = countryIso.toUpperCase();
  const source = "dataservices.imf.org";

  const cpiRec = await getCountryIndicator(iso, IMF_INDICATORS.PCPI_IX);
  const gdpRec = await getCountryIndicator(iso, IMF_INDICATORS.NGDP_R);
  const expRec = await getCountryIndicator(iso, IMF_INDICATORS.TXG_FOB);
  const impRec = await getCountryIndicator(iso, IMF_INDICATORS.TMG_CIF);

  // ── Inflation component ─────────────────────────────────────────────
  let inflationScore: number | null = null;
  if (cpiRec && cpiRec.series.length >= 2) {
    const s = cpiRec.series;
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    if (prev.value > 0) {
      const yoyPct = ((last.value / prev.value) - 1) * 100;
      inflationScore = clamp01to100(yoyPct * 2.5);
    }
  }

  // ── GDP growth component ─────────────────────────────────────────────
  let gdpGrowthScore: number | null = null;
  if (gdpRec && gdpRec.series.length >= 2) {
    const s = gdpRec.series;
    const last = s[s.length - 1];
    const prev = s[s.length - 2];
    if (prev.value !== 0) {
      const gdpGrowthPct = ((last.value / prev.value) - 1) * 100;
      gdpGrowthScore = clamp01to100(50 - gdpGrowthPct * 5);
    }
  }

  // ── Trade balance component ──────────────────────────────────────────
  let tradeBalanceUsd: number | null = null;
  let tradeBalanceYear: number | null = null;
  let tradeBalanceScore: number | null = null;
  if (expRec && impRec) {
    const expLatest = expRec.series.length > 0 ? expRec.series[expRec.series.length - 1] : null;
    const impLatest = impRec.series.length > 0 ? impRec.series[impRec.series.length - 1] : null;
    if (expLatest && impLatest && impLatest.value > 0) {
      tradeBalanceUsd = expLatest.value - impLatest.value;
      tradeBalanceYear = Math.max(expLatest.year, impLatest.year);
      const ratioPct = (tradeBalanceUsd / impLatest.value) * 100;
      tradeBalanceScore = clamp01to100(50 - ratioPct * 1.0);
    }
  }

  const components = [inflationScore, gdpGrowthScore, tradeBalanceScore].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );

  const riskScore =
    components.length === 0
      ? 0
      : Math.round(components.reduce((a, b) => a + b, 0) / components.length);

  return {
    ok: components.length > 0,
    countryIso: iso,
    riskScore,
    components: {
      inflationScore,
      gdpGrowthScore,
      tradeBalanceScore,
    },
    inputs: {
      cpiLatest: cpiRec?.latestValue ?? null,
      cpiYear: cpiRec?.latestYear ?? null,
      gdpLatest: gdpRec?.latestValue ?? null,
      gdpYear: gdpRec?.latestYear ?? null,
      tradeBalanceUsd,
      tradeBalanceYear,
    },
    source,
    cached: isCacheFresh(),
  };
}

function clamp01to100(x: number): number {
  if (!Number.isFinite(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/** Read-only access to cache stats — used by the sync-status endpoint. */
export function getImfCacheStats(): {
  countriesCached: number;
  indicatorsCached: number;
  lastSyncedAt: string | null;
  countries: string[];
  indicators: string[];
  ttlMs: number;
} {
  let totalIndicators = 0;
  for (const inner of indicatorCache.values()) totalIndicators += inner.size;
  return {
    countriesCached: indicatorCache.size,
    indicatorsCached: totalIndicators,
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    countries: IMF_COUNTRIES,
    indicators: Object.keys(IMF_INDICATORS),
    ttlMs: IMF_CACHE_TTL_MS,
  };
}
