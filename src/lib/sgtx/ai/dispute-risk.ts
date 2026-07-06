// SGTX BRAIN — Pre-emptive Dispute Risk Prediction
//
// Invoked at milestone-confirmation time (the highest-signal event in the
// trade lifecycle). Analyses the trade's history, contract pricing, QC
// inspections, cold-chain exposure, delivery SLA, document completeness and
// sanctions proximity to predict the probability of a future dispute being
// filed. Surfaces a preventive Smart-Inbox alert to the counterparty when
// probability > 0.4 so they can take mitigating action BEFORE a dispute
// crystallises.
//
// This is PREVENTIVE intelligence — it never blocks a milestone confirmation.
// Legitimate trades must continue to flow; the Brain only nudges the
// counterparty to verify / document / negotiate.

import { db } from "@/lib/db";
import { validateQuotePrice } from "@/lib/sgtx/ai/brain";
import { sanctionsRadar } from "@/lib/sgtx/ai/brain-intelligence";
import { searchPerishableDB } from "@/lib/sgtx/ai/perishable-requirements";
import { resolveDocumentRequirements } from "@/lib/sgtx/trade-request/doc-rules";
import { logger } from "@/lib/sgtx/logger";

// ============================================================
// Public types (per IMPL-6 spec)
// ============================================================

export interface DisputeRiskInput {
  ustn: string;
  milestone?: string; // e.g. "M3_LOADING_COMPLETE" or "CONTAINER_LOADED"
  confirmedByGtid?: string;
}

export interface DisputeRiskSignal {
  signal: string; // e.g. "price_deviation", "qc_fail_history", "cold_chain_breach_risk", "delivery_delay"
  weight: number; // 0-1 contribution to risk
  detail: string;
  source: string; // "brain.validateQuotePrice" | "db.qcInspections" | etc.
}

export interface DisputeRiskResult {
  ustn: string;
  probability: number; // 0-1 predicted dispute probability
  riskLevel: "low" | "medium" | "high";
  signals: DisputeRiskSignal[];
  recommendedActions: string[]; // plain-language preventive actions
  preventInboxAlert?: {
    recipientGtid: string;
    title: string;
    body: string;
    severity: "info" | "warning" | "critical";
  };
  assessedAt: string;
  brainModule: string; // "predictDisputeRisk"
}

// ============================================================
// Internal constants
// ============================================================

// Spec signal weights (cap at 1.0 when summed)
const WEIGHT_PRICE_DEVIATION = 0.3;
const WEIGHT_QC_FAIL = 0.25;
const WEIGHT_COLD_CHAIN = 0.2;
const WEIGHT_DELIVERY_DELAY = 0.2;
const WEIGHT_DOC_GAPS = 0.15;
const WEIGHT_SANCTIONS = 0.3;

// Hot-climate corridors — origin or destination in these countries, during
// the summer months, materially raises cold-chain breach risk for perishables.
const HIGH_TEMP_COUNTRIES = new Set([
  "SA", "AE", "EG", "IN", "PK", "BD", "NG", "SD", "DZ", "LY", "IQ", "IR",
  "KW", "QA", "OM", "YE", "DJ", "ET", "SN", "ML", "TD", "SO",
]);

// Red Sea / Suez routes — Asia ↔ EU transits pass through high-temperature
// waters regardless of season (Houthi risk aside, ambient sea-air temps in
// the Bab-el-Mandeb + Gulf of Aden regularly exceed reefer design margins).
const EU_COUNTRIES = new Set([
  "DE", "NL", "FR", "IT", "ES", "BE", "GB", "PL", "GR", "PT", "IE", "AT",
  "CZ", "DK", "SE", "FI", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE",
]);
const ASIAN_COUNTRIES = new Set([
  "CN", "IN", "VN", "TH", "MY", "SG", "ID", "PH", "BD", "JP", "KR", "TW", "LK",
]);

const HOT_MONTHS = new Set([5, 6, 7, 8, 9]); // June–September (0-indexed)

// ============================================================
// Helpers
// ============================================================

function isHighTempCorridor(originCountry: string, destCountry: string): boolean {
  const month = new Date().getMonth(); // 0-11
  const isHotMonth = HOT_MONTHS.has(month);
  const involvesHotCountry =
    HIGH_TEMP_COUNTRIES.has(originCountry) || HIGH_TEMP_COUNTRIES.has(destCountry);
  const isSuezRoute =
    (EU_COUNTRIES.has(originCountry) && ASIAN_COUNTRIES.has(destCountry)) ||
    (ASIAN_COUNTRIES.has(originCountry) && EU_COUNTRIES.has(destCountry));
  // Hot-country exposure counts year-round (ambient design margins exceeded
  // even in winter for some origins). Suez/Red Sea counts only in summer.
  return involvesHotCountry || (isSuezRoute && isHotMonth);
}

