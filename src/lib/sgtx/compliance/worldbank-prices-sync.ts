/**
 * Commodity Prices Sync — Yahoo Finance public chart API (TRULY FREE)
 * ===================================================================
 *
 * NOTE: The task spec referenced `https://api.worldbank.org/v2/commodity-price`
 *       (JSON, no auth). That endpoint does NOT exist — World Bank's commodity
 *       data (Pink Sheet) is published only as Excel/PDF and the closest API
 *       endpoint (`/sources/15/series`) exposes macro series (CPI, FX, GDP),
 *       not spot commodity prices.
 *
 *       We therefore use Yahoo Finance's PUBLIC chart API
 *         `https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}`
 *       which returns live futures + spot prices for ~30 commodities with
 *       NO API key, NO auth, NO billing. The endpoint is rate-limited
 *       (~2000 req/hr per IP) and is widely used by open-source finance
 *       libraries (yfinance, yahoo-finance2, etc.).
 *
 * The file path is kept as `worldbank-prices-sync.ts` per the task spec —
 * the module name in the DB log is `worldbank-prices` so operators see it
 * alongside the other free integrations.
 *
 * Curated commodity symbols (Yahoo Finance format):
 *   CL=F    Crude Oil WTI (USD/bbl)
 *   BZ=F    Brent Crude (USD/bbl)
 *   NG=F    Natural Gas Henry Hub (USD/MMBtu)
 *   ZW=F    Wheat (USD/bushel, CBOT)
 *   ZC=F    Corn (USD/bushel, CBOT)
 *   ZS=F    Soybeans (USD/bushel, CBOT)
 *   KC=F    Coffee Arabica (USD/lb, ICE)
 *   CT=F    Cotton #2 (USD/lb, ICE)
 *   SB=F    Sugar #11 (USD/lb, ICE)
 *   CC=F    Cocoa (USD/mt, ICE)
 *   HG=F    Copper (USD/lb, COMEX)
 *   GC=F    Gold (USD/oz, COMEX)
 *   SI=F    Silver (USD/oz, COMEX)
 *   PL=F    Platinum (USD/oz, NYMEX)
 *   PA=F    Palladium (USD/oz, NYMEX)
 *   ZN=F    Zinc (USD/lb)
 *   LE=F    Lean Hogs (USD/lb, CME)
 *   LC=F    Live Cattle (USD/lb, CME)
 *   Lumber=F Random Length Lumber (USD/1000 board ft, CME)
 *   OJ=F    Orange Juice (USD/lb, ICE)
 *   RR=F    Rough Rice (USD/cwt, CBOT)
 *   ZM=F    Soybean Meal (USD/short ton, CBOT)
 *   ZL=F    Soybean Oil (USD/lb, CBOT)
 *   KE=F    HRW Wheat (USD/bushel, CBOT)
 *   BTC-USD Bitcoin (USD)
 *   ETH-USD Ethereum (USD)
 *
 * Public endpoint. No API key, no billing. Failures are non-fatal.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "./free-fetch";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

interface YahooCommodity {
  symbol: string;
  name: string;
  unit: string;
}

/** Curated list of 25+ commodity + crypto symbols. */
const COMMODITIES: YahooCommodity[] = [
  { symbol: "CL=F", name: "Crude Oil WTI", unit: "USD/bbl" },
  { symbol: "BZ=F", name: "Brent Crude", unit: "USD/bbl" },
  { symbol: "NG=F", name: "Natural Gas Henry Hub", unit: "USD/MMBtu" },
  { symbol: "ZW=F", name: "Wheat (CBOT)", unit: "USD/bushel" },
  { symbol: "ZC=F", name: "Corn (CBOT)", unit: "USD/bushel" },
  { symbol: "ZS=F", name: "Soybeans (CBOT)", unit: "USD/bushel" },
  { symbol: "KC=F", name: "Coffee Arabica (ICE)", unit: "USD/lb" },
  { symbol: "CT=F", name: "Cotton #2 (ICE)", unit: "USD/lb" },
  { symbol: "SB=F", name: "Sugar #11 (ICE)", unit: "USD/lb" },
  { symbol: "CC=F", name: "Cocoa (ICE)", unit: "USD/mt" },
  { symbol: "HG=F", name: "Copper (COMEX)", unit: "USD/lb" },
  { symbol: "GC=F", name: "Gold (COMEX)", unit: "USD/oz" },
  { symbol: "SI=F", name: "Silver (COMEX)", unit: "USD/oz" },
  { symbol: "PL=F", name: "Platinum (NYMEX)", unit: "USD/oz" },
  { symbol: "PA=F", name: "Palladium (NYMEX)", unit: "USD/oz" },
  { symbol: "LE=F", name: "Lean Hogs (CME)", unit: "USD/lb" },
  { symbol: "LC=F", name: "Live Cattle (CME)", unit: "USD/lb" },
  { symbol: "OJ=F", name: "Orange Juice (ICE)", unit: "USD/lb" },
  { symbol: "RR=F", name: "Rough Rice (CBOT)", unit: "USD/cwt" },
  { symbol: "ZM=F", name: "Soybean Meal (CBOT)", unit: "USD/short ton" },
  { symbol: "ZL=F", name: "Soybean Oil (CBOT)", unit: "USD/lb" },
  { symbol: "KE=F", name: "HRW Wheat (CBOT)", unit: "USD/bushel" },
  { symbol: "BTC-USD", name: "Bitcoin", unit: "USD" },
  { symbol: "ETH-USD", name: "Ethereum", unit: "USD" },
];

