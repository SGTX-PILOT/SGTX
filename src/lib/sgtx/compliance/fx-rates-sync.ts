/**
 * FX Rates Sync — FREE sources (no API key, no billing)
 * ======================================================
 *
 * Sources
 * -------
 *   2a. https://open.er-api.com/v6/latest/USD  (free, no auth)
 *       Returns ~165 currencies against USD with `rates` map.
 *
 *   2b. https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 *       ECB euro reference rates (free, no auth). Returns ~30 currencies
 *       against EUR. We persist these with base="EUR" and source="ecb".
 *
 * Both feeds are persisted to the `FxRate` table. The unique constraint
 * `@@unique([base, quote, source])` means we keep both USD-based and
 * EUR-based snapshots side-by-side so downstream consumers (FeeLock,
 * customs duty calculator, CBE stub) can cross-rate via USD without
 * favouring any single source.
 *
 * The existing `src/lib/sgtx/gov/cbe.ts` keeps its hardcoded CBE table
 * for settlement instructions; this module provides live market rates
 * (which the CBE stub cross-references in production).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "./free-fetch";

const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const ECB_DAILY_XML_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export interface FxRateRecord {
  base: string;
  quote: string;
  rate: number;
  source: string;
}

export interface FxRatesSyncResult {
  ok: boolean;
  openEr: { parsed: number; upserted: number };
  ecb: { parsed: number; upserted: number };
  errors: string[];
  durationMs: number;
}

interface OpenErApiResponse {
  base?: string;
  rates?: Record<string, number>;
}

/** Parse ECB daily XML — returns [{quote, rate}]. */
export function parseEcbXml(xml: string): Array<{ quote: string; rate: number }> {
  const out: Array<{ quote: string; rate: number }> = [];
  const re = /<Cube\s+currency='([A-Z]{3})'\s+rate='([\d.]+)'\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] && m[2]) {
      const rate = parseFloat(m[2]);
      if (Number.isFinite(rate)) out.push({ quote: m[1], rate });
    }
  }
  // Some ECB releases use double quotes.
  if (out.length === 0) {
    const re2 = /<Cube\s+currency="([A-Z]{3})"\s+rate="([\d.]+)"\s*\/>/g;
    while ((m = re2.exec(xml)) !== null) {
      if (m[1] && m[2]) {
        const rate = parseFloat(m[2]);
        if (Number.isFinite(rate)) out.push({ quote: m[1], rate });
      }
    }
  }
  return out;
}

/**
 * Run both syncs (open.er-api.com + ECB) and persist results.
 * Returns the merged result. Each leg is independent — a failure in one
 * does NOT block the other.
 */
