// SGTX Governor Phase 1 Gates — Buyer Initiation (Blueprint §VII G1U1-G1U11)
// ---------------------------------------------------------------------------
// Each gate is an advisory function that takes the trade request input and
// returns { gateId, verdict, conditions }. The merged verdict is the strictest
// (DENY > CONDITIONAL > ALLOW). Gates are ADVISORY:
//   • ALLOW       — required data is present and consistent.
//   • CONDITIONAL — data missing or below confidence threshold; can proceed
//                   but tenant must resolve the listed conditions before
//                   contract lock / USTN mint.
//   • DENY        — hard violation (e.g. dual-use goods without an export
//                   license). Trade cannot proceed.
//
// validatePhase1Gates(input) runs all 11 gates and returns the merged verdict
// plus the full per-gate breakdown so the tenant decision panel (G1U11) can
// surface a single pane of glass.
//
// NON-MARKETPLACE: these gates never produce scores, rankings, or counterparty
// recommendations. They answer the binary "is this buyer-side initiation
// permitted?" question only.

// ============ Types ============

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  conditions: string[];
}

export interface Phase1GateInput {
  // G1U1 — mesh session
  meshSessionId?: string;
  meshSessionInitialized?: boolean;

  // G1U2 — intent classification
  intentConfidence?: number; // 0-1
  intentHumanConfirmed?: boolean;

  // G1U3 — spec extraction
  specExtraction?: { field: string; confidence: number }[];
  specCriticalFields?: string[]; // default = commodity, origin, destination, incoterm, value

  // G1U4 — HS classification + dual-use check
  hsCode?: string;
  hsConfidence?: number;
  dualUseCheck?: {
    complete: boolean;
    dualUse: boolean;
    licenseRequired: boolean;
    licensePresent?: boolean;
  };

  // G1U5 — jurisdiction prescreen
  jurisdictionPrescreen?: {
    verdict: "ALLOW" | "CONDITIONAL" | "DENY";
    resolved?: boolean; // true if CONDITIONAL conditions were already met
  };

  // G1U6 — Loom logging of agent invocations
  agentInvocations?: { logged: boolean; count?: number };

  // G1U7 — per-container data consistency
  containers?: PerContainerData[];

  // G1U8 — marketplace attribution
  marketplaceAttribution?: { applicable: boolean; recorded?: boolean };

  // G1U9 — container recommendation/override
  containerRecommendation?: {
    recommended: boolean;
    logged?: boolean;
    overridden?: boolean;
    overrideLogged?: boolean;
  };

  // G1U10 — multi-shipment validation
  multiShipment?: {
    isMulti: boolean;
    shipments?: any[];
    shipmentsValid?: boolean;
  };

  // G1U11 — governor decision explanation / tenant decision panel
  decisionPanel?: { generated: boolean };
}

export interface PerContainerData {
  containerId?: string;
  originPort?: string;
  destinationPort?: string;
  palletCount?: number;
  packaging?: string;
  grossWeightKg?: number;
  netWeightKg?: number;
  volumeCbm?: number;
}

export interface Phase1GateMerged {
  verdict: GateVerdict;
  conditions: string[];
  gates: GateResult[];
}

// ============ Constants ============

const INTENT_CONF_THRESHOLD = 0.85;
const SPEC_CONF_THRESHOLD = 0.80;
const HS_CONF_THRESHOLD = 0.80;
const DEFAULT_CRITICAL_FIELDS = [
  "commodity",
  "origin",
  "destination",
  "incoterm",
  "value",
];

// ============ Helpers ============

function allow(gateId: string): GateResult {
  return { gateId, verdict: "ALLOW", conditions: [] };
}

function conditional(gateId: string, ...conditions: string[]): GateResult {
  return { gateId, verdict: "CONDITIONAL", conditions: conditions.filter(Boolean) };
}

function deny(gateId: string, ...conditions: string[]): GateResult {
  return { gateId, verdict: "DENY", conditions: conditions.filter(Boolean) };
}

