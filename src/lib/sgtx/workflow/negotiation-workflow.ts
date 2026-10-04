// @ts-nocheck
// =============================================================================
// SGTX v18 §9 — Negotiation, Contracting, Fees, Signing & Lock (Phase 3)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the Phase 3 master flow:
// 12 stages (A-L) from receive proposal to canonical handoff, plus the
// negotiation center, versioned model, contract generation (2 paths), fee
// lock, USTN generation, and CFR gate.
//
// Consumed by:
//   • /api/v1/workflow/negotiation   — public canonical mirror
//   • /api/sgtx/workflow/negotiation — internal mirror
//   • /api/sgtx/negotiation/*        — for negotiation endpoints
//   • Governor (§3.5)                — for final lock preconditions
// =============================================================================

// ============ v18 §9.2 — Master Flow (12 stages A-L) ============

export interface MasterFlowStage {
  stage: string;
  name: string;
  description: string;
}

export const MASTER_FLOW_STAGES: MasterFlowStage[] = [
  { stage: "A", name: "Receive Proposal", description: "Buyer/seller receives quote, counteroffer, amendment, clarification request, or schedule proposal" },
  { stage: "B", name: "Understand", description: "Show the prior version, current version, proposed version, differences, and financial, operational, document, and timing impact" },
  { stage: "C", name: "Negotiate", description: "Accept, Counter, Reject, Partial Accept, Amend, Request Information, Request Extension" },
  { stage: "D", name: "Resolve", description: "Continue until every material commercial term reaches agreed state" },
  { stage: "E", name: "Mutual Confirmation", description: "Both parties explicitly confirm the final commercial package" },
  { stage: "F", name: "Contract Formation", description: "Generate or process contract and required addenda" },
  { stage: "G", name: "Contract Validation", description: "Validate consistency across negotiated terms + contract + addenda + packing + logistics + documents + settlement" },
  { stage: "H", name: "Fee / Lock Conditions", description: "Verify all applicable SGTX fee and lock prerequisites" },
  { stage: "I", name: "Signing", description: "Collect required authorised signatures" },
  { stage: "J", name: "Lock", description: "Only when all applicable prerequisites are satisfied: lock contract/shipment" },
  { stage: "K", name: "USTN Generation", description: "Generate the appropriate USTN only at the authoritative lock point" },
  { stage: "L", name: "Canonical Handoff", description: "Propagate the locked transaction into downstream workflows" },
];

// ============ v18 §9.3-9.10 — Negotiation Center Components ============

export const NEGOTIATION_COMPONENTS = [
  { id: "9.3", name: "Negotiation Center", description: "Single UI surface for both parties to view and act on proposals" },
  { id: "9.4", name: "Versioned Negotiation Model", description: "Every counteroffer creates a new version; all versions preserved" },
  { id: "9.5", name: "Side-by-Side Diff", description: "Visual diff of prior vs current vs proposed terms" },
  { id: "9.6", name: "Impact Analysis", description: "Financial, operational, document, and timing impact shown per change" },
  { id: "9.7", name: "Partial Acceptance", description: "Single shipment: accept only part of quantity or terms where allowed" },
  { id: "9.8", name: "Counteroffer with Reason", description: "Counter with structured reason code + free-text explanation" },
  { id: "9.9", name: "Clarification Request (First-Class)", description: "Secure-channel question; does not stop the negotiation clock" },
  { id: "9.10", name: "Deadline Extension", description: "Either party can request extension; other party must accept" },
  { id: "9.11", name: "Quote Expiration (Strong Semantics)", description: "Expired quotes cannot be accepted; seller must issue new quote" },
  { id: "9.12", name: "Negotiation AI", description: "A1 advisory (suggestions, plain-language explanations) + A2 impact analysis" },
  { id: "9.13", name: "Negotiation Bot Transparency", description: "AI bot suggestions always marked as AI-generated; user decides" },
  { id: "9.14", name: "Final Commercial Term Sheet", description: "Consolidated term sheet before contract generation" },
  { id: "9.15", name: "Mutual Confirmation", description: "Both parties explicitly confirm; no silent lock" },
  { id: "9.16", name: "No Silent Changes After Mutual Confirmation", description: "Any change after mutual confirmation re-opens negotiation" },
];

// ============ v18 §9.17 — Contract Generation (Two Paths) ============

export const CONTRACT_GENERATION_PATHS = [
  {
    path: "A",
    name: "Clause Forge (A2, HF Local)",
    description: "AI generates the contract from the negotiated term sheet using clause templates. Includes the mandatory SGTX Witness Clause (non-removable).",
    aiAuthority: "A2 (HF local — Donut + clause library)",
    output: "Generated contract HTML + PDF + JSON",
    governorGate: "G1U20 — Clause Forge output validated",
  },
  {
    path: "B",
    name: "Upload Own Contract",
    description: "Parties upload their own contract PDF. The mandatory SGTX Witness Clause is appended (non-removable). Contract is parsed (A2 Donut) and the negotiated terms are mapped to the contract sections.",
    aiAuthority: "A2 (HF local — Donut extraction + mapping)",
    output: "Uploaded contract + appended SGTX Witness Clause + term mapping",
    governorGate: "G1U21 — uploaded contract + appended clause validated",
  },
];

