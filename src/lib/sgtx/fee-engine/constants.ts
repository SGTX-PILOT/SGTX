// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine Constants & Reference Data
 * ===========================================================================
 *
 * This module centralises every constant used by the Dynamic Fee Engine. The
 * engine itself is fully deterministic — given the same input snapshot, the
 * same fee is always produced (constitutional requirement §9.27.20).
 *
 * Reference: v18 §9.27 (33 sub-sections, 20 binding invariants).
 *
 * Layer 0 — Constitutional Floor / Ceiling (NON-BYPASSABLE):
 *   RATE_FLOOR     = 0.03%   (0.0003)  — absolute minimum rate.
 *   RATE_CEILING   = 1.50%   (0.0150)  — absolute maximum rate.
 *
 * Layer 6 — Party Affordability Guard:
 *   MARGIN_TAKE_RATE = 10% + 25% × SIGMOID((MARGIN−8%)/4%)  bounded [10%, 35%]
 *   AFFORDABILITY_CAP = ESTIMATED_GROSS_PROFIT × MARGIN_TAKE_RATE
 *
 * Fairness Score:
 *   FAIRNESS_SCORE = CLAMP(0.35·CTS + 0.30·RISK + 0.20·VALUE − 0.15·EFFICIENCY, 0, 100)
 *
 * Fair Rate:
 *   BASE_FAIR_RATE = 0.03% + 1.47% × (FAIRNESS_SCORE/100)
 *
 * Master Formula §9.27.22:
 *   1. CLASS_ADJUSTED_RATE = BASE_FAIR_RATE × class_factor
 *   2. DISCOUNTED_RATE      = CLASS_ADJUSTED_RATE × (1 − total_discount_pct)
 *   3. RAW_FEE              = CFB × DISCOUNTED_RATE
 *   4. PRE_CAP_FEE          = MIN(RAW_FEE, AFFORDABILITY_CAP, BULK_CAP,
 *                                 ESSENTIAL_CAP, SPECIAL_STOCK_CAP,
 *                                 CONSTITUTIONAL_CAP)
 *   5. FINAL_FEE            = MAX(PRE_CAP_FEE, COST_TO_SERVE_FLOOR)
 *   6. Constitutional check: 0 ≤ FINAL_FEE ≤ 1.50% × CFB
 */

// ============================================================================
// Layer 0 — Constitutional Floor & Ceiling (NON-BYPASSABLE)
// ============================================================================

/** Absolute minimum fee rate — 0.03% (constitutional floor, §9.27.20 invariant #1). */
export const RATE_FLOOR = 0.0003;

/** Absolute maximum fee rate — 1.50% (constitutional ceiling, §9.27.20 invariant #2). */
export const RATE_CEILING = 0.0150;

// ============================================================================
// Fairness Score weights (§9.27.7)
// ============================================================================

export const FAIRNESS_WEIGHTS = {
  /** Cost-to-Serve weight (Layer 2). */
  cts: 0.35,
  /** Risk weight (Layer 3). */
  risk: 0.30,
  /** Value Delivered weight (Layer 4). */
  value: 0.20,
  /** Efficiency weight (Layer 5) — NEGATIVE (efficiency REDUCES the fairness score → reduces the fair rate). */
  efficiency: -0.15,
} as const;

// ============================================================================
// Base Fair Rate (§9.27.8)
// ============================================================================

/** Fair rate intercept — 0.03% (== RATE_FLOOR). */
export const BASE_FAIR_RATE_INTERCEPT = 0.0003;

/** Fair rate slope — 1.47% (so rate spans 0.03% → 1.50% as fairness goes 0 → 100). */
export const BASE_FAIR_RATE_SLOPE = 0.0147;

// ============================================================================
// Layer 6 — Party Affordability Guard (§9.27.13)
// ============================================================================

/** Margin-take rate floor — 10%. */
export const MARGIN_TAKE_RATE_FLOOR = 0.10;

/** Margin-take rate ceiling — 35%. */
export const MARGIN_TAKE_RATE_CEILING = 0.35;

/** Margin-take rate base — 10%. */
export const MARGIN_TAKE_RATE_BASE = 0.10;

/** Margin-take rate sigmoid coefficient — 25%. */
export const MARGIN_TAKE_RATE_SIGMOID_COEFF = 0.25;

