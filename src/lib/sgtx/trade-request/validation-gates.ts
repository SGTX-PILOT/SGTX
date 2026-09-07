// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 — Phase 1 Validation Gates (G1U1–G1U33) — Buyer Trade Request
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 Section 6 + 15.3 — the buyer workflow runs 33 validation gates before
// the trade request can be submitted to the seller. Gates are split into:
//
//   • CRITICAL  — block submission until passed (e.g. no seller selected)
//   • WARNING   — surface to the buyer but do not block (e.g. readiness <70)
//
// `validatePhase1(state)` returns:
//   {
//     passed: boolean,                // true only if all CRITICAL gates pass
//     gates: GateResult[],            // 33 entries (G1U1–G1U33)
//     criticalPassed: number,
//     criticalTotal: number,
//     warnings: number,
//   }
//
// The function is PURE — no DB lookups, no async. It runs on the client
// (Section 12 — Feasibility Check) and is mirrored server-side at submit
// time so the Governor can re-verify before persisting the trade.
//
// NON-MARKETPLACE: gates never produce scores, rankings, or counterparty
// recommendations. They answer the binary "is this trade request submittable?"
// question only.

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

export type GateSeverity = "CRITICAL" | "WARNING";

export interface GateResult {
  gateId: string;            // "G1U1" .. "G1U33"
  passed: boolean;
  severity: GateSeverity;
  message: string;
  remediation?: string;
}

export interface Phase1ValidationResult {
  passed: boolean;
  gates: GateResult[];
  criticalPassed: number;
  criticalTotal: number;
  warnings: number;
}

// The buyer wizard state shape — only the fields the 33 gates inspect.
// This mirrors `WizardState` in src/app/trades/new/page.tsx.
export interface WizardState {
  // Section 1 — Seller
  counterpartyGtid?: string;
  counterpartyVerified?: boolean;
  counterpartyKybTier?: number;
  counterpartyTrustScore?: number | null;
  counterpartyCapacityUsd?: number | null;

  // Section 2 — Incoterm + Commercial Foundation
  incoterm?: string;
  originCountry?: string;
  destCountry?: string;
  settlementStructure?: string;
  paymentTerms?: string;
  paymentTiming?: string;
  currency?: string;
  creditPeriod?: string;
  buyerFinancingRequired?: boolean;
  buyerFinancingShared?: boolean;        // must remain FALSE per data-sovereign rule
  buyerFinancingCounterparty?: boolean; // must remain FALSE per data-sovereign rule
  buyerFinancingEitherParty?: boolean;   // must remain FALSE per data-sovereign rule

  // Section 3 — Transport Mode & Equipment
  transportMode?: string;
  equipmentType?: string;

  // Section 4 — Containers & Commodity
  equipmentCount?: string;
  commodity?: string;
  commodityHs?: string;
  quantity?: string;
  quantityUnit?: string;
  grossWeightKg?: number;
  netWeightKg?: number;
  acceptanceCriteria?: {
    temperature?: string;
    humidity?: string;
    weightTolerance?: string;
    qualityGrade?: string;
  };

  // Section 5 — Lab Tests
  labTestRequirements?: {
    mandatory: string[];
    recommended: string[];
    optional: string[];
  };
  labTestsPriced?: boolean;
  temperatureControlled?: boolean;

  // Section 6 — QC Inspection
  qcInspectionType?: string | null;
  qcInspectionGeography?: string | null;
  qcInspectionProviderCoverage?: boolean;
  qcInspectionFeeUsd?: number | null;

  // Section 7 — AI Container Advisor
  aiContainerAdvisorRun?: boolean;
  aiContainerAdvisorResult?: any;

  // Section 8 — Documentation
  documentRequirements?: any[];
  documentsTriggerResolved?: boolean;

  // Section 9 — Insurance
  insuranceRequired?: string;            // "yes" | "no" | "according_to_incoterm"
  insuranceType?: string;
  incotermRequiresInsurance?: boolean;

  // Section 10 — Delivery Window
  earliestDelivery?: string;
  preferredDelivery?: string;
  latestDelivery?: string;
  transitTimeDays?: number | null;
  specialInstructions?: string;

  // Section 11 — Trade Criticality
  tradeCriticality?: "Routine" | "Priority" | "Critical" | null;
  criticalitySuggested?: string | null;
  criticalityConfidence?: number | null;
  criticalityAdjustmentReason?: string;