// ============ v18 §9.17.2 — SGTX Witness Clause (Mandatory, Non-Removable) ============

export const SGTX_WITNESS_CLAUSE = {
  mandatory: true,
  removable: false,
  content:
    "SGTX Witness Clause: This contract is executed under the SGTX Sovereign Governed Trade Execution infrastructure. All payments, document authenticity, and milestone confirmations are governed by the SGTX Constitution (Layer 0). The USTN issued at lock is the canonical namespace for this trade. Disputes are resolved per the SGTX dispute resolution process (Section 14). The Governor's verdicts are binding.",
  signature: "Signed by the SGTX Platform Governance Authority (QES).",
} as const;

// ============ v18 §9.27 — Canonical Fee Basis ============

export const CANONICAL_FEE_BASIS = {
  description:
    "The SGTX platform fee is engine-determined, calculated on the Canonical Fee Basis defined in §9.27. The Dynamic Fee Engine computes the fee based on: trade value, commodity type, criticality classification, Incoterm, transport mode, jurisdiction, and counterparty trust scores.",
  components: [
    "Base fee (percentage of trade value)",
    "Commodity adjustment (per HS code risk profile)",
    "Criticality adjustment (Routine/Priority/Critical)",
    "Incoterm adjustment (CIF/CIP carry higher fee due to insurance handling)",
    "Transport mode adjustment (ocean baseline; air +; RoRo -)",
    "Jurisdiction adjustment (sanctions-adjacent jurisdictions +)",
    "Trust score adjustment (high-trust counterparties -)",
  ],
  feeLock: "Fees are locked at FeeLock (Stage 1) — instruction-only, never custodial (Pillar I).",
  paymentTiming: "Stage 1 fees due before contract lock; Stage 2 fees due at settlement.",
} as const;

// ============ v18 §9.36 — Final Lock Precondition Engine ============

export const FINAL_LOCK_PRECONDITIONS = [
  { id: "lock.1", name: "Mutual Confirmation", description: "Both parties explicitly confirmed the final commercial package", governorGate: "G1U22" },
  { id: "lock.2", name: "Contract Signed", description: "Contract signed by both parties (QES) + SGTX Witness Clause appended", governorGate: "G1U23" },
  { id: "lock.3", name: "Contract Validated", description: "Contract consistency across negotiated terms + addenda + packing + logistics + documents + settlement", governorGate: "G1U24" },
  { id: "lock.4", name: "CFR Validated", description: "If buyer or seller financing required: valid CFR exists (Phase A of §7)", governorGate: "G1U11 (CFR)" },
  { id: "lock.5", name: "Fee Precondition", description: "Stage 1 SGTX fee payment instruction received (FeeLock ACTIVE)", governorGate: "G1U25" },
  { id: "lock.6", name: "Sanctions Cleared", description: "Both counterparty GTIDs sanctions-cleared at lock time", governorGate: "G1U26" },
  { id: "lock.7", name: "Regulatory Pre-Clearance", description: "RIA compliance check passed for both export and import jurisdictions", governorGate: "G1U27" },
];

// ============ v18 §9.37 — Lock Decision Panel ============

export const LOCK_DECISION_PANEL = {
  purpose: "If any lock precondition fails, the Governor returns CONDITIONAL with a Decision Panel listing the failed preconditions + remediation actions.",
  uiDisplay: "Decision Panel shows each failed precondition + one-click 'Fix Now' button routing to the relevant workflow step.",
  auditLog: "All lock attempts (success + failure) are Loom-anchored.",
} as const;

// ============ v18 §9.38 — Lock Must Be Atomic ============

export const LOCK_ATOMICITY = {
  rule: "Lock is atomic — either ALL preconditions pass and the contract/shipment locks, OR no state changes.",
  implementation: "Implemented as a single PostgreSQL transaction with SERIALIZABLE isolation level. If any precondition fails, the entire transaction rolls back.",
  ustnGeneration: "USTN is generated ONLY on successful lock — never on a failed lock attempt (prevents sequence gaps + replay attacks).",
} as const;

// ============ v18 §9.39 — USTN Generation at Lock ============

export const USTN_GENERATION_AT_LOCK = {
  timing: "USTN is generated ONLY at the authoritative lock point (Stage J → K)",
  format: "v18 §5.1 format: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}",
  atomicSequence: "Atomic BIGINT per (country, year, traderId) from ustn_counters table",
  masterObject: "USTN master object (§5.3) is built at lock: parties, commodity, shipment details, fee lock, contract hash, signatures, all references bound to the USTN",
  immutability: "Once generated, the USTN is immutable (§5.1.10) — it never changes even if the shipment is cancelled",
  loomAnchor: "USTN generation event is Loom-anchored (G4)",
  physicalEmbodiment: "USTN printed on B/L, embedded in e-Invoice XML, included in ACID filing, written on phytosanitary cert, used as CBE Instant Payment narrative",
} as const;

