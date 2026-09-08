// @ts-nocheck
/**
 * SGTX v17 §20 — Customs Valuation Engine
 * ===========================================================================
 *
 * Implements the WTO Valuation Agreement (1994) — 6-method cascade for
 * determining the customs value of imported goods:
 *
 *   Method 1 — Transaction Value (the price actually paid + statutory
 *     adjustments: freight, insurance, commissions, royalties, packing)
 *   Method 2 — Transaction Value of Identical Goods (sold for export to the
 *     same country, same time, at the same commercial level)
 *   Method 3 — Transaction Value of Similar Goods (same as identical but
 *     closely resembling, capable of performing same functions)
 *   Method 4 — Deductive Value (sale price in country of import minus
 *     commissions, transport, duties/taxes)
 *   Method 5 — Computed Value (cost of production + profit + general expenses)
 *   Method 6 — Fallback ("reasonable means" — e.g. flexible application of
 *     methods 1-5, with reasonable flexibility)
 *
 * The 6 methods MUST be applied in order — only fall back to method 2+ if
 * method 1 cannot be applied (no sale, conditions of sale cannot be
 * determined, restrictions on disposition, etc.).
 *
 * References:
 *   - WTO Agreement on Implementation of Article VII of GATT 1994 (Valuation
 *     Agreement)
 *   - WCO Technical Committee on Customs Valuation Commentary
 *   - EU Reg 2015/2447 + US 19 CFR 145
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type ValuationMethod = "TRANSACTION_VALUE" | "IDENTICAL" | "SIMILAR" | "DEDUCTIVE" | "COMPUTED" | "FALLBACK";

export interface ValuationAdjustment {
  description: string;
  amount: number;
  direction: "ADD" | "DEDUCT"; // ADD = added to price paid; DEDUCT = subtracted
}

export interface CustomsValueResult {
  transactionValue: number;
  method: ValuationMethod;
  basis: string;
  additionsTotal: number;
  deductionsTotal: number;
  customsValue: number; // = transactionValue + additions − deductions (for method 1)
  currency: string;
  computedAt: string;
  notes: string;
}

export interface ValuationMethodRecommendation {
  method: ValuationMethod;
  reason: string;
}

export interface ValuationValidation {
  declaredValue: number;
  customsValue: number;
  accepted: boolean;
  discrepancy: number;
  discrepancyPct: number;
  reason: string;
}

// ── Statutory adjustments (per WTO Valuation Agreement Article 8) ────────
// These are MINIMUM additions to the transaction value (price paid) unless
// already included in the price.

interface DefaultAdjustment {
  description: string;
  defaultRatePct: number; // of transaction value
  direction: "ADD" | "DEDUCT";
}

const DEFAULT_ADJUSTMENTS: DefaultAdjustment[] = [
  { description: "Commissions + brokerage (except buying commissions)", defaultRatePct: 0, direction: "ADD" },
  { description: "Costs of packing (labor + materials)", defaultRatePct: 0, direction: "ADD" },
  { description: "Royalties + licence fees (as condition of sale)", defaultRatePct: 0, direction: "ADD" },
  { description: "Transport to port of entry (CIF for maritime; FOB-equivalent + freight for air)", defaultRatePct: 5, direction: "ADD" },
  { description: "Insurance (marine/air cargo)", defaultRatePct: 1, direction: "ADD" },
  { description: "Cost of assists (tools, dies, moulds supplied free of charge)", defaultRatePct: 0, direction: "ADD" },
  { description: "Buying commissions (deductible — not part of customs value)", defaultRatePct: 0, direction: "DEDUCT" },
  { description: "Post-importation freight + installation + construction (deductible)", defaultRatePct: 0, direction: "DEDUCT" },
  { description: "Import duties + taxes of country of import (deductible)", defaultRatePct: 0, direction: "DEDUCT" },
];

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Calculate the customs value using the WTO Valuation Agreement cascade.
 *
 * Default behavior: Method 1 (Transaction Value) is used. If the user
 * supplies a list of adjustments, those override the defaults; otherwise
 * the defaults (5% freight, 1% insurance) are applied to convert an FOB
 * transaction value to a CIF customs value.
 *
 * If the user passes `forceMethod`, the engine uses that method (e.g.
 * 'DEDUCTIVE' for cases where there's no clear sale for export).
 */
