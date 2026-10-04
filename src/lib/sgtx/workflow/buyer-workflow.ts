// @ts-nocheck
// =============================================================================
// SGTX v18 §6 — Buyer Workflow (Phase 1: Trade Initiation) canonical data
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the 13-section Buyer
// Workflow form defined in v18 §6.1.3. The form transforms the buyer's
// commercial intent into a structured, machine-readable, regulation-aware
// execution graph that every subsequent phase references via the USTN.
//
// Consumed by:
//   • /api/v1/workflow/buyer        — public canonical mirror
//   • /api/sgtx/workflow/buyer      — internal mirror
//   • /trades/new (Trader Portal)  — for form rendering reference
//   • /api/sgtx/trade-request       — for step validation
// =============================================================================

// ============ v18 §6.1.1 — Core Principles ============

export const BUYER_WORKFLOW_PRINCIPLES = [
  "Structured — every field is machine-readable, regulation-aware, and stored at the commodity level (not the header)",
  "AI-assisted, not AI-driven — A1 advises, A2 constrains, A4 validates, A5 forbidden",
  "Non-marketplace — the buyer explicitly identifies the seller (saved contacts only; no auto-suggestions)",
  "One-click guarantee — each step has a single primary action button",
  "Draft auto-save — background persistence every 30s; recovery on next visit",
  "Governor pre-screen — submission passes through G1U1–G1U33 gates before trade request is created",
] as const;

// ============ v18 §6.1.3 — Complete Form Structure (13 sections) ============

export interface FormSection {
  step: number;
  name: string;
  purpose: string;
  detailedSpec: string;
  aiAuthority?: string;
}

export const BUYER_WORKFLOW_FORM_SECTIONS: FormSection[] = [
  {
    step: 1,
    name: "Seller Selection",
    purpose: "Identify the intended seller/counterparty (from saved contacts only — no marketplace suggestions)",
    detailedSpec: "Section 6.2.4",
    aiAuthority: "A1 autocomplete from saved contacts; GNN (A2) sanctions pre-screen",
  },
  {
    step: 2,
    name: "Incoterm + Commercial Foundation (merged step)",
    purpose: "Incoterm, settlement structure, payment timing, credit period, currency, Buyer Financing Toggle",
    detailedSpec: "Sections 6.2.5, 6.4, 6.11",
    aiAuthority: "A4 (WasmEdge) validation: incoterm + settlement compatibility",
  },
  {
    step: 3,
    name: "Transport Mode & Equipment",
    purpose: "Primary transport mode and mode-dependent equipment (ocean container, air ULD, road trailer, rail wagon, RoRo)",
    detailedSpec: "Sections 6.2.6, 6.9",
    aiAuthority: "A4 (OPA) validation: mode-specific equipment rules",
  },
  {
    step: 4,
    name: "Container/Unit & Commodity Configuration",
    purpose: "Physical units, commodities, dynamic product fields, acceptance criteria (per-commodity quantity)",
    detailedSpec: "Sections 6.2.7, 6.6",
    aiAuthority: "A2 (Product Form Agent) dynamic schema generation + structured extraction",
  },
  {
    step: 5,
    name: "Lab Test Requirements",
    purpose: "Explicit mandatory/recommended/optional lab tests (RIA-driven, transparently priced at request time)",
    detailedSpec: "Section 6.2.8",
    aiAuthority: "A2 (RIA) determines required tests based on commodity + jurisdiction",
  },
  {
    step: 6,
    name: "QC Inspection Request (Geography-Aware)",
    purpose: "Geography-aware inspection request — provider coverage validation, seller contact advisory, anonymised price ranges",
    detailedSpec: "Section 6.2.9",
    aiAuthority: "A2 (HF local) coverage validation; A1 anonymised price ranges",
  },
  {
    step: 7,
    name: "AI Container/Unit Advisor",
    purpose: "Advisory-only equipment optimisation (pallet arrangement, container utilisation)",
    detailedSpec: "Sections 6.2.10, 6.15",
    aiAuthority: "A1 (Groq) advisory only; user accepts/modifies/rejects",
  },
  {
    step: 8,
    name: "Documentation Requirements",
    purpose: "Trigger-driven document checklist (phytosanitary, CoO, commercial invoice, packing list, B/L, etc.)",
    detailedSpec: "Sections 6.2.11, 6.7",
    aiAuthority: "A2 (Document Requirement Extractor) — trigger-driven by commodity + origin + destination",
  },
  {
    step: 9,
    name: "Insurance Requirements",
    purpose: "Insurance requirement, party responsible, type, coverage amount",
    detailedSpec: "Sections 6.2.12, 6.10",
    aiAuthority: "A1 (Insurance Recommender) — suggestions only",
  },
  {
    step: 10,
    name: "Delivery Window & Special Instructions",
    purpose: "Delivery window dates (earliest/latest) and free-text special instructions",
    detailedSpec: "Sections 6.2.13, 6.8, 6.9",
    aiAuthority: "A2 (Schedule Optimiser) — feasibility check",
  },
  {
    step: 11,
    name: "Trade Criticality",
    purpose: "Routine / Priority / Critical classification — affects Governor pre-screen strictness",
    detailedSpec: "Sections 6.2.14, 6.13",
    aiAuthority: "A4 (WasmEdge) validation: criticality thresholds",
  },
  {
    step: 12,
    name: "Draft Auto-Save",
    purpose: "Background persistence every 30s; recovery on next visit",
    detailedSpec: "Sections 6.2.15, 6.16",
    aiAuthority: "A0 (no AI — pure deterministic persistence)",
  },
  {
    step: 13,
    name: "Submit Trade Request",
    purpose: "Governor pre-screen (G1U1–G1U33) and request creation — issues a Request UUID + Request Reference",
    detailedSpec: "Section 6.2.16",
    aiAuthority: "A4 (OPA + WasmEdge) — full validation gate matrix",
  },
];

