// SGTX Part 32 — Add-On 11: Customs Valuation Intelligence
//
// Estimates customs duty using GRiRE tariff rates (HsTariffRate table) and
// detects market-price deviations (MarketPriceData table). When a declared
// value falls significantly below the market average, the engine emits an
// under-invoicing alert and recommends reassessment or dispute filing.
//
// WTO Valuation Methods (GATT Article VII):
//   1. Transaction value (default — what the importer declared)
//   2. Transaction value of identical goods
//   3. Transaction value of similar goods
//   4. Deductive method
//   5. Computed method
//   6. Fall-back method
//
// This engine primarily applies Method 1 (transaction value) and uses
// Methods 2-3 (identical/similar goods via MarketPriceData) as a sanity check.
//
// Constitutional notes:
//   - No Governor gate wired here. A future G2U22 hook may auto-file a
//     ValuationDispute when alertSeverity=CRITICAL and the deviation exceeds
//     a threshold (e.g., 50%).
//   - All DB calls are defensive (try/catch). Failures return null/empty and
//     log via the shared SGTX logger.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getTariffRate } from "@/lib/sgtx/grire";

// ============ Types ============

export interface ValuationInput {
  ustn?: string;
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  declaredValue: number;
  currency?: string;
  quantity?: number;
  unit?: string;
}

export interface ValuationResult {
  hsCode: string;
  destinationCountry: string;
  declaredValue: number;
  estimatedDuty: number;
  tariffRate: number | null;
  marketAverage: number | null;
  deviationPercentage: number | null;
  valuationMethod: string;
  confidence: number;
  alertType: string | null;
  alertSeverity: string | null;
  alertMessage: string | null;
  recommendation: string | null;
  modelVersion: string;
  breakdown: {
    tariffRate: number | null;
    dutyType: string | null;
    marketPriceSource: string | null;
    marketPriceConfidence: number | null;
    ftaPreferenceApplied: boolean;
  };
}

// Deviation thresholds (in percent).
//   |deviation| ≤ 10%  → no alert (normal market variance)
//   10% < |deviation| ≤ 25% → LOW
//   25% < |deviation| ≤ 50% → MEDIUM (under-invoicing suspected)
//   |deviation| > 50%       → HIGH/CRITICAL (likely fraud)
const DEVIATION_THRESHOLDS = {
  LOW: 10,
  MEDIUM: 25,
  HIGH: 50,
};

const MODEL_VERSION = "SGTX-VAL-1.0";

// ============ Pure helpers ============

/**
 * Classify the deviation between declared value and market average.
 * Returns the alert severity (or null if within tolerance) plus a human-readable message.
 *
 * Positive deviation = declared value is HIGHER than market (over-invoicing — possible capital flight).
 * Negative deviation  = declared value is LOWER  than market (under-invoicing — duty evasion).
 *
 * Under-invoicing is treated as the higher-severity case (loss of customs revenue).
 */
export function classifyDeviation(
  declaredValue: number,
  marketAverage: number | null,
): {
  deviationPercentage: number | null;
  alertType: string | null;
  alertSeverity: string | null;
  alertMessage: string | null;
} {
  if (marketAverage == null || marketAverage <= 0 || declaredValue <= 0) {
    return {
      deviationPercentage: null,
      alertType: null,
      alertSeverity: null,
      alertMessage: null,
    };
  }
  const deviation = ((declaredValue - marketAverage) / marketAverage) * 100;
  const absDeviation = Math.abs(deviation);

  if (absDeviation <= DEVIATION_THRESHOLDS.LOW) {
    return {
      deviationPercentage: +deviation.toFixed(2),
      alertType: null,
      alertSeverity: null,
      alertMessage: null,
    };
  }

  const isUnderInvoicing = deviation < 0;
  const alertType = isUnderInvoicing ? "UNDER_INVOICING" : "OVER_INVOICING";
  let severity: string;
  if (absDeviation > DEVIATION_THRESHOLDS.HIGH) {
    severity = "CRITICAL";
  } else if (absDeviation > DEVIATION_THRESHOLDS.MEDIUM) {
    severity = "HIGH";
  } else {
    severity = "MEDIUM";
  }

  const direction = isUnderInvoicing ? "below" : "above";
  const message =
    `Declared value ${absDeviation.toFixed(1)}% ${direction} market average. ` +
    (isUnderInvoicing
      ? "Under-invoicing suspected — customs revenue at risk. Recommend reassessment."
      : "Over-invoicing suspected — possible capital flight or anti-dumping concern.");

  return {
    deviationPercentage: +deviation.toFixed(2),
    alertType,
    alertSeverity: severity,
    alertMessage: message,
  };
}

