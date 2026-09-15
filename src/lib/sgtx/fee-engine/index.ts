// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine (7-layer deterministic engine)
 * ===========================================================================
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │                                                                          │
 * │   DYNAMIC FEE ENGINE — 7-LAYER ARCHITECTURE (v18 §9.27)                 │
 * │                                                                          │
 * │   Layer 0: Constitutional Floor / Ceiling (NON-BYPASSABLE)              │
 * │            RATE_FLOOR = 0.03%   RATE_CEILING = 1.50%                    │
 * │                                                                          │
 * │   Layer 1: Canonical Fee Basis (CFB) + Economic Classification          │
 * │            CFB = EXW_GOODS_VALUE + ELIGIBLE_SELLER_RESPONSIBLE_LOGISTICS│
 * │            Exclusions: VAT, duties, gov taxes, financing principal,    │
 * │            refundable deposits, bank charges.                           │
 * │            Economic classes: STANDARD, ESSENTIAL, BULK, PERISHABLE,     │
 * │            SPECIAL_STOCK (A-H), HIGH_VALUE_LOW_MARGIN, RO_RO,           │
 * │            FINANCING_LINKED, MULTI_SHIPMENT, STRATEGIC_CORRIDOR,        │
 * │            DISTRESSED.                                                  │
 * │                                                                          │
 * │   Layer 2: Cost-to-Serve (CTS) — 0-100 score                            │
 * │            Factors: trade complexity, regulatory burden, integration   │
 * │            count, exception count, dispute history, jurisdiction tier. │
 * │                                                                          │
 * │   Layer 3: Risk — 0-100 score                                           │
 * │            Factors: sanctions proximity, jurisdiction risk, commodity  │
 * │            risk, perishability, value at risk, counterparty TRI.       │
 * │                                                                          │
 * │   Layer 4: Value Delivered — 0-100 score                                │
 * │            Factors: time saved, document automation, financing access, │
 * │            compliance coverage, audit trail quality, trade health.      │
 * │                                                                          │
 * │   Layer 5: Efficiency — 0-100 score                                    │
 * │            Factors: API integration depth, automation level, data      │
 * │            quality, straight-through processing rate, exception rate.  │
 * │                                                                          │
 * │   Layer 6: Party Affordability Guard                                   │
 * │            MARGIN_TAKE_RATE = 10% + 25% × SIGMOID((MARGIN−8%)/4%)       │
 * │            bounded [10%, 35%]                                           │
 * │            AFFORDABILITY_CAP = ESTIMATED_GROSS_PROFIT × MARGIN_TAKE_RATE│
 * │                                                                          │
 * │   Layer 7: Constitutional Finalization                                 │
 * │            PRE_CAP_FEE = MIN(RAW_FEE, AFFORDABILITY_CAP, BULK_CAP,      │
 * │            ESSENTIAL_CAP, SPECIAL_STOCK_CAP, CONSTITUTIONAL_CAP)       │
 * │            FINAL_FEE = MAX(PRE_CAP_FEE, COST_TO_SERVE_FLOOR)           │
 * │            Constitutional check: 0 ≤ FINAL_FEE ≤ 1.50% × CFB           │
 * │                                                                          │
 * │   Fairness Score (Layer 2-5 aggregation):                              │
 * │     FAIRNESS_SCORE = CLAMP(0.35·CTS + 0.30·RISK + 0.20·VALUE            │
 * │                              − 0.15·EFFICIENCY, 0, 100)                 │
 * │                                                                          │
 * │   Base Fair Rate:                                                       │
 * │     BASE_FAIR_RATE = 0.03% + 1.47% × (FAIRNESS_SCORE/100)               │
 * │                                                                          │
 * │   Master Formula §9.27.22 (6 steps):                                   │
 * │     1. CLASS_ADJUSTED_RATE = BASE_FAIR_RATE × class_factor              │
 * │     2. DISCOUNTED_RATE     = CLASS_ADJUSTED_RATE × (1 − Σ discounts)    │
 * │     3. RAW_FEE             = CFB × DISCOUNTED_RATE                     │
 * │     4. PRE_CAP_FEE         = MIN(RAW_FEE, AFFORDABILITY_CAP, …)        │
 * │     5. FINAL_FEE           = MAX(PRE_CAP_FEE, COST_TO_SERVE_FLOOR)     │
 * │     6. Constitutional check                                              │
 * │                                                                          │
 * │   INVARIANT: The engine is DETERMINISTIC. Same inputs → same fee.      │
 * │                                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Database storage: existing FeeCalculation row, with the full Fee Decision
 * Object stored as JSON in `providerFeesJson`. FeeLock row + GovernorDecision
 * row written by `lockFeeDecision`.
 *
 * Incoterm resolution: the existing incoterm-engine (`src/lib/sgtx/incoterms/
 * responsibility-engine.ts`) supplies the seller-responsible logistics lines
 * via `getIncotermResponsibility(incoterm).mandatoryServices` filtered to
 * payer=SELLER.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
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
import {
  RATE_FLOOR,
  RATE_CEILING,
  FAIRNESS_WEIGHTS,
  BASE_FAIR_RATE_INTERCEPT,
  BASE_FAIR_RATE_SLOPE,
  MARGIN_TAKE_RATE_FLOOR,
  MARGIN_TAKE_RATE_CEILING,
  MARGIN_TAKE_RATE_BASE,
  MARGIN_TAKE_RATE_SIGMOID_COEFF,
  MARGIN_MIDPOINT_PCT,
  MARGIN_SIGMOID_SCALE_PCT,
  CLASS_CAPS,
  ECONOMIC_CLASSES,
  ECONOMIC_CLASS_MAP,
  SPECIAL_STOCK_SUBCLASSES,
  DISCOUNT_DEFS,
  DISCOUNT_MAP,
  DISCOUNT_CAPS,
  CFB_EXCLUSIONS,
  FEE_POLICY_ID,
  FEE_POLICY_VERSION,
  FEE_FORMULA_VERSION,
  INPUT_SNAPSHOT_VERSION,
  TRI_VERSION,
  RIA_VERSION,
  MARKET_DATA_VERSION,
  FX_SNAPSHOT_VERSION,
  FEE_POLICY_EFFECTIVE_DATE,
  CTS_FACTOR_WEIGHTS,
  RISK_FACTOR_WEIGHTS,
  VALUE_FACTOR_WEIGHTS,
  EFFICIENCY_FACTOR_WEIGHTS,
  sigmoid,
  marginTakeRate,
  clamp,
  roundTo,
  type EconomicClassDef,
  type DiscountDef,
} from "@/lib/sgtx/fee-engine/constants";

// ============================================================================
// Types — Fee Decision Object (§9.27.21 — 35+ fields)
// ============================================================================

export interface LogisticsCostInput {
  serviceType?: string;
  service?: string;
  type?: string;
  serviceCode?: string;
  amountUsd?: number;
  amount?: number;
  cost?: number;
  fee?: number;
  price?: number;
  payer?: "BUYER" | "SELLER";
  label?: string;
}

export interface CFBSnapshot {
  /** Canonical Fee Basis (USD) — EXW + eligible seller-responsible logistics. */
  cfb: number;
  /** EXW goods value (USD). */
  exwValue: number;
  /** Sum of eligible seller-responsible logistics (USD). */
  eligibleLogisticsUsd: number;
  /** Per-line breakdown of the eligible logistics. */
  eligibleLogisticsLines: { service: string; amountUsd: number; payer: string }[];
  /** Excluded cost lines (with reason). */
  exclusions: { reason: string; lines: string[] };
  /** Incoterm code driving the eligibility. */
  incoterm: string;
}

export interface ScoreResult {
  score: number;
  factors: Record<string, number>;
  notes?: string[];
}

export interface FairnessResult {
  score: number;
  formula: string;
  components: { cts: number; risk: number; value: number; efficiency: number };
}

export interface BaseFairRateResult {
  rate: number;
  formula: string;
}

export interface EconomicClassificationResult {
  classes: string[];
  primaryClass: string;
  factors: Record<string, number>;
  subclass?: string;
  notes: string[];
}

export interface MarginTakeRateResult {
  rate: number;
  formula: string;
  estimatedMarginPct: number;
  verifiedMarginPct: number | null;
  referenceMarginPct: number;
  confidence: number;
}

export interface AffordabilityCapResult {
  cap: number;
  formula: string;
  estimatedGrossProfit: number;
  marginTakeRate: number;
}

export interface DiscountEntry {
  id: string;
  label: string;
  pct: number;
  bps: number;
  notes: string;
}

export interface DiscountsResult {
  discounts: DiscountEntry[];
  totalDiscountPct: number;
  notes: string[];
}

export interface FeeDecisionObject {
  // ── Version metadata ─────────────────────────────────────────────────────
  FEE_DECISION_ID: string;
  USTN: string;
  FEE_POLICY_ID: string;
  FEE_POLICY_VERSION: string;
  FEE_FORMULA_VERSION: string;
  INPUT_SNAPSHOT_VERSION: string;
  TRI_VERSION: string;
  RIA_VERSION: string;
  MARKET_DATA_VERSION: string;
  FX_SNAPSHOT_VERSION: string;

  // ── Layer 1 — CFB + economic classification ───────────────────────────────
  CFB: number;
  EXW_VALUE: number;
  ELIGIBLE_LOGISTICS: number;
  ECONOMIC_CLASSES: string[];
  PRIMARY_CLASS: string;
  CLASS_FACTOR: number;
  SUBCLASS?: string;

  // ── Layers 2-5 — scores ──────────────────────────────────────────────────
  CTS_SCORE: number;
  RISK_SCORE: number;
  VALUE_SCORE: number;
  EFFICIENCY_SCORE: number;
  FAIRNESS_SCORE: number;

  // ── Rate chain ────────────────────────────────────────────────────────────
  BASE_FAIR_RATE: number;
  CLASS_ADJUSTED_RATE: number;
  DISCOUNTS_APPLIED: DiscountEntry[];
  DISCOUNTED_RATE: number;

  // ── Fee chain ──────────────────────────────────────────────────────────────
  RAW_FEE: number;
  CAPS_APPLIED: { cap: string; value: number; binding: boolean }[];
  PRE_CAP_FEE: number;
  COST_TO_SERVE_FLOOR: number;
  FINAL_FEE: number;
  FINAL_RATE: number;

  // ── Affordability / party protection ──────────────────────────────────────
  AFFORDABILITY_CAP: number;
  ESTIMATED_GROSS_PROFIT: number;
  MARGIN_TAKE_RATE: number;
  PARTY_PROTECTION_LIMIT: number;

