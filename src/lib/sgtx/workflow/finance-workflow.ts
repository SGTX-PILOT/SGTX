// @ts-nocheck
// =============================================================================
// SGTX v18 §10 — Formal Trade Finance Execution (Phase 4)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for Phase 4 formal financing:
// post-lock financing requests, financier RFQ + bidding, AI credit intelligence
// (advisory only — never the credit decision), co-financing, collateral,
// repayment, default, and release.
//
// Consumed by:
//   • /api/v1/workflow/finance        — public canonical mirror
//   • /api/sgtx/workflow/finance      — internal mirror
// =============================================================================

// ============ v18 §10.1 — Purpose & Design Philosophy ============

export const FINANCE_PRINCIPLES = [
  "Binding post-lock — Phase 4 occurs AFTER contract lock; the financing request is binding (unlike the non-binding CFR)",
  "Non-custodial (Pillar I) — SGTX never holds funds; banks execute the actual funds movement",
  "AI advisory only — AI credit intelligence is advisory (A1) or constraining (A2); the financier makes the credit decision",
  "Co-financing supported — multiple financiers can split a single financing request (Financier A: 60%, Financier B: 40%)",
  "Collateral tracking — pledged collateral is tracked separately from the financing agreement",
  "Repayment monitoring — repayment schedule tracked; missed payments trigger escalation (A3)",
  "Default + recovery — default follows a structured process; SGTX never repossesses (non-title-taking Pillar I)",
  "Regulatory reporting — financiers report to their regulators; SGTX provides the evidence package",
] as const;

// ============ v18 §10.2 — Critical Semantic Distinctions ============

export const FINANCE_SEMANTIC_DISTINCTIONS = [
  { concept: "Financing Request", definition: "Binding request created from contract data + CFR at lock (Phase B1 of §7)", visibility: "Borrower + financier" },
  { concept: "Financing Bid", definition: "Financier's bid with amount, APR, conditions", visibility: "Borrower" },
  { concept: "Financing Agreement", definition: "Executed agreement signed by borrower + financier (QES)", visibility: "Borrower + financier + SGTX (fee split)" },
  { concept: "AI Credit Intelligence", definition: "Advisory credit score (A1) + risk flags (A2) — never the credit decision", visibility: "Financier (advisory only)" },
  { concept: "Collateral", definition: "Pledged assets tracked separately from the financing agreement", visibility: "Borrower + financier" },
  { concept: "Co-Financing", definition: "Multiple financiers split a single request (annex A + annex B)", visibility: "Each financier sees only their annex" },
] as const;

// ============ v18 §10.6 — Financing Types (Configurable) ============

export const FINANCING_TYPES = [
  { code: "WORKING_CAPITAL", name: "Working Capital", description: "Short-term financing for trade operations" },
  { code: "LETTER_OF_CREDIT", name: "Letter of Credit (L/C)", description: "Bank-issued payment guarantee" },
  { code: "FACTORING", name: "Factoring", description: "Sale of accounts receivable to a financier" },
  { code: "FORFAITING", name: "Forfaiting", description: "Purchase of trade receivables at a discount" },
  { code: "SUPPLY_CHAIN_FINANCE", name: "Supply Chain Finance", description: "Financing for the supplier side" },
  { code: "EXPORT_CREDIT", name: "Export Credit", description: "Government-backed financing for exports" },
  { code: "BRIDGE_LOAN", name: "Bridge Loan", description: "Short-term bridge until longer-term financing" },
  { code: "INVENTORY_FINANCE", name: "Inventory Finance", description: "Financing secured against inventory" },
] as const;

// ============ v18 §10.7 — Financing Amount Control ============

export const FINANCING_AMOUNT_CONTROL = {
  principle: "The financing amount is bounded by the trade value + tolerance, never exceeding the locked contract value",
  err: "Execution Readiness Reference (ERR) — a pre-validated financing envelope that caps the amount the borrower can request",
  errComponents: ["Trade value (locked)", "Tolerance %", "Stage 1 fees", "Stage 2 fees", "Insurance + logistics if financed"],
  governorGate: "G1U28 — financing amount validated against ERR envelope",
} as const;

// ============ v18 §10.8-10.10 — AI Credit Intelligence (Advisory Only) ============

export const AI_CREDIT_INTELLIGENCE = {
  authority: "A1 advisory (Groq) + A2 constraining (HF local)",
  outputs: [
    "Credit score (0-100, advisory only)",
    "Risk flags (sanctions proximity, jurisdiction risk, commodity risk, counterparty trust gap)",
    "Recommended APR range (advisory)",
    "Recommended conditions precedent (advisory)",
    "Plain-language explanation (A1)",
  ],
  notTheCreditDecision: "The financier makes the credit decision. AI never approves or declines a financing request. AI outputs are advisory inputs to the financier's decision.",
  explainability: "Every AI output includes a plain-language explanation + the input features + the model version + the confidence score. The financier can audit any AI-influenced decision.",
  dataQualityScore: "AI outputs include a Data Quality Score (0-100) indicating the completeness + freshness of the input data. Low data quality triggers a manual review requirement.",
} as const;