/**
 * Build a recommendation string based on the valuation result.
 */
export function buildRecommendation(
  alertSeverity: string | null,
  tariffRate: number | null,
  hasMarketData: boolean,
): string {
  if (!tariffRate) {
    return "No tariff rate found in GRiRE — manual valuation lookup required.";
  }
  if (!hasMarketData) {
    return "No market price data available — accept transaction value (Method 1) subject to post-clearance audit.";
  }
  if (!alertSeverity) {
    return "Declared value within market tolerance — accept transaction value (WTO Method 1).";
  }
  if (alertSeverity === "MEDIUM") {
    return "Request supporting documents (commercial invoice, bank payment proof) before accepting transaction value.";
  }
  if (alertSeverity === "HIGH") {
    return "Reject transaction value — apply WTO Method 2/3 (identical/similar goods) using market price data. Consider dispute filing.";
  }
  if (alertSeverity === "CRITICAL") {
    return "URGENT: reject declaration, file ValuationDispute, refer to customs investigations unit for fraud review.";
  }
  return "Manual review required.";
}

// ============ DB helpers (defensive) ============

/**
 * Look up the most recent market price for a (hsCode, countryCode) pair.
 * Returns null if no data or on error.
 *
 * @param asOf — optional date reference (defaults to now)
 */
