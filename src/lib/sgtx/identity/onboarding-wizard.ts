// @ts-nocheck
// =============================================================================
// SGTX v18 §4.3 — Onboarding Wizard (6 Steps, AI-Assisted) canonical data
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the 6-step onboarding
// wizard defined in v18 §4.3. It exposes:
//   • Wizard overview (6 steps, AI authority, one-click guarantee)
//   • Step 1 — Welcome & GTID Confirmation (4 fields)
//   • Step 2 — Organization Details (11 basic fields + 5 verified IDs)
//   • Step 3 — KYB/KYC Verification (document list + biometric + statuses)
//   • Step 4 — Profile Configuration (TRD-specific + all-tenant + consent)
//   • Step 5 — Create First Resource (per-type resource catalogues)
//   • Step 6 — Enter Sandbox (characteristics + guided tour)
//   • Post-Onboarding — Go Live checklist
//   • Trade Readiness Assessment (8 categories + scoring formula)
//
// Consumed by:
//   • /api/v1/onboarding/wizard         — public canonical mirror
//   • /api/sgtx/onboarding/wizard        — internal mirror
//   • /join (RegistrationGateway)        — for wizard rendering
//   • /api/v1/onboarding/start|step|complete — for step validation
//
// All values match v18 §4.3 tables exactly. Layer 1 invariants.
// =============================================================================

// ============ v18 §4.3.1 — Wizard Overview ============

export const ONBOARDING_WIZARD_OVERVIEW = {
  totalSteps: 6,
  aiAuthority: {
    A1: "Groq → Ollama — autocomplete, defaults, plain-language explanations",
    A2: "HF local → Ollama — document extraction (HF Donut), registry cross-checks, biometric liveness",
    A4: "OPA — GTID generation and state transitions",
  },
  oneClickGuarantee:
    "Each step has a single primary action button. Data entry fields are not counted as irreversible clicks; only the final submission of each step is a one-click action.",
  nonMarketplaceRule:
    "The wizard never suggests counterparties or service providers. AI suggestions are limited to anonymised, differentially private statistics.",
} as const;

// ============ v18 §4.3.2 — Step 1: Welcome & GTID Confirmation ============

export const STEP_1_WELCOME = {
  step: 1,
  name: "Welcome & GTID Confirmation",
  behavior:
    "System generates a provisional GTID and displays it. User confirms with one click: 'Confirm GTID'. Governor validates that entity type is allowed in the selected jurisdiction. On success, tenant record created with lifecycle_state = 'REGISTERED'.",
  fields: [
    {
      field: "Entity Type",
      type: "Dropdown",
      source: "TRD, LSP, SHIP, LAB, QC, FIN, GOV, MP, CBR",
      aiAssistance: "A1 pre-selects based on IP geolocation and typical use (user can override)",
    },
    {
      field: "Country of Operation",
      type: "Dropdown",
      source: "ISO 3166-1 alpha-2, filtered by RIA jurisdiction matrix",
      aiAssistance: "A1 autocomplete; shows warning if country restricted",
    },
    {
      field: "Legal Name (English)",
      type: "Text",
      source: "User input",
      aiAssistance: "A1 suggests formatting",
    },
    {
      field: "Legal Name (Arabic)",
      type: "Text (optional, Egypt only)",
      source: "User input",
      aiAssistance: "—",
    },
  ],
  aiAssistance:
    "If the user enters an unsupported country, a plain-language explanation appears. No recommendation to change jurisdiction.",
  oneClickAction: "Confirm GTID → proceeds to Step 2",
  altAction: "Save Draft",
  provisionalGtid: "SGTX-EG-TRD-002139 (example)",
} as const;

// ============ v18 §4.3.3 — Step 2: Organization Details ============