// ============ v18 §6.1.4 — Canonical Data Model Principle ============

export const CANONICAL_DATA_MODEL = {
  principle: "Quantity is stored at the commodity level, not at the trade header level",
  reason: "For multi-commodity trades, header-level quantity is ambiguous (Container 1 Oranges 100 MT + Container 2 Potatoes 50 MT cannot share a single requested_quantity value)",
  table: "trade_request_commodities",
  perCommodityFields: [
    "quantity",
    "tolerance",
    "acceptance criteria",
    "packaging",
    "special requirements",
  ],
} as const;

// ============ v18 §6.1.5 — Phase Timeline & One-Click Guarantee ============

export const PHASE_TIMELINE = {
  draftAutoSaveInterval: "30 seconds",
  oneClickGuarantee: "Each step has a single primary action button. Data entry fields are not counted as irreversible clicks; only the final submission of each step is a one-click action.",
  estimatedTime: "5-15 minutes for a routine trade; longer for multi-commodity or critical trades",
} as const;

// ============ v18 §6.1.6 — AI Authority Summary (Form Level) ============

export const AI_AUTHORITY_FORM_LEVEL = [
  { agent: "A1 (Groq)", technology: "Groq-hosted LLM", role: "Autocomplete, plain-language explanations, suggestions, recommendations, tenant messages" },
  { agent: "A2 (RIA / HF local / XGBoost / LightGBM)", technology: "Local models + pgvector", role: "Regulatory data, dynamic schema generation, structured extraction, readiness scoring, product vectors" },
  { agent: "A4 (WasmEdge)", technology: "OPA + WasmEdge", role: "Validation: incoterm, equipment, weights, ports, delivery windows, settlement, criticality" },
  { agent: "GNN (A2)", technology: "Graph Neural Network", role: "Sanctions pre-screen of counterparties" },
] as const;

// ============ v18 §6.1.7 — Section Roadmap (16 subsections) ============