  // ── Trace + audit ──────────────────────────────────────────────────────────
  CALCULATION_TRACE: CalculationTrace;
  TSEC: string; // Trade-Specific Execution Code (deterministic hash)
  CALCULATED_AT: string;
  GOVERNOR_DECISION_ID: string | null;
  LOOM_HASH: string | null;
  LOCKED: boolean;
}

export interface CalculationTrace {
  layer0_constitutional: {
    rate_floor: number;
    rate_ceiling: number;
    notes: string[];
  };
  layer1_cfb: {
    exw_value: number;
    eligible_logistics_lines: { service: string; amount: number; payer: string }[];
    eligible_logistics_total: number;
    cfb: number;
    exclusions: { reason: string; lines: string[] };
    economic_classes: string[];
    primary_class: string;
    class_factor: number;
    subclass?: string;
    notes: string[];
  };
  layer2_cts: {
    score: number;
    factors: Record<string, number>;
    weights: typeof CTS_FACTOR_WEIGHTS;
    notes: string[];
  };
  layer3_risk: {
    score: number;
    factors: Record<string, number>;
    weights: typeof RISK_FACTOR_WEIGHTS;
    notes: string[];
  };
  layer4_value: {
    score: number;
    factors: Record<string, number>;
    weights: typeof VALUE_FACTOR_WEIGHTS;
    notes: string[];
  };
  layer5_efficiency: {
    score: number;
    factors: Record<string, number>;
    weights: typeof EFFICIENCY_FACTOR_WEIGHTS;
    notes: string[];
  };
  fairness: {
    formula: string;
    components: { cts: number; risk: number; value: number; efficiency: number };
    score: number;
  };
  base_fair_rate: {
    formula: string;
    intercept: number;
    slope: number;
    rate: number;
  };
  master_formula: {
    step1_class_adjusted_rate: number;
    step2_discounted_rate: number;
    step3_raw_fee: number;
    step4_pre_cap_fee: number;
    step5_final_fee: number;
    step6_constitutional_check: { valid: boolean; lower: number; upper: number };
    notes: string[];
  };
  affordability: {
    estimated_gross_profit: number;
    margin_take_rate: number;
    affordability_cap: number;
    formula: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: { id: string; label: string; passed: boolean; detail: string }[];
}

export interface FeePolicyVersion {
  policyId: string;
  policyVersion: string;
  formulaVersion: string;
  inputSnapshotVersion: string;
  effectiveDate: string;
}

// ============================================================================
// Helpers — logistics cost parsing
// ============================================================================

function normalizeServiceTag(entry: LogisticsCostInput): string {
  const raw =
    entry.serviceType || entry.service || entry.type || entry.serviceCode || "";
  return String(raw || "").trim().toUpperCase();
}

function getAmountUsd(entry: LogisticsCostInput): number {
  const v = entry.amountUsd ?? entry.amount ?? entry.cost ?? entry.fee ?? entry.price ?? 0;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ============================================================================
// Layer 1 — Canonical Fee Basis (CFB) + Economic Classification
// ============================================================================

/**
 * Compute the Canonical Fee Basis for a trade:
 *
 *   CFB = EXW_GOODS_VALUE + ELIGIBLE_SELLER_RESPONSIBLE_LOGISTICS
 *
 * Eligible logistics = mandatory services per the Incoterm responsibility
 * matrix where the payer is SELLER. Explicit exclusions per §9.27.2: VAT,
 * duties, government taxes/levies, financing principal, refundable deposits,
 * bank charges.
 *
 * NOTE: this function is pure — it accepts a snapshot of logistics costs and
 * the incoterm, so the same snapshot always yields the same CFB
 * (deterministic). The `calculateCFB(ustn)` variant loads the trade from the
 * DB and dispatches to this.
 */
export function computeCFB(
  exwValue: number,
  logisticsCosts: LogisticsCostInput[],
  incoterm: string,
): CFBSnapshot {
  const exw = Math.max(0, Number(exwValue) || 0);
  const matrix = (() => {
    try {
      return getIncotermResponsibility(incoterm);
    } catch {
      return null;
    }
  })();

  // Build the seller-responsible mandatory service set from the matrix.
  const sellerMandatoryServices = new Set<string>();
  if (matrix) {
    for (const s of matrix.mandatoryServices || []) {
      if (s.payer === "SELLER") {
        sellerMandatoryServices.add(s.service.toUpperCase());
      }
    }
  }

  const eligibleLines: { service: string; amountUsd: number; payer: string }[] = [];
  const excludedLines: string[] = [];

  for (const entry of logisticsCosts || []) {
    const tag = normalizeServiceTag(entry);
    const amount = getAmountUsd(entry);
    if (!tag || amount <= 0) continue;

    // Hard exclusions per §9.27.2 (these never enter CFB).
    const upper = tag.toUpperCase();
    if (
      upper.includes("VAT") ||
      upper.includes("DUTY") ||
      upper.includes("DUTIES") ||
      upper.includes("TAX") ||
      upper.includes("GOV_") ||
      upper.includes("FINANCING_PRINCIPAL") ||
      upper.includes("DEPOSIT") ||
      upper.includes("BANK_CHARGE")
    ) {
      excludedLines.push(`${tag} ($${amount.toFixed(2)})`);
      continue;
    }

    // Eligible only if the seller is the responsible payer per the incoterm
    // matrix (or if we have no matrix — fall back to the entry's own payer).
    const responsible = matrix
      ? sellerMandatoryServices.has(upper)
      : (entry.payer || "SELLER") === "SELLER";

    if (responsible) {
      eligibleLines.push({
        service: tag,
        amountUsd: amount,
        payer: "SELLER",
      });
    } else {
      // Buyer-responsible logistics is NOT excluded per §9.27.2, but it is NOT
      // part of CFB either (CFB only counts seller-responsible logistics).
      excludedLines.push(`${tag} ($${amount.toFixed(2)}) — buyer-responsible`);
    }
  }

  const eligibleLogisticsUsd = eligibleLines.reduce((s, l) => s + l.amountUsd, 0);
  const cfb = exw + eligibleLogisticsUsd;

  return {
    cfb: roundTo(cfb, 6),
    exwValue: roundTo(exw, 6),
    eligibleLogisticsUsd: roundTo(eligibleLogisticsUsd, 6),
    eligibleLogisticsLines: eligibleLines,
    exclusions: {
      reason: "§9.27.2 exclusions + buyer-responsible logistics (not in CFB)",
      lines: excludedLines,
    },
    incoterm: (incoterm || "UNKNOWN").toUpperCase(),
  };
}

/**
 * Load a Trade by USTN and compute its CFB. Returns null if the trade cannot
 * be found. Defensive — never throws.
 */
export async function calculateCFB(ustn: string): Promise<CFBSnapshot | null> {
  try {
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) return null;

    // Re-hydrate the trade's logistics costs. The Trade model stores them in
    // `logisticsRfqSummary` (JSON string) — fall back to empty array if absent
    // or unparseable so the engine still produces a deterministic decision.
    let logisticsCosts: LogisticsCostInput[] = [];
    if (trade.logisticsRfqSummary) {
      try {
        const parsed = JSON.parse(trade.logisticsRfqSummary);
        if (Array.isArray(parsed)) {
          logisticsCosts = parsed as LogisticsCostInput[];
        } else if (parsed && Array.isArray(parsed.costs)) {
          logisticsCosts = parsed.costs as LogisticsCostInput[];
        } else if (parsed && Array.isArray(parsed.lines)) {
          logisticsCosts = parsed.lines as LogisticsCostInput[];
        }
      } catch {
        // ignore — leave logistics empty
      }
    }

    const exw = Number(trade.tradeValueUsd) || 0;
    return computeCFB(exw, logisticsCosts, trade.incoterm || "EXW");
  } catch (err: any) {
    logger.error("[fee-engine] calculateCFB failed", { ustn, error: err?.message });
    return null;
  }
}

/**
 * Classify a trade into economic classes (non-mutually-exclusive — a trade
 * can be in multiple classes simultaneously).
 *
 * Heuristics (deterministic — pure function of the trade snapshot):
 *   - ESSENTIAL     — commodity in essential-goods HS prefix list (food/medicine).
 *   - BULK          — grossWeightKg ≥ 50_000 kg OR containerCount ≥ 5.
 *   - PERISHABLE    — coldChain=true OR commodity in perishable list.
 *   - SPECIAL_STOCK — commodity in special-stock subclass map (A-H).
 *   - HVLM          — exwValue ≥ $500_000 AND margin estimate ≤ 6%.
 *   - RO_RO         — transportMode == "RO_RO" or equipmentType contains "RORO".
 *   - FINANCING_LINKED — bankInstrument is non-empty (LC/DA/etc.).
 *   - MULTI_SHIPMENT — multiShipment=true OR parentUstn non-null.
 *   - STRATEGIC_CORRIDOR — origin × destination in strategic corridor map.
 *   - DISTRESSED    — status contains "DISTRESSED" OR tradeCriticality contains "DISTRESSED".
 *   - STANDARD      — always present as the fallback class.
 */
export function classifyEconomics(snapshot: {
  exwValue: number;
  commodity: string;
  commodityHs?: string | null;
  grossWeightKg: number;
  containerCount: number;
  coldChain: boolean;
  transportMode?: string | null;
  equipmentType?: string | null;
  bankInstrument?: string | null;
  multiShipment: boolean;
  parentUstn?: string | null;
  originCountry: string;
  destCountry: string;
  status?: string;
  tradeCriticality?: string | null;
  estimatedMarginPct?: number;
}): EconomicClassificationResult {
  const classes: string[] = ["STANDARD"];
  const factors: Record<string, number> = { STANDARD: 1.0 };
  const notes: string[] = [];

  const hs = (snapshot.commodityHs || "").toUpperCase();
  const commodityUpper = (snapshot.commodity || "").toUpperCase();

  // ESSENTIAL — food, medicine, humanitarian.
  const essentialHsPrefixes = ["0201", "0202", "0203", "0301", "0302", "0303", "0401", "0402", "1001", "1002", "1003", "1005", "1006", "1101", "1901"];
  const essentialCommodities = ["RICE", "WHEAT", "FLOUR", "SUGAR", "OIL", "MEDICINE", "PHARMACEUTICAL", "VACCINE", "MEDICAL", "HUMANITARIAN"];
  if (essentialHsPrefixes.some((p) => hs.startsWith(p)) || essentialCommodities.some((c) => commodityUpper.includes(c))) {
    classes.push("ESSENTIAL");
    factors.ESSENTIAL = ECONOMIC_CLASS_MAP.ESSENTIAL!.factor;
    notes.push("Commodity matched essential-goods list (food/medicine/humanitarian).");
  }

  // BULK — heavy volume or many containers.
  if (snapshot.grossWeightKg >= 50_000 || snapshot.containerCount >= 5) {
    classes.push("BULK");
    factors.BULK = ECONOMIC_CLASS_MAP.BULK!.factor;
    notes.push(`Bulk: ${snapshot.grossWeightKg} kg / ${snapshot.containerCount} containers.`);
  }

  // PERISHABLE — cold chain or perishable commodity.
  const perishableCommodities = ["FRUIT", "VEGETABLE", "FISH", "MEAT", "DAIRY", "FROZEN", "FRESH", "FLOWER"];
  if (snapshot.coldChain || perishableCommodities.some((c) => commodityUpper.includes(c))) {
    classes.push("PERISHABLE");
    factors.PERISHABLE = ECONOMIC_CLASS_MAP.PERISHABLE!.factor;
    notes.push("Perishable goods (cold chain or perishable-commodity match).");
  }

  // SPECIAL_STOCK — subclass A-H detection.
  const specialStockMap: Record<string, string[]> = {
    A: ["ART", "ANTIQUITY", "ANTIQUITIES"],
    B: ["GOLD", "SILVER", "PRECIOUS METAL"],
    C: ["DIAMOND", "GEMSTONE", "JEWEL"],
    D: ["ELECTRONICS", "SEMICONDUCTOR"],
    E: ["PHARMACEUTICAL", "BIOLOGIC"],
    F: ["DUAL USE"],
    G: ["CULTURAL", "HERITAGE"],
    H: [], // catch-all handled below
  };
  let specialStockSubclass: string | undefined;
  for (const [sub, keywords] of Object.entries(specialStockMap)) {
    if (keywords.some((k) => commodityUpper.includes(k))) {
      classes.push("SPECIAL_STOCK");
      factors.SPECIAL_STOCK = SPECIAL_STOCK_SUBCLASSES[sub];
      specialStockSubclass = sub;
      notes.push(`Special-stock subclass ${sub} matched.`);
      break;
    }
  }

  // HIGH_VALUE_LOW_MARGIN — high value + low margin.
  const margin = Number(snapshot.estimatedMarginPct) || 0;
  if (snapshot.exwValue >= 500_000 && margin > 0 && margin <= 6) {
    classes.push("HIGH_VALUE_LOW_MARGIN");
    factors.HIGH_VALUE_LOW_MARGIN = ECONOMIC_CLASS_MAP.HIGH_VALUE_LOW_MARGIN!.factor;
    notes.push(`HVLM: exw=$${snapshot.exwValue.toFixed(0)}, margin=${margin.toFixed(1)}%.`);
  }

  // RO_RO.
  const tm = (snapshot.transportMode || "").toUpperCase();
  const et = (snapshot.equipmentType || "").toUpperCase();
  if (tm.includes("RO_RO") || tm.includes("RORO") || et.includes("RORO") || et.includes("ROLL")) {
    classes.push("RO_RO");
    factors.RO_RO = ECONOMIC_CLASS_MAP.RO_RO!.factor;
    notes.push("RO-RO transport mode detected — per-unit fee model applies.");
  }

  // FINANCING_LINKED.
  if (snapshot.bankInstrument && snapshot.bankInstrument.trim() !== "") {
    classes.push("FINANCING_LINKED");
    factors.FINANCING_LINKED = ECONOMIC_CLASS_MAP.FINANCING_LINKED!.factor;
    notes.push(`Financing-linked via bank instrument: ${snapshot.bankInstrument}.`);
  }

  // MULTI_SHIPMENT.
  if (snapshot.multiShipment || snapshot.parentUstn) {
    classes.push("MULTI_SHIPMENT");
    factors.MULTI_SHIPMENT = ECONOMIC_CLASS_MAP.MULTI_SHIPMENT!.factor;
    notes.push("Multi-shipment trade (parent or multiShipment=true).");
  }

  // STRATEGIC_CORRIDOR.
  const strategicCorridors: [string, string][] = [
    ["EG", "SA"], // Egypt → Saudi Arabia
    ["EG", "AE"], // Egypt → UAE
    ["EG", "CN"], // Egypt → China
    ["EG", "EU"], // Egypt → EU
    ["SA", "EG"],
    ["AE", "EG"],
    ["CN", "EG"],
    ["EU", "EG"],
  ];
  const corridorKey = `${snapshot.originCountry.toUpperCase()}|${snapshot.destCountry.toUpperCase()}`;
  if (strategicCorridors.some(([o, d]) => corridorKey.startsWith(`${o}|${d}`))) {
    classes.push("STRATEGIC_CORRIDOR");
    factors.STRATEGIC_CORRIDOR = ECONOMIC_CLASS_MAP.STRATEGIC_CORRIDOR!.factor;
    notes.push(`Strategic corridor: ${snapshot.originCountry} → ${snapshot.destCountry}.`);
  }

  // DISTRESSED.
  const status = (snapshot.status || "").toUpperCase();
  const criticality = (snapshot.tradeCriticality || "").toUpperCase();
  if (status.includes("DISTRESSED") || criticality.includes("DISTRESSED")) {
    classes.push("DISTRESSED");
    factors.DISTRESSED = ECONOMIC_CLASS_MAP.DISTRESSED!.factor;
    notes.push("Distressed trade detected.");
  }

  // Determine primary class — most-specific non-STANDARD class wins.
  const priority = ["DISTRESSED", "SPECIAL_STOCK", "HIGH_VALUE_LOW_MARGIN", "PERISHABLE", "BULK", "RO_RO", "FINANCING_LINKED", "MULTI_SHIPMENT", "STRATEGIC_CORRIDOR", "ESSENTIAL", "STANDARD"];
  const primaryClass = priority.find((c) => classes.includes(c)) || "STANDARD";
  const classFactor = factors[primaryClass] ?? ECONOMIC_CLASS_MAP[primaryClass]?.factor ?? 1.0;

  return {
    classes,
    primaryClass,
    factors: { ...factors, [primaryClass]: classFactor },
    subclass: specialStockSubclass,
    notes,
  };
}

// ============================================================================
// Layer 2 — Cost-to-Serve (CTS) — 0-100 score
// ============================================================================

/**
 * Score the cost-to-serve of a trade. Higher score = higher CTS = higher fair rate.
 *
 * Factors (weighted):
 *   - tradeComplexity (multi-modal, multi-leg, multi-shipment) — 20%
 *   - regulatoryBurden (jurisdiction tier, special permits) — 20%
 *   - integrationCount (number of distinct provider integrations) — 15%
 *   - exceptionCount (open exceptions in the trade lifecycle) — 15%
 *   - disputeHistory (count of historical disputes for this trade / counterparties) — 15%
 *   - jurisdictionTier (origin × destination tier) — 15%
 *
 * Each factor is independently scaled to 0-100 then weighted-summed.
 */
export function scoreCostToServe(snapshot: {
  multiShipment?: boolean;
  multiLeg?: boolean;
  transportMode?: string | null;
  originTier?: number; // 1-5
  destTier?: number;
  specialPermits?: number;
  integrationCount?: number;
  exceptionCount?: number;
  disputeCount?: number;
}): ScoreResult {
  // Trade complexity — multi-shipment + multi-leg + multi-modal = 100.
  let tradeComplexity = 30; // base
  if (snapshot.multiShipment) tradeComplexity += 25;
  if (snapshot.multiLeg) tradeComplexity += 25;
  if (snapshot.transportMode && snapshot.transportMode.toUpperCase() === "MULTIMODAL") tradeComplexity += 20;
  tradeComplexity = clamp(tradeComplexity, 0, 100);

  // Regulatory burden — tier + special permits.
  const tierSum = (Number(snapshot.originTier) || 1) + (Number(snapshot.destTier) || 1);
  let regulatoryBurden = clamp(tierSum * 10, 0, 80);
  regulatoryBurden += clamp(Number(snapshot.specialPermits) || 0, 0, 20);
  regulatoryBurden = clamp(regulatoryBurden, 0, 100);

  // Integration count — 0=0, 1=20, 2=40, …, 5+=100.
  const ic = Number(snapshot.integrationCount) || 0;
  const integrationCount = clamp(ic * 20, 0, 100);

  // Exception count — 0=0, 1=30, 2=60, 3+=100.
  const ec = Number(snapshot.exceptionCount) || 0;
  const exceptionCount = clamp(ec * 30, 0, 100);

  // Dispute history — 0=0, 1=40, 2=70, 3+=100.
  const dc = Number(snapshot.disputeCount) || 0;
  const disputeHistory = clamp(dc * 30 + (dc > 0 ? 10 : 0), 0, 100);

  // Jurisdiction tier — average of origin + dest tiers × 20.
  const avgTier = (Number(snapshot.originTier) || 1 + (Number(snapshot.destTier) || 1)) / 2;
  const jurisdictionTier = clamp(avgTier * 20, 0, 100);

  const factors = { tradeComplexity, regulatoryBurden, integrationCount, exceptionCount, disputeHistory, jurisdictionTier };

  const score =
    tradeComplexity * CTS_FACTOR_WEIGHTS.tradeComplexity +
    regulatoryBurden * CTS_FACTOR_WEIGHTS.regulatoryBurden +
    integrationCount * CTS_FACTOR_WEIGHTS.integrationCount +
    exceptionCount * CTS_FACTOR_WEIGHTS.exceptionCount +
    disputeHistory * CTS_FACTOR_WEIGHTS.disputeHistory +
    jurisdictionTier * CTS_FACTOR_WEIGHTS.jurisdictionTier;

  return {
    score: roundTo(clamp(score, 0, 100), 4),
    factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, roundTo(v as number, 4)])),
  };
}

