// @ts-nocheck
// =============================================================================
// SGTX v18 §7 — Financing Pre-Clearance (Conditional Financing Reference — CFR)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the CFR two-phase financing
// model that eliminates "signed but unfundable" contracts:
//   • Phase A — Pre-Clearance (before contract lock) → non-binding CFR
//   • Phase B — Formal Execution (after contract lock) → binding agreement
//
// Consumed by:
//   • /api/v1/workflow/cfr               — public canonical mirror
//   • /api/sgtx/workflow/cfr             — internal mirror
//   • /api/sgtx/financing/cfr/*          — for CFR lifecycle endpoints
//   • Governor (§3.5)                    — verifies valid CFR exists at lock
// =============================================================================

// ============ v18 §7.1 — Two-Phase Financing Model ============

export interface FinancingPhase {
  phase: string;
  timing: string;
  output: string;
  nature: string;
}

export const FINANCING_PHASES: FinancingPhase[] = [
  {
    phase: "Phase A — Pre-Clearance",
    timing: "Before contract lock",
    output: "Conditional Financing Reference (CFR)",
    nature: "Non-binding, indicative",
  },
  {
    phase: "Phase B — Formal Execution",
    timing: "After contract lock",
    output: "Formal financing agreement",
    nature: "Binding, executed",
  },
];

// ============ v18 §7.2 — Critical Semantic Distinctions ============

export interface SemanticDistinction {
  concept: string;
  definition: string;
  visibility: string;
  phase: string;
}

export const SEMANTIC_DISTINCTIONS: SemanticDistinction[] = [
  {
    concept: "Financing declaration",
    definition:
      "Single-party boolean flag (buyer_financing_required / seller_financing_required)",
    visibility: "Declaring party only",
    phase: "Phase 1 / Phase 2",
  },
  {
    concept: "Trade Digest",
    definition:
      "Privacy-preserving description of the trade (masked parties)",
    visibility: "Selected financier only",
    phase: "Phase A",
  },
  {
    concept: "CFR (pre-clearance)",
    definition:
      "Non-binding, indicative financing reference with amount, APR, conditions, validity",
    visibility: "Borrower and issuing financier",
    phase: "Phase A",
  },
  {
    concept: "Formal financing request",
    definition:
      "Binding request created from contract data + CFR at lock (financing_requests)",
    visibility: "Borrower and financier (full visibility)",
    phase: "Phase B",
  },
  {
    concept: "Financing agreement / disbursement",
    definition:
      "Executed agreement; funds flow bank-to-bank under signed mandates",
    visibility: "Borrower, financier, SGTX (fee split)",
    phase: "Phase B",
  },
];

// ============ v18 §7.2 — Additional Distinctions ============

export const ADDITIONAL_DISTINCTIONS = [
  "Indicative vs. binding — the CFR's conditional_apr is subject to final due diligence; only the Phase B agreement is binding.",
  "Data-sovereignty vs. counterparty visibility — no shared, counterparty, or either-party financing flags exist anywhere in the request model; visibility begins only inside the CFR process.",
  "Pre-clearance validation vs. credit decision — the Governor verifies that a valid CFR exists at lock; it does not evaluate credit risk.",
] as const;

// ============ v18 §7.3 — Phase A: Pre-Clearance Steps (A1-A6) ============

export interface CfrStep {
  step: string;
  name: string;
  actor: string;
  action: string;
  output: string;
  governorGate?: string;
}