/** Margin midpoint for sigmoid — 8%. */
export const MARGIN_MIDPOINT_PCT = 8;

/** Sigmoid scale — 4%. */
export const MARGIN_SIGMOID_SCALE_PCT = 4;

// ============================================================================
// Layer 7 — Constitutional caps per economic class (§9.27.22 step 4)
// ============================================================================

/**
 * Per-class constitutional caps expressed as fraction-of-CFB.
 *
 * These are HARD CEILINGS that operate at Layer 7 — independent of any class
 * factor at Layer 1. They ensure no fee can exceed the constitutional ceiling
 * for its class even when the raw fee would otherwise be higher.
 *
 * NOTE: STANDARD cap == RATE_CEILING (1.50%). All other classes are tighter.
 */
export const CLASS_CAPS: Record<string, number> = {
  STANDARD: 0.0150,            // 1.50% (== constitutional ceiling)
  ESSENTIAL: 0.0075,           // 0.75% — essential goods affordability protection
  BULK: 0.0120,                // 1.20%
  PERISHABLE: 0.0150,          // 1.50%
  SPECIAL_STOCK: 0.0150,       // 1.50% (subclasses A-H may tighten further)
  HIGH_VALUE_LOW_MARGIN: 0.0080, // 0.80% — HVLM affordability protection
  RO_RO: 0.0150,               // 1.50% (per-unit variant computed separately)
  FINANCING_LINKED: 0.0150,    // 1.50%
  MULTI_SHIPMENT: 0.0150,      // 1.50%
  STRATEGIC_CORRIDOR: 0.0100,  // 1.00% — strategic corridor subsidy
  DISTRESSED: 0.0150,          // 1.50%
};

// ============================================================================
// Layer 1 — Economic class factors (§9.27.4)
// ============================================================================

export interface EconomicClassDef {
  /** Class identifier. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Multiplier applied to BASE_FAIR_RATE in step 1 of the master formula. */
  factor: number;
  /** Whether the class has a sub-linear rate curve (HVLM). */
  subLinear?: boolean;
  /** Whether the class uses a per-unit fee model instead of % of CFB (RO-RO). */
  perUnit?: boolean;
  /** Per-unit fee (USD per unit) when perUnit=true. */
  perUnitFeeUsd?: number;
  /** Notes for the calculation trace. */
  notes?: string;
}

export const ECONOMIC_CLASSES: EconomicClassDef[] = [
  {
    id: "STANDARD",
    label: "Standard trade",
    factor: 1.0,
    notes: "Default class — no adjustment.",
  },
  {
    id: "ESSENTIAL",
    label: "Essential goods (food, medicine, humanitarian)",
    factor: 0.8, // mid-band of 0.7-0.9
    notes: "Essential-goods affordability protection — rate reduced 20%.",
  },
  {
    id: "BULK",
    label: "Bulk commodity (volume-driven, low margin)",
    factor: 1.0,
    notes: "Bulk uses a non-linear curve, not a flat factor — handled in calculateFee.",
  },
  {
    id: "PERISHABLE",
    label: "Perishable goods (cold chain)",
    factor: 1.1,
    notes: "Perishables carry higher operational risk — rate uplifted 10%.",
  },
  {
    id: "SPECIAL_STOCK",
    label: "Special stock (subclasses A-H)",
    factor: 1.15,
    notes: "8 subclasses (A-H) — handled by subclass lookup; default mid-band.",
  },
  {
    id: "HIGH_VALUE_LOW_MARGIN",
    label: "High-value low-margin (HVLM)",
    factor: 0.8,
    subLinear: true,
    notes: "HVLM uses a sub-linear curve — class factor 0.8 plus affordability cap.",
  },
  {
    id: "RO_RO",
    label: "Roll-on / roll-off (per-unit)",
    factor: 1.0,
    perUnit: true,
    perUnitFeeUsd: 15.0,
    notes: "RO-RO is priced per vehicle / unit, not as % of CFB.",
  },
  {
    id: "FINANCING_LINKED",
    label: "Financing-linked trade",
    factor: 1.0,
    notes: "Financing-linked — fee aligned with financing principal (excluded from CFB).",
  },
  {
    id: "MULTI_SHIPMENT",
    label: "Multi-shipment (single contract, multiple loads)",
    factor: 1.0,
    notes: "Multi-shipment applies a per-shipment discount, not a class factor.",
  },
  {
    id: "STRATEGIC_CORRIDOR",
    label: "Strategic corridor (subsidised by jurisdiction)",
    factor: 0.9,
    notes: "Strategic corridor — rate reduced 10% + 1.00% class cap.",
  },
  {
    id: "DISTRESSED",
    label: "Distressed trade (rescue / humanitarian)",
    factor: 1.2,
    notes: "Distressed trade carries higher operational risk — rate uplifted 20%.",
  },
];

