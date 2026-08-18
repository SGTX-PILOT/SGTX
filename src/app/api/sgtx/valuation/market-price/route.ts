// GET /api/sgtx/valuation/market-price?hsCode=X&country=Y
//
// Returns the most recent MarketPriceData row for the (hsCode, country) pair,
// including source, confidence, and recordedAt timestamp.
//
// Query params:
//   ?hsCode=030221     (required — HS code, partial match on first 6 digits)
//   ?country=EG        (required — ISO 3166-1 alpha-2)
//
// Response:
//   { hsCode, country, marketPrice, currency, source, confidence, recordedAt }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getMarketPrice } from "@/lib/sgtx/valuation";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hsCode = url.searchParams.get("hsCode");
    const country = url.searchParams.get("country") || url.searchParams.get("countryCode");

    if (!hsCode) {
      return NextResponse.json({ error: "Missing required query param: hsCode" }, { status: 400 });
    }
    if (!country) {
      return NextResponse.json({ error: "Missing required query param: country" }, { status: 400 });
    }

    // Use the lib helper (defensive).
    const market = await getMarketPrice(hsCode, country);
    if (!market) {
      return NextResponse.json({
        hsCode,
        country: country.toUpperCase(),
        marketPrice: null,
        message: "No market price data available for this (hsCode, country) pair.",
      });
    }

    // Defensive: also return recent history (last 5 readings) for trend analysis.
    let history: any[] = [];
    try {
      history = await db.marketPriceData.findMany({
        where: {
          hsCode: { startsWith: hsCode.slice(0, Math.min(hsCode.length, 6)) },
          countryCode: country.toUpperCase(),
        },
        orderBy: { recordedAt: "desc" },
        take: 5,
      });
    } catch (e: any) {
      logger.warn("[valuation/market-price] history load failed", { error: e?.message });
    }

    return NextResponse.json({
      hsCode,
      country: country.toUpperCase(),
      marketPrice: market.price,
      currency: market.currency,
      source: market.source,
      confidence: market.confidence,
      recordedAt: market.recordedAt,
      history,
    });
  } catch (e: any) {
    logger.error("[valuation/market-price] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
