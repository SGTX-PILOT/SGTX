// @ts-nocheck
// =============================================================================
// SGTX v18 §13 — Settlement & Payment Orchestration (Phase 6)
// SGTX v18 §14 — Post-Trade: Distressed Cargo, Disputes & Reconciliation (Phases 7-8)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for Phase 6 (settlement)
// + Phase 7 (distressed cargo) + Phase 8 (disputes & reconciliation).
//
// Consumed by:
//   • /api/v1/workflow/settlement       — public canonical mirror
//   • /api/sgtx/workflow/settlement     — internal mirror
// =============================================================================

// ============ v18 §13.1 — Phase 6 High-Level Workflow (7 stages) ============

export interface SettlementStage {
  stage: number;
  name: string;
  trigger: string;
  aiAuthority?: string;
  oneClickAction?: string;
}

export const SETTLEMENT_STAGES: SettlementStage[] = [
  {
    stage: 1,
    name: "Settlement Instruction Generation",
    trigger: "Delivery confirmation OR milestone trigger",
    aiAuthority: "A4 (Governor) signs instruction with Ed25519",
  },
  {
    stage: 2,
    name: "Bank Selection",
    trigger: "After Stage 1",
    aiAuthority: "A2 (LightGBM + Groq advisory) selects buyer's mandated bank per funding currency from bank capability registry",
  },
  {
    stage: 3,
    name: "Buyer Approval",
    trigger: "Smart Inbox item 'Approve settlement for USTN...'",
    aiAuthority: "Voice: 'Approve settlement for USTN SGTX-...'",
    oneClickAction: "Approve settlement (one click or voice); auto-approved if milestone-based pre-approval in force",
  },
  {
    stage: 4,
    name: "Bank Processing",
    trigger: "After Stage 3 approval",
    aiAuthority: "Bank Settlement Gateway monitors pain.002 acknowledgments, camt.054 notifications, SWIFT gpi UETR tracking",
  },
  {
    stage: 5,
    name: "Deferred Government Fee Payment Trigger",
    trigger: "CUSTOMS_IMPORT milestone",
    aiAuthority: "System auto-generates instruction + dispatches pain.001 (auto-charge) OR alerts payer via Smart Inbox",
  },
  {
    stage: 6,
    name: "Reconciliation Engine",
    trigger: "camt.054 / gpi confirmation received",
    aiAuthority: "A2 (HF Donut) extracts EndToEndId, amount, currency; matches against settlement legs; confidence ≥95% auto-reconciled, <95% Smart Inbox alert",
  },
  {
    stage: 7,
    name: "Monthly Reconciliation Statement",
    trigger: "Month end (one-click download)",
    aiAuthority: "Generated with Ed25519 signature + SHA-256 checksum",
    oneClickAction: "Download monthly statement",
  },
];

// ============ v18 §13.1.2 — Architectural Principles (Direct Bank Settlement) ============

export const DIRECT_BANK_SETTLEMENT_PRINCIPLES = [
  "Non-Custodial (Pillar I) — SGTX never holds funds; the bank executes the actual funds movement",
  "USTN Multi-Leg Settlement Manifest — every financial obligation of a trade bound to a single manifest",
  "ISO 20022 Native — pain.001 (credit transfer), pain.002 (status report), camt.054 (notification), camt.056 (investigation)",
  "SWIFT gpi UETR Tracking — Universal Endpoint Tracker for cross-border payments",
  "Bank-Authoritative Settlement (G7) — banks confirm settlement; SGTX orchestrates only",
  "Quotation Transparency — every fee is transparently priced; no hidden costs",
  "Reconciliation-First — auto-reconciliation at ≥95% confidence; manual review below",
  "Audit Trail — all settlement events Loom-anchored",
] as const;

// ============ v18 §13.1.3 — USTN Multi-Leg Settlement Manifest ============

export const USTN_MULTI_LEG_MANIFEST = {
  table: "ustn_settlement_manifests",
  fields: [
    "ustn — the canonical trade identifier",
    "manifest_id — UUID per manifest version",
    "buyer_gtid, seller_gtid — counterparty GTIDs",
    "buyer_bank_account (encrypted), seller_bank_account (encrypted) — bank account details",
    "legs — JSON array of settlement legs",
    "total_amount, currency — total manifest amount",
    "fee_lock_hash — hash of the locked FeeLock (G1U25)",
    "governor_signature — Ed25519 signature by the Governor",
    "loom_hash — Loom chain anchor",
    "status — DRAFT → SIGNED → SUBMITTED → PROCESSING → SETTLED → RECONCILED → CLOSED",
    "created_at, settled_at, reconciled_at, closed_at",
  ],
  legStructure: {
    leg_id: "UUID per leg",
    description: "Human-readable leg description",
    payer_gtid: "Who pays",
    payee_gtid: "Who receives (or GOV_FEES, BANK_FEE, etc.)",
    amount: "Decimal(18,2)",
    currency: "ISO 4217",
    iso_20022_endtoendid: "EndToEndId binding",
    trigger_milestone: "LOADED, DEPARTED, ARRIVED, CUSTOMS_IMPORT, DELIVERED, etc.",
    terms: "IMMEDIATE / CREDIT_30 / CREDIT_60 / CREDIT_90",
    status: "PENDING → INSTRUCTION_GENERATED → SUBMITTED → ACKNOWLEDGED → SETTLED → RECONCILED",
  },
} as const;

