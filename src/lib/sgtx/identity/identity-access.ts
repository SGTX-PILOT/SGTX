// @ts-nocheck
// =============================================================================
// SGTX v18 §4.4-4.12 — Identity & Access Architecture (consolidated)
// -----------------------------------------------------------------------------
// This module consolidates the canonical data for the remaining §4 subsections
// not covered by the dedicated modules (4.1 GTID, 4.2 KYB, 4.3 Onboarding):
//   • §4.4 Employees, Roles & Permissions
//   • §4.5 Data Scopes & Confidentiality
//   • §4.6 Dual-Mode Toggle (Buyer/Seller/DUAL)
//   • §4.7 Session & Device Security
//   • §4.8 Consent Management
//   • §4.9 Internal Organisation (Business Units, Departments, Cost Centres)
//   • §4.10 Tenant Lifecycle
//   • §4.11 Network Feature (Saved Contacts)
//   • §4.12 SGTX Trade Trust Passport™
//
// Consumed by:
//   • /api/v1/identity/access        — public canonical mirror
//   • /api/sgtx/identity/access      — internal mirror
// =============================================================================

// ============ v18 §4.4 — Employees, Roles & Permissions ============

export const EMPLOYEE_RECORD_FIELDS = [
  "id (UUID) — immutable technical identifier",
  "tenant_gtid — the tenant this employee belongs to",
  "full_name (English + optional Arabic)",
  "email (unique per tenant)",
  "phone (optional)",
  "role — OWNER | ADMIN | TRADER | COMPLIANCE | FINANCE | OPERATIONS | READONLY",
  "permissions — array of permission strings (e.g., 'trade.request.create')",
  "default_trader_mode — BUY | SELL | DUAL (for TRD tenants)",
  "active_trader_mode — current active mode (BUY or SELL after switch)",
  "allow_role_switching — boolean (can the employee switch roles?)",
  "data_scopes — array of scope IDs (§4.5)",
  "consent_settings — JSONB (§4.8)",
  "lifecycle_state — ACTIVE | SUSPENDED | REVOKED",
  "created_at, updated_at, last_login_at",
] as const;

export const PERMISSIONS = [
  // Trader (Buyer mode)
  "trade.request.create",
  "trade.request.edit",
  "quote.accept",
  "quote.reject",
  "quote.counter",
  "contract.sign.buyer",
  "financing.request",
  "payment.authorize",
  "delivery.confirm",
  // Trader (Seller mode)
  "seller_quote.submit",
  "seller_quote.revise",
  "exw.lock",
  "packing.lock",
  "logistics.addendum.sign",
  "contract.sign.seller",
  // LSP
  "lsp.rfq.respond",
  "lsp.dispatch",
  "lsp.delivery.confirm",
  // SHIP
  "ship.booking.confirm",
  "ship.ebl.issue",
  "ship.milestone.update",
  // LAB
  "lab.test.request",
  "lab.result.submit",
  "lab.certificate.issue",
  // QC
  "qc.inspection.schedule",
  "qc.report.submit",
  "qc.conditional_pass.issue",
  // CBR
  "cbr.declaration.submit",
  "cbr.certificate.issue",
  "cbr.physical_handling",
  // FIN
  "fin.cfr.issue",
  "fin.bid.submit",
  "fin.agreement.sign",
  "fin.repayment.monitor",
  // GOV
  "gov.trade.monitor",
  "gov.permit.issue",
  // ADM
  "admin.constitutional_policy.view",
  "admin.constitutional_policy.propose",
  "admin.governor.log.view",
  "admin.tenant.manage",
  "admin.special_rate.manage",
  "admin.customer_care.impersonate",
] as const;

export const ROLES = [
  { code: "OWNER", description: "Tenant owner — full permissions, multisig member for L0 changes", tier: 0 },
  { code: "ADMIN", description: "Tenant administrator — full permissions except multisig", tier: 1 },
  { code: "TRADER", description: "Trader — BUY/SELL/DUAL mode (per default_trader_mode)", tier: 2 },
  { code: "COMPLIANCE", description: "Compliance officer — KYB approval, sanctions review, evidence package", tier: 2 },
  { code: "FINANCE", description: "Finance officer — financing approval, settlement approval", tier: 2 },
  { code: "OPERATIONS", description: "Operations officer — logistics, customs, inspections", tier: 2 },
  { code: "READONLY", description: "Read-only — view-only access (auditors, observers)", tier: 3 },
] as const;