// ============ Gate implementations ============

// G1U1: Agent mesh session properly initialized
function g1u1_mesh_session(input: Phase1GateInput): GateResult {
  if (input.meshSessionInitialized === true && input.meshSessionId) {
    return allow("G1U1");
  }
  return conditional(
    "G1U1",
    input.meshSessionId
      ? `Mesh session ${input.meshSessionId} not fully initialized — complete mesh handshake before proceeding.`
      : "Agent mesh session not initialized — complete mesh handshake before proceeding.",
  );
}

// G1U2: Intent classification confidence >= 0.85 OR human confirmed
function g1u2_intent_classification(input: Phase1GateInput): GateResult {
  if (input.intentHumanConfirmed === true) {
    return allow("G1U2");
  }
  const conf = input.intentConfidence ?? 0;
  if (conf >= INTENT_CONF_THRESHOLD) {
    return allow("G1U2");
  }
  return conditional(
    "G1U2",
    `Intent classification confidence ${(conf * 100).toFixed(0)}% is below the 85% threshold — obtain human confirmation or re-run classification.`,
  );
}

// G1U3: Spec extraction confidence >= 0.80 per critical field
function g1u3_spec_extraction(input: Phase1GateInput): GateResult {
  const specs = input.specExtraction || [];
  if (specs.length === 0) {
    return conditional("G1U3", "No spec extraction data provided — run spec extractor before proceeding.");
  }
  const criticalFields = input.specCriticalFields || DEFAULT_CRITICAL_FIELDS;
  const lowConfidenceFields = specs.filter(
    (s) =>
      criticalFields.includes(s.field) &&
      (typeof s.confidence !== "number" || s.confidence < SPEC_CONF_THRESHOLD),
  );
  // Also flag critical fields that are entirely missing from the extraction.
  const presentFields = new Set(specs.map((s) => s.field));
  const missingFields = criticalFields.filter((f) => !presentFields.has(f));
  if (lowConfidenceFields.length === 0 && missingFields.length === 0) {
    return allow("G1U3");
  }
  const conditions: string[] = [];
  if (lowConfidenceFields.length > 0) {
    conditions.push(
      `Spec extraction confidence below 80% for critical field(s): ${lowConfidenceFields
        .map((s) => `${s.field} (${((s.confidence ?? 0) * 100).toFixed(0)}%)`)
        .join(", ")}.`,
    );
  }
  if (missingFields.length > 0) {
    conditions.push(
      `Critical spec field(s) missing from extraction: ${missingFields.join(", ")}.`,
    );
  }
  return conditional("G1U3", ...conditions);
}

// G1U4: HS classification + dual-use check complete (HARD DENY for dual-use without license)
function g1u4_hs_classification(input: Phase1GateInput): GateResult {
  const dc = input.dualUseCheck;
  if (!dc || dc.complete !== true) {
    return conditional(
      "G1U4",
      !input.hsCode
        ? "HS code not yet classified — run HS code detector before proceeding."
        : `HS code ${input.hsCode} present but dual-use check incomplete — run dual-use screening.`,
    );
  }
  if (
    (input.hsConfidence ?? 0) < HS_CONF_THRESHOLD &&
    input.hsConfidence !== undefined
  ) {
    return conditional(
      "G1U4",
      `HS classification confidence ${((input.hsConfidence ?? 0) * 100).toFixed(0)}% below 80% — obtain human review.`,
    );
  }
  // Hard DENY: dual-use goods flagged without the required export license.
  if (dc.dualUse === true && dc.licenseRequired === true && dc.licensePresent !== true) {
    return deny(
      "G1U4",
      `Dual-use goods detected (HS ${input.hsCode || "?"}) — export license required but not present. Trade cannot proceed.`,
    );
  }
  return allow("G1U4");
}

