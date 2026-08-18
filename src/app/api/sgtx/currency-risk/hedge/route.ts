// POST /api/sgtx/currency-risk/hedge — Create a hedging recommendation
//
// Body:
//   {
//     tenantGtid: string,
//     currencyPair: string,                  // e.g. "USD/EGP"
//     exposureAmount: number,
//     riskLevel?: "LOW"|"MEDIUM"|"HIGH",     // derived if omitted
//     recommendedHedgePercentage?: number,   // 0..100, derived if omitted
//     estimatedCost?: number,                // optional
//     explanation?: string,
//     validUntilDays?: number                // default 7
//   }
//
// Either riskLevel is supplied explicitly, or the engine derives it from
// the currency pair + exposure amount (using calculateCurrencyExposure).
// Persists a HedgingRecommendation row.
//
// Response: { ok, recommendationId, validUntil, recommendation }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateCurrencyExposure,
  createHedgingRecommendation,
} from "@/lib/sgtx/currency-risk";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantGtid,
      currencyPair,
      exposureAmount,
      riskLevel,
      recommendedHedgePercentage,
      estimatedCost,
      explanation,
      validUntilDays,
    } = body || {};

    const missing: string[] = [];
    if (!tenantGtid) missing.push("tenantGtid");
    if (!currencyPair) missing.push("currencyPair");
    if (exposureAmount === undefined || exposureAmount === null) missing.push("exposureAmount");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    if (typeof exposureAmount !== "number" || exposureAmount < 0) {
      return NextResponse.json(
        { error: "exposureAmount must be a non-negative number" },
        { status: 400 },
      );
    }

    // Parse currencyPair into base/quote (defensive).
    const parts = String(currencyPair).toUpperCase().split("/");
    const base = parts[0] || "USD";
    const quote = parts[1] || "USD";

    // Derive risk level if not supplied.
    const VALID_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
    type RiskLevel = (typeof VALID_RISK_LEVELS)[number];
    let resolvedRiskLevel: RiskLevel | undefined =
      riskLevel && VALID_RISK_LEVELS.includes(riskLevel) ? riskLevel : undefined;
    let derivedExplanation = explanation;
    let derivedRecommendedPct = recommendedHedgePercentage;
    if (!resolvedRiskLevel) {
      const calc = await calculateCurrencyExposure({
        baseCurrency: base,
        exposureCurrency: quote,
        exposureAmount,
      });
      resolvedRiskLevel = calc.riskLevel;
      if (derivedRecommendedPct === undefined) {
        derivedRecommendedPct = calc.recommendedHedgePercentage;
      }
      if (!derivedExplanation) {
        derivedExplanation = calc.explanation;
      }
    }

    const created = await createHedgingRecommendation({
      tenantGtid,
      currencyPair,
      exposureAmount,
      riskLevel: resolvedRiskLevel,
      recommendedHedgePercentage: derivedRecommendedPct,
      estimatedCost,
      explanation: derivedExplanation,
      validUntilDays,
    });

    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist hedging recommendation (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      recommendationId: created.id,
      validUntil: created.validUntil,
      recommendation: {
        tenantGtid,
        currencyPair: currencyPair.toUpperCase(),
        exposureAmount,
        riskLevel: resolvedRiskLevel,
        recommendedHedgePercentage: derivedRecommendedPct,
        estimatedCost: estimatedCost ?? null,
        explanation: derivedExplanation ?? null,
        validUntil: created.validUntil,
      },
    });
  } catch (e: any) {
    logger.error("[currency-risk/hedge] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