// ============ v18 §13.1.4 — ISO 20022 USTN Identifier Binding ============

export const ISO_20022_USTN_BINDING = {
  rule: "The USTN is embedded in the ISO 20022 EndToEndId field for every settlement instruction",
  format: "EndToEndId = USTN + leg_id (e.g., 'SGTX-EG-26-F3A-1-LEG-001')",
  reconciliationUse: "The USTN in EndToEndId allows the Reconciliation Engine to auto-match bank confirmations (camt.054) against the settlement manifest",
  bankVisibility: "Banks see the USTN in the payment narrative; this enables traceability across the bank's own systems",
  regulatorVisibility: "Regulators can trace the USTN across multiple banks + jurisdictions",
} as const;

// ============ v18 §13.2 — Settlement Instruction Lifecycle ============

export const SETTLEMENT_INSTRUCTION_LIFECYCLE = {
  generation: "Automatic at delivery confirmation OR milestone trigger",
  signing: "Governor signs with Ed25519 (G1U38)",
  submission: "Bank Settlement Gateway dispatches pain.001 to the buyer's mandated bank",
  acknowledgment: "Bank returns pain.002 (ACK/NACK)",
  processing: "Bank executes the multi-leg transfer",
  notification: "camt.054 notification received when funds settled",
  reconciliation: "Reconciliation Engine matches camt.054 against manifest legs",
  closure: "All legs RECONCILED → manifest CLOSED",
  versioning: "Each manifest version preserved; new version on any change (e.g., re-routing after a failed leg)",
} as const;

// ============ v18 §13.4 — Reconciliation Engine ============

export const RECONCILIATION_ENGINE = {
  trigger: "camt.054 / SWIFT gpi confirmation received",
  extraction: "A2 (HF Donut) extracts EndToEndId, amount, currency from the bank confirmation",
  matching: "Match against settlement manifest legs by EndToEndId + amount + currency",
  confidenceThresholds: {
    autoReconcile: "≥95% confidence",
    manualReview: "<95% confidence → Smart Inbox alert for compliance review",
  },
  conflictResolution: "If bank confirmation contradicts the manifest leg (amount mismatch), both are recorded; manual review by compliance + Governor decides whether to mark the leg as DISPUTED",
  governorGate: "G1U39 — settlement reconciliation verified",
} as const;

// ============ v18 §13.5 — Monthly Reconciliation Statement ============

export const MONTHLY_RECONCILIATION_STATEMENT = {
  trigger: "Month end (auto-generated; one-click download by tenant admin)",
  content: "All settled USTNs, amounts, dates, counterparties, ISO 20022 EndToEndIds, Loom anchors",
  signature: "Ed25519 signature by the Governor",
  checksum: "SHA-256 checksum of the statement content",
  auditUse: "Used by the tenant's finance team + external auditors for reconciliation + tax filing",
  regulatorUse: "Regulators can request the statement for compliance review",
} as const;

// ============ v18 §14.2 — Phase 7: Distressed Cargo ============

export const DISTRESSED_CARGO_PHASE_7 = {
  goal: "Recover value from cargo that cannot be delivered as contracted (e.g., perishable goods spoiling in transit, customs rejection, counterparty default)",
  proactiveAlerts: "A2 (HF ViT) demurrage + delay alerts BEFORE distress declaration (advisory only)",
  declarationTrigger: "Seller clicks 'Declare Distressed Cargo' (one click) in TCC",
  aiConditionAssessment: "A2 (HF ViT — Vision Transformer) analyzes cargo photos + temperature logs + customs status + market prices",
  dynamicPricingEngine: "A2 (XGBoost) computes dynamic AI price based on condition + market + urgency",
  triageDashboard: [
    { path: "Sell Quickly", mechanism: "Accelerated Outreach to saved contacts (non-marketplace — no public listing)" },
    { path: "Comply with Local Law", mechanism: "Jurisdiction Compliance Assistant (RIA-driven)" },
    { path: "File Insurance Claim", mechanism: "Evidence Package Compiler (26 categories)" },
  ],
  checkBuyersAdvisory: "A1 advisory — 'Check Buyers' suggests potential buyers from saved contacts (no notifications sent until seller explicitly chooses)",
  partialDistress: "Partial distress + USTN splitting → MicroUSTN for the distressed portion (preserves the original USTN audit chain)",
  microUSTN: "Format: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}-D{N} (e.g., SGTX-EG-26-F3A-1-D1 for first distressed split)",
  governorGate: "G1U40 — distressed cargo declaration validated",
  loomAnchor: "Distress declaration + AI assessment + triage path + outcome all Loom-anchored",
} as const;