// G1U5: Jurisdiction prescreen ALLOW or CONDITIONAL resolved
function g1u5_jurisdiction_prescreen(input: Phase1GateInput): GateResult {
  const jp = input.jurisdictionPrescreen;
  if (!jp) {
    return conditional("G1U5", "Jurisdiction prescreen not yet run — execute prescreen before proceeding.");
  }
  if (jp.verdict === "DENY") {
    return deny("G1U5", "Jurisdiction prescreen returned DENY — a party jurisdiction is BLOCKED.");
  }
  if (jp.verdict === "CONDITIONAL" && jp.resolved !== true) {
    return conditional(
      "G1U5",
      "Jurisdiction prescreen returned CONDITIONAL — resolve jurisdiction conditions (enhanced due diligence / restricted corridors) before proceeding.",
    );
  }
  return allow("G1U5");
}

// G1U6: All agent invocations logged via Loom
function g1u6_agent_invocations_logged(input: Phase1GateInput): GateResult {
  const ai = input.agentInvocations;
  if (!ai) {
    return conditional("G1U6", "Agent invocation log not provided — confirm Loom logging is active.");
  }
  if (ai.logged !== true) {
    return conditional("G1U6", "Not all agent invocations were logged to the Loom chain — enable Loom audit before proceeding.");
  }
  return allow("G1U6");
}

// G1U7: PER-CONTAINER DATA CONSISTENCY
//   • port/destination consistency (each container has matching origin/destination ports
//     or, when omitted, the trade-level origin/destination applies)
//   • valid pallet data (non-negative integer)
//   • valid packaging (non-empty string)
//   • nonnegative/consistent container data (gross >= net, weights/volumes >= 0)
function g1u7_container_consistency(input: Phase1GateInput): GateResult {
  const containers = input.containers || [];
  if (containers.length === 0) {
    return conditional("G1U7", "No container data provided — at least one container must be specified.");
  }
  const problems: string[] = [];
  for (const c of containers) {
    const id = c.containerId || "(unidentified container)";
    if (c.palletCount != null && (!Number.isInteger(c.palletCount) || c.palletCount < 0)) {
      problems.push(`${id}: pallet count must be a non-negative integer (got ${c.palletCount}).`);
    }
    if (c.packaging != null && typeof c.packaging === "string" && c.packaging.trim() === "") {
      problems.push(`${id}: packaging type cannot be empty.`);
    }
    if (c.grossWeightKg != null && c.grossWeightKg < 0) {
      problems.push(`${id}: gross weight must be non-negative (got ${c.grossWeightKg} kg).`);
    }
    if (c.netWeightKg != null && c.netWeightKg < 0) {
      problems.push(`${id}: net weight must be non-negative (got ${c.netWeightKg} kg).`);
    }
    if (
      c.grossWeightKg != null &&
      c.netWeightKg != null &&
      c.grossWeightKg < c.netWeightKg
    ) {
      problems.push(`${id}: gross weight (${c.grossWeightKg} kg) less than net weight (${c.netWeightKg} kg) — inconsistent.`);
    }
    if (c.volumeCbm != null && c.volumeCbm < 0) {
      problems.push(`${id}: volume must be non-negative (got ${c.volumeCbm} cbm).`);
    }
    if (
      c.originPort &&
      c.destinationPort &&
      String(c.originPort).toUpperCase() === String(c.destinationPort).toUpperCase()
    ) {
      problems.push(`${id}: origin and destination ports are identical (${c.originPort}) — port/destination inconsistency.`);
    }
  }
  if (problems.length === 0) {
    return allow("G1U7");
  }
  // Container data problems are CONDITIONAL, not DENY — they are data-quality
  // issues that the tenant can fix before contract lock. Only G1U4 (dual-use
  // without license) is a hard DENY in Phase 1.
  return conditional("G1U7", ...problems);
}

