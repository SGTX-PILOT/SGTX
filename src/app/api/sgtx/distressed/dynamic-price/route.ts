// @ts-nocheck
// SGTX v17 §14.2 — Dynamic distressed cargo pricing (XGBoost simulated)
//
// POST /api/sgtx/distressed/dynamic-price
//   Body: { original_value_usd, condition_score, days_until_expiry,
//           market_demand: "LOW" | "MEDIUM" | "HIGH" }
//   Returns: { ok, suggested_price_usd, discount_pct, rationale, factors,
//              market_band, predicted_sale_rate_pct }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateDynamicPrice,
  type MarketDemand,
} from "@/lib/sgtx/distressed/dynamic-pricing";

export const dynamic = "force-dynamic";

const VALID_DEMANDS: MarketDemand[] = ["LOW", "MEDIUM", "HIGH"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      original_value_usd,
      condition_score,
      days_until_expiry,
      market_demand,
    } = body ?? {};

    if (!Number.isFinite(Number(original_value_usd)) || Number(original_value_usd) <= 0) {
      return NextResponse.json(
        { error: "original_value_usd must be a positive number" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(Number(condition_score))) {
      return NextResponse.json(
        { error: "condition_score must be a number (0-100)" },
        { status: 400 },
      );
    }
    if (!Number.isFinite(Number(days_until_expiry))) {
      return NextResponse.json(
        { error: "days_until_expiry must be a number" },
        { status: 400 },
      );
    }
    const demand = String(market_demand || "MEDIUM").toUpperCase() as MarketDemand;
    if (!VALID_DEMANDS.includes(demand)) {
      return NextResponse.json(
        { error: `market_demand must be one of ${VALID_DEMANDS.join(", ")}` },
        { status: 400 },
      );
    }

    const result = calculateDynamicPrice({
      originalValueUsd: Number(original_value_usd),
      conditionScore: Number(condition_score),
      daysUntilExpiry: Number(days_until_expiry),
      marketDemand: demand,
    });

    return NextResponse.json({
      ok: true,
      suggested_price_usd: result.suggestedPriceUsd,
      discount_pct: result.discountPct,
      rationale: result.rationale,
      factors: result.factors,
      market_band: result.marketBand,
      predicted_sale_rate_pct: result.predictedSaleRatePct,
    });
  } catch (e: any) {
    logger.error("[distressed/dynamic-price]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
