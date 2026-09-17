// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm Fee Calculator
 * ===========================================================================
 *
 * Calculates per-incoterm fee allocation across all 11 Incoterms 2020
 * (EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF).
 *
 * SGTX fee model (blueprint §1.5 / §9):
 *   SGTX fee = Total Trade Value × 1.5% (per country side)
 *
 * Total Trade Value definition (per the buyer-side wizardry + spec):
 *   Total Trade Value = EXW value + Mandatory Logistics (per Incoterm)
 *
 * The Incoterm determines which logistics cost lines are MANDATORY
 * (must be priced) and which party (BUYER or SELLER) pays each. This
 * calculator:
 *   1. Filters the supplied logistics costs to the mandatory subset per
 *      the incoterm responsibility matrix.
 *   2. Sums the EXW + mandatory logistics to compute Total Trade Value.
 *   3. Computes the SGTX fee = Total Trade Value × 1.5%.
 *   4. Splits each cost line (and the SGTX fee) by payer per the matrix.
 *   5. Returns a per-component breakdown (TRUCKING, OCEAN_FREIGHT, THC,
 *      CUSTOMS_EXPORT, CUSTOMS_IMPORT, INSURANCE, DUTY, DESTINATION_HANDLING).
 *
 * The calculator is a pure function — no DB lookups, no async. The buyer
 * wizard uses it for the live fee-breakdown preview; the seller workflow
 * uses it to render the cost waterfall; the Governor uses it for G2U18
 * mandatory-cost coverage validation.
 *
 * NON-MARKETPLACE: this calculator never produces scores, rankings, or
 * counterparty recommendations. It answers the binary "who pays what?"
 * question per Incoterms 2020.
 */

import {
  getIncotermResponsibility,
  SVC_TRUCKING,
  SVC_OCEAN_FREIGHT,
  SVC_THC,
  SVC_INSURANCE,
  SVC_DESTINATION_HANDLING,
  SVC_CUSTOMS_EXPORT,
  SVC_CUSTOMS_IMPORT,
  SVC_WAREHOUSING,
} from "@/lib/sgtx/incoterms/responsibility-engine";
import { logger } from "@/lib/sgtx/logger";

// ============ Constants ============

/** SGTX platform fee rate — 1.5% of Total Trade Value (blueprint §1.5 / §9). */
export const SGTX_FEE_RATE = 0.015;

/** Map of internal SVC_* tags to the canonical service-type codes the UI / API surfaces. */
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  [SVC_TRUCKING]: "Trucking (origin / destination drayage)",
  [SVC_OCEAN_FREIGHT]: "Ocean / main carriage freight",
  [SVC_THC]: "Terminal Handling Charges (THC)",
  [SVC_INSURANCE]: "Cargo insurance",
  [SVC_DESTINATION_HANDLING]: "Destination handling / delivery",
  [SVC_CUSTOMS_EXPORT]: "Export customs brokerage",
  [SVC_CUSTOMS_IMPORT]: "Import customs brokerage",
  [SVC_WAREHOUSING]: "Warehousing",
  DUTY: "Import duties",
  TAXES: "Import VAT / GST",
};

/** All the cost-component buckets the breakdown can return. */
export const ALL_COMPONENT_KEYS = [
  SVC_TRUCKING,
  SVC_OCEAN_FREIGHT,
  SVC_THC,
  SVC_CUSTOMS_EXPORT,
  SVC_CUSTOMS_IMPORT,
  SVC_INSURANCE,
  SVC_DESTINATION_HANDLING,
  SVC_WAREHOUSING,
  "DUTY",
  "TAXES",
] as const;

// ============ Types ============

/** A single logistics cost line. The shape is intentionally permissive — the
 *  calculator inspects several common aliases for the service tag and amount. */
export interface LogisticsCost {
  /** Service tag — SVC_TRUCKING / SVC_OCEAN_FREIGHT / etc. Aliases below are also accepted. */
  serviceType?: string;
  service?: string;
  type?: string;
  serviceCode?: string;
  /** USD amount. Aliases: amountUsd, cost, fee, price. */
  amountUsd?: number;
  amount?: number;
  cost?: number;
  fee?: number;
  price?: number;
  /** Optional explicit payer override (defaults to the incoterm matrix payer). */
  payer?: "BUYER" | "SELLER";
  /** Optional human-readable label for the cost line. */
  label?: string;
}

export interface FeeBreakdown {
  /** Service tag — one of SVC_* or DUTY / TAXES. */
  serviceType: string;
  /** Human-readable label. */
  label: string;
  /** USD amount for this cost line. */
  amountUsd: number;
  /** Who pays this cost line per the incoterm matrix. */
  payer: "BUYER" | "SELLER";
  /** True if this service is MANDATORY under the incoterm. */
  mandatory: boolean;
  /** True if this line is part of Total Trade Value (EXW + mandatory logistics). */
  countsTowardTradeValue: boolean;
  /** Free-text note explaining the allocation. */
  note?: string;
}

