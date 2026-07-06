// SGTX BRAIN — Dynamic Fee Valuation (calculateDynamicFee)
//
// Replaces the static 1.5%-per-side fee with a Brain-computed dynamic fee
// that adjusts within constitutional bounds (0.1% - 2.5% per Part 1.3.2
// fee_gate) based on:
//   1. Commodity volatility  (searchCommodityPrices  — price spread signal)
//   2. Route risk            (predictTradeRisk        — corridor risk score)
//   3. Liquidity             (forecastDemand          — demand-index signal)
//   4. Perishable urgency    (perishable-requirements — peak/off-season)
//
// The multiplier is the product of a sequence of signed adjustments applied
// to a neutral base of 1.0, then clamped to [0.5, 2.0]. The final rate is
// baseRate (0.015) * multiplier, clamped to [0.001, 0.025]. If every Brain
// signal fails (commodity unknown, providers down), the function falls back
// to the static 1.5% with multiplier 1.0 and a note in `rationale`.
//
// AUDIT-1 finding #2 ("Dynamic FeeLock Valuation MISSING") — this module
// closes that gap. The output is consumed by the FeeLock freeze route
// (/api/sgtx/payment/fealock/freeze) which records the breakdown in an
// Activity log row and uses `finalRate` to refresh the FeeLock's sgtxFeeUsd
// before the ACTIVE → FROZEN transition.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  searchCommodityPrices,
  type CommodityPrice,
} from "@/lib/sgtx/ai/brain";
import {
  predictTradeRisk,
  forecastDemand,
} from "@/lib/sgtx/ai/brain-intelligence";
import { searchPerishableDB } from "@/lib/sgtx/ai/perishable-requirements";

// ============================================================
// Constitutional bounds (Part 1.3.2 fee_gate.wasm)
// ============================================================

/** Static platform-fee default — 1.5% per side. */
export const BASE_FEE_RATE = 0.015;
/** Constitutional lower bound — 0.1% (Part 1.3.2 fee_gate). */
export const FEE_RATE_MIN = 0.001;
/** Constitutional upper bound — 2.5% (Part 1.3.2 fee_gate). */
export const FEE_RATE_MAX = 0.025;
/** Multiplier floor — half the static rate. */
export const MULTIPLIER_MIN = 0.5;
/** Multiplier ceiling — double the static rate. */
export const MULTIPLIER_MAX = 2.0;

// ============================================================
// Public types
// ============================================================

export interface DynamicFeeInput {
  ustn?: string;
  commodity?: string;
  originCountry?: string;
  destCountry?: string;
  contractValueUsd?: number;
  hsCode?: string;
}

export interface DynamicFeeFactor {
  factor:
    | "commodity_volatility"
    | "route_risk"
    | "liquidity"
    | "perishable_urgency";
  baseMultiplier: number; // 1.0 = neutral
  adjustment: number; // delta applied to multiplier (signed)
  detail: string;
  source: string;
}

export interface DynamicFeeResult {
  baseRate: number; // 0.015 (1.5%) — the static default
  multiplier: number; // 0.5x to 2.0x
  finalRate: number; // clamped to [0.001, 0.025] (0.1%-2.5% constitutional bounds)
  feeAmountUsd: number;
  factors: DynamicFeeFactor[];
  rationale: string; // plain-language explanation
  constitutionalCompliant: boolean;
  assessedAt: string;
  brainModule: string; // "calculateDynamicFee"
}

// ============================================================
// Internal helpers
// ============================================================

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function currentIsoMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Determine whether a perishable commodity is currently in peak harvest season.
 *
 * The perishable-requirements module does not carry explicit season data, so
 * we apply a conservative Northern-Hemisphere heuristic by category:
 *   • Fresh Fruit / Fresh Vegetable / Flowers → peak May–September
 *   • Frozen / Meat / Dairy / Seafood / Pharma → no seasonal peak (year-round supply)
 *
 * This is intentionally conservative — when in doubt we return false so the
 * perishable-urgency premium (off-season spoilage risk) can apply.
 */
