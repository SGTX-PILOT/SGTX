/**
 * WTO Tariff Download Facility — FREE, no API key, no auth
 * =================================================================
 *
 * Source: https://tariffdata.wto.org/RestApi
 *
 * What it gives SGTX
 * ------------------
 *   Applied MFN (Most-Favoured-Nation) tariff rates by reporter country ×
 *   HS code, for the top 10 trading partners (US, EU, CN, JP, IN, BR, AE,
 *   SA, EG, TR). Used by the customs duty calculator to estimate landed
 *   cost in any destination market — not just Egypt.
 *
 * API shape
 * ---------
 *   The WTO Tariff Download Facility exposes a small REST surface:
 *     • GET /RestApi?cmd=getReporters                     → list of reporters
 *     • GET /RestApi?cmd=getTariff&reporterCode=N&year=Y  → tariff schedule
 *               (optionally &productCode=HS to narrow to a single HS code)
 *   All responses are JSON. No auth required.
 *
 *   The exact JSON shape returned by `getTariff` varies (WTO has refactored
 *   the endpoint a few times), so the parser below is defensive: it accepts
 *   several known shapes and silently skips rows it cannot decode.
 *
 * Caching
 * -------
 *   Results are kept in an in-memory Map keyed by `${country}|${hsCode}`
 *   with a 24-hour TTL. Subsequent lookups hit the cache without re-fetching.
 *   A background `syncWtoTariffs()` call refreshes the cache on demand
 *   (operator-triggered POST /api/sgtx/compliance/wto-tariff/sync).
 *
 * Defensive behaviour
 * --------------------
 *   • 15s timeout via AbortSignal (shared `fetchWithTimeout` helper).
 *   • Per-country try/catch — one flaky country never blocks the others.
 *   • `getMfnTariff()` falls back to cached data if a fresh fetch fails.
 *   • Never throws — always returns a structured result.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "@/lib/sgtx/compliance/free-fetch";

const WTO_REST_API_BASE = "https://tariffdata.wto.org/RestApi";

/** 24-hour cache TTL. */
const WTO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The 10 partner countries SGTX caches tariff schedules for. The keys are
 * ISO-3 codes (used as the public lookup key); the values are WTO reporter
 * codes (numeric strings). WTO reporter codes are based on the UN M.49 /
 * ISO-3166 numeric scheme.
 */
const WTO_REPORTER_CODES: Record<string, string> = {
  USA: "842", // United States
  EU:  "97",  // European Union (27) — WTO aggregate
  CHN: "156", // China
  JPN: "392", // Japan
  IND: "699", // India
  BRA: "076", // Brazil
  ARE: "784", // United Arab Emirates
  SAU: "682", // Saudi Arabia
  EGY: "818", // Egypt
  TUR: "792", // Türkiye
};

export interface WtoTariffEntry {
  reporterCountry: string; // ISO-3 (USA, CHN, EGY, …)
  hsCode: string;          // HS code (typically 6-digit)
  mfnRate: number | null;  // Applied MFN ad-valorem rate (%)
  description: string;     // Product description (best-effort)
  year: number;            // Reporting year
  source: string;          // Always "tariffdata.wto.org"
  fetchedAt: string;       // ISO timestamp
}

export interface WtoTariffSyncResult {
  ok: boolean;
  countriesAttempted: number;
  countriesSucceeded: number;
  entriesCached: number;
  errors: string[];
  durationMs: number;
}

interface WtoTariffLookupResult {
  ok: boolean;
  rate: number | null;
  entry: WtoTariffEntry | null;
  source: string;
  cached: boolean;
}

/** In-memory cache: key = `${ISO3}|${HS}`. */
const tariffCache = new Map<string, WtoTariffEntry>();
let lastSyncedAt: number | null = null;

function cacheKey(country: string, hsCode: string): string {
  return `${country.toUpperCase()}|${hsCode}`;
}

function isCacheFresh(): boolean {
  if (lastSyncedAt === null) return false;
  return Date.now() - lastSyncedAt < WTO_CACHE_TTL_MS;
}

/**
 * Pick the most recent year to query (WTO data lags by ~1-2 years). We
 * try the last completed year first, then fall back one year at a time.
 */
function candidateYears(): number[] {
  const now = new Date().getFullYear();
  return [now - 1, now - 2, now - 3];
}