export async function syncFxRates(): Promise<FxRatesSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let openErParsed = 0;
  let openErUpserted = 0;
  let ecbParsed = 0;
  let ecbUpserted = 0;

  // ── 2a. open.er-api.com ────────────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(OPEN_ER_API_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      errors.push(`open.er-api.com fetch failed (${res ? res.status : "network"})`);
    } else {
      const data = (await res.json()) as OpenErApiResponse;
      if (data && data.rates) {
        openErParsed = Object.keys(data.rates).length;
        const entries = Object.entries(data.rates);
        const CHUNK = 200;
        for (let i = 0; i < entries.length; i += CHUNK) {
          const batch = entries.slice(i, i + CHUNK);
          try {
            await Promise.all(
              batch.map(([quote, rate]) =>
                db.fxRate.upsert({
                  where: {
                    base_quote_source: { base: "USD", quote, source: "open.er-api.com" },
                  },
                  create: { base: "USD", quote, rate, source: "open.er-api.com" },
                  update: { rate, syncedAt: new Date() },
                }),
              ),
            );
            openErUpserted += batch.length;
          } catch (batchErr) {
            const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            errors.push(`open.er-api.com batch @ ${i}: ${msg}`);
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`open.er-api.com: ${msg}`);
  }

  // ── 2b. ECB daily XML ─────────────────────────────────────────────────
  try {
    const res = await fetchWithTimeout(ECB_DAILY_XML_URL, {
      headers: { Accept: "application/xml,text/xml" },
    });
    if (!res || !res.ok) {
      errors.push(`ECB fetch failed (${res ? res.status : "network"})`);
    } else {
      const xml = await res.text();
      const rates = parseEcbXml(xml);
      ecbParsed = rates.length;
      const CHUNK = 100;
      for (let i = 0; i < rates.length; i += CHUNK) {
        const batch = rates.slice(i, i + CHUNK);
        try {
          await Promise.all(
            batch.map((r) =>
              db.fxRate.upsert({
                where: {
                  base_quote_source: { base: "EUR", quote: r.quote, source: "ecb" },
                },
                create: { base: "EUR", quote: r.quote, rate: r.rate, source: "ecb" },
                update: { rate: r.rate, syncedAt: new Date() },
              }),
            ),
          );
          ecbUpserted += batch.length;
        } catch (batchErr) {
          const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
          errors.push(`ECB batch @ ${i}: ${msg}`);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`ECB: ${msg}`);
  }

  const totalUpserted = openErUpserted + ecbUpserted;
  await logSync({
    integration: "fx-rates",
    source: "open.er-api.com+ecb",
    durationMs: Date.now() - start,
    recordsUpserted: totalUpserted,
    status: errors.length > 0 ? (totalUpserted > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
    errors,
  });

  logger.info("fx-rates sync completed", {
    openEr: { parsed: openErParsed, upserted: openErUpserted },
    ecb: { parsed: ecbParsed, upserted: ecbUpserted },
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    openEr: { parsed: openErParsed, upserted: openErUpserted },
    ecb: { parsed: ecbParsed, upserted: ecbUpserted },
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Look up the latest persisted FX rate for a pair. Tries USD-based rates
 * from open.er-api.com first, then ECB EUR rates (inverted if needed).
 */
export async function getLatestFxRate(
  from: string,
  to: string,
): Promise<{ rate: number | null; source: string | null; syncedAt: string | null }> {
  const fromU = from.toUpperCase();
  const toU = to.toUpperCase();
  if (fromU === toU) return { rate: 1, source: "identity", syncedAt: new Date().toISOString() };

  try {
    // Direct USD-based lookup.
    if (fromU === "USD") {
      const r = await db.fxRate.findUnique({
        where: { base_quote_source: { base: "USD", quote: toU, source: "open.er-api.com" } },
      });
      if (r) return { rate: r.rate, source: r.source, syncedAt: r.syncedAt.toISOString() };
    }
    if (toU === "USD") {
      const r = await db.fxRate.findUnique({
        where: { base_quote_source: { base: "USD", quote: fromU, source: "open.er-api.com" } },
      });
      if (r) return { rate: 1 / r.rate, source: r.source, syncedAt: r.syncedAt.toISOString() };
    }
    // EUR-based (ECB)
    if (fromU === "EUR") {
      const r = await db.fxRate.findUnique({
        where: { base_quote_source: { base: "EUR", quote: toU, source: "ecb" } },
      });
      if (r) return { rate: r.rate, source: r.source, syncedAt: r.syncedAt.toISOString() };
    }
    if (toU === "EUR") {
      const r = await db.fxRate.findUnique({
        where: { base_quote_source: { base: "EUR", quote: fromU, source: "ecb" } },
      });
      if (r) return { rate: 1 / r.rate, source: r.source, syncedAt: r.syncedAt.toISOString() };
    }
    // Cross-rate via USD (from -> USD -> to)
    const fromUsd = await db.fxRate.findUnique({
      where: { base_quote_source: { base: "USD", quote: fromU, source: "open.er-api.com" } },
    });
    const toUsd = await db.fxRate.findUnique({
      where: { base_quote_source: { base: "USD", quote: toU, source: "open.er-api.com" } },
    });
    if (fromUsd && toUsd && toUsd.rate > 0) {
      return {
        rate: fromUsd.rate / toUsd.rate,
        source: "cross-via-USD/open.er-api.com",
        syncedAt: fromUsd.syncedAt.toISOString(),
      };
    }
    return { rate: null, source: null, syncedAt: null };
  } catch (err) {
    logger.warn("fx-rates getLatestFxRate failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { rate: null, source: null, syncedAt: null };
  }
}