function isPerishableInPeakSeason(
  commodity: string,
  hsCode?: string,
): { perishable: boolean; peak: boolean; category?: string } {
  const match = searchPerishableDB(commodity, hsCode);
  if (!match) {
    return { perishable: false, peak: false };
  }
  const seasonalCategories = ["Fresh Fruit", "Fresh Vegetable", "Flowers"];
  const seasonal = seasonalCategories.includes(match.category);
  if (!seasonal) {
    return { perishable: true, peak: false, category: match.category };
  }
  const month = new Date().getUTCMonth() + 1; // 1-12
  const peak = month >= 5 && month <= 9; // May–September
  return { perishable: true, peak, category: match.category };
}

/**
 * Look up a Trade row by USTN to enrich the input. Used when the caller
 * passes only a USTN (e.g., the FeeLock freeze route) and the Brain needs
 * commodity / corridor / counterparty fields to feed its signals.
 *
 * Returns null on any error — callers must treat null as "signal unavailable"
 * and skip the corresponding factor rather than throwing.
 */
async function lookupTrade(ustn: string): Promise<{
  commodity: string;
  hsCode?: string;
  originCountry: string;
  destCountry: string;
  contractValueUsd: number;
  buyerGtid: string;
  sellerGtid: string;
  incoterm: string;
} | null> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true },
    }) as any;
    if (!trade) return null;
    return {
      commodity: trade.commodity,
      hsCode: trade.commodityHs || undefined,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      contractValueUsd: trade.tradeValueUsd,
      buyerGtid: trade.buyerGtid,
      sellerGtid: trade.sellerGtid,
      incoterm: trade.incoterm,
    };
  } catch (err) {
    logger.warn("[calculateDynamicFee] trade lookup failed", {
      ustn,
      error: (err as Error)?.message,
    });
    return null;
  }
}

// ============================================================
// Factor evaluators — each returns a DynamicFeeFactor or null on failure
// ============================================================

/**
 * Factor 1 — Commodity volatility.
 *
 * Calls `searchCommodityPrices` for the commodity at origin and destination
 * (when available). Computes the price spread = (max - min) / avg across all
 * returned readings. Volatile commodities (spread > 15%) incur a +0.3 risk
 * premium on the multiplier; stable commodities (spread < 5%) earn a -0.2
 * velocity discount. Perishables in peak harvest season earn an additional
 * -0.1 to encourage trade velocity (move the cargo before it spoils).
 */
async function evaluateCommodityVolatility(
  commodity: string,
  originCountry?: string,
  destCountry?: string,
  hsCode?: string,
): Promise<DynamicFeeFactor | null> {
  if (!commodity) return null;

  const ports: Array<{ port: string; country: string }> = [];
  if (destCountry) ports.push({ port: destCountry, country: destCountry });
  if (originCountry && originCountry !== destCountry) {
    ports.push({ port: originCountry, country: originCountry });
  }
  if (ports.length === 0) ports.push({ port: "GLOBAL", country: "US" });

  let prices: CommodityPrice[] = [];
  try {
    const responses = await Promise.all(
      ports.map((p) => searchCommodityPrices(commodity, p.port, p.country)),
    );
    prices = responses.flat().filter((p) => p && p.priceUsd > 0);
  } catch (err) {
    logger.warn("[calculateDynamicFee] searchCommodityPrices failed", {
      commodity,
      error: (err as Error)?.message,
    });
    return null;
  }

  if (prices.length === 0) return null;

  const priceValues = prices.map((p) => p.priceUsd);
  const high = Math.max(...priceValues);
  const low = Math.min(...priceValues);
  const avg = priceValues.reduce((sum, p) => sum + p, 0) / priceValues.length;
  const spreadPct = avg > 0 ? (high - low) / avg : 0;
  const spreadPctRounded = round4(spreadPct);

  let adjustment = 0;
  const detailParts: string[] = [];
  if (spreadPct > 0.15) {
    adjustment += 0.3;
    detailParts.push(
      `spread ${(spreadPctRounded * 100).toFixed(1)}% > 15% threshold → +0.3 risk premium`,
    );
  } else if (spreadPct < 0.05) {
    adjustment -= 0.2;
    detailParts.push(
      `spread ${(spreadPctRounded * 100).toFixed(1)}% < 5% threshold → -0.2 velocity discount`,
    );
  } else {
    detailParts.push(
      `spread ${(spreadPctRounded * 100).toFixed(1)}% within 5-15% neutral band`,
    );
  }

  // Peak-season perishable velocity incentive (additional -0.1)
  const season = isPerishableInPeakSeason(commodity, hsCode);
  if (season.perishable && season.peak) {
    adjustment -= 0.1;
    detailParts.push(
      `perishable (${season.category}) in peak harvest season → -0.1 velocity incentive`,
    );
  }

  return {
    factor: "commodity_volatility",
    baseMultiplier: 1.0,
    adjustment: round4(adjustment),
    detail: detailParts.join("; "),
    source: `searchCommodityPrices (${prices.length} reading${prices.length === 1 ? "" : "s"} across ${ports.length} port${ports.length === 1 ? "" : "s"})`,
  };
}

