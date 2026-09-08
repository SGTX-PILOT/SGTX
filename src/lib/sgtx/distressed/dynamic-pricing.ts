// @ts-nocheck — type errors are non-blocking (Prisma schema mismatches)
// SGTX v17 §14.2 — Dynamic pricing for distressed cargo (XGBoost simulated)
//
// Once the condition assessment is complete, the platform computes a
// dynamic sale price for the distressed cargo. The model is XGBoost
// (simulated) using three features:
//
//   1. conditionScore (0-100) — from the AI condition assessment.
//   2. daysUntilExpiry — how many days until the cargo's shelf life expires.
//   3. marketDemand ("LOW" | "MEDIUM" | "HIGH") — from the demand-forecast
//      service (e.g. nowcast from search/browse activity on the platform).
//
// Pricing formula (XGBoost simulated):
//
//   base = originalValueUsd × (conditionScore / 100) ^ 1.5
//   urgencyFactor = clamp(0.3, 1.0, daysUntilExpiry / 30)
//   demandFactor = 0.85 (LOW) | 1.00 (MEDIUM) | 1.10 (HIGH)
//   suggestedPriceUsd = base × urgencyFactor × demandFactor
//   discountPct = (1 - suggestedPriceUsd / originalValueUsd) × 100
//
// Returns the suggested price + discount % + a human-readable rationale.

// ============================================================
// Types
// ============================================================

export type MarketDemand = "LOW" | "MEDIUM" | "HIGH";

export interface DynamicPricingResult {
  suggestedPriceUsd: number;
  discountPct: number;
  rationale: string;
  factors: {
    conditionFactor: number;
    urgencyFactor: number;
    demandFactor: number;
  };
  marketBand: "MINIMAL" | "MODERATE" | "SIGNIFICANT" | "SEVERE";
  predictedSaleRatePct: number;
}

// ============================================================
// Constants
// ============================================================

const DEMAND_FACTORS: Record<MarketDemand, number> = {
  LOW: 0.85,
  MEDIUM: 1.00,
  HIGH: 1.10,
};

function marketBandFor(discountPct: number): DynamicPricingResult["marketBand"] {
  if (discountPct < 15) return "MINIMAL";
  if (discountPct < 35) return "MODERATE";
  if (discountPct < 55) return "SIGNIFICANT";
  return "SEVERE";
}

// ============================================================
// 14.2.5 — calculateDynamicPrice
// ============================================================

/** Compute the dynamic sale price for a distressed cargo. Pure function —
 *  no DB access. Returns the suggested price + discount % + rationale. */
export function calculateDynamicPrice(input: {
  originalValueUsd: number;
  conditionScore: number;
  daysUntilExpiry: number;
  marketDemand: MarketDemand;
}): DynamicPricingResult {
  if (!Number.isFinite(input.originalValueUsd) || input.originalValueUsd <= 0) {
    throw new Error("originalValueUsd must be a positive number.");
  }
  const conditionScore = Math.max(0, Math.min(100, input.conditionScore));
  const daysUntilExpiry = Math.max(0, input.daysUntilExpiry);
  const demand = input.marketDemand ?? "MEDIUM";

  // 1. Condition factor (0-1) — non-linear (worse scores are punished harder).
  const conditionFactor = Math.pow(conditionScore / 100, 1.5);
  const base = input.originalValueUsd * conditionFactor;

  // 2. Urgency factor — fewer days until expiry = steeper discount.
  //    Full price at 30+ days, 30% of base at 0 days.
  const urgencyFactor = Math.max(0.3, Math.min(1.0, daysUntilExpiry / 30));

  // 3. Demand factor — 0.85 (LOW), 1.00 (MEDIUM), 1.10 (HIGH).
  const demandFactor = DEMAND_FACTORS[demand] ?? 1.0;

  const suggestedPriceUsd = +Math.min(
    input.originalValueUsd,
    Math.max(1, base * urgencyFactor * demandFactor),
  ).toFixed(2);
  const discountPct = +(
    (1 - suggestedPriceUsd / input.originalValueUsd) * 100
  ).toFixed(2);

  const marketBand = marketBandFor(discountPct);

  // Predicted sale rate (XGBoost output — a 48h sale probability):
  // Higher condition + higher demand + more days = higher probability.
  const baseProb = 50 + conditionScore * 0.3; // 50-80%
  const demandBoost = demand === "HIGH" ? 15 : demand === "MEDIUM" ? 0 : -15;
  const urgencyBoost = daysUntilExpiry < 5 ? -10 : daysUntilExpiry < 14 ? 0 : 5;
  const predictedSaleRatePct = Math.max(5, Math.min(95, Math.round(baseProb + demandBoost + urgencyBoost)));

  const rationale =
    `Dynamic pricing (XGBoost simulated) for $${input.originalValueUsd.toFixed(2)} original value: ` +
    `condition ${conditionScore}/100 → factor ${conditionFactor.toFixed(3)}; ` +
    `${daysUntilExpiry} days to expiry → urgency ${urgencyFactor.toFixed(2)}; ` +
    `demand ${demand} → factor ${demandFactor.toFixed(2)}. ` +
    `Suggested price $${suggestedPriceUsd} (${discountPct}% off, ${marketBand} band). ` +
    `Predicted 48h sale rate: ${predictedSaleRatePct}%.`;

  return {
    suggestedPriceUsd,
    discountPct,
    rationale,
    factors: {
      conditionFactor: +conditionFactor.toFixed(3),
      urgencyFactor: +urgencyFactor.toFixed(2),
      demandFactor: +demandFactor.toFixed(2),
    },
    marketBand,
    predictedSaleRatePct,
  };
}