export interface IncotermFeeResult {
  incoterm: string;
  exwValueUsd: number;
  mandatoryLogisticsUsd: number;
  totalTradeValueUsd: number;
  sgtxFeeUsd: number;
  sgtxFeeRate: number;
  buyerPaysUsd: number;
  sellerPaysUsd: number;
  buyerPays: { serviceType: string; label: string; amountUsd: number }[];
  sellerPays: { serviceType: string; label: string; amountUsd: number }[];
  breakdown: FeeBreakdown[];
  /** Echoes any non-fatal warnings (e.g. unknown service tag). */
  warnings: string[];
}

// ============ Helpers ============

function normalizeServiceTag(entry: LogisticsCost): string {
  const raw = entry.serviceType || entry.service || entry.type || entry.serviceCode || "";
  return String(raw || "").trim().toUpperCase();
}

function getAmountUsd(entry: LogisticsCost): number {
  const v =
    entry.amountUsd ?? entry.amount ?? entry.cost ?? entry.fee ?? entry.price ?? 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Filter the supplied logistics costs to ONLY the mandatory services per
 * the given incoterm. Returns the matching entries (with their payer from
 * the matrix). All entries whose service tag is NOT in the incoterm's
 * mandatory list are filtered out.
 *
 * Note: this returns the BUYER-paid mandatory lines too — the caller can
 * re-filter by payer if it only wants the seller-side mandatory subset
 * (e.g. for G2U18).
 */
export function getMandatoryLogisticsCosts(
  incoterm: string,
  allLogisticsCosts: LogisticsCost[],
): LogisticsCost[] {
  try {
    const r = getIncotermResponsibility(incoterm);
    const mandatory = new Set(
      r.mandatoryServices.map((s) => s.service.toUpperCase()),
    );
    return (allLogisticsCosts || []).filter((e) =>
      mandatory.has(normalizeServiceTag(e)),
    );
  } catch (err: any) {
    logger.warn("[incoterm-fee-calculator] getMandatoryLogisticsCosts failed", {
      incoterm,
      error: err?.message,
    });
    return [];
  }
}

/**
 * Compute Total Trade Value = EXW + Mandatory Logistics (per Incoterm).
 * Mandatory logistics = the cost lines whose service tag matches a
 * mandatory service for this incoterm (regardless of payer — both buyer
 * and seller mandatory lines count toward Total Trade Value because both
 * form part of the total cost of getting the goods to the buyer).
 */
export function getTotalTradeValue(
  incoterm: string,
  exwValue: number,
  logisticsCosts: LogisticsCost[],
): number {
  try {
    const exw = Number(exwValue) || 0;
    const mandatory = getMandatoryLogisticsCosts(incoterm, logisticsCosts || []);
    const logisticsTotal = mandatory.reduce((s, e) => s + getAmountUsd(e), 0);
    return Math.max(0, exw + logisticsTotal);
  } catch (err: any) {
    logger.warn("[incoterm-fee-calculator] getTotalTradeValue failed", {
      incoterm,
      error: err?.message,
    });
    return Math.max(0, Number(exwValue) || 0);
  }
}

/**
 * Calculate the full fee allocation per incoterm:
 *   • buyerPays — sum of cost lines the BUYER is responsible for per the matrix
 *   • sellerPays — sum of cost lines the SELLER is responsible for
 *   • sgtxFeeUsd — Total Trade Value × 1.5%
 *   • breakdown — per-component line items with payer + mandatory flag
 *
 * The SGTX fee is split 50/50 between buyer and seller when both parties are
 * on the SGTX platform (1.5% per side, 3% total — per blueprint §1.5). When
 * only one party is on-platform, the on-platform party pays the full 1.5%
 * (the off-platform party pays nothing to SGTX but still pays their
 * logistics responsibilities). The caller can override the split by setting
 * `buyerOnPlatform` / `sellerOnPlatform` (default: both true → 50/50 split).
 */
export function calculateIncotermFees(
  incoterm: string,
  tradeValueUsd: number,
  logisticsCosts: LogisticsCost[],
  options?: {
    buyerOnPlatform?: boolean;
    sellerOnPlatform?: boolean;
    sgtxFeeRate?: number;
  },
): IncotermFeeResult {
  const warnings: string[] = [];
  const rate = options?.sgtxFeeRate ?? SGTX_FEE_RATE;
  const buyerOn = options?.buyerOnPlatform !== false;
  const sellerOn = options?.sellerOnPlatform !== false;

  let matrix;
  try {
    matrix = getIncotermResponsibility(incoterm);
  } catch (err: any) {
    warnings.push(
      `Unknown incoterm "${incoterm}" — fee calculation treated EXW-style (buyer pays all logistics).`,
    );
    return {
      incoterm: (incoterm || "").toUpperCase(),
      exwValueUsd: Number(tradeValueUsd) || 0,
      mandatoryLogisticsUsd: 0,
      totalTradeValueUsd: Number(tradeValueUsd) || 0,
      sgtxFeeUsd: (Number(tradeValueUsd) || 0) * rate,
      sgtxFeeRate: rate,
      buyerPaysUsd: Number(tradeValueUsd) || 0,
      sellerPaysUsd: 0,
      buyerPays: [
        {
          serviceType: "EXW",
          label: "EXW value (goods)",
          amountUsd: Number(tradeValueUsd) || 0,
        },
      ],
      sellerPays: [],
      breakdown: [],
      warnings,
    };
  }

  // Mandatory service set + payer map (from the matrix).
  const mandatoryPayer: Record<string, "BUYER" | "SELLER"> = {};
  for (const s of matrix.mandatoryServices) {
    mandatoryPayer[s.service.toUpperCase()] = s.payer;
  }
  const optionalPayer: Record<string, "BUYER" | "SELLER"> = {};
  for (const s of matrix.optionalServices) {
    optionalPayer[s.service.toUpperCase()] = s.payer;
  }

  // Build the breakdown from every supplied cost line.
  const breakdown: FeeBreakdown[] = [];
  const exw = Number(tradeValueUsd) || 0;

  // EXW goods value is always SELLER-pays (the seller receives the EXW price).
  // The SELLER "pays" EXW only in the sense of receiving it from the buyer —
  // for clarity we count the EXW as part of buyer's out-of-pocket. We surface
  // it as a separate breakdown line.
  breakdown.push({
    serviceType: "EXW",
    label: "EXW value (goods)",
    amountUsd: exw,
    payer: "BUYER",
    mandatory: true,
    countsTowardTradeValue: true,
    note: "Buyer pays the seller the EXW price for the goods.",
  });

  let mandatoryLogisticsTotal = 0;
  const seenTags = new Set<string>();

  for (const entry of logisticsCosts || []) {
    const tag = normalizeServiceTag(entry);
    if (!tag) {
      warnings.push("Skipped a logistics cost entry with no service tag.");
      continue;
    }
    const amountUsd = getAmountUsd(entry);
    const isMandatory = tag in mandatoryPayer;
    const isOptional = tag in optionalPayer;
    if (!isMandatory && !isOptional) {
      warnings.push(
        `Service "${tag}" is neither mandatory nor optional for ${incoterm} — included with BUYER payer fallback.`,
      );
    }
    const matrixPayer = mandatoryPayer[tag] || optionalPayer[tag] || "BUYER";
    const payer = entry.payer || matrixPayer;
    if (isMandatory) mandatoryLogisticsTotal += amountUsd;
    seenTags.add(tag);

    breakdown.push({
      serviceType: tag,
      label: entry.label || SERVICE_TYPE_LABELS[tag] || tag,
      amountUsd,
      payer,
      mandatory: isMandatory,
      countsTowardTradeValue: isMandatory,
      note: isMandatory
        ? `Mandatory under ${incoterm}. Payer per Incoterms 2020: ${matrixPayer}.`
        : isOptional
          ? `Optional under ${incoterm}. Payer per Incoterms 2020: ${matrixPayer}.`
          : `Not in the ${incoterm} matrix — caller-supplied payer override.`,
    });
  }

  // Add DUTY + TAXES as zero-amount lines so the breakdown shape is consistent.
  // DDP → seller pays; all others → buyer pays. The buyer wizard fills these
  // in via the customs gateway / GRiRE later; for now we surface the payer
  // allocation as a zero-amount placeholder line.
  const dutyPayer = matrix.sellerDuties ? "SELLER" : "BUYER";
  breakdown.push({
    serviceType: "DUTY",
    label: SERVICE_TYPE_LABELS.DUTY,
    amountUsd: 0,
    payer: dutyPayer,
    mandatory: true, // duties are always mandatory; the amount is computed later
    countsTowardTradeValue: false,
    note: `Import duty payer per ${incoterm}: ${dutyPayer}. Amount computed at customs declaration time (GRiRE / tariff engine).`,
  });

  // Compute Total Trade Value and SGTX fee.
  const totalTradeValue = Math.max(0, exw + mandatoryLogisticsTotal);
  const sgtxFeeUsd = totalTradeValue * rate;

  // SGTX fee split: 50/50 when both on-platform; full to whichever side is
  // on-platform; zero when neither is on-platform (theoretically impossible
  // but defensive).
  let sgtxBuyerShare = 0;
  let sgtxSellerShare = 0;
  if (buyerOn && sellerOn) {
    sgtxBuyerShare = sgtxFeeUsd / 2;
    sgtxSellerShare = sgtxFeeUsd / 2;
  } else if (buyerOn) {
    sgtxBuyerShare = sgtxFeeUsd;
  } else if (sellerOn) {
    sgtxSellerShare = sgtxFeeUsd;
  } else {
    warnings.push(
      "Neither party is on the SGTX platform — SGTX fee set to zero for display only; in production at least one party must be on-platform.",
    );
  }

  // SGTX fee breakdown line.
  breakdown.push({
    serviceType: "SGTX_FEE",
    label: `SGTX platform fee (${(rate * 100).toFixed(2)}% of Total Trade Value)`,
    amountUsd: sgtxFeeUsd,
    payer: sgtxBuyerShare >= sgtxSellerShare ? "BUYER" : "SELLER",
    mandatory: true,
    countsTowardTradeValue: false,
    note: `Total Trade Value × ${rate * 100}% = $${sgtxFeeUsd.toFixed(2)}. Split: buyer $${sgtxBuyerShare.toFixed(2)}, seller $${sgtxSellerShare.toFixed(2)}.`,
  });

  // Aggregate per-payer.
  const buyerLines: { serviceType: string; label: string; amountUsd: number }[] = [];
  const sellerLines: { serviceType: string; label: string; amountUsd: number }[] = [];
  let buyerPaysUsd = 0;
  let sellerPaysUsd = 0;

  for (const b of breakdown) {
    if (b.amountUsd <= 0) continue;
    if (b.payer === "BUYER") {
      buyerPaysUsd += b.amountUsd;
      buyerLines.push({
        serviceType: b.serviceType,
        label: b.label,
        amountUsd: b.amountUsd,
      });
    } else {
      sellerPaysUsd += b.amountUsd;
      sellerLines.push({
        serviceType: b.serviceType,
        label: b.label,
        amountUsd: b.amountUsd,
      });
    }
  }

  // SGTX fee split lines (separate so the UI can show them as platform fees).
  if (sgtxBuyerShare > 0) {
    buyerPaysUsd += sgtxBuyerShare;
    buyerLines.push({
      serviceType: "SGTX_FEE",
      label: "SGTX platform fee (buyer share)",
      amountUsd: sgtxBuyerShare,
    });
  }
  if (sgtxSellerShare > 0) {
    sellerPaysUsd += sgtxSellerShare;
    sellerLines.push({
      serviceType: "SGTX_FEE",
      label: "SGTX platform fee (seller share)",
      amountUsd: sgtxSellerShare,
    });
  }

  return {
    incoterm: matrix.incoterm,
    exwValueUsd: exw,
    mandatoryLogisticsUsd: mandatoryLogisticsTotal,
    totalTradeValueUsd: totalTradeValue,
    sgtxFeeUsd,
    sgtxFeeRate: rate,
    buyerPaysUsd,
    sellerPaysUsd,
    buyerPays: buyerLines,
    sellerPays: sellerLines,
    breakdown,
    warnings,
  };
}

// ============ Convenience exports for UI / Governor ============

/**
 * Returns the SGTX fee USD for an incoterm + trade value + logistics costs.
 * Convenience wrapper around calculateIncotermFees that returns just the
 * SGTX fee component (used by the landed-cost engine for the SGTX_FEE line).
 */
export function computeSgtxFee(
  incoterm: string,
  exwValueUsd: number,
  logisticsCosts: LogisticsCost[],
  rate: number = SGTX_FEE_RATE,
): number {
  const total = getTotalTradeValue(incoterm, exwValueUsd, logisticsCosts);
  return Math.max(0, total * rate);
}

/**
 * Returns the list of mandatory service tags the SELLER must price for the
 * given incoterm (used by the seller workflow / G2U18). This filters the
 * matrix to ONLY seller-side mandatory services — buyer-paid mandatory
 * services are out of scope for the seller's quote.
 */
export function getSellerMandatoryServices(incoterm: string): string[] {
  try {
    const r = getIncotermResponsibility(incoterm);
    return r.mandatoryServices
      .filter((s) => s.payer === "SELLER")
      .map((s) => s.service);
  } catch {
    return [];
  }
}

/**
 * Returns the list of mandatory service tags the BUYER must price / procure
 * for the given incoterm. Used by the buyer wizard's mandatory-services
 * checklist + the seller-side checklist of services the buyer will arrange.
 */
export function getBuyerMandatoryServices(incoterm: string): string[] {
  try {
    const r = getIncotermResponsibility(incoterm);
    return r.mandatoryServices
      .filter((s) => s.payer === "BUYER")
      .map((s) => s.service);
  } catch {
    return [];
  }
}