// ============ v18 §10.12 — Financing RFQ ============

export const FINANCING_RFQ = {
  trigger: "Borrower initiates an RFQ after contract lock (Phase B1 of §7 auto-creates the formal request, OR borrower manually initiates)",
  broadcastRule: "RFQ is broadcast to selected financiers (from saved contacts only — non-marketplace)",
  rfqPayload: ["Borrower GTID", "Trade USTN", "Contract value + currency", "Commodity", "Tenor requested", "Collateral offered (if any)", "AI Credit Intelligence summary"],
  responseWindow: "Financiers respond within a configurable window (default 48 hours; max 7 days)",
  responses: ["Bid (amount + APR + conditions + QES signed)", "Decline (with reason)", "Request more info"],
} as const;

// ============ v18 §10.13 — Financier Preference Engine (Versioned) ============

export const FINANCIER_PREFERENCE_ENGINE = {
  purpose: "Borrower can pre-configure preferences: preferred financiers, max APR acceptable, max collateral %, mandatory conditions",
  versionedModel: "Preferences are versioned — each version preserves a timestamp; the version active at RFQ broadcast is used",
  matchingTransparency: "RFQ matching is transparent — the borrower sees which financiers received the RFQ + which responded + the bid details",
  nonMarketplaceRule: "The platform never recommends financiers marketplace-style. Borrower explicitly selects saved contacts.",
} as const;

// ============ v18 §10.15-10.20 — Bid Acceptance + Agreement ============

export const BID_ACCEPTANCE = {
  borrowerChoice: "Borrower accepts one bid OR constructs a co-financing package from multiple bids",
  coFinancing: "Multiple financiers split the request — each signs a separate annex (A, B, C, ...) to the master agreement",
  agreementFormation: "Master financing agreement + per-financier annexes, all QES-signed",
  governorGate: "G1U29 — financing agreement signed by all parties (QES verified)",
  loomAnchor: "Financing agreement is Loom-anchored with the contract + USTN",
} as const;

// ============ v18 §10.21-10.30 — Disbursement ============

export const DISBURSEMENT = {
  bankToBank: "Funds flow bank-to-bank under signed ISO 20022 mandates (G7: bank-authoritative settlement)",
  nonCustodial: "SGTX never holds funds — the bank confirms settlement to SGTX via webhook",
  confirmationProof: "Bank confirmation stored in bank_confirmation_proofs with the ISO 20022 message + signature",
  governorGate: "G1U30 — bank confirmation verified (Q27)",
  disbursementSchedule: "Single disbursement OR staged disbursement (e.g., 50% at lock, 30% at shipment, 20% at delivery)",
} as const;

// ============ v18 §10.31-10.40 — Repayment Monitoring ============

export const REPAYMENT_MONITORING = {
  schedule: "Repayment schedule tracked per financing agreement + annexes",
  smartInboxAlerts: [
    "7 days before repayment due (reminder)",
    "On due date (urgent)",
    "1 day after due date (overdue)",
    "7 days after due date (escalation A3)",
    "30 days after due date (default trigger)",
  ],
  missedPaymentEscalation: "Missed payments trigger A3 escalation (human review). The Governor may block further disbursements to the borrower.",
  earlyRepayment: "Borrower can prepay with optional prepayment fee per the agreement terms",
} as const;

// ============ v18 §10.41-10.50 — Collateral Management ============

export const COLLATERAL_MANAGEMENT = {
  pledge: "Borrower pledges collateral (goods, receivables, bank guarantee, etc.) at agreement signing",
  trackingTable: "collateral_pledges — separate from the financing agreement",
  valuation: "Collateral valued at pledge + revalued periodically (A2 advisory)",
  releaseConditions: "Collateral released when: (a) financing fully repaid, OR (b) substitute collateral provided, OR (c) financier agrees to release",
  releaseEvidence: "Collateral release stored in collateral_release_evidence with QES signatures",
  governorGate: "G1U31 — collateral release verified (all release conditions met)",
} as const;

// ============ v18 §10.61-10.66 — Default + Recovery ============

export const DEFAULT_RECOVERY = {
  defaultTrigger: "30 days past due on any repayment OR breach of conditions precedent",
  defaultProcess: [
    "1. Financier declares default (Loom-anchored)",
    "2. Governor verifies the default conditions are met",
    "3. Collateral liquidation per the agreement terms (financier-led, not SGTX)",
    "4. SGTX provides the evidence package for legal proceedings",
    "5. USTN status set to DISPUTED (§5.2)",
  ],
  nonCustodialRule: "SGTX never repossesses collateral (Pillar I — non-title-taking). The financier pursues recovery under their own legal framework.",
  sgtxRole: "SGTX provides evidence + audit trail; never enforcement",
} as const;