function riskLevelFor(probability: number): "low" | "medium" | "high" {
  if (probability > 0.6) return "high";
  if (probability >= 0.3) return "medium";
  return "low";
}

function recommendedActionsFor(signals: DisputeRiskSignal[]): string[] {
  const actions: string[] = [];
  const fired = new Set(signals.map((s) => s.signal));

  if (fired.has("sanctions_proximity")) {
    actions.push(
      "Pause any settlement release and escalate to compliance for enhanced due diligence on the flagged party.",
    );
  }
  if (fired.has("price_deviation")) {
    actions.push(
      "Reconfirm the contract price with the counterparty and document the market-reference basis before further milestone confirmations.",
    );
  }
  if (fired.has("qc_fail_history")) {
    actions.push(
      "Request a re-inspection or conditional-pass resolution plan before accepting delivery; preserve sample evidence.",
    );
  }
  if (fired.has("cold_chain_breach_risk")) {
    actions.push(
      "Verify the reefer set-point and request the continuous temperature log at discharge; arrange a spot temperature check on arrival.",
    );
  }
  if (fired.has("delivery_delay")) {
    actions.push(
      "Document the delay reason, notify the insurer if cover is engaged, and consider a contractual amendment to extend the delivery window.",
    );
  }
  if (fired.has("document_gaps")) {
    actions.push(
      "Request the missing mandatory documents from the issuer before releasing payment; withhold settlement until complete.",
    );
  }
  if (actions.length === 0) {
    actions.push(
      "No elevated dispute risk detected — continue standard milestone monitoring.",
    );
  }
  return actions;
}

// ============================================================
// Signal evaluators
// ============================================================

/**
 * Signal 1 — Price deviation.
 * Calls Brain.validateQuotePrice (which delegates to analyzeMarket + runAI).
 * Falls back gracefully if AI / market data unavailable.
 */
async function evaluatePriceDeviation(trade: any): Promise<DisputeRiskSignal | null> {
  if (!trade.netWeightKg || trade.netWeightKg <= 0) return null;
  const pricePerKg = trade.tradeValueUsd / trade.netWeightKg;
  try {
    const result = await validateQuotePrice({
      commodity: trade.commodity,
      hsCode: trade.commodityHs || undefined,
      quotedPriceUsd: Math.round(pricePerKg * 1000) / 1000,
      port: trade.destPort,
      unit: "kg",
    });
    if (Math.abs(result.deviationPercent) > 20) {
      return {
        signal: "price_deviation",
        weight: WEIGHT_PRICE_DEVIATION,
        detail: `Contract price ${result.deviationPercent > 0 ? "+" : ""}${result.deviationPercent.toFixed(1)}% vs market ($${result.marketPrice.toFixed(2)}/kg). ${result.recommendation}`,
        source: "brain.validateQuotePrice",
      };
    }
  } catch (e: any) {
    logger.warn("[predictDisputeRisk] price deviation check failed:", e);
  }
  return null;
}

/**
 * Signal 2 — QC FAIL history.
 * Queries QcInspection rows for this trade; any FAIL result is a strong
 * predictor of a quality dispute.
 */
async function evaluateQcFailHistory(tradeId: string): Promise<DisputeRiskSignal | null> {
  try {
    const inspections = await db.qcInspection.findMany({
      where: { tradeId },
      select: { result: true, inspectionType: true, defectCount: true, notes: true },
    });
    const fails = inspections.filter((i: any) => i.result === "FAIL");
    if (fails.length > 0) {
      const totalDefects = fails.reduce((sum: number, i: any) => sum + (i.defectCount || 0), 0);
      return {
        signal: "qc_fail_history",
        weight: WEIGHT_QC_FAIL,
        detail: `${fails.length} FAIL result(s) across ${inspections.length} QC inspection(s); ${totalDefects} defect(s) recorded.`,
        source: "db.qcInspections",
      };
    }
  } catch (e: any) {
    logger.warn("[predictDisputeRisk] QC fail history check failed:", e);
  }
  return null;
}

/**
 * Signal 3 — Cold-chain breach risk.
 * Fires when the commodity is perishable (perishable-requirements DB match)
 * AND the transit passes through a high-temperature corridor.
 */
