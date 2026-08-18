// SGTX Governor Phase 2 Gates — Seller Quote Generation (Blueprint §VIII G2U17-G2U21)
// ---------------------------------------------------------------------------
// Each gate is an advisory function that takes the seller-side quote input and
// returns { gateId, verdict, conditions }. The merged verdict is the strictest
// (DENY > CONDITIONAL > ALLOW). Phase 2 gates are ADVISORY:
//   • ALLOW       — required seller-side data is present and consistent.
//   • CONDITIONAL — missing data or unpriced mandatory service line; seller
//                   can proceed to draft but must resolve before quote submit.
//   • DENY        — hard violation (e.g. provider fails eligibility).
//
// Plus namespaced sourcing sub-gates (G2-SRC-01..G2-SRC-03) which validate
// provider eligibility before a logistics quote can be submitted. These
// sub-gates feed G2U18's mandatory-cost coverage check.
//
// validatePhase2Gates(input) runs all gates and returns the merged verdict
// plus the full per-gate breakdown.
//
// NON-MARKETPLACE: these gates never produce provider rankings, scores, or
// alternative-counterparty recommendations. They answer the binary "is this
// seller-side quote permitted?" question only.

import {
  getIncotermResponsibility,
  validateIncotermConsistency,
} from "@/lib/sgtx/incoterms/responsibility-engine";

// ============ Types (re-use Phase 1 verdict types) ============

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  conditions: string[];
}

export interface ProviderEligibilityInput {
  providerGtid?: string;
  /** Country code where the provider is licensed to operate. */
  licensedJurisdiction?: string;
  /** Country code of the corridor the quote serves. */
  corridorJurisdiction?: string;
  /** Provider's active credential set (e.g. CBE, Nafeza, CargoX, IATA certs). */
  credentials?: { type: string; valid: boolean; expiresAt?: string }[];
  /** Active sanctions screening result for the provider. */
  sanctionsCheck?: { screened: boolean; hit: boolean };
  /** Provider's stated capacity for the requested service (TEU, slots, kg). */
  capacity?: { available: number; required: number; unit?: string };
}

export interface Phase2GateInput {
  // G2U17 — loading origin
  loadingOrigin?: {
    port?: string;
    facility?: string;
    readyDate?: string;
    cutoffDate?: string;
  };

  // G2U18 — mandatory logistics costs (per Incoterm)
  incoterm?: string;
  logisticsCosts?: any[]; // list of logistics cost / quote entries
  /** When true, an empty logisticsCosts list is tolerated (e.g. EXW seller-side). */
  logisticsCostsOptional?: boolean;

  // G2U19 — alternative delivery port
  alternativePort?: {
    declared: boolean;
    primaryPort?: string;
    fallbackPort?: string;
    fallbackReason?: string;
  };

  // G2U20 — multi-shipment schedule
  multiShipment?: {
    isMulti: boolean;
    shipments?: { seq?: number; departure?: string; arrival?: string }[];
    scheduleValid?: boolean;
  };

  // G2U21 — price visibility
  priceVisibility?: {
    visibleToBuyer: boolean;
    lineItemsBreakdown: boolean; // are line items broken down for the buyer?
    surchargesDisclosed: boolean; // are surcharges disclosed?
  };

  // G2-SRC-01..03 — provider eligibility (namespaced sourcing sub-gates)
  providers?: ProviderEligibilityInput[];
}

export interface Phase2GateMerged {
  verdict: GateVerdict;
  conditions: string[];
  gates: GateResult[];
}

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

// ============ Phase 2 main gates ============

// G2U17: Loading origin
function g2u17_loading_origin(input: Phase2GateInput): GateResult {
  const lo = input.loadingOrigin;
  if (!lo) {
    return conditional("G2U17", "Loading origin not specified — provide port/facility + ready date before quote submit.");
  }
  const problems: string[] = [];
  if (!lo.port && !lo.facility) {
    problems.push("Loading origin requires at least a port or facility identifier.");
  }
  if (!lo.readyDate) {
    problems.push("Loading origin requires a cargo-ready date.");
  }
  if (lo.readyDate && lo.cutoffDate) {
    // cutoff (vessel cut) must be on or after ready date — otherwise the seller
    // can't physically deliver to the carrier in time.
    if (new Date(lo.readyDate) > new Date(lo.cutoffDate)) {
      problems.push(`Cargo-ready date ${lo.readyDate} is after the carrier cutoff ${lo.cutoffDate} — loading origin schedule infeasible.`);
    }
  }
  if (problems.length === 0) return allow("G2U17");
  return conditional("G2U17", ...problems);
}