// ============ v18 §4.4.3 — Role Journey Maps (10 roles) ============

export const ROLE_JOURNEY_MAPS = [
  { role: "TRADER_BUYER", days: "22 days", steps: 8, summary: "Register → Create Request → Receive Quote → Sign Contract → Pay Fee → Track Shipment → Confirm Delivery → Approve Settlement" },
  { role: "TRADER_SELLER", days: "21 days", steps: 9, summary: "Register → Receive Request → Lock EXW → Submit Quote → Sign Contract → Pay Fee → Ack Release → Load Container → Transit → Receive Settlement" },
  { role: "LSP", days: "6 days", steps: 6, summary: "Register → Receive RFQ → Send Quote → Sign Addendum → Ack Release → Dispatch → Deliver → Confirm Milestone" },
  { role: "SHIP", days: "8 days", steps: 7, summary: "Register → Receive Booking → Send Quote → Confirm Booking → Issue eBL → Update Milestones → Confirm Arrival" },
  { role: "LAB", days: "5 days", steps: 5, summary: "Register → Receive Test Request → Sample Collection → Start Testing → Submit Results → Issue Certificate" },
  { role: "QC", days: "5 days", steps: 5, summary: "Register → Receive Inspection Request → Schedule → Field Inspection → Submit Report → Conditional Pass/Pass/Fail" },
  { role: "CBR", days: "7 days", steps: 6, summary: "Register → Receive Service Request → Submit Declaration → Track Clearance → Issue Certificates → Physical Handling → Storage" },
  { role: "FIN", days: "30+ days", steps: 6, summary: "Register → Receive RFQ → Submit Bid → Sign Agreement → Disburse → Monitor Repayment → Close" },
  { role: "GOV", days: "ongoing", steps: 4, summary: "Register → Live Trade Monitor → Multi-Agency Coordination → Permit Issuance → Compliance Reporting" },
  { role: "MP", days: "ongoing", steps: 3, summary: "Register → API Key Generation → Webhook Configuration → Revenue Share Tracking" },
] as const;

// ============ v18 §4.5 — Data Scopes & Confidentiality ============

export const DATA_SCOPES = [
  { id: "cost_hiding", name: "Cost-Component Hiding", description: "Warehouse and operations staff excluded from seeing cost components (seller cost breakdowns, margins)" },
  { id: "mode_scoping", name: "Mode Scoping", description: "allow_role_switching=false locks an employee to one side of the Trader Portal (BUY or SELL)" },
  { id: "business_unit_scoping", name: "Business-Unit Scoping", description: "Employees limited to their business unit's records (§4.9)" },
  { id: "field_level_confidentiality", name: "Field-Level Confidentiality", description: "Resolution + master-object responses filter fields by role (LSP sees only their services; buyer sees commercial terms but not seller's internal costs; financier sees financing-relevant package; gov sees only compliance documents)" },
  { id: "consent_gated_sharing", name: "Consent-Gated Sharing", description: "Trust components, verified identifiers, financing history, and dispute history require explicit consent from the data owner (§4.1.5.6 + §4.8)" },
] as const;

export const CONFIDENTIALITY_ENFORCEMENT = {
  apiLayer: "OPA policies enforce data scopes at the API layer (every data access evaluated by OPA)",
  dbLayer: "RLS (row-level security) enforces tenant isolation at the database layer",
  auditLog: "All scope changes are Governor-governed and Loom-logged (G4)",
  adminUi: "Tenant admin manages scopes in Company Admin → Data Scopes, including the 'Allow Role Switching' toggle (one click per employee)",
} as const;

// ============ v18 §4.6 — Dual-Mode Toggle (Buyer/Seller/DUAL) ============