export const SECTION_ROADMAP = [
  { id: "6.2", name: "Complete Workflow Steps" },
  { id: "6.3", name: "Regulatory Intelligence Agent (RIA)" },
  { id: "6.4", name: "Incoterm Selection & Engine" },
  { id: "6.5", name: "Product Form Agent (A2)" },
  { id: "6.6", name: "Structured Container & Commodity Entry" },
  { id: "6.7", name: "Documentation Requirements" },
  { id: "6.8", name: "Special Trade Instructions" },
  { id: "6.9", name: "Transport & Logistics" },
  { id: "6.10", name: "Insurance Requirements" },
  { id: "6.11", name: "Commercial Settlement Requirements" },
  { id: "6.12", name: "Trade Request Readiness" },
  { id: "6.13", name: "Trade Criticality" },
  { id: "6.14", name: "Multi-Shipment Requests" },
  { id: "6.15", name: "AI Container Advisor" },
  { id: "6.16", name: "Draft Auto-Save & Recovery" },
] as const;

// ============ v18 §6.1.8 — Implementation Priority ============

export const IMPLEMENTATION_PRIORITY = {
  p0: ["Step 1 Seller Selection", "Step 2 Incoterm + Commercial Foundation", "Step 4 Container & Commodity", "Step 13 Submit (Governor pre-screen)"],
  p1: ["Step 3 Transport Mode", "Step 5 Lab Tests", "Step 8 Documentation", "Step 11 Criticality", "Draft Auto-Save"],
  p2: ["Step 6 QC Inspection", "Step 7 AI Container Advisor", "Step 9 Insurance", "Step 10 Delivery Window"],
} as const;

// ============ v18 §6.2.2 — Access & Entry Points ============

export const ACCESS_ENTRY_POINTS = [
  { entry: "Smart Inbox (landing)", cta: "Click 'New Trade Request' (sidebar or quick action)" },
  { entry: "Trade Command Center", cta: "Click 'New Trade' button" },
  { entry: "Direct URL", cta: "/trades/new (Trader Portal, Buyer mode)" },
  { entry: "Voice Command", cta: "Voice: 'Create new trade' (Vosk + HF Mixtral intent extraction)" },
] as const;

// ============ v18 §6.2.4 — Step 1: Seller Selection ============

export const STEP_1_SELLER_SELECTION = {
  fields: [
    { field: "Seller GTID", type: "Autocomplete from saved contacts", mandatory: true, aiAssistance: "A1 autocomplete from saved contacts only — no marketplace suggestions" },
    { field: "Seller Legal Name", type: "Read-only (resolved from GTID)", mandatory: true, aiAssistance: "Resolved via /api/v1/gtid/resolve" },
    { field: "Seller Trust Score", type: "Read-only indicator", mandatory: false, aiAssistance: "GNN (A2) sanctions pre-screen + TRI status" },
    { field: "Saved Contact Relationship", type: "Read-only (e.g., 'Supplier', 'Customer')", mandatory: false, aiAssistance: "From saved_contacts table" },
  ],
  oneClickAction: "Confirm Seller → proceeds to Step 2",
  nonMarketplaceRule: "Only saved contacts appear. The platform never suggests 'you might also want to trade with X'.",
  governorGate: "G1U1 — seller must be KYB VERIFIED with sanctions cleared",
} as const;

// ============ v18 §6.2.5 — Step 2: Incoterm + Commercial Foundation ============