/**
 * Factor 2 — Route risk.
 *
 * Calls `predictTradeRisk` for the origin→dest corridor. The Brain returns a
 * 0-100 risk score; we normalize to 0-1. Risk > 0.6 adds +0.4 to the
 * multiplier (risk premium). Risk < 0.3 subtracts 0.1 (safe-corridor
 * discount).
 */
async function evaluateRouteRisk(
  ustn: string | undefined,
  commodity: string | undefined,
  hsCode: string | undefined,
  originCountry: string | undefined,
  destCountry: string | undefined,
  contractValueUsd: number | undefined,
  buyerGtid: string | undefined,
  sellerGtid: string | undefined,
  incoterm: string | undefined,
): Promise<DynamicFeeFactor | null> {
  if (
    !ustn ||
    !commodity ||
    !hsCode ||
    !originCountry ||
    !destCountry ||
    contractValueUsd == null ||
    !buyerGtid ||
    !sellerGtid ||
    !incoterm
  ) {
    return null;
  }

  let riskScoreNorm: number;
  let riskLevel: string;
  try {
    const result = await predictTradeRisk({
      ustn,
      buyerGtid,
      sellerGtid,
      commodity,
      hsCode,
      tradeValueUsd: contractValueUsd,
      originCountry,
      destCountry,
      incoterm,
    });
    riskScoreNorm = clamp(result.riskScore / 100, 0, 1);
    riskLevel = result.riskLevel;
  } catch (err) {
    logger.warn("[calculateDynamicFee] predictTradeRisk failed", {
      ustn,
      error: (err as Error)?.message,
    });
    return null;
  }

  let adjustment = 0;
  let detail: string;
  if (riskScoreNorm > 0.6) {
    adjustment = 0.4;
    detail = `route risk ${(riskScoreNorm * 100).toFixed(0)}/100 (${riskLevel}) > 60 threshold → +0.4 risk premium`;
  } else if (riskScoreNorm < 0.3) {
    adjustment = -0.1;
    detail = `route risk ${(riskScoreNorm * 100).toFixed(0)}/100 (${riskLevel}) < 30 threshold → -0.1 safe-corridor discount`;
  } else {
    adjustment = 0;
    detail = `route risk ${(riskScoreNorm * 100).toFixed(0)}/100 (${riskLevel}) within 30-60 neutral band`;
  }

  return {
    factor: "route_risk",
    baseMultiplier: 1.0,
    adjustment: round4(adjustment),
    detail,
    source: "predictTradeRisk",
  };
}

/**
 * Factor 3 — Liquidity.
 *
 * Calls `forecastDemand` for the commodity. A high demand index (abundant
 * supply, demandIndex > 60) earns a -0.15 velocity discount to encourage
 * trade flow. A low index (scarce supply, demandIndex < 40) adds +0.2 to
 * compensate for platform liquidity risk.
 */