/** Convenience lookup: class id → class def. */
export const ECONOMIC_CLASS_MAP: Record<string, EconomicClassDef> = Object.fromEntries(
  ECONOMIC_CLASSES.map((c) => [c.id, c]),
);

/** Special-stock subclasses A-H (§9.27.4). Each may carry its own sub-factor. */
export const SPECIAL_STOCK_SUBCLASSES: Record<string, number> = {
  A: 1.20, // art / antiquities
  B: 1.10, // precious metals
  C: 1.15, // gemstones
  D: 1.05, // high-value electronics
  E: 1.10, // pharmaceuticals
  F: 1.00, // dual-use
  G: 1.20, // cultural heritage
  H: 1.15, // other special stock
};

// ============================================================================
// Layer 4 — Discounts (§9.27.18)
// ============================================================================

export interface DiscountDef {
  id: string;
  label: string;
  /** Maximum discount expressed as a fraction (0.001 = 0.1% = 10 bps). */
  maxPct: number;
  /** Whether the discount is expressed in basis points (1 bp = 0.01%). */
  inBps?: boolean;
  notes?: string;
}

export const DISCOUNT_DEFS: DiscountDef[] = [
  {
    id: "MCI",
    label: "Master Commitment Index (long-term volume commitment)",
    maxPct: 0.0015, // 15 bps
    inBps: true,
    notes: "MCI discount capped at 15 bps based on 12-month committed volume.",
  },
  {
    id: "MULTI_SHIPMENT",
    label: "Multi-shipment consolidation (single contract, multiple loads)",
    maxPct: 0.0005, // 5 bps
    inBps: true,
    notes: "Multi-shipment discount 2-5 bps based on shipment count.",
  },
  {
    id: "VOLUME_LOYALTY",
    label: "Volume loyalty (repeat-customer discount)",
    maxPct: 0.001, // 10 bps
    inBps: true,
    notes: "Volume loyalty discount capped at 10 bps based on 90-day rolling volume.",
  },
  {
    id: "ECI",
    label: "Economic Complexity Index (high-ECI origin / destination)",
    maxPct: 0.0008, // 8 bps
    inBps: true,
    notes: "ECI discount capped at 8 bps based on origin × destination ECI score.",
  },
  {
    id: "API_INTEGRATION",
    label: "API integration (deep integration with SGTX APIs)",
    maxPct: 0.0002, // 2 bps
    inBps: true,
    notes: "API integration discount ≤ 2 bps based on integration depth.",
  },
  {
    id: "TELEMETRY",
    label: "Telemetry sharing (real-time shipment telemetry)",
    maxPct: 0.0001, // 1 bp
    inBps: true,
    notes: "Telemetry discount ≤ 1 bp based on telemetry coverage.",
  },
];

export const DISCOUNT_MAP: Record<string, DiscountDef> = Object.fromEntries(
  DISCOUNT_DEFS.map((d) => [d.id, d]),
);

/** Discount caps (defensive — same numbers as DISCOUNT_DEFS but as flat record). */
export const DISCOUNT_CAPS = {
  MCI_MAX_PCT: 0.0015,
  MULTI_SHIPMENT_MIN_BPS: 2,
  MULTI_SHIPMENT_MAX_BPS: 5,
  VOLUME_LOYALTY_MAX_PCT: 0.001,
  ECI_MAX_PCT: 0.0008,
  API_INTEGRATION_MAX_BPS: 2,
  TELEMETRY_MAX_BPS: 1,
} as const;

// ============================================================================
// CFB exclusions (§9.27.2 — explicit exclusions from Canonical Fee Basis)
// ============================================================================

export const CFB_EXCLUSIONS: string[] = [
  "VAT",
  "DUTIES",
  "GOVERNMENT_TAXES",
  "FINANCING_PRINCIPAL",
  "REFUNDABLE_DEPOSITS",
  "BANK_CHARGES",
];

