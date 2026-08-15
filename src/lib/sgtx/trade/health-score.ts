// SGTX Trade Health Score (FIX-12-FINAL / Fix 7)
// =============================================================================
//
// Audit section S24 (TCC) flagged that the trade healthScore column on the
// Trade table was hardcoded (always 85) and never calculated per the blueprint
// formula. This module implements the actual calculation from real trade data.
//
// Blueprint formula (Part 12G.7):
//
//   Compliance (0-100)     × 0.20 +
//   Documentation (0-100)  × 0.20 +
//   Logistics (0-100)      × 0.15 +
//   Payment (0-100)        × 0.15 +
//   Risk (0-100)           × 0.20 +
//   Timeline (0-100)       × 0.10
//
// Each component is computed from observable trade state. A component scores
// 100 when fully healthy and degrades as issues accumulate. The DB column on
// the Trade table (`trade.healthScore`) is preserved as a fallback so the
// field can still be seeded during trade creation — but the public GET
// /api/sgtx/trade response overrides it with the calculated value.
//
// The function is pure (no DB calls) — it relies on the trade's already-loaded
// relations. The caller is expected to fetch the trade with `include: {...}` so
// all components can be evaluated from the payload in a single round-trip.

/**
 * Trade payload shape — minimal field set required to compute the health
 * score. The actual Prisma Trade type is wider; this interface captures the
 * fields this module reads so it can be unit-tested without a full DB row.
 */
export interface HealthScoreTrade {
  status?: string;
  latestDeliveryDate?: Date | string | null;
  buyer?: { sanctionsCleared?: boolean | null } | null;
  seller?: { sanctionsCleared?: boolean | null } | null;
  documents?: Array<{ status?: string | null }> | null;
  documentRequirements?: Array<{ mandatory?: boolean | null }> | null;
  shipments?: Array<{
    status?: string | null;
    etd?: Date | string | null;
    arrivedAt?: Date | string | null;
    releasedAt?: Date | string | null;
  }> | null;
  invoices?: Array<{ status?: string | null }> | null;
  disputes?: Array<{ status?: string | null }> | null;
  timeline?: Array<{ completed?: boolean | null }> | null;
}

export interface HealthScoreBreakdown {
  compliance: number;
  documentation: number;
  logistics: number;
  payment: number;
  risk: number;
  timeline: number;
  score: number;
}

const CLAMP = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Compliance component (0-100, weight 0.20):
 *   • Buyer sanctions cleared         → +40
 *   • Seller sanctions cleared        → +40
 *   • Trade past the contract-signed  → +20 (regulator view: a sanctioned
 *     counterparty should never reach contract signing — reaching this
 *     state means the compliance gate already cleared)
 */
function complianceScore(trade: HealthScoreTrade): number {
  let score = 0;
  if (trade.buyer?.sanctionsCleared) score += 40;
  if (trade.seller?.sanctionsCleared) score += 40;
  const contracted = ["CONTRACT_SIGNED", "IN_EXECUTION", "DELIVERED", "SETTLED"].includes(trade.status || "");
  if (contracted) score += 20;
  return CLAMP(score);
}

/**
 * Documentation component (0-100, weight 0.20):
 *   • Mandatory DocumentRequirements vs verified uploaded Documents.
 *   • When no mandatory docs are required yet (early phase), score 100 (no
 *     blocker).
 *   • Score = verifiedMandatoryDocs / mandatoryDocs × 100.
 */
function documentationScore(trade: HealthScoreTrade): number {
  const mandatoryDocs = (trade.documentRequirements || []).filter((d) => d.mandatory).length;
  if (mandatoryDocs === 0) return 100;
  const docs = trade.documents || [];
  const verifiedMandatoryDocs = docs.filter((d) => d.status === "VERIFIED").length;
  return CLAMP((verifiedMandatoryDocs / mandatoryDocs) * 100);
}

/**
 * Logistics component (0-100, weight 0.15):
 *   • At least one shipment DELIVERED → 100
 *   • CUSTOMS_CLEARED / RELEASED      → 90
 *   • ARRIVED                          → 80
 *   • IN_TRANSIT                       → 70
 *   • DEPARTED                         → 60
 *   • LOADED                           → 50
 *   • No shipments / unknown status    → 40
 * Also penalise overdue shipments (arrivedAt after latestDeliveryDate).
 */