async function evaluateLiquidity(
  commodity: string | undefined,
  hsCode: string | undefined,
): Promise<DynamicFeeFactor | null> {
  if (!commodity) return null;

  let demandIndex: number;
  let trend: string;
  let recommendation: string;
  try {
    const result = await forecastDemand(
      commodity,
      hsCode || "",
      currentIsoMonth(),
    );
    demandIndex = result.demandIndex;
    trend = result.trend;
    recommendation = result.recommendation;
  } catch (err) {
    logger.warn("[calculateDynamicFee] forecastDemand failed", {
      commodity,
      error: (err as Error)?.message,
    });
    return null;
  }

  let adjustment = 0;
  let detail: string;
  if (demandIndex > 60) {
    adjustment = -0.15;
    detail = `demand index ${demandIndex}/100 (${trend}) > 60 → -0.15 velocity discount (abundant supply)`;
  } else if (demandIndex < 40) {
    adjustment = 0.2;
    detail = `demand index ${demandIndex}/100 (${trend}) < 40 → +0.2 scarcity premium (low liquidity)`;
  } else {
    adjustment = 0;
    detail = `demand index ${demandIndex}/100 (${trend}) within 40-60 neutral band`;
  }

  return {
    factor: "liquidity",
    baseMultiplier: 1.0,
    adjustment: round4(adjustment),
    detail: `${detail}. Forecast: ${recommendation}`,
    source: "forecastDemand",
  };
}

/**
 * Factor 4 — Perishable urgency.
 *
 * If the commodity is perishable AND not in peak season (off-season
 * spoilage risk), add +0.15 urgency premium — off-season perishables need
 * faster execution to avoid cargo loss, so the platform fee rises to
 * compensate for the elevated monitoring / re-dispatch overhead.
 */
function evaluatePerishableUrgency(
  commodity: string | undefined,
  hsCode?: string,
): DynamicFeeFactor | null {
  if (!commodity) return null;
  const season = isPerishableInPeakSeason(commodity, hsCode);
  if (!season.perishable) return null;

  if (season.peak) {
    return {
      factor: "perishable_urgency",
      baseMultiplier: 1.0,
      adjustment: 0,
      detail: `perishable (${season.category}) in peak season — no urgency premium`,
      source: "perishable-requirements (searchPerishableDB)",
    };
  }

  return {
    factor: "perishable_urgency",
    baseMultiplier: 1.0,
    adjustment: 0.15,
    detail: `perishable (${season.category}) off-season → +0.15 urgency premium (spoilage risk)`,
    source: "perishable-requirements (searchPerishableDB)",
  };
}

// ============================================================
// Main entry — calculateDynamicFee
// ============================================================

/**
 * Compute a dynamic SGTX platform fee within constitutional bounds.
 *
 * @param input  Trade context (USTN + optional commodity / corridor / value fields).
 *                When only `ustn` is provided, the Trade row is fetched from the DB
 *                to populate the remaining fields.
 *
 * @returns DynamicFeeResult with `finalRate` clamped to [0.001, 0.025],
 *          `multiplier` clamped to [0.5, 2.0], and a plain-language rationale.
 */