  // Section 12/13 — Trade value, marketplace attribution, draft
  tradeValueUsd?: number;
  targetPrice?: string;
  marketplaceAttribution?: boolean;
  marketplaceAttributionAcknowledged?: boolean;
  draftId?: string | null;
  lastSaved?: string | null;
  sessionStart?: number;     // epoch ms — used by G1U30 to detect 30s+ sessions
  readinessScore?: number | null;
  mandatoryFieldsComplete?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

const CRITICAL = (gateId: string, passed: boolean, message: string, remediation?: string): GateResult => ({
  gateId, passed, severity: "CRITICAL", message, remediation,
});
const WARNING = (gateId: string, passed: boolean, message: string, remediation?: string): GateResult => ({
  gateId, passed, severity: "WARNING", message, remediation,
});

// Per v17 Section 4.3 — perishable goods always require insurance and lab tests
const PERISHABLE_HS_PREFIXES = ["0805", "0806", "0810", "0811", "0901", "0904", "0906", "2005", "2006", "2007", "2008", "2009"];
const HIGH_VALUE_THRESHOLD_USD = 500_000;

// Incoterms that obligate the seller to insure the cargo during main carriage
const INCOTERMS_REQUIRING_SELLER_INSURANCE = new Set(["CIF", "CIP"]);

// Distressed / high-risk destination countries (per v17 Section 21)
const HIGH_RISK_DESTINATIONS = new Set([
  "AF", "IR", "KP", "SY", "YE", "SO", "LY", "SS", "VE", "MM", "BY",
]);

// ───────────────────────────────────────────────────────────────────────────────
// 33 Validation Gates (G1U1–G1U33) — v17 Section 15.3
// ───────────────────────────────────────────────────────────────────────────────

export function validatePhase1(state: WizardState): Phase1ValidationResult {
  const gates: GateResult[] = [];
  const isPerishable = !!(
    state.temperatureControlled ||
    (state.commodityHs && PERISHABLE_HS_PREFIXES.some(p => state.commodityHs!.startsWith(p)))
  );
  const isHighValue = (state.tradeValueUsd && state.tradeValueUsd >= HIGH_VALUE_THRESHOLD_USD) ||
    (state.targetPrice && parseFloat(state.targetPrice) * (parseFloat(state.quantity || "0") || 0) >= HIGH_VALUE_THRESHOLD_USD);
  const estValue =
    state.tradeValueUsd ||
    (state.targetPrice && state.quantity ? parseFloat(state.targetPrice) * parseFloat(state.quantity) : 0);

  // ── G1U1 — Seller selected and sanctions-cleared ──────────────────────────
  gates.push(CRITICAL(
    "G1U1",
    !!(state.counterpartyGtid && state.counterpartyVerified),
    "Seller selected and sanctions-cleared",
    state.counterpartyGtid
      ? "Seller failed sanctions pre-screen — select a verified seller."
      : "Select a seller before submitting the trade request.",
  ));

  // ── G1U2 — Seller KYB tier ≥2 (or 3 for high-value) ─────────────────────────
  const requiredKybTier = isHighValue ? 3 : 2;
  const kybOk = (state.counterpartyKybTier ?? 0) >= requiredKybTier;
  gates.push(CRITICAL(
    "G1U2",
    kybOk,
    `Seller KYB tier ≥${requiredKybTier}${isHighValue ? " (high-value trade)" : ""}`,
    `Re-initiate seller KYB verification to reach tier ${requiredKybTier} before submitting.`,
  ));

  // ── G1U3 — Incoterm valid for origin/dest countries ────────────────────────
  const incotermValid = !!state.incoterm &&
    !!state.originCountry &&
    !!state.destCountry &&
    !HIGH_RISK_DESTINATIONS.has(state.destCountry.toUpperCase());
  gates.push(CRITICAL(
    "G1U3",
    incotermValid,
    "Incoterm valid for origin/dest countries",
    "Destination country is on the distressed-country list — choose a different destination or contact SGTX compliance.",
  ));

  // ── G1U4 — Settlement structure specified ─────────────────────────────────
  gates.push(CRITICAL(
    "G1U4",
    !!state.settlementStructure,
    "Settlement structure specified",
    "Select a settlement structure (L/C, Documentary Collection, Bank Transfer, or Open Account).",
  ));

  // ── G1U5 — Payment timing specified ────────────────────────────────────────
  gates.push(CRITICAL(
    "G1U5",
    !!(state.paymentTiming || state.paymentTerms),
    "Payment timing specified",
    "Choose when the payment should be made (advance, against documents, deferred, etc.).",
  ));

  // ── G1U6 — Currency specified and FX-eligible ──────────────────────────────
  const fxEligible = !!state.currency &&
    !HIGH_RISK_DESTINATIONS.has((state.originCountry || "").toUpperCase());
  gates.push(CRITICAL(
    "G1U6",
    fxEligible,
    "Currency specified and FX-eligible",
    "Select a settlement currency. If origin country is sanctioned, choose USD or contact FX desk.",
  ));

  // ── G1U7 — Transport mode specified ────────────────────────────────────────
  const VALID_MODES = ["OCEAN", "AIR", "RAIL", "TRUCK", "ROAD", "RORO", "MULTIMODAL", "SEA"];
  gates.push(CRITICAL(
    "G1U7",
    !!state.transportMode && VALID_MODES.includes(state.transportMode.toUpperCase()),
    "Transport mode specified (Ocean/Air/Rail/Truck/RoRo/Multimodal)",
    "Choose a transport mode in Section 3 before configuring containers.",
  ));

  // ── G1U8 — Equipment type valid for transport mode ─────────────────────────
  const modeEquipmentMap: Record<string, string[]> = {
    OCEAN: ["20DRY", "40DRY", "20REF", "40REF", "40HC", "20TK", "40TK", "20OT", "40OT", "20FR", "40FR"],
    SEA:   ["20DRY", "40DRY", "20REF", "40REF", "40HC", "20TK", "40TK", "20OT", "40OT", "20FR", "40FR"],
    AIR:   ["ULD_AKE", "ULD_LD6", "ULD_PAG", "ULD_AKE", "ULD_PAG", "ULD_LD3", "BULK_PALLET"],
    RAIL:  ["WAGON_DRY", "WAGON_REEFER", "WAGON_TANK"],
    TRUCK: ["TRAILER_DRY", "TRAILER_REEFER", "TRAILER_TANK", "TRAILER_FLATBED"],
    ROAD:  ["TRAILER_DRY", "TRAILER_REEFER", "TRAILER_TANK", "TRAILER_FLATBED"],
    RORO:  ["ROLLTRAILER", "MAFI", "VEHICLE_DECK"],
    MULTIMODAL: ["CONTAINER_20", "CONTAINER_40", "CONTAINER_40HC", "CONTAINER_40REF"],
  };
  const allowed = state.transportMode ? modeEquipmentMap[state.transportMode.toUpperCase()] || [] : [];
  const equipValid = !!state.equipmentType && allowed.includes(state.equipmentType);
  gates.push(CRITICAL(
    "G1U8",
    equipValid,
    "Equipment type valid for transport mode",
    "The equipment type doesn't match the selected transport mode — re-select equipment in Section 3.",
  ));

  // ── G1U9 — At least 1 container/unit configured ────────────────────────────
  const count = parseInt(state.equipmentCount || "0", 10);
  gates.push(CRITICAL(
    "G1U9",
    count >= 1,
    "At least 1 container/unit configured",
    "Add at least one container or unit in Section 4.",
  ));

  // ── G1U10 — Max 50 containers/units ────────────────────────────────────────
  gates.push(CRITICAL(
    "G1U10",
    count <= 50,
    "Max 50 containers/units",
    count > 50
      ? `Reduce to 50 containers or fewer (currently ${count}). For larger shipments use multi-shipment mode.`
      : undefined,
  ));

  // ── G1U11 — Commodity HS code valid ────────────────────────────────────────
  const hsOk = !!(state.commodityHs && /^\d{4,8}(\.\d{1,2})?$/.test(state.commodityHs.trim()));
  gates.push(WARNING(
    "G1U11",
    hsOk,
    "Commodity HS code valid",
    "Enter a valid 4–8 digit HS code in Section 4 — required for tariff and documentation generation.",
  ));

  // ── G1U12 — Commodity quantity > 0 ─────────────────────────────────────────
  const qty = parseFloat(state.quantity || "0") || 0;
  gates.push(CRITICAL(
    "G1U12",
    qty > 0,
    "Commodity quantity > 0",
    "Quantity must be greater than zero.",
  ));

  // ── G1U13 — Net weight ≤ gross weight ──────────────────────────────────────
  const gross = state.grossWeightKg ?? (qty * 1000);
  const net = state.netWeightKg ?? (qty * 1000);
  gates.push(WARNING(
    "G1U13",
    net <= gross,
    "Net weight ≤ gross weight",
    "Net weight cannot exceed gross weight — review commodity weights in Section 4.",
  ));

  // ── G1U14 — Acceptance criteria matrix complete ───────────────────────────
  const ac = state.acceptanceCriteria || {};
  const acComplete = !!(ac.qualityGrade || ac.temperature || ac.weightTolerance || ac.humidity) ||
    !isPerishable;
  gates.push(CRITICAL(
    "G1U14",
    acComplete,
    "Acceptance criteria matrix complete",
    "Add at least one acceptance criterion (quality grade, temperature, weight tolerance, or humidity) in Section 4.",
  ));

  // ── G1U15 — Lab tests mandatory set locked (if perishable) ─────────────────
  const labMandatoryLocked = !isPerishable ||
    ((state.labTestRequirements?.mandatory || []).length > 0);
  gates.push(CRITICAL(
    "G1U15",
    labMandatoryLocked,
    "Lab tests mandatory set locked (if perishable)",
    "Perishable goods require at least one mandatory lab test in Section 5.",
  ));

  // ── G1U16 — Lab tests explicitly priced ────────────────────────────────────
  gates.push(WARNING(
    "G1U16",
    !!state.labTestsPriced || !isPerishable,
    "Lab tests explicitly priced",
    "Each selected lab test must have an explicit price — review Section 5.",
  ));

  // ── G1U17 — QC inspection type valid for geography ─────────────────────────
  const validQcTypes = ["PRE_SHIPMENT", "DURING_LOADING", "DESTINATION", "INDEPENDENT", "NONE"];
  const qcTypeValid = state.qcInspectionType == null ||
    state.qcInspectionType === "NONE" ||
    validQcTypes.includes(state.qcInspectionType);
  gates.push(CRITICAL(
    "G1U17",
    qcTypeValid,
    "QC inspection type valid for geography",
    "Choose a valid QC inspection type in Section 6 (or select 'NONE' to skip).",
  ));

  // ── G1U18 — QC provider has coverage in dest country ───────────────────────
  const qcCoverageOk = state.qcInspectionType == null ||
    state.qcInspectionType === "NONE" ||
    !!state.qcInspectionProviderCoverage;
  gates.push(CRITICAL(
    "G1U18",
    qcCoverageOk,
    "QC provider has coverage in destination country",
    "Selected QC provider does not operate in the destination country — pick another provider in Section 6 or remove the inspection.",
  ));

  // ── G1U19 — AI Container Advisor run (if mode-dependent) ───────────────────
  const advisorNeeded = !!state.transportMode && state.transportMode.toUpperCase() !== "TRUCK" && state.transportMode.toUpperCase() !== "ROAD";
  gates.push(WARNING(
    "G1U19",
    !advisorNeeded || !!state.aiContainerAdvisorRun,
    "AI Container Advisor run (if mode-dependent)",
    "Run the AI Container Advisor in Section 7 to optimise container configuration.",
  ));

  // ── G1U20 — Documentation requirements trigger-resolved ────────────────────
  const docsResolved = !!state.documentsTriggerResolved ||
    (Array.isArray(state.documentRequirements) && state.documentRequirements.length > 0);
  gates.push(CRITICAL(
    "G1U20",
    docsResolved,
    "Documentation requirements trigger-resolved",
    "Resolve documentation triggers in Section 8 — required documents must be enumerated before submit.",
  ));

  // ── G1U21 — Insurance requirements specified (if incoterm requires) ────────
  const insuranceRequired = state.incotermRequiresInsurance ||
    INCOTERMS_REQUIRING_SELLER_INSURANCE.has(state.incoterm || "");
  const insuranceOk = !insuranceRequired ||
    state.insuranceRequired === "yes" ||
    state.insuranceRequired === "according_to_incoterm";
  gates.push(CRITICAL(
    "G1U21",
    insuranceOk,
    "Insurance requirements specified (if Incoterm requires)",
    "This Incoterm requires cargo insurance — choose 'Yes' or 'Per Incoterm' in Section 9.",
  ));

  // ── G1U22 — Insurance type valid ────────────────────────────────────────────
  const validInsuranceTypes = ["ALL_RISK", "FPA", "WA", "TLO", ""];
  const insTypeOk = !state.insuranceRequired || state.insuranceRequired === "no" ||
    validInsuranceTypes.includes(state.insuranceType || "");
  gates.push(WARNING(
    "G1U22",
    insTypeOk,
    "Insurance type valid",
    "Select a valid coverage type (All Risk, FPA, WA, TLO) in Section 9.",
  ));

  // ── G1U23 — Earliest delivery date < preferred < latest ────────────────────
  const e = state.earliestDelivery, p = state.preferredDelivery, l = state.latestDelivery;
  let dateOrderOk = true;
  if (e && p && e > p) dateOrderOk = false;
  if (p && l && p > l) dateOrderOk = false;
  if (e && l && e > l) dateOrderOk = false;
  gates.push(CRITICAL(
    "G1U23",
    dateOrderOk,
    "Earliest delivery date < preferred < latest",
    "Delivery window dates are out of order — fix in Section 10 (earliest → preferred → latest).",
  ));

  // ── G1U24 — Delivery window within carrier transit time ───────────────────
  // Window from earliest→latest must be ≥ transit time (if known)
  let transitOk = true;
  if (state.transitTimeDays && e && l) {
    const windowDays = (new Date(l).getTime() - new Date(e).getTime()) / 86_400_000;
    transitOk = windowDays >= state.transitTimeDays;
  }
  gates.push(WARNING(
    "G1U24",
    transitOk,
    "Delivery window within carrier transit time",
    "Delivery window is shorter than the carrier's transit time — extend the latest acceptable date in Section 10.",
  ));

  // ── G1U25 — Special instructions length ≤ 2000 chars ────────────────────────
  const siLen = (state.specialInstructions || "").length;
  gates.push(CRITICAL(
    "G1U25",
    siLen <= 2000,
    "Special instructions length ≤ 2000 chars",
    `Special instructions are ${siLen} characters — trim to 2000 or fewer.`,
  ));

  // ── G1U26 — Trade criticality set (Routine/Priority/Critical) ──────────────
  gates.push(CRITICAL(
    "G1U26",
    !!state.tradeCriticality,
    "Trade criticality set (Routine/Priority/Critical)",
    "Set trade criticality in Section 11 — Routine, Priority, or Critical.",
  ));

  // ── G1U27 — Trade value > 0 ────────────────────────────────────────────────
  gates.push(CRITICAL(
    "G1U27",
    estValue > 0,
    "Trade value > 0",
    "Enter a target price (or estimated trade value) greater than zero.",
  ));

  // ── G1U28 — Trade value within seller capacity (if known) ──────────────────
  const capacityOk = state.counterpartyCapacityUsd == null ||
    state.counterpartyCapacityUsd <= 0 ||
    estValue <= state.counterpartyCapacityUsd;
  gates.push(WARNING(
    "G1U28",
    capacityOk,
    "Trade value within seller capacity (if known)",
    `Estimated value ($${estValue.toLocaleString()}) exceeds seller's known capacity — confirm capacity or split the trade.`,
  ));

  // ── G1U29 — Buyer Financing Toggle is data-sovereign ───────────────────────
  // Per v17 Section 7.6 — buyer financing is data-sovereign. NO shared /
  // counterparty / either-party flags may be set. The buyer declares only
  // that THEY need financing. The seller is asked separately via CFR
  // pre-clearance and the buyer's financing needs are kept private until
  // the buyer explicitly discloses via CFR.
  const sovereign = !state.buyerFinancingShared &&
    !state.buyerFinancingCounterparty &&
    !state.buyerFinancingEitherParty;
  gates.push(CRITICAL(
    "G1U29",
    sovereign,
    "Buyer Financing Toggle is data-sovereign (no shared/counterparty/either-party flags)",
    "Financing declaration must be buyer-only. Remove any shared/counterparty/either-party flags.",
  ));

  // ── G1U30 — Draft auto-saved (if session > 30s) ────────────────────────────
  const sessionAge = state.sessionStart ? Date.now() - state.sessionStart : 0;
  const draftOk = sessionAge < 30_000 || !!state.lastSaved;
  gates.push(WARNING(
    "G1U30",
    draftOk,
    "Draft auto-saved (if session > 30s)",
    "Wait a moment for the draft to auto-save before submitting.",
  ));

  // ── G1U31 — All mandatory fields present ──────────────────────────────────
  gates.push(CRITICAL(
    "G1U31",
    !!state.mandatoryFieldsComplete,
    "All mandatory fields present",
    "Complete the remaining mandatory fields — see the section checklist at the top of the page.",
  ));

  // ── G1U32 — Readiness score ≥ 70 (warning only — not blocking) ─────────────
  const readiness = state.readinessScore ?? 0;
  gates.push(WARNING(
    "G1U32",
    readiness >= 70,
    "Readiness score ≥ 70 (warning only — not blocking)",
    `Readiness is ${readiness}/100 — review missing fields to improve submission quality.`,
  ));

  // ── G1U33 — Marketplace attribution acknowledged (if attributed, 72h dispute window) ─
  const attrOk = !state.marketplaceAttribution ||
    !!state.marketplaceAttributionAcknowledged;
  gates.push(CRITICAL(
    "G1U33",
    attrOk,
    "Marketplace attribution acknowledged (if attributed, 72h dispute window)",
    "Acknowledge the marketplace attribution and the 72-hour dispute window before submitting.",
  ));

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const criticalGates = gates.filter(g => g.severity === "CRITICAL");
  const criticalPassed = criticalGates.filter(g => g.passed).length;
  const warnings = gates.filter(g => g.severity === "WARNING" && !g.passed).length;
  const passed = criticalGates.every(g => g.passed);

  return {
    passed,
    gates,
    criticalPassed,
    criticalTotal: criticalGates.length,
    warnings,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// AI Criticality Suggestion (used by Section 11)
// ───────────────────────────────────────────────────────────────────────────────
//
// v17 Section 11 specifies that the AI suggests a trade criticality based on
// multiple factors. The suggestion is advisory — the buyer may override with a
// mandatory reason (≥20 chars). The function is deterministic and runs
// client-side so it always produces the same answer for the same input
// (no flaky LLM calls for a criticality label).
//
// Rules (per v17 Section 11.3):
//   • Perishable commodity                              → Priority+
//   • High-risk destination country                      → Priority+
//   • Trade value > $500k                                → Priority+
//   • Critical delivery window (preferred < 14d from now) → Critical+
//   • Otherwise                                          → Routine
//
// Confidence is 0.5–1.0 (lower if signals are mixed).

export interface CriticalitySuggestion {
  suggested: "Routine" | "Priority" | "Critical";
  confidence: number;       // 0.5–1.0
  reasons: string[];
}

export function suggestTradeCriticality(state: WizardState): CriticalitySuggestion {
  const reasons: string[] = [];
  let priority = 0;       // 0 = routine, 1 = priority, 2 = critical
  let signalCount = 0;

  // Perishable commodity → Priority+
  if (state.temperatureControlled) {
    reasons.push("Perishable / temperature-controlled commodity");
    priority = Math.max(priority, 1);
    signalCount++;
  }
  if (state.commodityHs && PERISHABLE_HS_PREFIXES.some(p => state.commodityHs!.startsWith(p))) {
    reasons.push("HS code indicates a perishable agricultural product");
    priority = Math.max(priority, 1);
    signalCount++;
  }

  // High-risk destination country → Priority+
  if (state.destCountry && HIGH_RISK_DESTINATIONS.has(state.destCountry.toUpperCase())) {
    reasons.push(`Destination (${state.destCountry}) is on the high-risk country list`);
    priority = Math.max(priority, 1);
    signalCount++;
  }

  // Trade value > $500k → Priority+
  const estValue =
    state.tradeValueUsd ||
    (state.targetPrice && state.quantity ? parseFloat(state.targetPrice) * parseFloat(state.quantity) : 0);
  if (estValue >= HIGH_VALUE_THRESHOLD_USD) {
    reasons.push(`Trade value ≥ $${HIGH_VALUE_THRESHOLD_USD.toLocaleString()} (high-value)`);
    priority = Math.max(priority, 1);
    signalCount++;
  }

  // Critical delivery window → Critical+
  if (state.preferredDelivery) {
    const days = (new Date(state.preferredDelivery).getTime() - Date.now()) / 86_400_000;
    if (days <= 14 && days >= 0) {
      reasons.push("Delivery window is within 14 days (urgent)");
      priority = Math.max(priority, 2);
      signalCount++;
    }
  }

  // Explicit override → Critical
  if (state.tradeCriticality === "Critical" && state.criticalityAdjustmentReason) {
    // user's manual override is reflected in the suggestion baseline
  }

  const suggested: CriticalitySuggestion["suggested"] =
    priority === 2 ? "Critical" : priority === 1 ? "Priority" : "Routine";
  // Confidence: more consistent signals = higher confidence
  const confidence = Math.min(1.0, 0.5 + signalCount * 0.15);

  return { suggested, confidence, reasons: reasons.length ? reasons : ["No urgency signals detected — routine handling recommended."] };
}