export const DUAL_MODE_TOGGLE = {
  eligibility: "Only TRD (Trader) tenants with trader_mode = DUAL are eligible",
  jwtClaim: "active_trader_mode_context — carried in every session JWT (BUY or SELL)",
  switchEndpoint: "POST /v1/employee/switch-context — audited action (Activity log + simulated JWT)",
  rateLimit: "10 switches per 60 seconds per employee (§4.6.4)",
  opaPolicies: "OPA policies prevent cross-mode actions (BUY-mode employee cannot submit seller quotes, etc.)",
  uiBehavior: {
    inbox: "Smart Inbox filters by active mode (BUY-mode shows buyer inbox items only)",
    commandCenter: "Trade Command Center filters by active mode",
    workflows: "All workflows filter by active mode",
    dualView: "DUAL tenants see a combined view with an always-visible mode toggle",
  },
  voiceSupport: "Voice command 'Switch to BUY mode' / 'Switch to SELL mode' (Vosk + HF Mixtral intent extraction)",
  accessibility: "WCAG 2.2 AA — keyboard shortcut (Alt+M), screen reader announcements, 44px touch target",
} as const;

// ============ v18 §4.7 — Session & Device Security ============

export const SESSION_DEVICE_SECURITY = {
  deviceRegistry: {
    table: "devices (employee_gtid + device_fingerprint + platform + last_seen + trust_score)",
    fingerprintComponents: ["user_agent", "screen_resolution", "timezone", "language", "platform", "hardware_concurrency"],
    trustScoreFactors: ["known_device", "known_location", "recent_activity", "security_events"],
  },
  stepUpAuthentication: {
    triggers: ["sensitive action (e.g., contract.sign)", "new device", "new location", "high-value trade (>$100k)", "Governor CONDITIONAL verdict"],
    factors: [
      "Passkey (WebAuthn) — something you have",
      "Biometric verification — something you are",
      "SMS OTP — something you know (fallback only)",
      "Email OTP — fallback only",
    ],
    multisigRequirement: "Irreversible actions require 2-of-3 standard, 3-of-5 constitutional (§3.5.9)",
  },
  sessionRiskEngine: {
    factors: ["device_trust_score", "location_risk", "time_since_last_login", "failed_attempts", "behavioral_anomalies"],
    thresholds: { lowRisk: "≥80", mediumRisk: "50-79", highRisk: "<50" },
    highRiskActions: ["step-up required", "lock session", "alert security team"],
  },
  recoveryFlow: {
    lostPasskey: "Identity verification — notarised ID + employment proof + two existing employee sponsors → new passkey issued (Loom-anchored)",
    lostDevice: "Step-up auth from a known device + identity verification → revoke lost device",
  },
} as const;

// ============ v18 §4.8 — Consent Management ============

export const CONSENT_MANAGEMENT = {
  consentRecords: {
    table: "consent_records (tenant_gtid + purpose + granted_at + revoked_at + method + version)",
    immutable: true,
    versioned: true,
  },
  consentPurposes: [
    { code: "trust_components", description: "Share trust score components (compliance, documentation, logistics, payment, risk, timeline)", defaultState: "GRANTED" },
    { code: "verified_ids", description: "Share verified identifiers (LEI, DUNS, CUSTOMS_REG, CHAMBER_REG, VAT_REG)", defaultState: "REVOKED" },
    { code: "financing_history", description: "Share financing history (past agreements, repayment performance)", defaultState: "REVOKED" },
    { code: "dispute_history", description: "Share dispute history (categories, outcomes, resolution time)", defaultState: "REVOKED" },
    { code: "marketing_intelligence", description: "Contribute anonymised data to the market intelligence panel", defaultState: "REVOKED" },
    { code: "voice_stress", description: "Allow voice stress flag (on-device only, never stored)", defaultState: "REVOKED" },
  ],
  consentEnforcement: {
    apiLayer: "Every API response that includes consented fields is filtered by the consent_records table",
    opaPolicies: "OPA policy consent.check evaluates consent state for every data access",
    auditLog: "All consent grants + revocations Loom-anchored (G4)",
    uiManagement: "Company Admin → Privacy → manage consent per purpose (one-click toggle)",
  },
} as const;

// ============ v18 §4.9 — Internal Organisation ============