export const STEP_2_INCOTERM_COMMERCIAL = {
  fields: [
    { field: "Incoterm", type: "Dropdown (EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF)", mandatory: true, aiAssistance: "A4 (WasmEdge) validation: incoterm + transport mode compatibility" },
    { field: "Settlement Structure", type: "Dropdown (Stage 1 + Stage 2 split, single-stage, deferred)", mandatory: true, aiAssistance: "A4 validation: matches incoterm" },
    { field: "Payment Timing", type: "Dropdown (pre-shipment, post-shipment, deferred 30/60/90 days)", mandatory: true, aiAssistance: "A1 plain-language explanation of each option" },
    { field: "Credit Period", type: "Number input (days)", mandatory: false, aiAssistance: "A2 (Risk Radar) flags extended credit periods" },
    { field: "Currency", type: "Dropdown (ISO 4217)", mandatory: true, aiAssistance: "A1 default from tenant preferences" },
    { field: "Buyer Financing Toggle", type: "Switch (on/off)", mandatory: true, aiAssistance: "Triggers CFR (Conditional Financing Reference) flow if on" },
  ],
  oneClickAction: "Continue → proceeds to Step 3",
  governorGate: "G1U2 — incoterm + settlement structure compatibility",
} as const;

// ============ v18 §6.2.6 — Step 3: Transport Mode & Equipment ============

export const STEP_3_TRANSPORT_MODE = {
  transportModes: [
    { code: "OCEAN", name: "Ocean Container", equipmentExamples: "20'DV, 40'DV, 40'HC, 45'HC, Reefer 40'RH, Open Top, Flat Rack" },
    { code: "AIR", name: "Air Cargo", equipmentExamples: "ULD (Unit Load Device): PMC, PAG, AKE" },
    { code: "ROAD", name: "Road Transport", equipmentExamples: "20'Trailer, 40'Trailer, Refrigerated Trailer, Flatbed" },
    { code: "RAIL", name: "Rail Freight", equipmentExamples: "20'Container wagon, 40'Container wagon, Boxcar, Hopper" },
    { code: "RORO", name: "Roll-on/Roll-off", equipmentExamples: "Vehicle deck, MAFI trailer, Static trailer" },
    { code: "MULTIMODAL", name: "Multimodal (ocean + road/rail)", equipmentExamples: "Container + inland transport" },
  ],
  canonicalOrderRule: "Transport mode is selected BEFORE containers/units. Incoterm and settlement structure are captured together. The AI Container Advisor runs AFTER transport mode selection.",
  oneClickAction: "Continue → proceeds to Step 4",
  governorGate: "G1U3 — transport mode + equipment compatibility",
} as const;

// ============ v18 §6.2.7 — Step 4: Container/Unit & Commodity Configuration ============

export const STEP_4_CONTAINER_COMMODITY = {
  fields: [
    { field: "Container/Unit Type", type: "Dropdown (filtered by Step 3 transport mode)", mandatory: true, aiAssistance: "A4 validation: equipment must match transport mode" },
    { field: "Container Count", type: "Number input", mandatory: true, aiAssistance: "A1 suggests based on commodity volume" },
    { field: "Commodity HS Code", type: "Autocomplete (HS code database)", mandatory: true, aiAssistance: "A1 autocomplete + A2 classification" },
    { field: "Commodity Description", type: "Text (English + optional Arabic)", mandatory: true, aiAssistance: "A2 (Product Form Agent) fills from HS code database" },
    { field: "Quantity per Commodity", type: "Number + unit (MT, KG, L, units)", mandatory: true, aiAssistance: "A2 dynamic schema per commodity" },
    { field: "Tolerance", type: "Percentage (e.g., ±5%)", mandatory: false, aiAssistance: "A2 default per commodity type" },
    { field: "Acceptance Criteria", type: "Structured (quality specs, ripeness, size, grade)", mandatory: true, aiAssistance: "A2 (Product Form Agent) commodity-specific fields" },
    { field: "Packaging", type: "Structured (pallet type, cartons per pallet, layer arrangement)", mandatory: true, aiAssistance: "A2 dynamic schema per commodity" },
  ],
  canonicalDataModel: "Quantity stored at commodity level (trade_request_commodities table), not at trade header",
  oneClickAction: "Continue → proceeds to Step 5",
  governorGate: "G1U4 — commodity + quantity + packaging validity",
} as const;

// ============ v18 §6.2.8 — Step 5: Lab Test Requirements ============