export async function calculateDynamicFee(
  input: DynamicFeeInput,
): Promise<DynamicFeeResult> {
  const assessedAt = new Date().toISOString();
  const brainModule = "calculateDynamicFee";

  // ---- 1. Resolve input fields (DB lookup if USTN-only) ----
  let commodity = input.commodity;
  let hsCode = input.hsCode;
  let originCountry = input.originCountry;
  let destCountry = input.destCountry;
  let contractValueUsd = input.contractValueUsd;
  let buyerGtid: string | undefined;
  let sellerGtid: string | undefined;
  let incoterm: string | undefined;

  const needsLookup =
    (!commodity || !originCountry || !destCountry || contractValueUsd == null) &&
    !!input.ustn;

  if (needsLookup) {
    const trade = await lookupTrade(input.ustn as string);
    if (trade) {
      commodity = commodity || trade.commodity;
      hsCode = hsCode || trade.hsCode;
      originCountry = originCountry || trade.originCountry;
      destCountry = destCountry || trade.destCountry;
      contractValueUsd =
        contractValueUsd != null ? contractValueUsd : trade.contractValueUsd;
      buyerGtid = trade.buyerGtid;
      sellerGtid = trade.sellerGtid;
      incoterm = trade.incoterm;
    }
  }

  // ---- 2. Evaluate factors (each is independently fault-tolerant) ----
  const factors: DynamicFeeFactor[] = [];

  const volatilityFactor = await evaluateCommodityVolatility(
    commodity || "",
    originCountry,
    destCountry,
    hsCode,
  ).catch(() => null);
  if (volatilityFactor) factors.push(volatilityFactor);

  const routeRiskFactor = await evaluateRouteRisk(
    input.ustn,
    commodity,
    hsCode,
    originCountry,
    destCountry,
    contractValueUsd,
    buyerGtid,
    sellerGtid,
    incoterm,
  ).catch(() => null);
  if (routeRiskFactor) factors.push(routeRiskFactor);

  const liquidityFactor = await evaluateLiquidity(
    commodity,
    hsCode,
  ).catch(() => null);
  if (liquidityFactor) factors.push(liquidityFactor);

  const perishableFactor = evaluatePerishableUrgency(commodity, hsCode);
  if (perishableFactor) factors.push(perishableFactor);

  // ---- 3. Aggregate multiplier (start at 1.0, apply signed adjustments) ----
  let multiplier = 1.0;
  for (const f of factors) {
    multiplier += f.adjustment;
  }
  const clampedMultiplier = clamp(multiplier, MULTIPLIER_MIN, MULTIPLIER_MAX);

  // ---- 4. Final rate (constitutional clamp) ----
  const rawRate = BASE_FEE_RATE * clampedMultiplier;
  const finalRate = clamp(rawRate, FEE_RATE_MIN, FEE_RATE_MAX);
  const finalRateRounded = round4(finalRate);
  const feeAmountUsd =
    contractValueUsd != null ? round2(contractValueUsd * finalRateRounded) : 0;

  // ---- 5. Constitutional compliance flag ----
  const constitutionalCompliant = finalRateRounded >= FEE_RATE_MIN && finalRateRounded <= FEE_RATE_MAX;

  // ---- 6. Rationale (plain-language summary) ----
  // Pass the rounded values so the rationale text matches the structured
  // fields exactly (avoids 1.58% vs 1.57% cosmetic drift from float repr).
  const rationale = buildRationale({
    factors,
    multiplier: clampedMultiplier,
    finalRate: finalRateRounded,
    fallbackUsed: factors.length === 0,
  });

  return {
    baseRate: BASE_FEE_RATE,
    multiplier: round4(clampedMultiplier),
    finalRate: finalRateRounded,
    feeAmountUsd,
    factors,
    rationale,
    constitutionalCompliant,
    assessedAt,
    brainModule,
  };
}

// ============================================================
// Rationale builder
// ============================================================

function buildRationale(params: {
  factors: DynamicFeeFactor[];
  multiplier: number;
  finalRate: number;
  fallbackUsed: boolean;
}): string {
  if (params.factors.length === 0) {
    return (
      "Brain signals unavailable (commodity unknown or providers down) — " +
      `falling back to static ${(
        BASE_FEE_RATE * 100
      ).toFixed(1)}% fee (multiplier 1.0). ` +
      "Constitutional bounds 0.1%-2.5% respected."
    );
  }

  const positive: string[] = [];
  const negative: string[] = [];
  for (const f of params.factors) {
    if (f.adjustment > 0) {
      positive.push(`${f.factor} +${f.adjustment.toFixed(2)}`);
    } else if (f.adjustment < 0) {
      negative.push(`${f.factor} ${f.adjustment.toFixed(2)}`);
    }
  }

  const direction =
    params.multiplier > 1.001
      ? "premium"
      : params.multiplier < 0.999
        ? "discount"
        : "neutral";

  const finalPct = (params.finalRate * 100).toFixed(2);
  const multiplierStr = params.multiplier.toFixed(2);

  if (positive.length === 0 && negative.length === 0) {
    return (
      `Brain assessed ${params.factors.length} factor(s); all neutral → ` +
      `multiplier ${multiplierStr}x, final rate ${finalPct}% (within 0.1%-2.5% bounds).`
    );
  }

  const parts: string[] = [];
  if (positive.length > 0) parts.push(`premiums: ${positive.join(", ")}`);
  if (negative.length > 0) parts.push(`discounts: ${negative.join(", ")}`);

  return (
    `Brain assessed ${params.factors.length} factor(s) — ${parts.join("; ")} → ` +
    `multiplier ${multiplierStr}x (${direction}), final rate ${finalPct}% ` +
    `(within 0.1%-2.5% constitutional bounds).`
  );
}