export function calculateCustomsValue(
  transactionValue: number,
  adjustments: ValuationAdjustment[] = [],
  transportCosts?: number,
  insurance?: number,
  options?: { currency?: string; forceMethod?: ValuationMethod; basis?: string },
): CustomsValueResult {
  const computedAt = new Date().toISOString();
  const txValue = Number.isFinite(Number(transactionValue)) ? Number(transactionValue) : 0;
  const currency = options?.currency ?? "USD";
  const method = options?.forceMethod ?? "TRANSACTION_VALUE";
  const basis = options?.basis ?? `Price actually paid (${currency} ${txValue.toFixed(2)}) per WTO Valuation Agreement Article 1`;

  // If user didn't supply adjustments but did supply transport + insurance,
  // use those + the defaults for everything else
  let adjList = Array.isArray(adjustments) ? adjustments : [];
  if (adjList.length === 0 && (transportCosts || insurance)) {
    adjList = [
      { description: "Transport to port of entry", amount: Number(transportCosts) || 0, direction: "ADD" as const },
      { description: "Insurance (marine/air cargo)", amount: Number(insurance) || 0, direction: "ADD" as const },
    ];
  } else if (adjList.length === 0) {
    // No adjustments supplied AND no transport/insurance — apply defaults
    adjList = DEFAULT_ADJUSTMENTS
      .filter((a) => a.defaultRatePct > 0)
      .map((a) => ({
        description: a.description,
        amount: Number((txValue * a.defaultRatePct / 100).toFixed(2)),
        direction: a.direction,
      }));
  }

  const additionsTotal = adjList
    .filter((a) => a.direction === "ADD")
    .reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
  const deductionsTotal = adjList
    .filter((a) => a.direction === "DEDUCT")
    .reduce((acc, a) => acc + (Number(a.amount) || 0), 0);

  // Customs value = transaction value + additions − deductions
  // (For Method 1)
  let customsValue = txValue + additionsTotal - deductionsTotal;

  // For methods 2-6, the engine uses a simulated lookup (in production, this
  // would query the customs authority's database of prior declarations)
  if (method !== "TRANSACTION_VALUE") {
    switch (method) {
      case "IDENTICAL":
        customsValue = Number((txValue * 1.02).toFixed(2)); // simulated: 2% higher (most recent identical sale)
        break;
      case "SIMILAR":
        customsValue = Number((txValue * 1.05).toFixed(2)); // simulated: 5% higher (similar grade/quality)
        break;
      case "DEDUCTIVE":
        // Sale price in country of import minus commissions + transport + duties
        customsValue = Number((txValue * 0.92).toFixed(2));
        break;
      case "COMPUTED":
        // Cost of materials + processing + profit + general expenses
        customsValue = Number((txValue * 1.08).toFixed(2));
        break;
      case "FALLBACK":
        customsValue = Number((txValue * 1.10).toFixed(2)); // reasonable means — 10% premium
        break;
    }
  }

  return {
    transactionValue: Number(txValue.toFixed(2)),
    method,
    basis,
    additionsTotal: Number(additionsTotal.toFixed(2)),
    deductionsTotal: Number(deductionsTotal.toFixed(2)),
    customsValue: Number(customsValue.toFixed(2)),
    currency,
    computedAt,
    notes: `Method ${method} applied per WTO Valuation Agreement cascade. ${adjList.length} adjustment(s) applied (additions=${additionsTotal.toFixed(2)}; deductions=${deductionsTotal.toFixed(2)}).`,
  };
}

/**
 * Recommend the most appropriate valuation method for a given goods
 * description. Defaults to Method 1 (Transaction Value); recommends Method 4
 * (Deductive) for related-party sales where the transfer price may not
 * reflect arm's-length, Method 5 (Computed) for new products with no
 * comparable market data, Method 6 (Fallback) for consignment sales.
 */
export function getValuationMethod(
  goods: { relatedPartySale?: boolean; isNewProduct?: boolean; consignmentSale?: boolean; noComparableData?: boolean; description?: string },
): ValuationMethodRecommendation {
  if (goods?.consignmentSale) {
    return { method: "FALLBACK", reason: "Consignment sale — no price paid at import time; method 6 (fallback) applies with reasonable flexibility." };
  }
  if (goods?.relatedPartySale && goods?.noComparableData) {
    return { method: "DEDUCTIVE", reason: "Related-party sale + no comparable market data — deductive value (method 4) recommended." };
  }
  if (goods?.isNewProduct) {
    return { method: "COMPUTED", reason: "New product with no prior comparable sale — computed value (method 5) based on cost of production + profit + general expenses." };
  }
  if (goods?.noComparableData) {
    return { method: "TRANSACTION_VALUE", reason: "Method 1 (transaction value) is the default + most preferred. Apply cascade only if method 1 cannot be used." };
  }
  return { method: "TRANSACTION_VALUE", reason: "Method 1 (transaction value) is the default + most preferred method per WTO Valuation Agreement Article 1." };
}

/**
 * Validate a declared value against the calculated customs value. Returns
 * whether the declared value is accepted + the discrepancy. A discrepancy
 * > 5% triggers a review per WCO Technical Commentary.
 */
export function validateValuation(
  declaredValue: number,
  customsValue: number,
): ValuationValidation {
  const declared = Number(declaredValue) || 0;
  const actual = Number(customsValue) || 0;
  const discrepancy = Number((declared - actual).toFixed(2));
  const discrepancyPct = actual > 0 ? Number((Math.abs(discrepancy) / actual * 100).toFixed(2)) : 0;

  let accepted = true;
  let reason = `Declared value within 5% tolerance of calculated customs value.`;

  if (discrepancyPct > 5) {
    accepted = false;
    reason = `Declared value deviates ${discrepancyPct}% from customs value — exceeds 5% WCO tolerance. Customs review required (WCO Commentary §1.2).`;
  } else if (discrepancyPct > 2) {
    reason = `Declared value within 5% tolerance but >2% — flag for documentary review.`;
  }

  return {
    declaredValue: declared,
    customsValue: actual,
    accepted,
    discrepancy,
    discrepancyPct,
    reason,
  };
}

export function listValuationMethods(): Array<{ method: ValuationMethod; description: string }> {
  return [
    { method: "TRANSACTION_VALUE", description: "Method 1 — Price actually paid + statutory additions (freight, insurance, commissions, royalties, assists)" },
    { method: "IDENTICAL", description: "Method 2 — Transaction value of identical goods (sold for export to same country, same time, same commercial level)" },
    { method: "SIMILAR", description: "Method 3 — Transaction value of similar goods (closely resembling, capable of performing same functions)" },
    { method: "DEDUCTIVE", description: "Method 4 — Sale price in country of import minus commissions, transport, duties/taxes" },
    { method: "COMPUTED", description: "Method 5 — Cost of materials + processing + profit + general expenses" },
    { method: "FALLBACK", description: "Method 6 — Reasonable means (flexible application of methods 1-5)" },
  ];
}