export const INTERNAL_ORGANISATION = {
  businessUnits: {
    table: "tenant_business_units (tenant_gtid + name + head_employee_gtid + cost_center_code)",
    purpose: "Group employees + trades by business unit for reporting + scoping",
    scopeUse: "Employees can be limited to their business unit's records (§4.5 data scope)",
  },
  departments: {
    table: "tenant_departments (business_unit_id + name + head_employee_gtid)",
    purpose: "Sub-group within a business unit (e.g., Import Department, Export Department)",
  },
  costCentres: {
    table: "tenant_cost_centers (code + name + business_unit_id + budget + spent)",
    purpose: "Track costs per cost centre for finance reporting",
  },
  approvalGroups: {
    table: "tenant_approval_groups (name + member_employee_gtids[] + approval_policy_id)",
    purpose: "Define groups for trade approval workflows (e.g., 'Trade Approval Group A' for trades > $100k)",
  },
  approvalPolicies: {
    table: "tenant_approval_policies (name + trigger_threshold + required_approvals + approver_group_id)",
    example: "Trade > $100k → 2-of-3 approvals from 'Trade Approval Group A'; Trade > $1M → 3-of-5 approvals from 'Executive Approval Group'",
  },
  authorityDomainSeparation: "Tenant approval (internal organisational) is separate from Platform Governance Authority (constitutional) — tenants cannot approve constitutional changes (§4.9.5)",
} as const;

// ============ v18 §4.10 — Tenant Lifecycle ============

export const TENANT_LIFECYCLE = {
  unifiedStateMachine: [
    { state: "REGISTERED", description: "Tenant created (post-onboarding Step 1)", next: ["KYB_PENDING", "SUSPENDED"] },
    { state: "KYB_PENDING", description: "KYB documents submitted, under review", next: ["VERIFIED", "MANUAL_REVIEW", "REJECTED", "SUSPENDED"] },
    { state: "MANUAL_REVIEW", description: "Confidence <85% or registry unavailable", next: ["VERIFIED", "REJECTED"] },
    { state: "VERIFIED", description: "KYB verified; tenant can create real trades", next: ["SUSPENDED", "ARCHIVED"] },
    { state: "SUSPENDED", description: "Sanctions hit OR compliance breach OR Governor decision", next: ["VERIFIED", "ARCHIVED"] },
    { state: "ARCHIVED", description: "Tenant voluntarily archived; GTID remains as historical record", next: [] },
    { state: "REJECTED", description: "KYB rejected; tenant can appeal (re-opens to KYB_PENDING)", next: ["KYB_PENDING"] },
  ],
  lifecycleHistoryTable: "tenant_lifecycle_history (tenant_gtid + from_state + to_state + reason + actor_gtid + timestamp + loom_hash)",
  governorGates: "All lifecycle transitions are Governor-governed + Loom-anchored",
} as const;

// ============ v18 §4.11 — Network Feature (Saved Contacts) ============

export const NETWORK_FEATURE = {
  principle: "Non-marketplace — no public matching, ranking, recommendation, or discovery of counterparties (Constitutional Point 16 + 22)",
  savedContacts: {
    table: "saved_contacts (owner_gtid + contact_gtid + contact_name + contact_type + relationship + trust_portrait + health_score + trust_score + total_trades + auto_saved + created_at)",
    addWorkflow: "Tenant explicitly adds a contact by GTID (from a previous trade) or by typing a GTID (with format validation + checksum verification)",
    autoSaved: "After a successful trade, the counterparty is auto-saved (auto_saved=true) unless the tenant opts out",
  },
  aiEnrichment: {
    gnnTrustPortrait: "GNN (A2) computes a trust portrait per saved contact — but ONLY for the contact's relationship with the owner (never a global ranking)",
    healthScore: "Health score composite (compliance + documentation + logistics + payment + risk + timeline) per saved contact",
    trustScore: "Trust score (TRI) accumulated from trades with this contact",
    totalTrades: "Total trade count with this contact",
    nonMarketplaceRule: "AI never suggests 'you might want to add X' — contacts are added explicitly by the tenant",
  },
  noMarketplaceDiscovery: [
    "No public directory of tenants",
    "No search across all tenants (only saved contacts + explicit GTID resolution)",
    "No 'recommended counterparties' feature anywhere in the UI",
    "No ranking of saved contacts by 'best match' — only alphabetical + last interaction",
    "GNN trust analytics serve known parties only (Point 22)",
  ],
} as const;