// G1U8: Marketplace attribution recorded if applicable (existing stub)
function g1u8_marketplace_attribution(input: Phase1GateInput): GateResult {
  const ma = input.marketplaceAttribution;
  if (!ma || ma.applicable !== true) {
    return allow("G1U8");
  }
  if (ma.recorded !== true) {
    return conditional(
      "G1U8",
      "Trade originated from marketplace lead — record PartnerLeadAttribution before proceeding.",
    );
  }
  return allow("G1U8");
}

// G1U9: Container recommendation/override logged
function g1u9_container_recommendation(input: Phase1GateInput): GateResult {
  const cr = input.containerRecommendation;
  if (!cr) {
    return conditional("G1U9", "Container recommendation not yet generated — run container advisor before proceeding.");
  }
  if (cr.recommended !== true) {
    return allow("G1U9"); // no recommendation needed
  }
  if (cr.overridden === true && cr.overrideLogged !== true) {
    return conditional(
      "G1U9",
      "Container recommendation was overridden — log the override rationale to the Loom chain.",
    );
  }
  if (cr.logged !== true) {
    return conditional("G1U9", "Container recommendation has not been logged — append to Loom chain before proceeding.");
  }
  return allow("G1U9");
}

// G1U10: Multi-shipment validation
function g1u10_multi_shipment(input: Phase1GateInput): GateResult {
  const ms = input.multiShipment;
  if (!ms || ms.isMulti !== true) {
    return allow("G1U10"); // single-shipment — no multi-shipment validation needed
  }
  if (!ms.shipments || ms.shipments.length < 2) {
    return conditional(
      "G1U10",
      "Multi-shipment trade declared but fewer than 2 shipments provided — define shipment schedule.",
    );
  }
  if (ms.shipmentsValid !== true) {
    return conditional(
      "G1U10",
      "Multi-shipment schedule not validated — confirm each shipment has USTN, FeeLock, and valid departure/arrival windows.",
    );
  }
  return allow("G1U10");
}

// G1U11: Governor decision explanation / tenant decision panel
function g1u11_decision_panel(input: Phase1GateInput): GateResult {
  const dp = input.decisionPanel;
  if (!dp || dp.generated !== true) {
    return conditional(
      "G1U11",
      "Governor decision explanation has not been generated — produce tenant decision panel before proceeding.",
    );
  }
  return allow("G1U11");
}

// ============ Merger ============

const VERDICT_RANK: Record<GateVerdict, number> = { ALLOW: 0, CONDITIONAL: 1, DENY: 2 };

/**
 * Merge per-gate verdicts into a single verdict. Strictest wins.
 * Conditions from every non-ALLOW gate are accumulated (in gate order).
 */
export function mergeGateVerdicts(gates: GateResult[]): Phase1GateMerged {
  let merged: GateVerdict = "ALLOW";
  const conditions: string[] = [];
  for (const g of gates) {
    if (VERDICT_RANK[g.verdict] > VERDICT_RANK[merged]) {
      merged = g.verdict;
    }
    if (g.verdict !== "ALLOW") {
      conditions.push(...g.conditions);
    }
  }
  return { verdict: merged, conditions, gates };
}

// ============ Public entry: validatePhase1Gates ============

/**
 * Run all 11 Phase 1 gates (G1U1-G1U11) against the buyer-side trade request
 * input and return the merged verdict. Non-blocking: gates never throw — they
 * degrade gracefully to CONDITIONAL with descriptive reasons.
 */
export function validatePhase1Gates(input: Phase1GateInput): Phase1GateMerged {
  const gates: GateResult[] = [
    g1u1_mesh_session(input),
    g1u2_intent_classification(input),
    g1u3_spec_extraction(input),
    g1u4_hs_classification(input),
    g1u5_jurisdiction_prescreen(input),
    g1u6_agent_invocations_logged(input),
    g1u7_container_consistency(input),
    g1u8_marketplace_attribution(input),
    g1u9_container_recommendation(input),
    g1u10_multi_shipment(input),
    g1u11_decision_panel(input),
  ];
  return mergeGateVerdicts(gates);
}