export const STEP_5_LAB_TESTS = {
  fields: [
    { field: "Mandatory Tests", type: "Read-only list (RIA-driven)", mandatory: true, aiAssistance: "A2 (RIA) determines based on commodity + origin + destination" },
    { field: "Recommended Tests", type: "Checkbox list (optional)", mandatory: false, aiAssistance: "A2 (RIA) — user can deselect" },
    { field: "Optional Tests", type: "Free-select from lab catalogue", mandatory: false, aiAssistance: "A1 plain-language explanations" },
    { field: "Test Pricing", type: "Read-only (transparent per test)", mandatory: false, aiAssistance: "Real-time from lab service catalogue" },
  ],
  explicitRequirementRule: "Mandatory, recommended, and optional tests are explicit, RIA-driven, and priced transparently at request time.",
  oneClickAction: "Continue → proceeds to Step 6",
  governorGate: "G1U5 — mandatory lab tests must be acknowledged",
} as const;

// ============ v18 §6.2.9 — Step 6: QC Inspection Request ============

export const STEP_6_QC_INSPECTION = {
  fields: [
    { field: "Inspection Type", type: "Dropdown (pre-shipment, loading, destination)", mandatory: true, aiAssistance: "A1 plain-language explanation" },
    { field: "Inspector Provider", type: "Autocomplete from saved QC contacts", mandatory: true, aiAssistance: "A2 (HF local) coverage validation" },
    { field: "Coverage Check", type: "Read-only indicator", mandatory: false, aiAssistance: "A2 — provider must service the origin port" },
    { field: "Anonymised Price Range", type: "Read-only", mandatory: false, aiAssistance: "A1 anonymised historical range (differentially private)" },
  ],
  geographyAwareRule: "Provider coverage validation, seller contact advisory, and anonymised historical price ranges prevent inspection requests where no inspector exists.",
  oneClickAction: "Continue → proceeds to Step 7",
  governorGate: "G1U6 — QC provider coverage validated",
} as const;

// ============ v18 §6.2.10 — Step 7: AI Container/Unit Advisor ============

export const STEP_7_AI_CONTAINER_ADVISOR = {
  advisory: "A1 (Groq) advisory-only equipment optimisation",
  fields: [
    { field: "Pallet Arrangement Suggestion", type: "Read-only (advisory)", mandatory: false, aiAssistance: "A1 + A2 (Packing Solver) optimises pallet layout" },
    { field: "Container Utilisation", type: "Read-only percentage", mandatory: false, aiAssistance: "A1 calculates volume utilisation" },
    { field: "Accept / Modify / Reject", type: "User action", mandatory: true, aiAssistance: "User explicitly accepts, modifies, or rejects the suggestion" },
  ],
  advisoryOnlyRule: "AI never forces — user can always override.",
  oneClickAction: "Continue → proceeds to Step 8",
} as const;

// ============ v18 §6.2.11 — Step 8: Documentation Requirements ============

export const STEP_8_DOCUMENTATION = {
  triggerDrivenRule: "Document checklist is trigger-driven by commodity + origin + destination + incoterm + transport mode.",
  commonDocuments: [
    "Commercial Invoice",
    "Packing List",
    "Bill of Lading (B/L) or Air Waybill (AWB)",
    "Certificate of Origin (CoO)",
    "Phytosanitary Certificate (for plants/plant products)",
    "Health Certificate (for animal products)",
    "Fumigation Certificate (for wood packaging)",
    "Insurance Certificate",
    "Inspection Certificate (QC)",
    "Lab Test Reports",
  ],
  oneClickAction: "Continue → proceeds to Step 9",
  governorGate: "G1U7 — mandatory documents acknowledged",
} as const;

// ============ v18 §6.2.12 — Step 9: Insurance Requirements ============