// ============================================================================
// Layer 3 — Risk — 0-100 score
// ============================================================================

/**
 * Score the risk of a trade. Higher score = higher risk = higher fair rate.
 *
 * Factors (weighted per §9.27.6):
 *   - sanctionsProximity — 25%
 *   - jurisdictionRisk — 20%
 *   - commodityRisk — 15%
 *   - perishability — 10%
 *   - valueAtRisk — 15%
 *   - counterpartyTri — 15%
 *
 * Inputs are pre-computed 0-100 sub-scores for each factor.
 */
export function scoreRisk(snapshot: {
  sanctionsProximityScore?: number; // 0-100
  jurisdictionRiskScore?: number; // 0-100
  commodityRiskScore?: number; // 0-100
  perishabilityScore?: number; // 0-100
  valueAtRiskScore?: number; // 0-100
  counterpartyTriScore?: number; // 0-100
}): ScoreResult {
  const sp = clamp(Number(snapshot.sanctionsProximityScore) || 0, 0, 100);
  const jr = clamp(Number(snapshot.jurisdictionRiskScore) || 0, 0, 100);
  const cr = clamp(Number(snapshot.commodityRiskScore) || 0, 0, 100);
  const per = clamp(Number(snapshot.perishabilityScore) || 0, 0, 100);
  const var_ = clamp(Number(snapshot.valueAtRiskScore) || 0, 0, 100);
  const tri = clamp(Number(snapshot.counterpartyTriScore) || 0, 0, 100);

  const factors = {
    sanctionsProximity: sp,
    jurisdictionRisk: jr,
    commodityRisk: cr,
    perishability: per,
    valueAtRisk: var_,
    counterpartyTri: tri,
  };

  const score =
    sp * RISK_FACTOR_WEIGHTS.sanctionsProximity +
    jr * RISK_FACTOR_WEIGHTS.jurisdictionRisk +
    cr * RISK_FACTOR_WEIGHTS.commodityRisk +
    per * RISK_FACTOR_WEIGHTS.perishability +
    var_ * RISK_FACTOR_WEIGHTS.valueAtRisk +
    tri * RISK_FACTOR_WEIGHTS.counterpartyTri;

  return {
    score: roundTo(clamp(score, 0, 100), 4),
    factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, roundTo(v as number, 4)])),
  };
}