// ============ v18 §9.41 — Canonical Event Emission ============

export const CANONICAL_EVENT_EMISSION = {
  trigger: "At successful lock, the system emits canonical events to NATS JetStream:",
  events: [
    "contract.locked — contract UUID + USTN + parties",
    "feeling.locked — FeeLock ACTIVE at Stage 1",
    "ustn.generated — USTN + master object hash",
    "loom.anchored — hash chain entry for the lock",
    "cfr.converted — CFR (if any) converted to formal financing request (Phase B1)",
  ],
  consumers: ["Smart Inbox (priority 75 quote received by buyer)", "TCC (Trade Command Center updates)", "Operations portal", "Money portal"],
} as const;

// ============ v18 §9.42 — CFR Gate (Financing Pre-Clearance) ============

export const CFR_GATE_AT_LOCK = {
  rule: "If either party has financing_required=true, the CFR gate (G1U11) is MANDATORY at lock",
  failureBehavior: "If CFR is missing, expired, or revoked at lock → BLOCKED with CONDITIONAL verdict",
  successBehavior: "If CFR is valid → lock proceeds + CFR is auto-converted to a formal financing request (Phase B1)",
  auditLog: "CFR gate decision is Loom-anchored with the lock event",
} as const;

// ============ v18 §9.43 — Implementation Checklist ============

export const PHASE_3_CHECKLIST = [
  "Implement Negotiation Center UI with side-by-side diff",
  "Implement versioned negotiation model (all versions preserved)",
  "Implement impact analysis (financial + operational + document + timing)",
  "Implement partial acceptance (single shipment part-quantity)",
  "Implement counteroffer with reason code + free-text",
  "Implement clarification request (first-class, doesn't stop clock)",
  "Implement deadline extension (request + accept/reject)",
  "Implement quote expiration (strong semantics — no accept after expiry)",
  "Implement Clause Forge (A2 Donut + clause library) for Path A",
  "Implement upload + append for Path B",
  "Implement mandatory SGTX Witness Clause (non-removable)",
  "Implement Final Lock Precondition Engine (7 preconditions)",
  "Implement Lock Decision Panel (CONDITIONAL verdict + remediation)",
  "Implement atomic lock (PostgreSQL SERIALIZABLE)",
  "Implement USTN generation at lock (v18 format)",
  "Implement canonical event emission (5 events to NATS)",
  "Implement CFR gate at lock (G1U11)",
];

// ============ v18 §9.44 — AI Authority Summary (Phase 3) ============

export const PHASE_3_AI_AUTHORITY = [
  { agent: "A1 (Groq)", role: "Negotiation suggestions, plain-language explanations, impact summaries" },
  { agent: "A2 (HF local — Donut)", role: "Contract clause extraction + upload contract parsing" },
  { agent: "A2 (Risk Radar)", role: "Flags risky terms in counteroffers" },
  { agent: "A4 (OPA + WasmEdge)", role: "Final lock precondition validation (G1U22-G1U27)" },
];

// ============ Convenience: full canonical Phase 3 payload ============

export function getNegotiationWorkflowPayload() {
  return {
    master_flow_stages: MASTER_FLOW_STAGES,
    negotiation_components: NEGOTIATION_COMPONENTS,
    contract_generation_paths: CONTRACT_GENERATION_PATHS,
    sgtx_witness_clause: SGTX_WITNESS_CLAUSE,
    canonical_fee_basis: CANONICAL_FEE_BASIS,
    final_lock_preconditions: FINAL_LOCK_PRECONDITIONS,
    lock_decision_panel: LOCK_DECISION_PANEL,
    lock_atomicity: LOCK_ATOMICITY,
    ustn_generation_at_lock: USTN_GENERATION_AT_LOCK,
    canonical_event_emission: CANONICAL_EVENT_EMISSION,
    cfr_gate_at_lock: CFR_GATE_AT_LOCK,
    implementation_checklist: PHASE_3_CHECKLIST,
    ai_authority: PHASE_3_AI_AUTHORITY,
    counts: {
      master_flow_stages: MASTER_FLOW_STAGES.length, // 12 (A-L)
      negotiation_components: NEGOTIATION_COMPONENTS.length, // 14
      contract_generation_paths: CONTRACT_GENERATION_PATHS.length, // 2
      canonical_fee_components: CANONICAL_FEE_BASIS.components.length, // 7
      final_lock_preconditions: FINAL_LOCK_PRECONDITIONS.length, // 7
      canonical_events: CANONICAL_EVENT_EMISSION.events.length, // 5
      event_consumers: CANONICAL_EVENT_EMISSION.consumers.length, // 4
      checklist_items: PHASE_3_CHECKLIST.length, // 17
      ai_authority_entries: PHASE_3_AI_AUTHORITY.length, // 4
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