export async function getMarketPrice(
  hsCode: string,
  countryCode: string,
): Promise<{ price: number; currency: string; source: string; confidence: number | null; recordedAt: Date } | null> {
  try {
    const row = await db.marketPriceData.findFirst({
      where: {
        hsCode: { startsWith: hsCode.slice(0, Math.min(hsCode.length, 6)) },
        countryCode: countryCode.toUpperCase(),
      },
      orderBy: { recordedAt: "desc" },
    });
    if (!row) return null;
    return {
      price: row.marketPrice,
      currency: row.currency,
      source: row.source,
      confidence: row.confidence,
      recordedAt: row.recordedAt,
    };
  } catch (e: any) {
    logger.error("[valuation/getMarketPrice] failed", {
      hsCode, countryCode, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Persist a CustomsValuation row from a ValuationResult. Defensive — returns null on failure.
 *
 * The caller (API route) is responsible for calling calculateValuation() first;
 * this helper converts the pure result into a DB row.
 */
export async function persistValuation(
  input: ValuationInput,
  result: ValuationResult,
): Promise<{ id: string } | null> {
  try {
    const created = await db.customsValuation.create({
      data: {
        ustn: input.ustn || null,
        hsCode: input.hsCode,
        originCountry: input.originCountry.toUpperCase(),
        destinationCountry: input.destinationCountry.toUpperCase(),
        declaredValue: input.declaredValue,
        estimatedDuty: result.estimatedDuty,
        marketAverage: result.marketAverage,
        deviationPercentage: result.deviationPercentage,
        valuationMethod: result.valuationMethod,
        confidence: result.confidence,
        alertType: result.alertType,
        alertSeverity: result.alertSeverity,
        alertMessage: result.alertMessage,
        recommendation: result.recommendation,
        modelVersion: result.modelVersion,
      },
    });
    logger.info("[valuation/persistValuation] saved", {
      id: created.id, hsCode: input.hsCode, declaredValue: input.declaredValue,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[valuation/persistValuation] failed", {
      hsCode: input.hsCode, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Create a ValuationDispute record. Used by the /dispute route.
 * Defensive — returns null on failure.
 */
export async function createValuationDispute(input: {
  ustn: string;
  declaredValue: number;
  customsReassessedValue?: number;
  disputeReason: string;
  evidence?: string;
  governorDecisionId?: string;
}): Promise<{ id: string } | null> {
  try {
    const created = await db.valuationDispute.create({
      data: {
        ustn: input.ustn,
        declaredValue: input.declaredValue,
        customsReassessedValue: input.customsReassessedValue ?? null,
        disputeReason: input.disputeReason,
        evidence: input.evidence || null,
        status: "PENDING",
        governorDecisionId: input.governorDecisionId || null,
      },
    });
    logger.info("[valuation/createValuationDispute] created", {
      id: created.id, ustn: input.ustn,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[valuation/createValuationDispute] failed", {
      ustn: input.ustn, error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Core calculation ============

/**
 * Calculate customs valuation + duty estimate + market deviation alert.
 *
 * This is the main entry point. It performs DB I/O (GRiRE tariff lookup +
 * MarketPriceData lookup) but is otherwise pure — persistence is opt-in via
 * the separate persistValuation() helper.
 *
 * Logic:
 *   1. Look up tariff rate via GRiRE getTariffRate(hsCode, destinationCountry).
 *   2. estimatedDuty = declaredValue × tariffRate / 100 (or 0 if no tariff found).
 *   3. Look up market price via MarketPriceData.
 *   4. Compute deviation = (declared - market) / market × 100.
 *   5. Classify deviation into alert severity (LOW/MEDIUM/HIGH/CRITICAL).
 *   6. Build recommendation based on severity.
 *   7. Confidence = average of tariff + market confidence scores (defensive).
 *
 * Returns the structured ValuationResult.
 */
export async function calculateValuation(input: ValuationInput): Promise<ValuationResult> {
  // 1) Tariff lookup via GRiRE
  const tariff = await getTariffRate(input.hsCode, input.destinationCountry);
  const tariffRate = tariff?.tariffRate ?? null;
  const dutyType = tariff?.dutyType ?? null;

  // 2) Duty estimate
  const estimatedDuty = tariffRate != null
    ? +(input.declaredValue * (tariffRate / 100)).toFixed(2)
    : 0;

  // 3) Market price lookup
  const market = await getMarketPrice(input.hsCode, input.destinationCountry);
  const marketAverage = market?.price ?? null;

  // 4) Deviation classification
  const deviation = classifyDeviation(input.declaredValue, marketAverage);

  // 5) Confidence roll-up
  const confidenceScores: number[] = [];
  if (tariff?.confidenceScore != null) confidenceScores.push(tariff.confidenceScore);
  if (market?.confidence != null) confidenceScores.push(market.confidence);
  const confidence = confidenceScores.length > 0
    ? +(confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length).toFixed(2)
    : 0;

  // 6) Recommendation
  const recommendation = buildRecommendation(
    deviation.alertSeverity,
    tariffRate,
    marketAverage != null,
  );

  // 7) Valuation method (default = Method 1; may be overridden by caller)
  const valuationMethod = "TRANSACTION_VALUE_WTO_M1";

  return {
    hsCode: input.hsCode,
    destinationCountry: input.destinationCountry.toUpperCase(),
    declaredValue: input.declaredValue,
    estimatedDuty,
    tariffRate,
    marketAverage,
    deviationPercentage: deviation.deviationPercentage,
    valuationMethod,
    confidence,
    alertType: deviation.alertType,
    alertSeverity: deviation.alertSeverity,
    alertMessage: deviation.alertMessage,
    recommendation,
    modelVersion: MODEL_VERSION,
    breakdown: {
      tariffRate,
      dutyType,
      marketPriceSource: market?.source ?? null,
      marketPriceConfidence: market?.confidence ?? null,
      ftaPreferenceApplied: false, // future: check FTA preferences
    },
  };
}