// ============================================================================
// Layer 4 — Value Delivered — 0-100 score
// ============================================================================

/**
 * Score the value SGTX delivers to the trade. Higher score = more value =
 * (slightly) higher fair rate. Capped via Layer 6 affordability + Layer 7
 * constitutional ceiling.
 *
 * Factors (weighted per §9.27.7):
 *   - timeSaved — 20% (days saved vs. baseline)
 *   - documentAutomation — 20% (% documents auto-generated)
 *   - financingAccess — 15% (financing-linked? + LTV)
 *   - complianceCoverage — 15% (% compliance gates passed)
 *   - auditTrailQuality — 15% (Loom chain depth / completeness)
 *   - tradeHealthImprovement — 15% (delta vs. baseline health score)
 */
export function scoreValueDelivered(snapshot: {
  timeSavedDays?: number;
  documentAutomationPct?: number; // 0-100
  financingAccessScore?: number; // 0-100
  complianceCoveragePct?: number; // 0-100
  auditTrailQualityScore?: number; // 0-100
  tradeHealthImprovement?: number; // delta points
}): ScoreResult {
  // Time saved: 0 days = 0, 5 days = 50, 10+ days = 100.
  const ts = Number(snapshot.timeSavedDays) || 0;
  const timeSaved = clamp(ts * 10, 0, 100);

  const documentAutomation = clamp(Number(snapshot.documentAutomationPct) || 0, 0, 100);
  const financingAccess = clamp(Number(snapshot.financingAccessScore) || 0, 0, 100);
  const complianceCoverage = clamp(Number(snapshot.complianceCoveragePct) || 0, 0, 100);
  const auditTrailQuality = clamp(Number(snapshot.auditTrailQualityScore) || 0, 0, 100);
  // Trade health improvement: -10 to +30 points typical.
  const thi = Number(snapshot.tradeHealthImprovement) || 0;
  const tradeHealthImprovement = clamp(50 + thi * 2, 0, 100);

  const factors = {
    timeSaved,
    documentAutomation,
    financingAccess,
    complianceCoverage,
    auditTrailQuality,
    tradeHealthImprovement,
  };

  const score =
    timeSaved * VALUE_FACTOR_WEIGHTS.timeSaved +
    documentAutomation * VALUE_FACTOR_WEIGHTS.documentAutomation +
    financingAccess * VALUE_FACTOR_WEIGHTS.financingAccess +
    complianceCoverage * VALUE_FACTOR_WEIGHTS.complianceCoverage +
    auditTrailQuality * VALUE_FACTOR_WEIGHTS.auditTrailQuality +
    tradeHealthImprovement * VALUE_FACTOR_WEIGHTS.tradeHealthImprovement;

  return {
    score: roundTo(clamp(score, 0, 100), 4),
    factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, roundTo(v as number, 4)])),
  };
}

// ============================================================================
// Layer 5 — Efficiency — 0-100 score
// ============================================================================

/**
 * Score the operational efficiency of the trade on the SGTX platform. Higher
 * score = MORE efficient = LOWER fair rate (efficiency weight is NEGATIVE in
 * the fairness score formula).
 *
 * Factors (weighted per §9.27.8):
 *   - apiIntegrationDepth — 25%
 *   - automationLevel — 25%
 *   - dataQuality — 20%
 *   - straightThroughProcessingRate — 20%
 *   - exceptionRate — 10% (NEGATIVE-CORRELATED — high exceptions = low score)
 */
export function scoreEfficiency(snapshot: {
  apiIntegrationDepthScore?: number; // 0-100
  automationLevelPct?: number; // 0-100
  dataQualityScore?: number; // 0-100
  straightThroughProcessingPct?: number; // 0-100
  exceptionRatePct?: number; // 0-100 (high = bad)
}): ScoreResult {
  const apiIntegrationDepth = clamp(Number(snapshot.apiIntegrationDepthScore) || 0, 0, 100);
  const automationLevel = clamp(Number(snapshot.automationLevelPct) || 0, 0, 100);
  const dataQuality = clamp(Number(snapshot.dataQualityScore) || 0, 0, 100);
  const stp = clamp(Number(snapshot.straightThroughProcessingPct) || 0, 0, 100);
  // exceptionRate is REVERSED — 100% exceptions = 0 score, 0% exceptions = 100 score.
  const exr = clamp(Number(snapshot.exceptionRatePct) || 0, 0, 100);
  const exceptionRateScore = clamp(100 - exr, 0, 100);

  const factors = {
    apiIntegrationDepth,
    automationLevel,
    dataQuality,
    straightThroughProcessingRate: stp,
    exceptionRate: exceptionRateScore, // already-inverted score
  };

  const score =
    apiIntegrationDepth * EFFICIENCY_FACTOR_WEIGHTS.apiIntegrationDepth +
    automationLevel * EFFICIENCY_FACTOR_WEIGHTS.automationLevel +
    dataQuality * EFFICIENCY_FACTOR_WEIGHTS.dataQuality +
    stp * EFFICIENCY_FACTOR_WEIGHTS.straightThroughProcessingRate +
    exceptionRateScore * EFFICIENCY_FACTOR_WEIGHTS.exceptionRate;

  return {
    score: roundTo(clamp(score, 0, 100), 4),
    factors: Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, roundTo(v as number, 4)])),
    notes: [
      `exceptionRate inverted: ${exr}% raw → ${exceptionRateScore} score (efficiency weight is negative).`,
    ],
  };
}

// ============================================================================
// Fairness Score + Base Fair Rate
// ============================================================================

/**
 * Fairness Score:
 *
 *   FAIRNESS_SCORE = CLAMP(0.35·CTS + 0.30·RISK + 0.20·VALUE − 0.15·EFFICIENCY, 0, 100)
 *
 * Higher efficiency → lower fairness score → lower fair rate (reward for efficiency).
 */
export function calculateFairnessScore(
  cts: number,
  risk: number,
  value: number,
  efficiency: number,
): FairnessResult {
  const c = clamp(Number(cts) || 0, 0, 100);
  const r = clamp(Number(risk) || 0, 0, 100);
  const v = clamp(Number(value) || 0, 0, 100);
  const e = clamp(Number(efficiency) || 0, 0, 100);

  const raw =
    FAIRNESS_WEIGHTS.cts * c +
    FAIRNESS_WEIGHTS.risk * r +
    FAIRNESS_WEIGHTS.value * v +
    FAIRNESS_WEIGHTS.efficiency * e;

  const score = clamp(raw, 0, 100);

  return {
    score: roundTo(score, 4),
    formula: `CLAMP(0.35×${c.toFixed(2)} + 0.30×${r.toFixed(2)} + 0.20×${v.toFixed(2)} − 0.15×${e.toFixed(2)}, 0, 100) = ${score.toFixed(4)}`,
    components: { cts: c, risk: r, value: v, efficiency: e },
  };
}

/**
 * Base Fair Rate:
 *
 *   BASE_FAIR_RATE = 0.03% + 1.47% × (FAIRNESS_SCORE/100)
 *
 * At fairness=0 → 0.03%; at fairness=100 → 1.50%. Linear interpolation.
 */
export function calculateBaseFairRate(fairnessScore: number): BaseFairRateResult {
  const fs = clamp(Number(fairnessScore) || 0, 0, 100);
  const rate = BASE_FAIR_RATE_INTERCEPT + BASE_FAIR_RATE_SLOPE * (fs / 100);
  return {
    rate: roundTo(rate, 8),
    formula: `0.03% + 1.47% × (${fs.toFixed(2)}/100) = ${(rate * 100).toFixed(4)}%`,
  };
}

// ============================================================================
// Layer 6 — Party Affordability Guard
// ============================================================================

/**
 * Margin-take rate (Layer 6):
 *
 *   MARGIN_TAKE_RATE = 10% + 25% × SIGMOID((MARGIN − 8%) / 4%)
 *
 * bounded [10%, 35%].
 *
 * The estimated margin is a confidence-weighted blend:
 *
 *   ESTIMATED_MARGIN = CONFIDENCE × VERIFIED_MARGIN + (1 − CONFIDENCE) × REFERENCE_MARGIN
 *
 * where REFERENCE_MARGIN is the commodity-sector reference margin (default 12%).
 */
export function calculateMarginTakeRate(
  verifiedMarginPct: number | null,
  referenceMarginPct: number = 12,
  confidence: number = 0.5,
): MarginTakeRateResult {
  const c = clamp(Number(confidence) || 0, 0, 1);
  const ref = Math.max(0, Number(referenceMarginPct) || 0);
  const verified = verifiedMarginPct == null ? null : Math.max(0, Number(verifiedMarginPct) || 0);
  const estimated = verified != null ? c * verified + (1 - c) * ref : ref;
  const rate = marginTakeRate(estimated);

  return {
    rate: roundTo(rate, 8),
    formula: `10% + 25% × SIGMOID((${estimated.toFixed(2)} − 8)/4) = ${(rate * 100).toFixed(4)}%`,
    estimatedMarginPct: roundTo(estimated, 4),
    verifiedMarginPct: verified,
    referenceMarginPct: ref,
    confidence: c,
  };
}

/**
 * Affordability cap:
 *
 *   AFFORDABILITY_CAP = ESTIMATED_GROSS_PROFIT × MARGIN_TAKE_RATE
 *
 * where ESTIMATED_GROSS_PROFIT = CFB × ESTIMATED_MARGIN_PCT.
 *
 * This protects the parties — SGTX cannot take more than a fraction of the
 * gross profit, regardless of the fair rate.
 */