function logisticsScore(trade: HealthScoreTrade): number {
  const shipments = trade.shipments || [];
  if (shipments.length === 0) return 40;
  const statuses = shipments.map((s) => s.status || "").map((s) => s.toUpperCase());
  if (statuses.some((s) => s === "DELIVERED")) return 100;
  if (statuses.some((s) => s === "RELEASED" || s === "CUSTOMS_CLEARED")) return 90;
  if (statuses.some((s) => s === "ARRIVED")) return 80;
  if (statuses.some((s) => s === "IN_TRANSIT")) return 70;
  if (statuses.some((s) => s === "DEPARTED")) return 60;
  if (statuses.some((s) => s === "LOADED")) return 50;
  // Penalty: shipments not yet arrived past their latest delivery date.
  const latest = trade.latestDeliveryDate ? new Date(trade.latestDeliveryDate).getTime() : null;
  if (latest && Date.now() > latest) {
    const overdue = shipments.filter((s) => !s.arrivedAt).length;
    return CLAMP(40 - overdue * 5);
  }
  return 40;
}

/**
 * Payment component (0-100, weight 0.15):
 *   • Any invoice PAID → 100
 *   • At least one invoice in APPROVED / PENDING → 60 (in-flight)
 *   • No invoices yet → 50 (trade early phase, payment not started)
 *   • Overdue invoices (status OVERDUE) → 20
 */
function paymentScore(trade: HealthScoreTrade): number {
  const invoices = trade.invoices || [];
  if (invoices.length === 0) return 50;
  if (invoices.some((i) => i.status === "PAID")) return 100;
  if (invoices.some((i) => i.status === "OVERDUE")) return 20;
  if (invoices.some((i) => i.status === "APPROVED" || i.status === "PENDING")) return 60;
  return 50;
}

/**
 * Risk component (0-100, weight 0.20):
 *   • Each open dispute subtracts 25 from 100 (floor 0).
 *   • Resolved disputes subtract 5 (residual reputational impact).
 */
function riskScore(trade: HealthScoreTrade): number {
  const disputes = trade.disputes || [];
  if (disputes.length === 0) return 100;
  const open = disputes.filter((d) => d.status && d.status !== "RESOLVED" && d.status !== "CANCELLED").length;
  const resolved = disputes.length - open;
  return CLAMP(100 - open * 25 - resolved * 5);
}

/**
 * Timeline component (0-100, weight 0.10):
 *   • Fraction of timeline events marked completed.
 *   • Empty timeline → 50 (neutral; no signal yet).
 *   • Penalty if latestDeliveryDate is in the past and the trade is not
 *     DELIVERED/SETTLED.
 */
function timelineScore(trade: HealthScoreTrade): number {
  const timeline = trade.timeline || [];
  if (timeline.length === 0) return 50;
  const completed = timeline.filter((t) => t.completed).length;
  const base = (completed / timeline.length) * 100;
  const latest = trade.latestDeliveryDate ? new Date(trade.latestDeliveryDate).getTime() : null;
  const overdue = latest && Date.now() > latest && !["DELIVERED", "SETTLED"].includes(trade.status || "");
  return CLAMP(overdue ? base - 20 : base);
}

/**
 * Compute the trade health score per the blueprint formula.
 *
 * @param trade Trade payload with relations loaded (documents, shipments,
 *              invoices, disputes, timeline, buyer, seller,
 *              documentRequirements). Missing relations are tolerated and
 *              degrade gracefully to a neutral score.
 * @returns Breakdown of each component + the weighted aggregate `score`.
 */
export function calculateHealthScore(trade: HealthScoreTrade): HealthScoreBreakdown {
  const compliance = complianceScore(trade);
  const documentation = documentationScore(trade);
  const logistics = logisticsScore(trade);
  const payment = paymentScore(trade);
  const risk = riskScore(trade);
  const timeline = timelineScore(trade);
  const score = Math.round(
    compliance * 0.20 +
    documentation * 0.20 +
    logistics * 0.15 +
    payment * 0.15 +
    risk * 0.20 +
    timeline * 0.10,
  );
  return {
    compliance,
    documentation,
    logistics,
    payment,
    risk,
    timeline,
    score: CLAMP(score),
  };
}