// ============ v18 §14.3 — Phase 8: Disputes & Reconciliation ============

export const DISPUTES_PHASE_8 = {
  filing: "Any party can file a dispute (category, description, remedy sought)",
  categories: [
    "QUALITY — quality of goods not as contracted",
    "QUANTITY — quantity short or excess",
    "TIMING — delivery outside the agreed window",
    "PAYMENT — payment not received or wrong amount",
    "DOCUMENTATION — documents missing or incorrect",
    "CUSTOMS — customs clearance issues",
    "LOGISTICS — damage during transit",
    "INSURANCE — insurance claim disputes",
    "FINANCING — financing agreement disputes",
    "REGULATORY — regulatory compliance disputes",
  ],
  evidencePackage: "System compiles evidence package automatically (26 categories) + Loom-anchored",
  feeLockFreeze: "On dispute filing, FeeLock freezes (no further payments execute) until dispute resolved",
  mediationLog: "Both parties enter the Mediation Log — structured offers, counter-offers, evidence submissions",
  aiMediationAssist: "A1 advisory — suggests fair settlement ranges from anonymised historical disputes (non-binding)",
  escalationLadder: [
    "1. Direct negotiation (parties only)",
    "2. Mediation (A1 advisory)",
    "3. Arbitration (per contract's arbitration clause)",
    "4. Court (SGTX provides evidence package; never represents either party)",
  ],
  resolutionOutcomes: [
    "RESOLVED — parties agreed; frozen payments released",
    "WITHDRAWN — filing party withdrew",
    "ESCALATED — moved to next ladder rung",
    "COURT — escalated to court (SGTX provides evidence only)",
  ],
  governorGate: "G1U41 — dispute resolution validated",
  evidenceIntegrityRule: "Evidence is sealed at closure (Point 29); post-closure may add but never modify",
} as const;

// ============ v18 §14.5 — USTN Closure (earned, not forced) ============

export const USTN_CLOSURE = {
  principle: "Closure is earned, not forced (Constitutional Point 17)",
  sevenConditions: [
    "1. Settlement Confirmed — all manifest legs SETTLED + bank-confirmed",
    "2. Delivery Confirmed — buyer-confirmed receipt of goods",
    "3. Customs Closed — both export + import customs declarations closed",
    "4. Documents Archived — all 26 evidence categories sealed + archived",
    "5. Disputes Resolved — all disputes RESOLVED or WITHDRAWN",
    "6. Financial Exposure Cleared — all financing + guarantees + deferred payments settled",
    "7. Timeline Complete — 30-day post-settlement window elapsed with no incident",
  ],
  canClosePredicate: "Pure function evaluated by WasmEdge — returns true only when all 7 conditions met",
  closureEvent: "USTN status set to CLOSED + Loom-anchored + evidence package sealed (immutable)",
  postClosureRule: "Post-closure may ADD evidence (e.g., tax audit) but NEVER MODIFY existing evidence (Point 29)",
  governorGate: "G1U42 — USTN closure validated (all 7 conditions evaluated true)",
} as const;

// ============ Convenience: full canonical settlement + post-trade payload ============

export function getSettlementPostTradePayload() {
  return {
    settlement_stages: SETTLEMENT_STAGES,
    direct_bank_settlement_principles: DIRECT_BANK_SETTLEMENT_PRINCIPLES,
    ustn_multi_leg_manifest: USTN_MULTI_LEG_MANIFEST,
    iso_20022_ustn_binding: ISO_20022_USTN_BINDING,
    settlement_instruction_lifecycle: SETTLEMENT_INSTRUCTION_LIFECYCLE,
    reconciliation_engine: RECONCILIATION_ENGINE,
    monthly_reconciliation_statement: MONTHLY_RECONCILIATION_STATEMENT,
    distressed_cargo_phase_7: DISTRESSED_CARGO_PHASE_7,
    disputes_phase_8: DISPUTES_PHASE_8,
    ustn_closure: USTN_CLOSURE,
    counts: {
      settlement_stages: SETTLEMENT_STAGES.length, // 7
      direct_bank_principles: DIRECT_BANK_SETTLEMENT_PRINCIPLES.length, // 8
      manifest_fields: USTN_MULTI_LEG_MANIFEST.fields.length, // 11
      manifest_leg_fields: Object.keys(USTN_MULTI_LEG_MANIFEST.legStructure).length, // 9
      distressed_triage_paths: DISTRESSED_CARGO_PHASE_7.triageDashboard.length, // 3
      dispute_categories: DISPUTES_PHASE_8.categories.length, // 10
      escalation_ladder: DISPUTES_PHASE_8.escalationLadder.length, // 4
      resolution_outcomes: DISPUTES_PHASE_8.resolutionOutcomes.length, // 4
      closure_conditions: USTN_CLOSURE.sevenConditions.length, // 7
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