export function calculateAffordabilityCap(
  cfb: number,
  estimatedMarginPct: number,
  marginTakeRatePct: number,
): AffordabilityCapResult {
  const c = Math.max(0, Number(cfb) || 0);
  const m = Math.max(0, Number(estimatedMarginPct) || 0) / 100;
  const mt = clamp(Number(marginTakeRatePct) || MARGIN_TAKE_RATE_FLOOR, MARGIN_TAKE_RATE_FLOOR, MARGIN_TAKE_RATE_CEILING);
  const grossProfit = c * m;
  const cap = grossProfit * mt;

  return {
    cap: roundTo(cap, 6),
    estimatedGrossProfit: roundTo(grossProfit, 6),
    marginTakeRate: roundTo(mt, 8),
    formula: `ESTIMATED_GROSS_PROFIT × MARGIN_TAKE_RATE = ${c.toFixed(2)} × ${m.toFixed(4)} × ${mt.toFixed(4)} = ${cap.toFixed(4)}`,
  };
}

// ============================================================================
// Discounts
// ============================================================================

/**
 * Calculate the applicable discounts for a trade.
 *
 * Inputs:
 *   - mci (Master Commitment Index) — 0-1 score
 *   - shipmentCount — for multi-shipment discount (2-5 bps)
 *   - volumeLoyalty — 0-1 score (90-day rolling volume)
 *   - eci (Economic Complexity Index) — 0-1 score
 *   - apiIntegrationDepth — 0-1 score
 *   - telemetryCoverage — 0-1 score
 *
 * Each discount is capped at its defined max. Returns the per-discount
 * breakdown + the total discount pct.
 */
export function calculateDiscounts(snapshot: {
  mciScore?: number;
  shipmentCount?: number;
  volumeLoyaltyScore?: number;
  eciScore?: number;
  apiIntegrationDepthScore?: number;
  telemetryCoverageScore?: number;
}): DiscountsResult {
  const discounts: DiscountEntry[] = [];

  // MCI — capped at 15 bps (0.0015).
  const mciScore = clamp(Number(snapshot.mciScore) || 0, 0, 1);
  const mciPct = mciScore * DISCOUNT_CAPS.MCI_MAX_PCT;
  discounts.push({
    id: "MCI",
    label: DISCOUNT_MAP.MCI!.label,
    pct: roundTo(mciPct, 8),
    bps: roundTo(mciPct * 10000, 4),
    notes: `MCI score ${mciScore.toFixed(2)} → ${(mciPct * 10000).toFixed(2)} bps (cap 15 bps).`,
  });

  // Multi-shipment — 2-5 bps based on shipment count.
  const sc = Math.max(0, Math.floor(Number(snapshot.shipmentCount) || 1));
  let multiShipBps = 0;
  if (sc >= 2) {
    // 2 shipments = 2 bps, 3 = 3 bps, 4 = 4 bps, 5+ = 5 bps.
    multiShipBps = clamp(sc, DISCOUNT_CAPS.MULTI_SHIPMENT_MIN_BPS, DISCOUNT_CAPS.MULTI_SHIPMENT_MAX_BPS);
  }
  const multiShipPct = multiShipBps / 10000;
  discounts.push({
    id: "MULTI_SHIPMENT",
    label: DISCOUNT_MAP.MULTI_SHIPMENT!.label,
    pct: roundTo(multiShipPct, 8),
    bps: multiShipBps,
    notes: `${sc} shipments → ${multiShipBps} bps (range 2-5 bps).`,
  });

  // Volume loyalty — capped at 10 bps.
  const vlScore = clamp(Number(snapshot.volumeLoyaltyScore) || 0, 0, 1);
  const vlPct = vlScore * DISCOUNT_CAPS.VOLUME_LOYALTY_MAX_PCT;
  discounts.push({
    id: "VOLUME_LOYALTY",
    label: DISCOUNT_MAP.VOLUME_LOYALTY!.label,
    pct: roundTo(vlPct, 8),
    bps: roundTo(vlPct * 10000, 4),
    notes: `Volume loyalty score ${vlScore.toFixed(2)} → ${(vlPct * 10000).toFixed(2)} bps (cap 10 bps).`,
  });

  // ECI — capped at 8 bps.
  const eciScore = clamp(Number(snapshot.eciScore) || 0, 0, 1);
  const eciPct = eciScore * DISCOUNT_CAPS.ECI_MAX_PCT;
  discounts.push({
    id: "ECI",
    label: DISCOUNT_MAP.ECI!.label,
    pct: roundTo(eciPct, 8),
    bps: roundTo(eciPct * 10000, 4),
    notes: `ECI score ${eciScore.toFixed(2)} → ${(eciPct * 10000).toFixed(2)} bps (cap 8 bps).`,
  });

  // API integration — capped at 2 bps.
  const apiScore = clamp(Number(snapshot.apiIntegrationDepthScore) || 0, 0, 1);
  const apiPct = apiScore * (DISCOUNT_CAPS.API_INTEGRATION_MAX_BPS / 10000);
  discounts.push({
    id: "API_INTEGRATION",
    label: DISCOUNT_MAP.API_INTEGRATION!.label,
    pct: roundTo(apiPct, 8),
    bps: roundTo(apiPct * 10000, 4),
    notes: `API integration score ${apiScore.toFixed(2)} → ${(apiPct * 10000).toFixed(2)} bps (cap 2 bps).`,
  });

  // Telemetry — capped at 1 bp.
  const telScore = clamp(Number(snapshot.telemetryCoverageScore) || 0, 0, 1);
  const telPct = telScore * (DISCOUNT_CAPS.TELEMETRY_MAX_BPS / 10000);
  discounts.push({
    id: "TELEMETRY",
    label: DISCOUNT_MAP.TELEMETRY!.label,
    pct: roundTo(telPct, 8),
    bps: roundTo(telPct * 10000, 4),
    notes: `Telemetry coverage ${telScore.toFixed(2)} → ${(telPct * 10000).toFixed(2)} bps (cap 1 bp).`,
  });

  const totalDiscountPct = discounts.reduce((s, d) => s + d.pct, 0);

  return {
    discounts,
    totalDiscountPct: roundTo(totalDiscountPct, 8),
    notes: [`Total discount: ${(totalDiscountPct * 100).toFixed(4)}% (${(totalDiscountPct * 10000).toFixed(2)} bps).`],
  };
}

// ============================================================================
// Hash helpers — TSEC + LOOM_HASH (deterministic)
// ============================================================================

/**
 * Deterministic 8-byte hash from a string (FNV-1a 64-bit variant).
 * Returns the hash as a 16-char hex string (zero-padded).
 *
 * Used for TSEC (Trade-Specific Execution Code) + LOOM_HASH — both must be
 * DETERMINISTIC so the same inputs produce the same code (constitutional §9.27.20).
 */
export function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    // h *= 0x100000001b3 — split to avoid BigInt literal overflow.
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

/**
 * Compute the TSEC (Trade-Specific Execution Code) for a fee decision.
 *
 * The TSEC is a deterministic 16-char hex code derived from the canonical
 * formula inputs (USTN + CFB + scores + final fee). It is the audit trail
 * key that lets a governor / regulator re-derive the same decision.
 */
export function computeTSEC(
  ustn: string,
  cfb: number,
  cts: number,
  risk: number,
  value: number,
  efficiency: number,
  finalFee: number,
): string {
  const canonical = [
    ustn || "",
    Number(cfb || 0).toFixed(6),
    Number(cts || 0).toFixed(4),
    Number(risk || 0).toFixed(4),
    Number(value || 0).toFixed(4),
    Number(efficiency || 0).toFixed(4),
    Number(finalFee || 0).toFixed(6),
  ].join("|");
  return fnv1a64(canonical);
}

/**
 * Compute the LOOM hash for the fee decision (SHA-256-like via SubtleCrypto
 * when available, fallback to FNV-1a 64-bit for determinism).
 *
 * NOTE: in the browser context we'd use window.crypto.subtle; here we use
 * a pure-JS deterministic hash so the engine remains sync + deterministic
 * across all runtimes.
 */
export function computeLoomHash(decision: FeeDecisionObject): string {
  // Canonical JSON (sorted keys) of the decision object minus the LOOM_HASH
  // field itself + the GOVERNOR_DECISION_ID (set post-hoc).
  const { LOOM_HASH, GOVERNOR_DECISION_ID, ...rest } = decision;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return fnv1a64(canonical);
}

// ============================================================================
// Fee Decision ID generator (deterministic)
// ============================================================================

/**
 * Generate a deterministic Fee Decision ID for a USTN + calculation timestamp.
 * Format: FD-<ustn-hex-prefix>-<unix-seconds>.
 */