export const PHASE_A_STEPS: CfrStep[] = [
  {
    step: "A1",
    name: "Borrower Declares Financing Requirement",
    actor: "Borrower (Buyer or Seller)",
    action:
      "Sets buyer_financing_required=true (or seller_financing_required=true) during Phase 1 (Section 6) or Phase 2 (Section 8)",
    output: "Financing declaration flag (data-sovereign — not visible to counterparty)",
  },
  {
    step: "A2",
    name: "Borrower Selects Financier",
    actor: "Borrower",
    action:
      "Selects a financier (saved contact BANK or PFI) from saved contacts — no marketplace matching",
    output: "Selected financier GTID",
    governorGate: "G1U9 — financier must be KYB VERIFIED Tier 3 (BANK) or Tier 2 (PFI)",
  },
  {
    step: "A3",
    name: "System Compiles the Trade Digest (Privacy-Preserving)",
    actor: "SGTX system",
    action:
      "Compiles a privacy-preserving trade digest: commodity, quantity, origin, destination, incoterm, trade value range, tenor. Parties are MASKED — no GTIDs, no legal names.",
    output: "Trade Digest JSON (masked)",
  },
  {
    step: "A4",
    name: "Financier Reviews the Digest",
    actor: "Selected Financier",
    action:
      "Reviews the masked digest. Can request more info via secure channel (still masked). Decides whether to issue a CFR.",
    output: "Decision: issue CFR / decline / request more info",
  },
  {
    step: "A5",
    name: "Financier Issues the Conditional Financing Reference",
    actor: "Selected Financier",
    action:
      "Issues a CFR with: max_amount, conditional_apr, conditions_precedent[], expiry_date. Signed by the financier's QES.",
    output: "CFR record (cfr_id, max_amount, conditional_apr, conditions, expiry)",
    governorGate: "G1U10 — CFR signature verified (QES)",
  },
  {
    step: "A6",
    name: "CFR Validated Before Contract Lock",
    actor: "Governor (A4 — OPA + WasmEdge)",
    action:
      "At contract lock, the Governor verifies a valid CFR exists for the borrower's financing requirement. If CFR is expired, revoked, or missing, the lock is BLOCKED with CONDITIONAL verdict.",
    output: "ALLOW (CFR valid) / CONDITIONAL (CFR missing or expired)",
    governorGate: "G1U11 — CFR validated at contract lock",
  },
];

// ============ v18 §7.4 — Phase B: Formal Execution Steps (B1-B4) ============

export const PHASE_B_STEPS: CfrStep[] = [
  {
    step: "B1",
    name: "Automatic Formal Request Creation",
    actor: "SGTX system",
    action:
      "When the contract locks, the system automatically creates a formal financing request (financing_requests row) from the contract data + the CFR. The request now has FULL visibility (no masking).",
    output: "Formal financing request (financing_requests.id)",
    governorGate: "G1U12 — formal request auto-created at lock",
  },
  {
    step: "B2",
    name: "Financier Receives the Formal Request",
    actor: "Financier",
    action:
      "Financier sees the full trade details + borrower identity + CFR. Performs final due diligence. Decides: approve, decline, or request additional conditions.",
    output: "Decision: approve / decline / conditional approval",
  },
  {
    step: "B3",
    name: "Disbursement",
    actor: "Bank (non-custodial — SGTX orchestrates only)",
    action:
      "On approval, funds flow bank-to-bank under signed ISO 20022 mandates. SGTX never holds funds. The bank confirms settlement to SGTX via webhook.",
    output: "Bank confirmation (bank_confirmation_proofs)",
    governorGate: "G1U13 — bank confirmation verified (G7: bank-authoritative settlement)",
  },
  {
    step: "B4",
    name: "Repayment Monitoring",
    actor: "Financier + SGTX",
    action:
      "Repayment schedule tracked. Smart Inbox alerts the borrower of upcoming repayments. Missed payments trigger escalation (A3 → human review).",
    output: "Repayment schedule + alerts",
  },
];

// ============ v18 §7.5 — CFR Data Model ============

export const CFR_DATA_MODEL = {
  table: "conditional_financing_references",
  fields: [
    { name: "cfr_id", type: "UUID", description: "Unique CFR identifier (issued by financier)" },
    { name: "borrower_gtid", type: "TEXT", description: "The borrower (Buyer or Seller) GTID" },
    { name: "financier_gtid", type: "TEXT", description: "The issuing financier GTID" },
    { name: "trade_request_uuid", type: "UUID", description: "The associated trade request UUID" },
    { name: "max_amount", type: "DECIMAL(18,2)", description: "Maximum financing amount" },
    { name: "currency", type: "CHAR(3)", description: "ISO 4217 currency code" },
    { name: "conditional_apr", type: "DECIMAL(5,2)", description: "Indicative Annual Percentage Rate (subject to final DD)" },
    { name: "conditions_precedent", type: "JSONB", description: "Array of conditions that must be met" },
    { name: "expiry_date", type: "TIMESTAMPTZ", description: "CFR validity expiry (typically 30-90 days)" },
    { name: "financier_signature", type: "TEXT", description: "QES signature by the financier" },
    { name: "status", type: "TEXT", description: "PENDING / ISSUED / EXPIRED / REVOKED / CONVERTED" },
    { name: "converted_to_request_id", type: "UUID", description: "Set when the CFR is converted to a formal financing_request at lock (Phase B1)" },
    { name: "loom_hash", type: "TEXT", description: "Loom audit chain anchor" },
    { name: "created_at", type: "TIMESTAMPTZ", description: "CFR creation timestamp" },
  ],
  statuses: ["PENDING", "ISSUED", "EXPIRED", "REVOKED", "CONVERTED"],
} as const;