export const STEP_2_ORG_DETAILS = {
  step: 2,
  name: "Organization Details (with Verified Trade Profile)",
  purpose:
    "Collect core legal and commercial identifiers, including optional verified identifiers that will be linked to the GTID.",
  basicFields: [
    { field: "Commercial Register Number", mandatory: "Yes (for TRD, LSP, SHIP, LAB, QC, CBR, FIN)", validation: "Format check per jurisdiction; cross-reference with government registry (scraped)", aiAssistance: "A2 — HF Donut extracts from uploaded PDF" },
    { field: "Tax ID (VAT / National)", mandatory: "Yes (all except GOV, MP)", validation: "API check against ETA (Egypt) or equivalent", aiAssistance: "A2 extraction" },
    { field: "Export/Import License Number", mandatory: "For TRD only", validation: "Optional; validated against customs system", aiAssistance: "A2 extraction" },
    { field: "Insurance Certificate Number", mandatory: "For LSP, SHIP, CBR", validation: "RIA validates expiry date", aiAssistance: "A2 extraction" },
    { field: "ISO Accreditation Number", mandatory: "For LAB (17025), QC (17020)", validation: "RIA checks against accreditation body", aiAssistance: "A2 extraction" },
    { field: "UBO Declaration (JSON)", mandatory: "For Tier 2+ tenants", validation: "Structured form (name, nationality, ownership %)", aiAssistance: "—" },
    { field: "Contact Email & Phone", mandatory: "Yes (all)", validation: "Format validation", aiAssistance: "—" },
    { field: "Office Address (geocoded)", mandatory: "Yes (all)", validation: "Nominatim reverse geocoding", aiAssistance: "A1 suggests address from partial input" },
  ],
  documentUpload: {
    formats: ["PDF"],
    maxSize: "10 MB",
    aiExtraction: "A2 (HF Donut + PaddleOCR) extracts fields in real time and pre-fills the form. Low-confidence fields (<85%) are highlighted; the user must confirm or correct.",
  },
  verifiedTradeProfile: {
    optional: true,
    benefit: "Increases trust score and enables certain features",
    identifiers: [
      { identifier: "LEI (Legal Entity Identifier)", source: "User input (20-character alphanumeric)", verificationMethod: "GLEIF API (real-time) → returns legal name, status", oneClickAction: "Verify LEI" },
      { identifier: "DUNS Number", source: "User input (9 digits)", verificationMethod: "Dun & Bradstreet (scraped, batch daily)", oneClickAction: "Verify DUNS" },
      { identifier: "Customs Registration (local)", source: "Upload PDF or enter registration number", verificationMethod: "Nafeza API (Egypt) or equivalent customs system", oneClickAction: "Verify Customs Reg" },
      { identifier: "Chamber of Commerce Registration", source: "Upload PDF", verificationMethod: "Scraped registry check (jurisdiction-specific)", oneClickAction: "Verify Chamber Reg" },
      { identifier: "VAT Registration", source: "Upload PDF or enter number", verificationMethod: "ETA API (Egypt) or equivalent", oneClickAction: "Verify VAT" },
    ],
    verificationOutcomes: [
      "Verified — identifier stored in tenant_verified_ids table, linked to GTID",
      "Mismatch / Invalid — error message with suggestion to correct",
      "Pending (for batch-verified DUNS) — will be verified within 24h; user can proceed",
    ],
  },
  oneClickAction: "Verify & Continue → proceeds to Step 3",
  altAction: "Save Draft",
} as const;

// ============ v18 §4.3.4 — Step 3: KYB/KYC Verification ============

export const STEP_3_KYB = {
  step: 3,
  name: "KYB/KYC Verification (Automated, AI-Driven)",
  documentList: "Dynamic, generated by RIA based on entity type, jurisdiction, and selected identifiers",
  exampleDocuments_TRD_Egypt: [
    "Commercial register extract (already uploaded in Step 2)",
    "Tax registration certificate",
    "Export licence",
    "UBO declaration form (structured)",
    "Bank account confirmation letter (optional)",
    "Sanctions self-declaration (pre-filled, user signs)",
  ],
  aiAssistance: {
    extraction: "A2 (HF Donut) extracts all fields from uploaded PDFs",
    crossReference: "System cross-references with government registries (free APIs, scraped)",
    biometricLiveness: "For individuals (UBOs, directors) using ZITADEL WebAuthn (passkey) — no third-party service",
  },
  verificationStatuses: [
    { status: "Auto-verified", condition: "confidence ≥90% and registry match" },
    { status: "Manual review required", condition: "confidence <85% or registry unavailable" },
    { status: "Rejected", condition: "mismatch with official records (user can appeal)" },
  ],
  userAction: "Submit Documents — one click. System queues for verification. While pending, tenant can use sandbox but cannot create real trades.",
  smartInboxSla: "Smart Inbox shows estimated SLA (e.g., 'Your documents are under review. Estimated response 48 hours.') — generated by A1",
  governance: "Governor validates that all mandatory documents are submitted; otherwise it returns CONDITIONAL with a Decision Panel listing missing items",
  oneClickAction: "Submit Documents",
  altAction: "Save Draft",
} as const;

// ============ v18 §4.3.5 — Step 4: Profile Configuration ============