export function generateFeeDecisionId(ustn: string, calculatedAt: string): string {
  const u = (ustn || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const ts = new Date(calculatedAt).getTime();
  const tsSafe = Number.isFinite(ts) ? Math.floor(ts / 1000) : 0;
  return `FD-${u || "USTN"}-${tsSafe.toString(36).toUpperCase().padStart(8, "0")}`;
}

// ============================================================================
// Cost-to-Serve Floor (master formula step 5)
// ============================================================================

/**
 * Cost-to-serve floor — the minimum fee that ensures SGTX recovers its
 * direct operational cost for this trade. The fee can never fall below this
 * floor regardless of discounts.
 *
 * Computed as: 5 bps × CFB (with a hard floor of $1).
 */
export function computeCostToServeFloor(cfb: number): number {
  const f = Math.max(0, Number(cfb) || 0) * 0.0005; // 5 bps
  return Math.max(1, f);
}

// ============================================================================
// Main entry — calculateFee(ustn) — full 7-layer pipeline
// ============================================================================

/**
 * Run the full 7-layer Dynamic Fee Engine for a trade identified by USTN.
 *
 * Loads the Trade row, computes the CFB, scores all four layers, computes
 * the fairness score + base fair rate, applies class factor + discounts +
 * affordability cap + constitutional caps, and produces the full Fee
 * Decision Object.
 *
 * Persists the decision in FeeCalculation (existing model — full object
 * stored as JSON in `providerFeesJson`).
 *
 * Deterministic: same USTN + same Trade snapshot → same Fee Decision Object.
 *
 * Returns null if the trade cannot be found.
 */
export async function calculateFee(ustn: string): Promise<FeeDecisionObject | null> {
  try {
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) {
      logger.warn("[fee-engine] calculateFee: trade not found", { ustn });
      return null;
    }

    // ── Re-hydrate the trade snapshot ──────────────────────────────────────
    let logisticsCosts: LogisticsCostInput[] = [];
    if (trade.logisticsRfqSummary) {
      try {
        const parsed = JSON.parse(trade.logisticsRfqSummary);
        if (Array.isArray(parsed)) logisticsCosts = parsed;
        else if (parsed && Array.isArray(parsed.costs)) logisticsCosts = parsed.costs;
        else if (parsed && Array.isArray(parsed.lines)) logisticsCosts = parsed.lines;
      } catch {
        // ignore
      }
    }

    const exw = Number(trade.tradeValueUsd) || 0;

    // ── Layer 1 — CFB + economic classification ────────────────────────────
    const cfbSnapshot = computeCFB(exw, logisticsCosts, trade.incoterm || "EXW");
    const econ = classifyEconomics({
      exwValue: exw,
      commodity: trade.commodity || "",
      commodityHs: trade.commodityHs,
      grossWeightKg: Number(trade.grossWeightKg) || 0,
      containerCount: Number(trade.containerCount) || 1,
      coldChain: Boolean(trade.coldChain),
      transportMode: trade.transportMode,
      equipmentType: trade.equipmentType,
      bankInstrument: trade.bankInstrument,
      multiShipment: Boolean(trade.multiShipment),
      parentUstn: trade.parentUstn,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      status: trade.status,
      tradeCriticality: trade.tradeCriticality,
      estimatedMarginPct: 12, // reference margin
    });

    // ── Layer 2 — CTS ───────────────────────────────────────────────────────
    const cts = scoreCostToServe({
      multiShipment: Boolean(trade.multiShipment),
      multiLeg: Boolean(trade.parentUstn),
      transportMode: trade.transportMode,
      originTier: 2,
      destTier: 2,
      specialPermits: 0,
      integrationCount: 2,
      exceptionCount: 0,
      disputeCount: 0,
    });

    // ── Layer 3 — Risk ──────────────────────────────────────────────────────
    const risk = scoreRisk({
      sanctionsProximityScore: 10,
      jurisdictionRiskScore: 30,
      commodityRiskScore: 20,
      perishabilityScore: trade.coldChain ? 60 : 10,
      valueAtRiskScore: clamp(exw / 1_000_000 * 100, 0, 100),
      counterpartyTriScore: 40,
    });

    // ── Layer 4 — Value Delivered ──────────────────────────────────────────
    const value = scoreValueDelivered({
      timeSavedDays: 5,
      documentAutomationPct: 60,
      financingAccessScore: trade.bankInstrument ? 70 : 30,
      complianceCoveragePct: 80,
      auditTrailQualityScore: 75,
      tradeHealthImprovement: 5,
    });

    // ── Layer 5 — Efficiency ───────────────────────────────────────────────
    const efficiency = scoreEfficiency({
      apiIntegrationDepthScore: 60,
      automationLevelPct: 50,
      dataQualityScore: 70,
      straightThroughProcessingPct: 40,
      exceptionRatePct: 20,
    });

    // ── Fairness Score + Base Fair Rate ────────────────────────────────────
    const fairness = calculateFairnessScore(cts.score, risk.score, value.score, efficiency.score);
    const baseFairRate = calculateBaseFairRate(fairness.score);

    // ── Class factor ────────────────────────────────────────────────────────
    const classDef = ECONOMIC_CLASS_MAP[econ.primaryClass] || ECONOMIC_CLASS_MAP.STANDARD!;
    let classFactor = classDef.factor;

    // Bulk curve — sub-linear: factor shrinks as CFB grows above $250k.
    if (econ.primaryClass === "BULK") {
      const bulkCurve = 1.0 - 0.2 * sigmoid((cfbSnapshot.cfb - 250_000) / 100_000);
      classFactor = roundTo(bulkCurve, 4);
    }

    // HVLM curve — sub-linear: factor shrinks further as value grows.
    if (econ.primaryClass === "HIGH_VALUE_LOW_MARGIN") {
      const hvlmCurve = 0.8 - 0.15 * sigmoid((exw - 1_000_000) / 500_000);
      classFactor = roundTo(clamp(hvlmCurve, 0.5, 0.85), 4);
    }

    // Special-stock subclass factor override.
    if (econ.primaryClass === "SPECIAL_STOCK" && econ.subclass) {
      classFactor = SPECIAL_STOCK_SUBCLASSES[econ.subclass] ?? classFactor;
    }

    // ── Master formula step 1: CLASS_ADJUSTED_RATE ──────────────────────────
    let classAdjustedRate = baseFairRate.rate * classFactor;

    // RO-RO — per-unit fee model. Compute as (per-unit fee × unit count) / CFB
    // so the resulting rate is comparable. Use containerCount as the proxy for units.
    let roRoPerUnitFeeUsd: number | null = null;
    if (econ.primaryClass === "RO_RO" && classDef.perUnit) {
      const unitCount = Math.max(1, Number(trade.containerCount) || 1);
      roRoPerUnitFeeUsd = (classDef.perUnitFeeUsd || 15) * unitCount;
      // Convert per-unit fee to an effective rate for the rest of the pipeline.
      classAdjustedRate = cfbSnapshot.cfb > 0 ? clamp(roRoPerUnitFeeUsd / cfbSnapshot.cfb, 0, RATE_CEILING) : RATE_FLOOR;
    }

    // ── Discounts ──────────────────────────────────────────────────────────
    const discounts = calculateDiscounts({
      mciScore: 0.3,
      shipmentCount: trade.multiShipment ? 3 : 1,
      volumeLoyaltyScore: 0.2,
      eciScore: 0.4,
      apiIntegrationDepthScore: 0.6,
      telemetryCoverageScore: 0.5,
    });

    // ── Master formula step 2: DISCOUNTED_RATE ─────────────────────────────
    const discountedRate = classAdjustedRate * (1 - discounts.totalDiscountPct);

    // ── Layer 6 — Affordability guard ──────────────────────────────────────
    const marginResult = calculateMarginTakeRate(
      null, // no verified margin — fall back to reference
      12,   // reference margin 12%
      0.5,  // 50% confidence
    );
    const affordability = calculateAffordabilityCap(
      cfbSnapshot.cfb,
      marginResult.estimatedMarginPct,
      marginResult.rate,
    );

    // ── Master formula step 3: RAW_FEE ─────────────────────────────────────
    const rawFee = cfbSnapshot.cfb * discountedRate;

    // ── Layer 7 — Constitutional caps ──────────────────────────────────────
    const constitutionalCap = cfbSnapshot.cfb * RATE_CEILING;
    const classCap = cfbSnapshot.cfb * (CLASS_CAPS[econ.primaryClass] ?? RATE_CEILING);
    const essentialCap = econ.classes.includes("ESSENTIAL") ? cfbSnapshot.cfb * CLASS_CAPS.ESSENTIAL : Infinity;
    const bulkCap = econ.classes.includes("BULK") ? cfbSnapshot.cfb * CLASS_CAPS.BULK : Infinity;
    const specialStockCap = econ.classes.includes("SPECIAL_STOCK") ? cfbSnapshot.cfb * CLASS_CAPS.SPECIAL_STOCK : Infinity;
    const hvlmCap = econ.classes.includes("HIGH_VALUE_LOW_MARGIN") ? cfbSnapshot.cfb * CLASS_CAPS.HIGH_VALUE_LOW_MARGIN : Infinity;

    // ── Master formula step 4: PRE_CAP_FEE ─────────────────────────────────
    const capCandidates = [
      { cap: "RAW_FEE", value: rawFee, binding: false },
      { cap: "AFFORDABILITY_CAP", value: affordability.cap, binding: false },
      { cap: "BULK_CAP", value: bulkCap, binding: false },
      { cap: "ESSENTIAL_CAP", value: essentialCap, binding: false },
      { cap: "SPECIAL_STOCK_CAP", value: specialStockCap, binding: false },
      { cap: "HVLM_CAP", value: hvlmCap, binding: false },
      { cap: "CLASS_CAP", value: classCap, binding: false },
      { cap: "CONSTITUTIONAL_CAP", value: constitutionalCap, binding: false },
    ];
    const preCapFee = Math.min(...capCandidates.map((c) => c.value));

    // Mark the binding cap (the one that produced the minimum).
    for (const c of capCandidates) {
      if (Math.abs(c.value - preCapFee) < 1e-9) c.binding = true;
    }

    // ── Master formula step 5: FINAL_FEE ───────────────────────────────────
    const costToServeFloor = computeCostToServeFloor(cfbSnapshot.cfb);
    const finalFee = Math.max(preCapFee, costToServeFloor);
    const finalRate = cfbSnapshot.cfb > 0 ? finalFee / cfbSnapshot.cfb : RATE_FLOOR;

    // ── Master formula step 6: Constitutional check ────────────────────────
    const constitutionalValid = finalFee >= 0 && finalFee <= constitutionalCap;

    // ── TSEC + Loom hash ──────────────────────────────────────────────────
    const calculatedAt = new Date().toISOString();
    const feeDecisionId = generateFeeDecisionId(ustn, calculatedAt);
    const tsec = computeTSEC(ustn, cfbSnapshot.cfb, cts.score, risk.score, value.score, efficiency.score, finalFee);

    // ── Assemble the Fee Decision Object ───────────────────────────────────
    const decision: FeeDecisionObject = {
      FEE_DECISION_ID: feeDecisionId,
      USTN: ustn,
      FEE_POLICY_ID,
      FEE_POLICY_VERSION,
      FEE_FORMULA_VERSION,
      INPUT_SNAPSHOT_VERSION,
      TRI_VERSION,
      RIA_VERSION,
      MARKET_DATA_VERSION,
      FX_SNAPSHOT_VERSION,

      CFB: cfbSnapshot.cfb,
      EXW_VALUE: cfbSnapshot.exwValue,
      ELIGIBLE_LOGISTICS: cfbSnapshot.eligibleLogisticsUsd,
      ECONOMIC_CLASSES: econ.classes,
      PRIMARY_CLASS: econ.primaryClass,
      CLASS_FACTOR: classFactor,
      ...(econ.subclass ? { SUBCLASS: econ.subclass } : {}),

      CTS_SCORE: cts.score,
      RISK_SCORE: risk.score,
      VALUE_SCORE: value.score,
      EFFICIENCY_SCORE: efficiency.score,
      FAIRNESS_SCORE: fairness.score,

      BASE_FAIR_RATE: baseFairRate.rate,
      CLASS_ADJUSTED_RATE: classAdjustedRate,
      DISCOUNTS_APPLIED: discounts.discounts,
      DISCOUNTED_RATE: discountedRate,

      RAW_FEE: roundTo(rawFee, 6),
      CAPS_APPLIED: capCandidates.map((c) => ({ cap: c.cap, value: roundTo(c.value, 6), binding: c.binding })),
      PRE_CAP_FEE: roundTo(preCapFee, 6),
      COST_TO_SERVE_FLOOR: roundTo(costToServeFloor, 6),
      FINAL_FEE: roundTo(finalFee, 6),
      FINAL_RATE: roundTo(finalRate, 8),

      AFFORDABILITY_CAP: affordability.cap,
      ESTIMATED_GROSS_PROFIT: affordability.estimatedGrossProfit,
      MARGIN_TAKE_RATE: marginResult.rate,
      PARTY_PROTECTION_LIMIT: affordability.cap,

      CALCULATION_TRACE: {
        layer0_constitutional: {
          rate_floor: RATE_FLOOR,
          rate_ceiling: RATE_CEILING,
          notes: [
            "Layer 0 — constitutional floor + ceiling are NON-BYPASSABLE (§9.27.20 invariant #1, #2).",
            `RATE_FLOOR = ${(RATE_FLOOR * 100).toFixed(2)}%`,
            `RATE_CEILING = ${(RATE_CEILING * 100).toFixed(2)}%`,
          ],
        },
        layer1_cfb: {
          exw_value: cfbSnapshot.exwValue,
          eligible_logistics_lines: cfbSnapshot.eligibleLogisticsLines.map((l) => ({
            service: l.service,
            amount: l.amountUsd,
            payer: l.payer,
          })),
          eligible_logistics_total: cfbSnapshot.eligibleLogisticsUsd,
          cfb: cfbSnapshot.cfb,
          exclusions: cfbSnapshot.exclusions,
          economic_classes: econ.classes,
          primary_class: econ.primaryClass,
          class_factor: classFactor,
          ...(econ.subclass ? { subclass: econ.subclass } : {}),
          notes: econ.notes,
        },
        layer2_cts: {
          score: cts.score,
          factors: cts.factors,
          weights: CTS_FACTOR_WEIGHTS,
          notes: [],
        },
        layer3_risk: {
          score: risk.score,
          factors: risk.factors,
          weights: RISK_FACTOR_WEIGHTS,
          notes: [],
        },
        layer4_value: {
          score: value.score,
          factors: value.factors,
          weights: VALUE_FACTOR_WEIGHTS,
          notes: [],
        },
        layer5_efficiency: {
          score: efficiency.score,
          factors: efficiency.factors,
          weights: EFFICIENCY_FACTOR_WEIGHTS,
          notes: efficiency.notes || [],
        },
        fairness: {
          formula: fairness.formula,
          components: fairness.components,
          score: fairness.score,
        },
        base_fair_rate: {
          formula: baseFairRate.formula,
          intercept: BASE_FAIR_RATE_INTERCEPT,
          slope: BASE_FAIR_RATE_SLOPE,
          rate: baseFairRate.rate,
        },
        master_formula: {
          step1_class_adjusted_rate: roundTo(classAdjustedRate, 8),
          step2_discounted_rate: roundTo(discountedRate, 8),
          step3_raw_fee: roundTo(rawFee, 6),
          step4_pre_cap_fee: roundTo(preCapFee, 6),
          step5_final_fee: roundTo(finalFee, 6),
          step6_constitutional_check: {
            valid: constitutionalValid,
            lower: 0,
            upper: roundTo(constitutionalCap, 6),
          },
          notes: [
            ...(roRoPerUnitFeeUsd != null ? [`RO-RO per-unit fee: $${roRoPerUnitFeeUsd.toFixed(2)} (effective rate ${(classAdjustedRate * 100).toFixed(4)}%).`] : []),
            `Class factor ${classFactor.toFixed(4)} applied to base fair rate.`,
            `Total discount ${(discounts.totalDiscountPct * 100).toFixed(4)}% (${(discounts.totalDiscountPct * 10000).toFixed(2)} bps).`,
            `Constitutional check: ${constitutionalValid ? "PASS" : "FAIL"} — FINAL_FEE $${finalFee.toFixed(2)} must be in [0, $${constitutionalCap.toFixed(2)}].`,
          ],
        },
        affordability: {
          estimated_gross_profit: affordability.estimatedGrossProfit,
          margin_take_rate: marginResult.rate,
          affordability_cap: affordability.cap,
          formula: affordability.formula,
        },
      },
      TSEC: tsec,
      CALCULATED_AT: calculatedAt,
      GOVERNOR_DECISION_ID: null,
      LOOM_HASH: null,
      LOCKED: false,
    };

    // Compute the LOOM hash now that all other fields are set.
    decision.LOOM_HASH = computeLoomHash(decision);

    // ── Persist the Fee Decision Object ────────────────────────────────────
    try {
      await db.feeCalculation.create({
        data: {
          ustn,
          tradeValueUsd: cfbSnapshot.cfb,
          sgtxFeeUsd: finalFee,
          totalFeesUsd: finalFee,
          stage: "V18_DYNAMIC_ENGINE",
          providerFeesJson: JSON.stringify(decision),
        },
      });
      // Also reflect the new fee on the Trade row.
      await db.trade.update({
        where: { ustn },
        data: { sgtxFeeUsd: finalFee, updatedAt: new Date() },
      }).catch(() => null);
    } catch (err: any) {
      logger.error("[fee-engine] calculateFee: persist failed", { ustn, error: err?.message });
      // Don't fail the whole calculation if the DB write fails — the decision
      // is still returned to the caller.
    }

    logger.info("[fee-engine] calculateFee complete", {
      ustn,
      cfb: cfbSnapshot.cfb,
      finalFee,
      finalRate,
      primaryClass: econ.primaryClass,
    });

    return decision;
  } catch (err: any) {
    logger.error("[fee-engine] calculateFee failed", { ustn, error: err?.message });
    return null;
  }
}