// G2U18: Mandatory logistics costs (per Incoterm Responsibility Engine)
function g2u18_mandatory_logistics_costs(input: Phase2GateInput): GateResult {
  // When no incoterm is set, we can't yet validate mandatory coverage.
  if (!input.incoterm) {
    return conditional("G2U18", "Incoterm not yet selected — mandatory logistics cost coverage cannot be validated.");
  }
  // EXW seller-side: seller has no mandatory transport services.
  // (The Incoterm engine already returns [] for EXW seller-side mandatory
  // services with payer=SELLER; but EXW *does* still list buyer-paid mandatory
  // services, which we don't expect the seller to price.)
  let sellerMandatory: string[];
  try {
    const r = getIncotermResponsibility(input.incoterm);
    sellerMandatory = r.mandatoryServices.filter((s) => s.payer === "SELLER").map((s) => s.service);
  } catch {
    // Unknown incoterm — fall back to validating nothing (treat as CONDITIONAL upstream).
    return conditional("G2U18", `Unknown incoterm "${input.incoterm}" — cannot validate mandatory logistics cost coverage.`);
  }
  if (sellerMandatory.length === 0) {
    return allow("G2U18"); // no seller-side mandatory services for this incoterm
  }
  if ((!input.logisticsCosts || input.logisticsCosts.length === 0) && !input.logisticsCostsOptional) {
    return conditional(
      "G2U18",
      `No logistics cost lines provided — seller must price mandatory service(s) for ${input.incoterm}: ${sellerMandatory.join(", ")}.`,
    );
  }
  const consistency = validateIncotermConsistency(input.incoterm, input.logisticsCosts || []);
  // Filter missing to seller-side only.
  const missingSeller = consistency.missing.filter((m) => sellerMandatory.includes(m));
  if (missingSeller.length === 0) {
    return allow("G2U18");
  }
  return conditional(
    "G2U18",
    `Seller has not priced mandatory service(s) for ${input.incoterm}: ${missingSeller.join(", ")}.`,
  );
}

// G2U19: Alternative delivery port
function g2u19_alternative_port(input: Phase2GateInput): GateResult {
  const ap = input.alternativePort;
  if (!ap || ap.declared !== true) {
    return allow("G2U19"); // no alternative port declared — nothing to validate
  }
  if (!ap.fallbackPort) {
    return conditional("G2U19", "Alternative delivery port declared but no fallback port specified.");
  }
  if (!ap.fallbackReason || ap.fallbackReason.trim() === "") {
    return conditional("G2U19", `Alternative delivery port ${ap.fallbackPort} declared without rationale — record the fallback reason.`);
  }
  if (ap.primaryPort && ap.fallbackPort && ap.primaryPort.toUpperCase() === ap.fallbackPort.toUpperCase()) {
    return conditional("G2U19", `Alternative delivery port ${ap.fallbackPort} is identical to the primary port — provide a distinct fallback.`);
  }
  return allow("G2U19");
}

// G2U20: Multi-shipment schedule
function g2u20_multi_shipment(input: Phase2GateInput): GateResult {
  const ms = input.multiShipment;
  if (!ms || ms.isMulti !== true) {
    return allow("G2U20"); // single-shipment — no schedule validation needed
  }
  if (!ms.shipments || ms.shipments.length < 2) {
    return conditional("G2U20", "Multi-shipment trade declared but fewer than 2 shipments scheduled — define shipment sequence.");
  }
  if (ms.scheduleValid !== true) {
    return conditional("G2U20", "Multi-shipment schedule not validated — confirm each shipment's departure/arrival windows and that they do not overlap infeasibly.");
  }
  // Lightweight date check: each shipment must have a departure.
  const missingDeparture = ms.shipments.filter((s) => !s.departure).length;
  if (missingDeparture > 0) {
    return conditional("G2U20", `${missingDeparture} shipment(s) missing a departure date — define full schedule.`);
  }
  return allow("G2U20");
}

// G2U21: Price visibility
function g2u21_price_visibility(input: Phase2GateInput): GateResult {
  const pv = input.priceVisibility;
  if (!pv) {
    return conditional("G2U21", "Price visibility configuration not provided — declare buyer visibility scope before quote submit.");
  }
  const problems: string[] = [];
  if (pv.visibleToBuyer !== true) {
    problems.push("Quote price must be visible to the buyer before submit.");
  }
  if (!pv.lineItemsBreakdown) {
    problems.push("Line-item breakdown must be visible to the buyer (no hidden cost lines).");
  }
  if (!pv.surchargesDisclosed) {
    problems.push("All surcharges (fuel, bunker, peak season, THC, etc.) must be disclosed to the buyer.");
  }
  if (problems.length === 0) return allow("G2U21");
  return conditional("G2U21", ...problems);
}