// ============ v18 §10.68-10.69 — Governor + Human-in-the-Loop (Financing) ============

export const FINANCE_GOVERNOR_GATES = [
  { gate: "G1U28", description: "Financing amount validated against ERR envelope" },
  { gate: "G1U29", description: "Financing agreement signed by all parties (QES)" },
  { gate: "G1U30", description: "Bank disbursement confirmed (G7: bank-authoritative)" },
  { gate: "G1U31", description: "Collateral release verified (all release conditions met)" },
  { gate: "G1U32", description: "Default declaration verified (30 days past due OR breach)" },
  { gate: "G1U33", description: "Financing closure — all repayments + collateral released" },
] as const;

// ============ v18 §10.70 — Co-Financing Database Design ============

export const CO_FINANCING_MODEL = {
  masterAgreement: "Financing agreement (master) — borrower + co-financing structure",
  annexes: "Per-financier annexes (A, B, C, ...) — each financier signs their annex with their portion + APR + conditions",
  visibility: "Each financier sees only their annex; the master agreement is visible to borrower + all co-financiers",
  proportionTracking: "Proportions tracked in financing_agreement_annexes table (annex_letter, financier_gtid, principal_usd, apr, conditions)",
  default_waterfall: "In default, financiers are paid in annex-letter order (A first, then B, etc.) unless the master agreement specifies otherwise",
} as const;

// ============ v18 §10.71 — Regulatory Reporting ============

export const REGULATORY_REPORTING = {
  financierReports: "Financiers report to their regulators per their jurisdiction (CBE for Egyptian banks, etc.)",
  sgtxEvidencePackage: "SGTX provides the evidence package: contract + financing agreement + disbursement proofs + repayment schedule + collateral tracking + Loom chain",
  reportTriggers: ["New financing agreement", "Disbursement", "Repayment overdue", "Default", "Collateral release", "Closure"],
  auditTrail: "All regulatory reports are Loom-anchored (G4) with the financier's QES",
} as const;

// ============ v18 §10.73 — AI Authority Summary (Phase 4) ============

export const PHASE_4_AI_AUTHORITY = [
  { agent: "A1 (Groq)", role: "Plain-language credit summaries + explanations; advisory APR ranges" },
  { agent: "A2 (HF local — Risk Radar)", role: "Risk flags (sanctions proximity, jurisdiction, commodity, counterparty trust gap)" },
  { agent: "A2 (Pricing Dynamics)", role: "Market-aware APR suggestions (anonymised, differentially private)" },
  { agent: "A4 (OPA + WasmEdge)", role: "Governor gates G1U28-G1U33 (financing amount, agreement, disbursement, collateral, default, closure)" },
] as const;

// ============ Convenience: full canonical Phase 4 payload ============

export function getFinanceWorkflowPayload() {
  return {
    principles: FINANCE_PRINCIPLES,
    semantic_distinctions: FINANCE_SEMANTIC_DISTINCTIONS,
    financing_types: FINANCING_TYPES,
    amount_control: FINANCING_AMOUNT_CONTROL,
    ai_credit_intelligence: AI_CREDIT_INTELLIGENCE,
    financing_rfq: FINANCING_RFQ,
    financier_preference_engine: FINANCIER_PREFERENCE_ENGINE,
    bid_acceptance: BID_ACCEPTANCE,
    disbursement: DISBURSEMENT,
    repayment_monitoring: REPAYMENT_MONITORING,
    collateral_management: COLLATERAL_MANAGEMENT,
    default_recovery: DEFAULT_RECOVERY,
    governor_gates: FINANCE_GOVERNOR_GATES,
    co_financing_model: CO_FINANCING_MODEL,
    regulatory_reporting: REGULATORY_REPORTING,
    ai_authority: PHASE_4_AI_AUTHORITY,
    counts: {
      principles: FINANCE_PRINCIPLES.length, // 8
      semantic_distinctions: FINANCE_SEMANTIC_DISTINCTIONS.length, // 6
      financing_types: FINANCING_TYPES.length, // 8
      amount_control_components: FINANCING_AMOUNT_CONTROL.errComponents.length, // 5
      ai_outputs: AI_CREDIT_INTELLIGENCE.outputs.length, // 5
      rfq_payload_fields: FINANCING_RFQ.rfqPayload.length, // 7
      repayment_alerts: REPAYMENT_MONITORING.smartInboxAlerts.length, // 5
      default_process_steps: DEFAULT_RECOVERY.defaultProcess.length, // 5
      governor_gates: FINANCE_GOVERNOR_GATES.length, // 6 (G1U28-G1U33)
      report_triggers: REGULATORY_REPORTING.reportTriggers.length, // 6
      ai_authority_entries: PHASE_4_AI_AUTHORITY.length, // 4
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