// ============================================================================
// Fee Sanity Gate — validateFeeDecision (16 checks)
// ============================================================================

/**
 * Fee Sanity Gate — 16 deterministic checks validating a Fee Decision Object
 * is constitutionally + operationally sound.
 *
 * Each check is independent; a single failure → valid=false. Warnings are
 * non-blocking observations.
 */
export function validateFeeDecision(
  feeDecision: FeeDecisionObject,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: { id: string; label: string; passed: boolean; detail: string }[] = [];

  const d = feeDecision;

  // CHECK 1 — FINAL_FEE ≥ 0.
  const c1 = d.FINAL_FEE >= 0;
  checks.push({ id: "C01", label: "FINAL_FEE is non-negative", passed: c1, detail: `FINAL_FEE = $${(d.FINAL_FEE || 0).toFixed(6)}` });
  if (!c1) errors.push(`C01: FINAL_FEE is negative ($${d.FINAL_FEE}).`);

  // CHECK 2 — FINAL_FEE ≤ constitutional ceiling.
  const constitutionalCap = (d.CFB || 0) * RATE_CEILING;
  const c2 = d.FINAL_FEE <= constitutionalCap + 1e-6;
  checks.push({ id: "C02", label: "FINAL_FEE ≤ constitutional ceiling (1.50% × CFB)", passed: c2, detail: `FINAL_FEE $${d.FINAL_FEE?.toFixed(6)} ≤ $${constitutionalCap.toFixed(6)}` });
  if (!c2) errors.push(`C02: FINAL_FEE $${d.FINAL_FEE} exceeds constitutional ceiling $${constitutionalCap}.`);

  // CHECK 3 — FINAL_RATE ≥ RATE_FLOOR (0.03%).
  const c3 = d.FINAL_RATE >= RATE_FLOOR - 1e-9;
  checks.push({ id: "C03", label: "FINAL_RATE ≥ RATE_FLOOR (0.03%)", passed: c3, detail: `FINAL_RATE = ${(d.FINAL_RATE || 0) * 100}% vs floor ${(RATE_FLOOR * 100)}%` });
  if (!c3) errors.push(`C03: FINAL_RATE ${(d.FINAL_RATE || 0) * 100}% is below the 0.03% floor.`);

  // CHECK 4 — FINAL_RATE ≤ RATE_CEILING (1.50%).
  const c4 = d.FINAL_RATE <= RATE_CEILING + 1e-6;
  checks.push({ id: "C04", label: "FINAL_RATE ≤ RATE_CEILING (1.50%)", passed: c4, detail: `FINAL_RATE = ${(d.FINAL_RATE || 0) * 100}% vs ceiling ${(RATE_CEILING * 100)}%` });
  if (!c4) errors.push(`C04: FINAL_RATE ${(d.FINAL_RATE || 0) * 100}% exceeds the 1.50% ceiling.`);

  // CHECK 5 — CFB ≥ EXW_VALUE.
  const c5 = d.CFB >= d.EXW_VALUE - 1e-6;
  checks.push({ id: "C05", label: "CFB ≥ EXW_VALUE", passed: c5, detail: `CFB = $${d.CFB} vs EXW = $${d.EXW_VALUE}` });
  if (!c5) errors.push(`C05: CFB ($${d.CFB}) is less than EXW_VALUE ($${d.EXW_VALUE}).`);

  // CHECK 6 — CFB ≥ ELIGIBLE_LOGISTICS (trivially true via CFB = EXW + logistics, but defensive).
  const c6 = d.CFB >= d.ELIGIBLE_LOGISTICS - 1e-6;
  checks.push({ id: "C06", label: "CFB ≥ ELIGIBLE_LOGISTICS", passed: c6, detail: `CFB = $${d.CFB} vs logistics = $${d.ELIGIBLE_LOGISTICS}` });
  if (!c6) errors.push(`C06: CFB ($${d.CFB}) is less than ELIGIBLE_LOGISTICS ($${d.ELIGIBLE_LOGISTICS}).`);

  // CHECK 7 — CTS_SCORE in [0, 100].
  const c7 = d.CTS_SCORE >= 0 && d.CTS_SCORE <= 100;
  checks.push({ id: "C07", label: "CTS_SCORE in [0, 100]", passed: c7, detail: `CTS_SCORE = ${d.CTS_SCORE}` });
  if (!c7) errors.push(`C07: CTS_SCORE ${d.CTS_SCORE} out of bounds.`);

  // CHECK 8 — RISK_SCORE in [0, 100].
  const c8 = d.RISK_SCORE >= 0 && d.RISK_SCORE <= 100;
  checks.push({ id: "C08", label: "RISK_SCORE in [0, 100]", passed: c8, detail: `RISK_SCORE = ${d.RISK_SCORE}` });
  if (!c8) errors.push(`C08: RISK_SCORE ${d.RISK_SCORE} out of bounds.`);

  // CHECK 9 — VALUE_SCORE in [0, 100].
  const c9 = d.VALUE_SCORE >= 0 && d.VALUE_SCORE <= 100;
  checks.push({ id: "C09", label: "VALUE_SCORE in [0, 100]", passed: c9, detail: `VALUE_SCORE = ${d.VALUE_SCORE}` });
  if (!c9) errors.push(`C09: VALUE_SCORE ${d.VALUE_SCORE} out of bounds.`);

  // CHECK 10 — EFFICIENCY_SCORE in [0, 100].
  const c10 = d.EFFICIENCY_SCORE >= 0 && d.EFFICIENCY_SCORE <= 100;
  checks.push({ id: "C10", label: "EFFICIENCY_SCORE in [0, 100]", passed: c10, detail: `EFFICIENCY_SCORE = ${d.EFFICIENCY_SCORE}` });
  if (!c10) errors.push(`C10: EFFICIENCY_SCORE ${d.EFFICIENCY_SCORE} out of bounds.`);

  // CHECK 11 — FAIRNESS_SCORE in [0, 100].
  const c11 = d.FAIRNESS_SCORE >= 0 && d.FAIRNESS_SCORE <= 100;
  checks.push({ id: "C11", label: "FAIRNESS_SCORE in [0, 100]", passed: c11, detail: `FAIRNESS_SCORE = ${d.FAIRNESS_SCORE}` });
  if (!c11) errors.push(`C11: FAIRNESS_SCORE ${d.FAIRNESS_SCORE} out of bounds.`);

  // CHECK 12 — BASE_FAIR_RATE in [0.03%, 1.50%].
  const c12 = d.BASE_FAIR_RATE >= RATE_FLOOR - 1e-9 && d.BASE_FAIR_RATE <= RATE_CEILING + 1e-9;
  checks.push({ id: "C12", label: "BASE_FAIR_RATE in [0.03%, 1.50%]", passed: c12, detail: `BASE_FAIR_RATE = ${(d.BASE_FAIR_RATE || 0) * 100}%` });
  if (!c12) errors.push(`C12: BASE_FAIR_RATE ${(d.BASE_FAIR_RATE || 0) * 100}% out of constitutional bounds.`);

  // CHECK 13 — MARGIN_TAKE_RATE in [10%, 35%].
  const c13 = d.MARGIN_TAKE_RATE >= MARGIN_TAKE_RATE_FLOOR - 1e-9 && d.MARGIN_TAKE_RATE <= MARGIN_TAKE_RATE_CEILING + 1e-9;
  checks.push({ id: "C13", label: "MARGIN_TAKE_RATE in [10%, 35%]", passed: c13, detail: `MARGIN_TAKE_RATE = ${(d.MARGIN_TAKE_RATE || 0) * 100}%` });
  if (!c13) errors.push(`C13: MARGIN_TAKE_RATE ${(d.MARGIN_TAKE_RATE || 0) * 100}% out of [10%, 35%] bounds.`);

  // CHECK 14 — DISCOUNTED_RATE ≤ CLASS_ADJUSTED_RATE.
  const c14 = d.DISCOUNTED_RATE <= d.CLASS_ADJUSTED_RATE + 1e-9;
  checks.push({ id: "C14", label: "DISCOUNTED_RATE ≤ CLASS_ADJUSTED_RATE", passed: c14, detail: `DISCOUNTED_RATE = ${(d.DISCOUNTED_RATE || 0) * 100}% vs CLASS_ADJUSTED = ${(d.CLASS_ADJUSTED_RATE || 0) * 100}%` });
  if (!c14) errors.push(`C14: DISCOUNTED_RATE exceeds CLASS_ADJUSTED_RATE — discounts must be non-negative.`);

  // CHECK 15 — At least one binding cap in CAPS_APPLIED.
  const c15 = (d.CAPS_APPLIED || []).some((c) => c.binding);
  checks.push({ id: "C15", label: "At least one binding cap in CAPS_APPLIED", passed: c15, detail: `${(d.CAPS_APPLIED || []).filter((c) => c.binding).map((c) => c.cap).join(", ") || "(none)"}` });
  if (!c15) warnings.push("C15: No binding cap was identified — caps may not have been computed correctly.");

  // CHECK 16 — TSEC + LOOM_HASH are present (audit trail integrity).
  const c16 = Boolean(d.TSEC) && Boolean(d.LOOM_HASH);
  checks.push({ id: "C16", label: "TSEC + LOOM_HASH present (audit trail)", passed: c16, detail: `TSEC=${d.TSEC || "(missing)"} LOOM_HASH=${d.LOOM_HASH || "(missing)"}` });
  if (!c16) errors.push("C16: TSEC or LOOM_HASH is missing — audit trail integrity violated.");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

// ============================================================================
// Fee policy versioning
// ============================================================================

export function getFeePolicyVersion(): FeePolicyVersion {
  return {
    policyId: FEE_POLICY_ID,
    policyVersion: FEE_POLICY_VERSION,
    formulaVersion: FEE_FORMULA_VERSION,
    inputSnapshotVersion: INPUT_SNAPSHOT_VERSION,
    effectiveDate: FEE_POLICY_EFFECTIVE_DATE,
  };
}

// ============================================================================
// Stored decision retrieval — getFeeDecision(ustn)
// ============================================================================

/**
 * Retrieve the most recent Fee Decision Object stored for a USTN.
 * Returns null if none exists.
 */
export async function getFeeDecision(ustn: string): Promise<FeeDecisionObject | null> {
  try {
    const row = await db.feeCalculation.findFirst({
      where: { ustn, stage: "V18_DYNAMIC_ENGINE" },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.providerFeesJson || "{}") as FeeDecisionObject;
      return parsed;
    } catch {
      return null;
    }
  } catch (err: any) {
    logger.error("[fee-engine] getFeeDecision failed", { ustn, error: err?.message });
    return null;
  }
}

// ============================================================================
// Lock Fee Decision — lockFeeDecision(feeDecisionId)
// ============================================================================

/**
 * Lock a Fee Decision — promote it to FeeLock ACTIVE state, write a
 * GovernorDecision row (audit trail), and compute the Loom hash.
 *
 * Per §9.30, FeeLock never goes ACTIVE on click alone — it requires an
 * externally-confirmed payment event. This function performs the LOCK step
 * which makes the decision immutable + writes the GovernorDecision record
 * (the payment confirmation is a separate downstream event).
 *
 * Returns the lock state.
 */
export async function lockFeeDecision(
  feeDecisionId: string,
): Promise<{ locked: boolean; loomHash: string | null; governorDecisionId: string | null; feeLockId: string | null; error?: string }> {
  try {
    // Look up the FeeCalculation row whose decision JSON matches this ID.
    // We scan rows with the V18 stage and parse the JSON to find the match.
    const rows = await db.feeCalculation.findMany({
      where: { stage: "V18_DYNAMIC_ENGINE" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    let matched: FeeDecisionObject | null = null;
    let matchedRowId: string | null = null;
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.providerFeesJson || "{}") as FeeDecisionObject;
        if (parsed.FEE_DECISION_ID === feeDecisionId) {
          matched = parsed;
          matchedRowId = r.id;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!matched || !matchedRowId) {
      return { locked: false, loomHash: null, governorDecisionId: null, feeLockId: null, error: "Fee decision not found" };
    }

    const ustn = matched.USTN;
    const finalFee = matched.FINAL_FEE;

    // Compute the LOOM hash (deterministic).
    const loomHash = computeLoomHash(matched);

    // Write a GovernorDecision row (audit trail).
    const decisionId = `GD-FEELOCK-${ustn}-${Date.now().toString(36).toUpperCase()}`;
    try {
      await db.governorDecision.create({
        data: {
          decisionId,
          action: "FEE_LOCK",
          actorGtid: null,
          actorEmployeeId: null,
          traderMode: null,
          resourceUstn: ustn,
          payload: JSON.stringify({
            feeDecisionId,
            ustn,
            finalFee,
            finalRate: matched.FINAL_RATE,
            cfb: matched.CFB,
            tsec: matched.TSEC,
            loomHash,
          }),
          verdict: "APPROVED",
          conditions: "Fee Decision validated + locked per §9.30.",
          tenantMessage: `Fee Decision ${feeDecisionId} locked for ${ustn}.`,
          loomHash,
          previousHash: null,
          signature: `sig-${loomHash}`,
          pqcSignature: `pqc-${loomHash}`,
          moduleVersions: JSON.stringify({
            feeEngine: FEE_POLICY_VERSION,
            formulaVersion: FEE_FORMULA_VERSION,
          }),
          aiConfidence: 1.0,
        },
      });
    } catch (err: any) {
      logger.error("[fee-engine] lockFeeDecision: GovernorDecision write failed", { ustn, error: err?.message });
    }

    // Write / update the FeeLock row.
    let feeLockId: string | null = null;
    try {
      const existing = await db.feeLock.findFirst({
        where: { ustn, status: { in: ["PENDING", "FROZEN"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        await db.feeLock.update({
          where: { id: existing.id },
          data: {
            status: "FROZEN",
            totalAmountUsd: finalFee,
            sgtxFeeUsd: finalFee,
            frozenReason: `Fee Decision ${feeDecisionId} locked per §9.30.`,
            frozenAt: new Date(),
            updatedAt: new Date(),
          },
        });
        feeLockId = existing.id;
      } else {
        const created = await db.feeLock.create({
          data: {
            ustn,
            status: "FROZEN",
            totalAmountUsd: finalFee,
            sgtxFeeUsd: finalFee,
            frozenReason: `Fee Decision ${feeDecisionId} locked per §9.30.`,
            frozenAt: new Date(),
          },
        });
        feeLockId = created.id;
      }
    } catch (err: any) {
      logger.error("[fee-engine] lockFeeDecision: FeeLock write failed", { ustn, error: err?.message });
    }

    // Mark the decision as LOCKED + write the governor decision ID + loom hash
    // back to the stored FeeCalculation JSON.
    try {
      const updated = { ...matched, LOCKED: true, GOVERNOR_DECISION_ID: decisionId, LOOM_HASH: loomHash };
      await db.feeCalculation.update({
        where: { id: matchedRowId },
        data: { providerFeesJson: JSON.stringify(updated) },
      });
    } catch (err: any) {
      logger.error("[fee-engine] lockFeeDecision: update decision JSON failed", { ustn, error: err?.message });
    }

    logger.info("[fee-engine] lockFeeDecision complete", { feeDecisionId, ustn, decisionId, loomHash });

    return { locked: true, loomHash, governorDecisionId: decisionId, feeLockId };
  } catch (err: any) {
    logger.error("[fee-engine] lockFeeDecision failed", { feeDecisionId, error: err?.message });
    return { locked: false, loomHash: null, governorDecisionId: null, feeLockId: null, error: err?.message || "Unknown error" };
  }
}