export const STEP_4_PROFILE = {
  step: 4,
  name: "Profile Configuration",
  traderSpecific: {
    appliesTo: "TRD only",
    fields: [
      { field: "Trader mode", options: ["BUY (importer only)", "SELL (exporter only)", "DUAL (both)"], default: "DUAL" },
      { field: "Default incoterm", purpose: "Pre-fill trade requests" },
      { field: "Preferred currency", purpose: "Displaying prices; actual trade currency can differ" },
    ],
  },
  allTenants: [
    { field: "Preferred language", options: "English, Arabic, German, Vietnamese, etc.", purpose: "AI-generated messages, Smart Inbox, UI" },
    {
      field: "Consent for optional features",
      options: [
        "Voice stress flag (off by default, on-device only)",
        "Offline mobile sync (for LSP/QC mobile apps)",
        "Anonymous market intelligence panel (sharing aggregated data)",
      ],
    },
    {
      field: "Notification preferences",
      options: ["Quiet hours", "Digest settings — can be changed later in Company Admin"],
    },
  ],
  oneClickAction: "Save Preferences → stores settings, proceeds to Step 5",
  altAction: "Skip to Step 5",
} as const;

// ============ v18 §4.3.6 — Step 5: Create First Resource (Optional) ============

export const STEP_5_RESOURCES = {
  step: 5,
  name: "Create First Resource (Optional)",
  purpose: "Pre-configure common data to accelerate future trade creation. Entirely optional; the user can skip.",
  resourceTypesPerTenant: [
    { tenantType: "TRD (Buyer)", resources: "Saved commodities (HS code, description, typical packaging), saved ports, preferred logistics providers (from contacts, if any)" },
    { tenantType: "TRD (Seller)", resources: "Service catalogue (packing options, default EXW margins), preferred shipping lines, laboratory contacts" },
    { tenantType: "LSP", resources: "Serviceable routes, vehicle types, default fees (per km, per container), fleet list upload" },
    { tenantType: "SHIP", resources: "Serviceable ports, vessel schedules, base freight rates (per container type)" },
    { tenantType: "LAB", resources: "Test panels, fees, sample instructions, accreditation certificate" },
    { tenantType: "QC", resources: "Commodity-specific inspection plans, AQL sampling defaults, fee schedules" },
    { tenantType: "CBR", resources: "Service catalogue (certification fee, physical handling fee, storage fee)" },
    { tenantType: "FIN", resources: "Risk appetite, preferred financing types, settlement methods" },
  ],
  aiAssistance:
    "A1 (Groq): system suggests default fee ranges based on anonymised platform aggregates (e.g., 'Typical trucking fee for this corridor: $0.75–$0.95/km'). User can accept, modify, or skip. No suggestions based on 'what others charge' — only anonymised, differentially private statistics.",
  oneClickActions: [
    "Save Resource — adds the resource to the tenant's catalogue",
    "Skip — proceeds to Step 6 without saving any resource",
  ],
} as const;

// ============ v18 §4.3.7 — Step 6: Enter Sandbox ============

export const STEP_6_SANDBOX = {
  step: 6,
  name: "Enter Sandbox",
  purpose: "Provide a fully functional, isolated replica of the platform for practice and education.",
  characteristics: [
    "Separate PostgreSQL schema (sandbox_*), NATS JetStream stream, and ClickHouse database",
    "Synthetic counterparties pre-provisioned with names like 'Demo Buyer Co.', 'Demo Seller Ltd.', 'Demo Logistics Provider' — clearly marked DEMO",
    "No real money, real documents, or real API calls to government systems (mocked responses)",
    "Resets automatically every week (Sunday 03:00 UTC). User can also click 'Reset Sandbox' to wipe and restart",
  ],
  guidedPracticeTrade: {
    steps: [
      "1. Creating a trade request (structured form)",
      "2. Seller accepting and locking EXW price",
      "3. Designing packing",
      "4. Adding logistics (using mock RFQ responses)",
      "5. Submitting quote, signing contract, paying mock fee",
      "6. Tracking milestones, confirming delivery, settling payment",
    ],
    rule: "Each step includes an educational explanation — never suggests alternative counterparties",
  },
  sandboxUiElements: [
    "Persistent banner 'You are in Sandbox mode. No real transactions will occur.'",
    "'Exit Sandbox' button (available only after completing the guided tour or after 5 minutes)",
  ],
  oneClickActions: [
    "Start Sandbox — creates the sandbox environment and loads the guided tour",
    "Reset Sandbox — wipes data and restarts",
    "Exit Sandbox — returns to the main portal (sandbox data persists until reset)",
  ],
  dataIsolation: "Complete replica of production platform: data stored in separate PostgreSQL schema (sandbox_*), no real money or documents ever used, no data leaks to production",
} as const;