function evaluateColdChainBreachRisk(trade: any): DisputeRiskSignal | null {
  // The trade's coldChain flag is the strongest signal — it indicates reefer
  // equipment is in use and any corridor heat is a breach risk.
  const perishable = searchPerishableDB(trade.commodity, trade.commodityHs || undefined);
  if (!perishable && !trade.coldChain) return null;
  if (!isHighTempCorridor(trade.originCountry, trade.destCountry)) return null;
  const setPoint = perishable?.setPointTempC ?? "n/a";
  return {
    signal: "cold_chain_breach_risk",
    weight: WEIGHT_COLD_CHAIN,
    detail: `Perishable commodity (${perishable?.category ?? "cold-chain flagged"}) on a high-temperature corridor (${trade.originCountry}→${trade.destCountry}); reefer set-point ${setPoint}°C. Ambient exceedance risk during transit.`,
    source: "ai.perishableRequirements + corridor.highTemp",
  };
}

/**
 * Signal 4 — Delivery delay.
 * Fires when the milestone is being confirmed AFTER the contractual
 * latestDeliveryDate (the trade's delivery SLA deadline).
 */
function evaluateDeliveryDelay(trade: any, confirmedAt: Date): DisputeRiskSignal | null {
  const deadline = trade.latestDeliveryDate || trade.preferredDeliveryDate;
  if (!deadline) return null;
  if (confirmedAt.getTime() <= deadline.getTime()) return null;
  const daysLate = Math.ceil(
    (confirmedAt.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24),
  );
  return {
    signal: "delivery_delay",
    weight: WEIGHT_DELIVERY_DELAY,
    detail: `Milestone confirmed ${daysLate} day(s) after contractual delivery deadline (${deadline.toISOString().slice(0, 10)}).`,
    source: "db.trade.latestDeliveryDate",
  };
}

/**
 * Signal 5 — Document gaps.
 * Computes the mandatory document set via doc-rules, then queries the
 * Document table for what has actually been uploaded. Any missing mandatory
 * document is a predictor of a settlement / customs dispute.
 */
async function evaluateDocumentGaps(trade: any): Promise<DisputeRiskSignal | null> {
  try {
    const required = resolveDocumentRequirements({
      hsCode: trade.commodityHs,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      incoterm: trade.incoterm,
      transportMode: trade.transportMode,
      coldChain: trade.coldChain,
    });
    const mandatory = required.filter((d) => d.mandatory);
    if (mandatory.length === 0) return null;

    const uploaded = await db.document.findMany({
      where: { tradeId: trade.id },
      select: { type: true, status: true },
    });
    const presentTypes = new Set(
      uploaded
        .filter((d: any) => d.status === "UPLOADED" || d.status === "VERIFIED")
        .map((d: any) => d.type),
    );
    const missing = mandatory.filter((d) => !presentTypes.has(d.docType));
    if (missing.length === 0) return null;
    return {
      signal: "document_gaps",
      weight: WEIGHT_DOC_GAPS,
      detail: `${missing.length} mandatory document(s) missing: ${missing.map((d) => d.docType).join(", ")}.`,
      source: "trade-request.doc-rules + db.documents",
    };
  } catch (e: any) {
    logger.warn("[predictDisputeRisk] document-gap check failed:", e);
  }
  return null;
}

/**
 * Signal 6 — Sanctions proximity.
 * Calls Brain.sanctionsRadar on BOTH buyer and seller. Any hit on either
 * party is a critical dispute / non-payment predictor.
 */
async function evaluateSanctionsProximity(trade: any): Promise<DisputeRiskSignal | null> {
  const parties = [
    { gtid: trade.buyerGtid, name: trade.buyer?.legalName || "Buyer", country: trade.buyer?.country || trade.destCountry },
    { gtid: trade.sellerGtid, name: trade.seller?.legalName || "Seller", country: trade.seller?.country || trade.originCountry },
  ];
  const hits: string[] = [];
  for (const p of parties) {
    try {
      const r = await sanctionsRadar({
        partyGtid: p.gtid,
        legalName: p.name,
        country: p.country,
        hsCode: trade.commodityHs || "",
      });
      if (r.riskLevel !== "CLEAR" || r.hits.length > 0) {
        hits.push(`${p.name} (${p.gtid}): ${r.riskLevel}${r.hits.length > 0 ? ` — ${r.hits.map((h: any) => h.list).join("; ")}` : ""}`);
      }
    } catch (e: any) {
      logger.warn(`[predictDisputeRisk] sanctions radar failed for ${p.gtid}:`, e);
    }
  }
  if (hits.length === 0) return null;
  return {
    signal: "sanctions_proximity",
    weight: WEIGHT_SANCTIONS,
    detail: `Sanctions radar flagged ${hits.length} party/parties: ${hits.join(" | ")}`,
    source: "brain.sanctionsRadar",
  };
}