/**
 * Parse one tariff row from the WTO `getTariff` response. The endpoint has
 * several historical response shapes, so we accept any of them.
 */
function parseTariffRow(
  row: Record<string, unknown>,
  reporterIso: string,
  fallbackYear: number,
): WtoTariffEntry | null {
  if (!row || typeof row !== "object") return null;
  const getProduct = (k: string) =>
    row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
  const hsCode = String(
    getProduct("ProductCode") ?? getProduct("Productcode") ?? getProduct("productCode") ?? "",
  ).trim();
  if (!hsCode) return null;

  const rateRaw =
    getProduct("MFNRate") ?? getProduct("MfnRate") ?? getProduct("mfnRate") ??
    getProduct("SimpleAverage") ?? getProduct("Value") ?? getProduct("Rate");
  const mfnRate = rateRaw == null ? null : Number(rateRaw);
  const safeRate = Number.isFinite(mfnRate as number) ? (mfnRate as number) : null;

  const description = String(
    getProduct("ProductDescription") ?? getProduct("Description") ?? getProduct("productName") ?? "",
  ).trim();
  const yearRaw =
    getProduct("Year") ?? getProduct("year") ?? fallbackYear;
  const year = Number(yearRaw) || fallbackYear;

  return {
    reporterCountry: reporterIso,
    hsCode,
    mfnRate: safeRate,
    description,
    year,
    source: "tariffdata.wto.org",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch the tariff schedule for a single reporter country for the latest
 * year that returns data. Returns an empty array on any failure (never
 * throws).
 */
async function fetchReporterTariffs(
  reporterIso: string,
  reporterCode: string,
): Promise<{ entries: WtoTariffEntry[]; year: number | null; error?: string }> {
  for (const year of candidateYears()) {
    const url = `${WTO_REST_API_BASE}?cmd=getTariff&reporterCode=${encodeURIComponent(
      reporterCode,
    )}&year=${year}&format=json`;
    try {
      const res = await fetchWithTimeout(url, {
        headers: { Accept: "application/json" },
      });
      if (!res || !res.ok) {
        // try the next year — WTO often only has data for 1-2 years back
        continue;
      }
      const data = (await res.json()) as unknown;
      const rows: Record<string, unknown>[] = extractTariffRows(data);
      if (rows.length === 0) {
        continue; // try the next year
      }
      const entries: WtoTariffEntry[] = [];
      for (const row of rows) {
        const entry = parseTariffRow(row, reporterIso, year);
        if (entry) entries.push(entry);
      }
      if (entries.length === 0) {
        continue;
      }
      return { entries, year };
    } catch (err) {
      // move on to the next candidate year
      logger.debug("wto-tariff: per-year fetch failed", {
        reporterIso,
        year,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { entries: [], year: null, error: "no tariff data for any candidate year" };
}

/** Accept the several known shapes of the WTO getTariff response. */
function extractTariffRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter((r): r is Record<string, unknown> =>
      typeof r === "object" && r !== null,
    );
  }
  if (typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  // Common shapes seen across WTO refactors.
  const candidates: unknown[] = [
    obj["Data"],
    obj["data"],
    obj["Records"],
    obj["records"],
    obj["Tariff"],
    obj["tariff"],
    obj["results"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const filtered = c.filter(
        (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
      );
      if (filtered.length > 0) return filtered;
    }
  }
  // Some responses nest: { Data: { Table: [...] } }
  const nestedTable =
    (obj["Data"] as Record<string, unknown> | undefined)?.["Table"] ??
    (obj["data"] as Record<string, unknown> | undefined)?.["Table"];
  if (Array.isArray(nestedTable)) {
    return nestedTable.filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    );
  }
  return [];
}

/**
 * Bulk refresh the WTO tariff cache for all 10 partner countries.
 * Safe to call from a cron or operator POST. Never throws.
 */
export async function syncWtoTariffs(): Promise<WtoTariffSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  const countries = Object.keys(WTO_REPORTER_CODES);
  let countriesSucceeded = 0;
  let entriesCached = 0;

  for (const iso of countries) {
    const reporterCode = WTO_REPORTER_CODES[iso];
    if (!reporterCode) {
      errors.push(`${iso}: missing reporter code`);
      continue;
    }
    try {
      const { entries, year, error } = await fetchReporterTariffs(iso, reporterCode);
      if (entries.length === 0) {
        if (error) errors.push(`${iso}: ${error}`);
        continue;
      }
      for (const entry of entries) {
        tariffCache.set(cacheKey(iso, entry.hsCode), entry);
        entriesCached++;
      }
      countriesSucceeded++;
      logger.info("wto-tariff: synced country", {
        country: iso,
        year,
        entries: entries.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${iso}: ${msg}`);
      logger.warn("wto-tariff: country sync failed", { country: iso, error: msg });
    }
  }

  if (countriesSucceeded > 0) {
    lastSyncedAt = Date.now();
  }

  const status: "SUCCESS" | "PARTIAL" | "FAILED" =
    countriesSucceeded === countries.length
      ? "SUCCESS"
      : countriesSucceeded === 0
        ? "FAILED"
        : "PARTIAL";

  await logSync({
    integration: "wto-tariff",
    source: "tariffdata.wto.org",
    durationMs: Date.now() - start,
    recordsUpserted: entriesCached,
    status,
    errors,
  });

  logger.info("wto-tariff sync completed", {
    countriesAttempted: countries.length,
    countriesSucceeded,
    entriesCached,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    countriesAttempted: countries.length,
    countriesSucceeded,
    entriesCached,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Look up the applied MFN tariff rate for a given reporter country × HS
 * code. Hits the in-memory cache first; if the cache is empty/stale AND
 * we have a known reporter code, attempts a single live lookup before
 * falling back to whatever is cached.
 *
 * @param country  ISO-3 code (USA, CHN, EGY, …) — case-insensitive.
 * @param hsCode   HS code (digits only, 6+ digits recommended).
 */
export async function getMfnTariff(
  country: string,
  hsCode: string,
): Promise<WtoTariffLookupResult> {
  const iso = country.toUpperCase();
  const hs = (hsCode ?? "").trim();
  if (!iso || !hs) {
    return { ok: false, rate: null, entry: null, source: "tariffdata.wto.org", cached: false };
  }

  const key = cacheKey(iso, hs);
  const cached = tariffCache.get(key);
  if (cached && isCacheFresh()) {
    return { ok: true, rate: cached.mfnRate, entry: cached, source: cached.source, cached: true };
  }

  // Best-effort live lookup — only if we know the reporter code.
  const reporterCode = WTO_REPORTER_CODES[iso];
  if (reporterCode) {
    const { entries, error } = await fetchReporterTariffs(iso, reporterCode);
    if (entries.length > 0) {
      // Cache everything we got back (frees the caller from re-fetching
      // sibling HS codes), then return the requested row.
      for (const e of entries) {
        tariffCache.set(cacheKey(iso, e.hsCode), e);
      }
      if (lastSyncedAt === null) lastSyncedAt = Date.now();
      const match =
        tariffCache.get(key) ??
        entries.find((e) => e.hsCode === hs) ??
        // Try a prefix match (WTO codes are sometimes 8-10 digits; caller
        // often has a 6-digit HS). Pick the closest by length.
        entries.find((e) => e.hsCode.startsWith(hs) || hs.startsWith(e.hsCode));
      if (match) {
        return {
          ok: true,
          rate: match.mfnRate,
          entry: match,
          source: match.source,
          cached: false,
        };
      }
    } else if (error) {
      logger.warn("wto-tariff: live lookup failed, falling back to cache", {
        country: iso,
        hsCode: hs,
        error,
      });
    }
  }

  // Final fallback — even a stale cached entry is better than nothing.
  if (cached) {
    return { ok: true, rate: cached.mfnRate, entry: cached, source: cached.source, cached: true };
  }

  return {
    ok: false,
    rate: null,
    entry: null,
    source: "tariffdata.wto.org",
    cached: false,
  };
}

/** Read-only access to the cache size — used by the sync-status endpoint. */
export function getWtoCacheStats(): {
  cachedEntries: number;
  lastSyncedAt: string | null;
  countries: string[];
  ttlMs: number;
} {
  return {
    cachedEntries: tariffCache.size,
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    countries: Object.keys(WTO_REPORTER_CODES),
    ttlMs: WTO_CACHE_TTL_MS,
  };
}