export const STEP_9_INSURANCE = {
  fields: [
    { field: "Insurance Required", type: "Switch (on/off)", mandatory: true, aiAssistance: "A4 validation: required by incoterm (CIF/CIP mandatory)" },
    { field: "Party Responsible", type: "Dropdown (Buyer or Seller)", mandatory: true, aiAssistance: "A4 (WasmEdge) — determined by incoterm" },
    { field: "Insurance Type", type: "Dropdown (Cargo, Marine, All-Risks, Named Perils)", mandatory: true, aiAssistance: "A1 (Insurance Recommender) — advisory only" },
    { field: "Coverage Amount", type: "Number + currency", mandatory: true, aiAssistance: "A1 suggests based on trade value + commodity risk" },
  ],
  oneClickAction: "Continue → proceeds to Step 10",
} as const;

// ============ v18 §6.2.13 — Step 10: Delivery Window & Special Instructions ============

export const STEP_10_DELIVERY_WINDOW = {
  fields: [
    { field: "Earliest Delivery Date", type: "Date picker", mandatory: true, aiAssistance: "A2 (Schedule Optimiser) feasibility check" },
    { field: "Latest Delivery Date", type: "Date picker", mandatory: true, aiAssistance: "A2 — flags tight windows" },
    { field: "Special Instructions (free text)", type: "Textarea", mandatory: false, aiAssistance: "A2 (Special Instructions Extractor) — structures for Governor" },
  ],
  oneClickAction: "Continue → proceeds to Step 11",
} as const;

// ============ v18 §6.2.14 — Step 11: Trade Criticality ============

export const STEP_11_CRITICALITY = {
  classifications: [
    { code: "ROUTINE", description: "Standard trade — normal Governor pre-screen", threshold: "trade value < $100k" },
    { code: "PRIORITY", description: "Elevated scrutiny — additional Governor gates", threshold: "trade value $100k-$1M OR critical commodity" },
    { code: "CRITICAL", description: "Maximum scrutiny — 2-of-3 multisig on contract sign", threshold: "trade value > $1M OR sanctions-adjacent jurisdiction" },
  ],
  oneClickAction: "Continue → proceeds to Step 12",
  governorGate: "G1U8 — criticality threshold validated",
} as const;

// ============ v18 §6.2.15 — Step 12: Draft Auto-Save ============

export const STEP_12_DRAFT_AUTOSAVE = {
  intervalSeconds: 30,
  storageTable: "trade_request_drafts",
  recovery: "On next visit, if a draft exists for the tenant + buyer mode, prompt 'Continue draft?' or 'Start fresh'",
  fields: ["All form fields from steps 1-11 are persisted as JSON"],
  oneClickAction: "Continue drafting / Submit",
} as const;

// ============ v18 §6.2.16 — Step 13: Submit Trade Request ============

export const STEP_13_SUBMIT = {
  preSubmissionChecklist: [
    "All 11 mandatory fields completed",
    "Seller is KYB VERIFIED with sanctions cleared",
    "Incoterm + settlement structure compatible",
    "Transport mode + equipment compatible",
    "Commodity + quantity + packaging valid",
    "Mandatory lab tests acknowledged",
    "QC provider coverage validated",
    "Mandatory documents acknowledged",
    "Insurance required by incoterm is configured",
    "Delivery window valid (earliest < latest)",
    "Criticality classification set",
  ],
  governorGates: "G1U1 through G1U8 + commodity-specific gates",
  issuance: "On successful submit, the system issues a Request UUID (immutable technical identifier) + Request Reference (human-facing opaque reference)",
  ustnGenerationNote: "USTN is NOT generated at this stage. USTN is generated at the authoritative lock point (single-shipment lock, or per-shipment lock for multi-shipment contracts) when the FeeLock becomes ACTIVE at STAGE1_SETTLED.",
  oneClickAction: "Submit Trade Request → Governor pre-screen",
} as const;

// ============ v18 §6.2.17 — Executive Approval Layer ============

export const EXECUTIVE_APPROVAL_LAYER = {
  trigger: "Trades above $100k require internal executive approval before submission",
  approvalWorkflow: "Request blocked at Governor pre-screen → routed to internal approver (configured per tenant) → approver signs → request unblocked",
  audit: "All approval actions are Loom-logged",
} as const;