// ============================================================
// Main entry
// ============================================================

/**
 * Predict the probability of a future dispute being filed on the given trade,
 * evaluated at milestone-confirmation time. Returns a risk score, the
 * contributing signals, recommended preventive actions, and (when probability
 * exceeds 0.4) a preventive inbox alert addressed to the counterparty (the
 * party NOT confirming the milestone).
 *
 * Pure advisory — never throws (errors degrade to a low-risk result so the
 * calling milestone-confirmation route is never blocked).
 */
export async function predictDisputeRisk(input: DisputeRiskInput): Promise<DisputeRiskResult> {
  const assessedAt = new Date().toISOString();
  const empty: DisputeRiskResult = {
    ustn: input.ustn,
    probability: 0,
    riskLevel: "low",
    signals: [],
    recommendedActions: [],
    assessedAt,
    brainModule: "predictDisputeRisk",
  };

  try {
    const trade = await db.trade.findUnique({
      where: { ustn: input.ustn },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      logger.warn(`[predictDisputeRisk] trade ${input.ustn} not found`);
      return empty;
    }

    // Run all 6 signal evaluators in parallel — each is failure-isolated.
    const [
      priceSignal,
      qcSignal,
      coldChainSignal,
      docGapSignal,
      sanctionsSignal,
    ] = await Promise.all([
      evaluatePriceDeviation(trade).catch(() => null),
      evaluateQcFailHistory(trade.id).catch(() => null),
      Promise.resolve(evaluateColdChainBreachRisk(trade)),
      evaluateDocumentGaps(trade).catch(() => null),
      evaluateSanctionsProximity(trade).catch(() => null),
    ]);
    // Delivery-delay depends on the confirmation timestamp (now).
    const delaySignal = evaluateDeliveryDelay(trade, new Date());

    const signals: DisputeRiskSignal[] = [
      priceSignal,
      qcSignal,
      coldChainSignal,
      delaySignal,
      docGapSignal,
      sanctionsSignal,
    ].filter((s): s is DisputeRiskSignal => s !== null);

    // Sum weights, capped at 1.0.
    const rawWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const probability = Math.min(1, Math.max(0, Math.round(rawWeight * 1000) / 1000));
    const riskLevel = riskLevelFor(probability);
    const recommendedActions = recommendedActionsFor(signals);

    const result: DisputeRiskResult = {
      ustn: input.ustn,
      probability,
      riskLevel,
      signals,
      recommendedActions,
      assessedAt,
      brainModule: "predictDisputeRisk",
    };

    // Generate a preventive inbox alert addressed to the counterparty when
    // probability > 0.4. The counterparty is the party NOT confirming the
    // milestone — if a logistics provider is confirming (neither buyer nor
    // seller), default to the buyer (cargo owner with the most to lose).
    if (probability > 0.4) {
      const isBuyer = input.confirmedByGtid === trade.buyerGtid;
      const isSeller = input.confirmedByGtid === trade.sellerGtid;
      const confirmerRole = isBuyer ? "buyer" : isSeller ? "seller" : "logistics provider";
      // Match the route's counterparty derivation: if confirmer is the buyer,
      // recipient is the seller; otherwise (seller OR logistics) recipient is
      // the buyer.
      const recipientGtid = isBuyer ? trade.sellerGtid : trade.buyerGtid;
      const topSignals = signals
        .slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3)
        .map((s) => `${s.signal} (${(s.weight * 100).toFixed(0)}%)`);
      const severity: "info" | "warning" | "critical" =
        riskLevel === "high" ? "critical" : "warning";
      const shortUstn = input.ustn.length > 24 ? `${input.ustn.slice(0, 24)}...` : input.ustn;
      const milestoneLabel = input.milestone
        ? input.milestone.replace(/_/g, " ")
        : "milestone";
      result.preventInboxAlert = {
        recipientGtid,
        title: `Dispute Risk Detected on ${shortUstn}`,
        body:
          `SGTX Brain assessed ${riskLevel.toUpperCase()} dispute risk ` +
          `(${(probability * 100).toFixed(0)}% probability) when ${confirmerRole} ` +
          `confirmed ${milestoneLabel}. Top signals: ${topSignals.join(", ")}. ` +
          `Recommended preventive actions: ${recommendedActions.slice(0, 2).join(" ")}`,
        severity,
      };
    }

    return result;
  } catch (e: any) {
    logger.error("[predictDisputeRisk] unexpected error:", e);
    return empty;
  }
}