// ============ v18 §4.12 — SGTX Trade Trust Passport™ ============

export const TRUST_PASSPORT = {
  purpose: "Portable, verifiable credential summarising a tenant's trustworthiness — shareable with explicit consent",
  contents: {
    identity: ["gtid", "legal_name", "type", "subtype", "jurisdiction"],
    compliance: ["kyb_tier", "kyb_status", "sanctions_cleared", "pep_status", "lifecycle_state"],
    trust: ["trust_score", "trust_confidence", "tri_status", "tri_history_last_90_days"],
    performance: ["total_trades", "on_time_delivery_rate", "dispute_rate", "average_settlement_time"],
    verified_identifiers: ["LEI", "DUNS", "CUSTOMS_REG", "CHAMBER_REG", "VAT_REG"],
    network: ["saved_contacts_count", "active_corridors"],
  },
  verifiableCredentialFormat: {
    standard: "W3C Verifiable Credentials Data Model 1.1",
    type: ["VerifiableCredential", "SGTXTradeTrustPassport"],
    issuer: "did:sgtx:platform-governance-authority",
    issuanceDate: "ISO-8601",
    expirationDate: "ISO-8601 (default 90 days)",
    credentialSubject: "tenant_gtid + contents above",
    proof: {
      type: "Ed25519Signature2018",
      created: "ISO-8601",
      verificationMethod: "did:sgtx:platform-governance-authority#keys-1",
      proofValue: "base58-encoded Ed25519 signature",
    },
  },
  sharingWorkflow: {
    trigger: "Tenant clicks 'Share Trust Passport' in Company Admin → Privacy → Trust Passport",
    recipient: "Tenant enters the recipient's GTID (must be a saved contact)",
    consent: "Tenant explicitly consents to share (consent_records entry)",
    delivery: "Platform issues a Verifiable Credential + sends to the recipient's GTID via secure channel",
    revocation: "Tenant can revoke at any time; revocation Loom-anchored + recipient notified",
  },
  offlineVerification: {
    download: "Tenant can download the signed passport JSON",
    verificationTool: "Open-source verification tool (npm install @sgtx/passport-verifier) — verifies the Ed25519 signature against the platform's public key",
    publicKeyEndpoint: "GET /api/v1/keys — returns the platform's Ed25519 public key",
    noServerDependency: "Verification works offline — no need to call the SGTX platform",
  },
} as const;

// ============ Convenience: full canonical Identity & Access payload ============

export function getIdentityAccessPayload() {
  return {
    employee_record_fields: EMPLOYEE_RECORD_FIELDS,
    permissions: PERMISSIONS,
    roles: ROLES,
    role_journey_maps: ROLE_JOURNEY_MAPS,
    data_scopes: DATA_SCOPES,
    confidentiality_enforcement: CONFIDENTIALITY_ENFORCEMENT,
    dual_mode_toggle: DUAL_MODE_TOGGLE,
    session_device_security: SESSION_DEVICE_SECURITY,
    consent_management: CONSENT_MANAGEMENT,
    internal_organisation: INTERNAL_ORGANISATION,
    tenant_lifecycle: TENANT_LIFECYCLE,
    network_feature: NETWORK_FEATURE,
    trust_passport: TRUST_PASSPORT,
    counts: {
      employee_record_fields: EMPLOYEE_RECORD_FIELDS.length, // 14
      permissions: PERMISSIONS.length, // 41
      roles: ROLES.length, // 7
      role_journey_maps: ROLE_JOURNEY_MAPS.length, // 10
      data_scopes: DATA_SCOPES.length, // 5
      consent_purposes: CONSENT_MANAGEMENT.consentPurposes.length, // 6
      tenant_lifecycle_states: TENANT_LIFECYCLE.unifiedStateMachine.length, // 7
      no_marketplace_rules: NETWORK_FEATURE.noMarketplaceDiscovery.length, // 5
      trust_passport_sections: Object.keys(TRUST_PASSPORT.contents).length, // 6
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