// ============ Sourcing sub-gates (G2-SRC-01..03) ============

// G2-SRC-01: Provider holds valid credentials in jurisdiction
function g2_src_01_credentials(providers: ProviderEligibilityInput[]): GateResult {
  if (!providers || providers.length === 0) {
    return conditional("G2-SRC-01", "No providers supplied — credential eligibility cannot be validated.");
  }
  const problems: string[] = [];
  for (const p of providers) {
    if (!p.providerGtid) {
      problems.push("Provider missing GTID — cannot validate credentials.");
      continue;
    }
    if (!p.credentials || p.credentials.length === 0) {
      problems.push(`Provider ${p.providerGtid}: no credentials on file for jurisdiction ${p.corridorJurisdiction || "?"}.`);
      continue;
    }
    const now = Date.now();
    const valid = p.credentials.filter((c) => c.valid && (!c.expiresAt || new Date(c.expiresAt).getTime() > now));
    if (valid.length === 0) {
      problems.push(`Provider ${p.providerGtid}: all credentials expired or invalid for jurisdiction ${p.corridorJurisdiction || "?"}.`);
    }
  }
  if (problems.length === 0) return allow("G2-SRC-01");
  return conditional("G2-SRC-01", ...problems);
}

// G2-SRC-02: Provider has no active sanctions
function g2_src_02_sanctions(providers: ProviderEligibilityInput[]): GateResult {
  if (!providers || providers.length === 0) {
    return conditional("G2-SRC-02", "No providers supplied — sanctions screening cannot be validated.");
  }
  const problems: string[] = [];
  for (const p of providers) {
    if (!p.providerGtid) continue;
    if (!p.sanctionsCheck || p.sanctionsCheck.screened !== true) {
      problems.push(`Provider ${p.providerGtid}: sanctions screening not yet performed — screen before quote submit.`);
      continue;
    }
    if (p.sanctionsCheck.hit === true) {
      // HARD DENY: sanctioned provider cannot be onboarded to a quote.
      return deny(`G2-SRC-02`, `Provider ${p.providerGtid}: sanctions hit detected — provider is ineligible for this trade.`);
    }
  }
  if (problems.length === 0) return allow("G2-SRC-02");
  return conditional("G2-SRC-02", ...problems);
}

// G2-SRC-03: Provider capacity available for service/corridor
function g2_src_03_capacity(providers: ProviderEligibilityInput[]): GateResult {
  if (!providers || providers.length === 0) {
    return conditional("G2-SRC-03", "No providers supplied — capacity cannot be validated.");
  }
  const problems: string[] = [];
  for (const p of providers) {
    if (!p.providerGtid) continue;
    if (!p.capacity) {
      problems.push(`Provider ${p.providerGtid}: capacity not declared.`);
      continue;
    }
    if (typeof p.capacity.available !== "number" || typeof p.capacity.required !== "number") {
      problems.push(`Provider ${p.providerGtid}: capacity figures must be numeric.`);
      continue;
    }
    if (p.capacity.available < p.capacity.required) {
      problems.push(
        `Provider ${p.providerGtid}: available capacity ${p.capacity.available} ${p.capacity.unit || ""} < required ${p.capacity.required} ${p.capacity.unit || ""}.`,
      );
    }
  }
  if (problems.length === 0) return allow("G2-SRC-03");
  return conditional("G2-SRC-03", ...problems);
}

// ============ Merger (re-exported from phase1 for symmetry) ============

const VERDICT_RANK: Record<GateVerdict, number> = { ALLOW: 0, CONDITIONAL: 1, DENY: 2 };

export function mergeGateVerdicts(gates: GateResult[]): Phase2GateMerged {
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

// ============ Public entry: validatePhase2Gates ============

/**
 * Run all Phase 2 gates (G2U17-G2U21) plus the sourcing sub-gates
 * (G2-SRC-01..G2-SRC-03) against the seller-side quote input and return the
 * merged verdict. Non-blocking: gates never throw — they degrade gracefully
 * to CONDITIONAL with descriptive reasons.
 */
export function validatePhase2Gates(input: Phase2GateInput): Phase2GateMerged {
  const providers = input.providers || [];
  const gates: GateResult[] = [
    g2u17_loading_origin(input),
    g2u18_mandatory_logistics_costs(input),
    g2u19_alternative_port(input),
    g2u20_multi_shipment(input),
    g2u21_price_visibility(input),
    g2_src_01_credentials(providers),
    g2_src_02_sanctions(providers),
    g2_src_03_capacity(providers),
  ];
  return mergeGateVerdicts(gates);
}