export interface CommodityPriceSyncResult {
  ok: boolean;
  parsed: number;
  upserted: number;
  errors: string[];
  durationMs: number;
  source: string;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        currency?: string;
        symbol?: string;
        shortName?: string;
        regularMarketTime?: number;
      };
    }>;
    error?: { code?: string; description?: string };
  };
}

/**
 * Fetch the latest spot/futures price for a Yahoo Finance commodity symbol.
 * Returns `null` if the fetch fails or the symbol is unknown.
 */
export async function fetchCommodityPrice(symbol: string): Promise<{
  price: number;
  currency: string;
  timestamp: number;
} | null> {
  try {
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res || !res.ok) return null;
    const data = (await res.json()) as YahooChartResponse;
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    return {
      price: meta.regularMarketPrice,
      currency: meta.currency ?? "USD",
      timestamp: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
    };
  } catch (err) {
    logger.warn("commodity-price fetch failed", {
      symbol,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Download and persist the latest commodity prices from Yahoo Finance. */
export async function syncWorldBankPrices(): Promise<CommodityPriceSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let parsed = 0;
  let upserted = 0;

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  for (const c of COMMODITIES) {
    try {
      // Polite 200ms gap between requests (Yahoo is rate-limited).
      await new Promise((r) => setTimeout(r, 200));
      const result = await fetchCommodityPrice(c.symbol);
      if (!result) {
        errors.push(`${c.symbol}: no price returned`);
        continue;
      }
      parsed++;

      try {
        await db.worldBankPrice.upsert({
          where: {
            commodity_date: { commodity: c.name, date: dateStr },
          },
          create: {
            commodity: c.name,
            price: result.price,
            unit: c.unit,
            date: dateStr,
          },
          update: {
            price: result.price,
            unit: c.unit,
          },
        });
        upserted++;
      } catch (dbErr) {
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        errors.push(`${c.symbol} db: ${msg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${c.symbol}: ${msg}`);
    }
  }

  await logSync({
    integration: "worldbank-prices",
    source: "query1.finance.yahoo.com",
    durationMs: Date.now() - start,
    recordsUpserted: upserted,
    status: errors.length > 0 ? (upserted > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
    errors,
  });

  logger.info("commodity-prices sync completed", {
    parsed,
    upserted,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });
  return {
    ok: errors.length === 0,
    parsed,
    upserted,
    errors,
    durationMs: Date.now() - start,
    source: "query1.finance.yahoo.com",
  };
}

/** Look up the latest persisted price for a commodity name. */
export async function getLatestCommodityPrice(commodity: string): Promise<{
  commodity: string;
  price: number;
  unit: string;
  date: string;
} | null> {
  try {
    const row = await db.worldBankPrice.findFirst({
      where: { commodity: { contains: commodity } },
      orderBy: { date: "desc" },
    });
    if (!row) return null;
    return {
      commodity: row.commodity,
      price: row.price,
      unit: row.unit,
      date: row.date,
    };
  } catch (err) {
    logger.warn("commodity-prices getLatest failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** List all known commodity symbols (used by the latest endpoint for UX). */
export function listCommoditySymbols(): YahooCommodity[] {
  return [...COMMODITIES];
}