// ============ v18 §7.6 — Buyer/Seller Financing Toggles & Data-Sovereign Flags ============

export const FINANCING_TOGGLES = {
  buyerFinancingToggle: {
    field: "buyer_financing_required",
    type: "Boolean",
    default: false,
    setBy: "Buyer in Phase 1 (Section 6, Step 2 — Incoterm + Commercial Foundation)",
    visibility: "Buyer only — never visible to seller",
    triggersCfr: true,
  },
  sellerFinancingToggle: {
    field: "seller_financing_required",
    type: "Boolean",
    default: false,
    setBy: "Seller in Phase 2 (Section 8 — Seller Workflow)",
    visibility: "Seller only — never visible to buyer",
    triggersCfr: true,
  },
  dataSovereigntyRule:
    "No shared, counterparty, or either-party financing flags exist anywhere in the request model. Visibility begins only inside the CFR process (Phase A, Step A2 — borrower selects financier).",
  nonMarketplaceRule:
    "Financier selection is from saved contacts only. The platform never matches borrowers with financiers marketplace-style.",
} as const;

// ============ v18 §7.7 — API & Governor Gates for CFR ============

export const CFR_API_ENDPOINTS = [
  { method: "POST", path: "/v1/financing/cfr/request", description: "Borrower requests a CFR from a selected financier (Step A2-A3)" },
  { method: "GET", path: "/v1/financing/cfr/{cfr_id}", description: "Retrieve a CFR by ID (borrower or financier only)" },
  { method: "POST", path: "/v1/financing/cfr/{cfr_id}/issue", description: "Financier issues the CFR with amount, APR, conditions (Step A5)" },
  { method: "POST", path: "/v1/financing/cfr/{cfr_id}/revoke", description: "Financier revokes a CFR before expiry" },
  { method: "GET", path: "/v1/financing/cfr/by-trade/{trade_request_uuid}", description: "List CFRs for a trade request (borrower or financier only)" },
  { method: "POST", path: "/v1/financing/request", description: "Phase B1 — system auto-creates formal financing request at contract lock" },
  { method: "GET", path: "/v1/financing/request/{request_id}", description: "Retrieve a formal financing request (borrower + financier only)" },
  { method: "POST", path: "/v1/financing/request/{request_id}/approve", description: "Financier approves the formal request (Step B2)" },
  { method: "POST", path: "/v1/financing/request/{request_id}/decline", description: "Financier declines the formal request" },
] as const;

export const CFR_GOVERNOR_GATES = [
  { gate: "G1U9", description: "Financier must be KYB VERIFIED Tier 3 (BANK) or Tier 2 (PFI)" },
  { gate: "G1U10", description: "CFR signature verified (QES by financier)" },
  { gate: "G1U11", description: "CFR validated at contract lock (not expired, not revoked, covers the trade value)" },
  { gate: "G1U12", description: "Formal financing request auto-created at lock" },
  { gate: "G1U13", description: "Bank confirmation verified at disbursement (G7: bank-authoritative settlement)" },
] as const;

// ============ Convenience: full canonical CFR payload ============

export function getCfrPayload() {
  return {
    financing_phases: FINANCING_PHASES,
    semantic_distinctions: SEMANTIC_DISTINCTIONS,
    additional_distinctions: ADDITIONAL_DISTINCTIONS,
    phase_a_steps: PHASE_A_STEPS,
    phase_b_steps: PHASE_B_STEPS,
    cfr_data_model: CFR_DATA_MODEL,
    financing_toggles: FINANCING_TOGGLES,
    api_endpoints: CFR_API_ENDPOINTS,
    governor_gates: CFR_GOVERNOR_GATES,
    counts: {
      financing_phases: FINANCING_PHASES.length, // 2
      semantic_distinctions: SEMANTIC_DISTINCTIONS.length, // 5
      additional_distinctions: ADDITIONAL_DISTINCTIONS.length, // 3
      phase_a_steps: PHASE_A_STEPS.length, // 6
      phase_b_steps: PHASE_B_STEPS.length, // 4
      cfr_data_model_fields: CFR_DATA_MODEL.fields.length, // 13
      cfr_statuses: CFR_DATA_MODEL.statuses.length, // 5
      financing_toggles: Object.keys(FINANCING_TOGGLES).filter(k => k !== "dataSovereigntyRule" && k !== "nonMarketplaceRule").length, // 2
      api_endpoints: CFR_API_ENDPOINTS.length, // 9
      governor_gates: CFR_GOVERNOR_GATES.length, // 5
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