// ============ v18 §4.3.8 — Post-Onboarding: Go Live ============

export const POST_ONBOARDING_GO_LIVE = {
  trigger: "After Step 6 (or after manual verification if Step 3 required human review)",
  goLiveConditions: [
    "KYB status = VERIFIED",
    "All required identifiers submitted",
    "Profile configured (language, trader mode for TRD)",
    "Governor evaluates no outstanding compliance blocks",
  ],
  smartInboxWelcome: "Smart Inbox shows 'Welcome to SGTX — you are now live!' notification generated by A1",
  firstTradePrompt: "Trade Command Center prompts user to create first trade (CTA: 'Create your first trade') — but does not suggest counterparties",
} as const;

// ============ v18 §4.3.9 — Trade Readiness Assessment ============

export const TRADE_READINESS = {
  purpose:
    "After onboarding, every tenant sees a Trade Readiness Assessment that shows what's blocking them from creating their first real trade.",
  categories: [
    { id: "identity", name: "Identity Verified", description: "KYB VERIFIED status, sanctions cleared, PEP clear or enhanced DD complete" },
    { id: "profile", name: "Profile Configured", description: "Language, trader mode (TRD), notification preferences set" },
    { id: "contacts", name: "Saved Counterparties", description: "At least one saved contact (relationship-controlled; the platform never auto-suggests)" },
    { id: "commodities", name: "Saved Commodities", description: "At least one saved commodity with HS code" },
    { id: "logistics", name: "Logistics Plan", description: "At least one saved route or preferred LSP/SHIP" },
    { id: "financing", name: "Financing Pre-Cleared (optional)", description: "CFR issued or financing intent declared" },
    { id: "documents", name: "Required Documents", description: "RIA-required documents for the first trade type" },
    { id: "governor", name: "Governor Approval", description: "All Governor gates pass for trade.create" },
  ],
  scoringFormula: {
    weights: {
      identity: 25,
      profile: 10,
      contacts: 15,
      commodities: 10,
      logistics: 10,
      financing: 5,
      documents: 15,
      governor: 10,
    },
    total: 100,
    readyThreshold: 80,
    partiallyReadyThreshold: 50,
  },
  uiDisplay: {
    ready: "Ready — you can create your first trade",
    partiallyReady: "Partially Ready — complete the remaining items below",
    notReady: "Not Ready — address the items below to enable trade creation",
  },
  oneClickRemediation: "Each unmet category has a one-click 'Fix Now' button that routes to the relevant onboarding step or company admin screen",
  governorIntegration: "Governor blocks trade.create if readiness score < 80 OR if any of the mandatory categories (identity, profile, governor) are not met",
} as const;

// ============ Convenience: full canonical onboarding payload ============

export function getOnboardingWizardPayload() {
  return {
    wizard_overview: ONBOARDING_WIZARD_OVERVIEW,
    steps: [
      STEP_1_WELCOME,
      STEP_2_ORG_DETAILS,
      STEP_3_KYB,
      STEP_4_PROFILE,
      STEP_5_RESOURCES,
      STEP_6_SANDBOX,
    ],
    post_onboarding_go_live: POST_ONBOARDING_GO_LIVE,
    trade_readiness: TRADE_READINESS,
    counts: {
      total_steps: 6,
      step_1_fields: STEP_1_WELCOME.fields.length,
      step_2_basic_fields: STEP_2_ORG_DETAILS.basicFields.length,
      step_2_verified_ids: STEP_2_ORG_DETAILS.verifiedTradeProfile.identifiers.length,
      step_3_verification_statuses: STEP_3_KYB.verificationStatuses.length,
      step_4_all_tenant_fields: STEP_4_PROFILE.allTenants.length,
      step_5_resource_types: STEP_5_RESOURCES.resourceTypesPerTenant.length,
      step_6_characteristics: STEP_6_SANDBOX.characteristics.length,
      step_6_guided_tour_steps: STEP_6_SANDBOX.guidedPracticeTrade.steps.length,
      go_live_conditions: POST_ONBOARDING_GO_LIVE.goLiveConditions.length,
      readiness_categories: TRADE_READINESS.categories.length,
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