// ============ v18 §6.12 — Trade Request Readiness ============

export const TRADE_REQUEST_READINESS = {
  purpose: "Before submitting, the buyer sees a Trade Request Readiness score (0-100) showing what's blocking submission.",
  components: [
    { id: "seller", name: "Seller verified", weight: 15 },
    { id: "incoterm", name: "Incoterm + settlement valid", weight: 15 },
    { id: "transport", name: "Transport + equipment selected", weight: 10 },
    { id: "commodity", name: "Commodity + quantity configured", weight: 15 },
    { id: "lab_tests", name: "Lab tests acknowledged", weight: 10 },
    { id: "qc", name: "QC provider coverage validated", weight: 10 },
    { id: "documents", name: "Documents acknowledged", weight: 10 },
    { id: "insurance", name: "Insurance configured", weight: 5 },
    { id: "delivery", name: "Delivery window set", weight: 5 },
    { id: "criticality", name: "Criticality set", weight: 5 },
  ],
  total: 100,
  readyThreshold: 100, // ALL components must be ready for submission
  governorIntegration: "Governor pre-screen blocks submission if any readiness component is missing",
} as const;

// ============ Convenience: full canonical buyer workflow payload ============

export function getBuyerWorkflowPayload() {
  return {
    principles: BUYER_WORKFLOW_PRINCIPLES,
    form_sections: BUYER_WORKFLOW_FORM_SECTIONS,
    canonical_data_model: CANONICAL_DATA_MODEL,
    phase_timeline: PHASE_TIMELINE,
    ai_authority_form_level: AI_AUTHORITY_FORM_LEVEL,
    section_roadmap: SECTION_ROADMAP,
    implementation_priority: IMPLEMENTATION_PRIORITY,
    access_entry_points: ACCESS_ENTRY_POINTS,
    steps: {
      step_1_seller_selection: STEP_1_SELLER_SELECTION,
      step_2_incoterm_commercial: STEP_2_INCOTERM_COMMERCIAL,
      step_3_transport_mode: STEP_3_TRANSPORT_MODE,
      step_4_container_commodity: STEP_4_CONTAINER_COMMODITY,
      step_5_lab_tests: STEP_5_LAB_TESTS,
      step_6_qc_inspection: STEP_6_QC_INSPECTION,
      step_7_ai_container_advisor: STEP_7_AI_CONTAINER_ADVISOR,
      step_8_documentation: STEP_8_DOCUMENTATION,
      step_9_insurance: STEP_9_INSURANCE,
      step_10_delivery_window: STEP_10_DELIVERY_WINDOW,
      step_11_criticality: STEP_11_CRITICALITY,
      step_12_draft_autosave: STEP_12_DRAFT_AUTOSAVE,
      step_13_submit: STEP_13_SUBMIT,
    },
    executive_approval_layer: EXECUTIVE_APPROVAL_LAYER,
    trade_request_readiness: TRADE_REQUEST_READINESS,
    counts: {
      principles: BUYER_WORKFLOW_PRINCIPLES.length,
      form_sections: BUYER_WORKFLOW_FORM_SECTIONS.length, // 13
      ai_authority_entries: AI_AUTHORITY_FORM_LEVEL.length, // 4
      roadmap_subsections: SECTION_ROADMAP.length, // 15
      access_entry_points: ACCESS_ENTRY_POINTS.length, // 4
      transport_modes: STEP_3_TRANSPORT_MODE.transportModes.length, // 6
      common_documents: STEP_8_DOCUMENTATION.commonDocuments.length, // 10
      criticality_classifications: STEP_11_CRITICALITY.classifications.length, // 3
      readiness_components: TRADE_REQUEST_READINESS.components.length, // 10
      pre_submission_checklist_items: STEP_13_SUBMIT.preSubmissionChecklist.length, // 11
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