// ============================================================================
// Fee policy versioning metadata
// ============================================================================

export const FEE_POLICY_ID = "FEE_POLICY_SGTX_V18";
export const FEE_POLICY_VERSION = "v18.0";
export const FEE_FORMULA_VERSION = "9.27.22";
export const INPUT_SNAPSHOT_VERSION = "1.0";
export const TRI_VERSION = "v17";
export const RIA_VERSION = "v17";
export const MARKET_DATA_VERSION = "v18";
export const FX_SNAPSHOT_VERSION = "v18.0";
export const FEE_POLICY_EFFECTIVE_DATE = "2025-01-01T00:00:00Z";

// ============================================================================
// Layer 2 — Cost-to-Serve factor weights (§9.27.5)
// ============================================================================

export const CTS_FACTOR_WEIGHTS = {
  tradeComplexity: 0.20,
  regulatoryBurden: 0.20,
  integrationCount: 0.15,
  exceptionCount: 0.15,
  disputeHistory: 0.15,
  jurisdictionTier: 0.15,
} as const;

// ============================================================================
// Layer 3 — Risk factor weights (§9.27.6)
// ============================================================================

export const RISK_FACTOR_WEIGHTS = {
  sanctionsProximity: 0.25,
  jurisdictionRisk: 0.20,
  commodityRisk: 0.15,
  perishability: 0.10,
  valueAtRisk: 0.15,
  counterpartyTri: 0.15,
} as const;

// ============================================================================
// Layer 4 — Value Delivered factor weights (§9.27.7)
// ============================================================================

export const VALUE_FACTOR_WEIGHTS = {
  timeSaved: 0.20,
  documentAutomation: 0.20,
  financingAccess: 0.15,
  complianceCoverage: 0.15,
  auditTrailQuality: 0.15,
  tradeHealthImprovement: 0.15,
} as const;

// ============================================================================
// Layer 5 — Efficiency factor weights (§9.27.8)
// ============================================================================

export const EFFICIENCY_FACTOR_WEIGHTS = {
  apiIntegrationDepth: 0.25,
  automationLevel: 0.25,
  dataQuality: 0.20,
  straightThroughProcessingRate: 0.20,
  exceptionRate: 0.10, // NEGATIVE-CORRELATED below
} as const;

// ============================================================================
// Sigmoid helper (used by Layer 6 + bulk curve + HVLM curve)
// ============================================================================

/**
 * Numerically-stable logistic sigmoid.
 *
 *   sigmoid(x) = 1 / (1 + e^−x)
 *
 * Clamped to [0, 1]. For |x| > 36 the exponential saturates — we return
 * the limit (0 or 1) to avoid floating-point underflow.
 *
 * Used by:
 *   - Layer 6: MARGIN_TAKE_RATE = 10% + 25% × SIGMOID((MARGIN−8%)/4%)
 *   - Layer 1: BULK class curve (sub-linear)
 *   - Layer 1: HVLM class curve (sub-linear)
 */
export function sigmoid(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  if (x > 36) return 1;
  if (x < -36) return 0;
  return 1 / (1 + Math.exp(-x));
}

/**
 * Margin-take rate (Layer 6 affordability guard):
 *
 *   MARGIN_TAKE_RATE = 10% + 25% × SIGMOID((MARGIN − 8%) / 4%)
 *
 * bounded [10%, 35%]. Margin is expressed as a percentage (e.g. 12 for 12%).
 */
export function marginTakeRate(marginPct: number): number {
  const z = (Number(marginPct) - MARGIN_MIDPOINT_PCT) / MARGIN_SIGMOID_SCALE_PCT;
  const raw = MARGIN_TAKE_RATE_BASE + MARGIN_TAKE_RATE_SIGMOID_COEFF * sigmoid(z);
  return Math.min(MARGIN_TAKE_RATE_CEILING, Math.max(MARGIN_TAKE_RATE_FLOOR, raw));
}

/**
 * CLAMP helper — clamps a value to [lo, hi].
 */
export function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/**
 * Round to N decimal places (defensive against floating-point noise in
 * the calculation trace).
 */
export function roundTo(value: number, decimals: number = 6): number {
  if (!Number.isFinite(value)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}
