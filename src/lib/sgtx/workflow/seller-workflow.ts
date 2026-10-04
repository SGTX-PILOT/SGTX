// @ts-nocheck
// =============================================================================
// SGTX v18 §8 — Seller Workflow (Phase 2: Quote, Packing & Logistics)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the 25-step Seller
// Workflow that transforms a buyer's request into a commercially viable,
// physically feasible, and compliant quote.
//
// Consumed by:
//   • /api/v1/workflow/seller        — public canonical mirror
//   • /api/sgtx/workflow/seller      — internal mirror
//   • /operations/seller (Seller Workspace) — for UI reference
//   • /api/sgtx/quote-v2             — for quote submission validation
// =============================================================================

// ============ v18 §8.1 — Core Principles ============

export const SELLER_WORKFLOW_PRINCIPLES = [
  "One Adaptive Experience (no separate Basic/Expert modes)",
  "Feasibility Before Pricing (determine whether the request can be fulfilled before detailed pricing)",
  "Zero Re-Entry (all buyer request data flows in; no manual re-creation)",
  "Data-Sovereign Financing (the seller declares only the seller's financing needs)",
  "Evidence-Based Commitment (every commitment requires explicit acknowledgment)",
  "AI-Assisted Optimisation (AI suggests pricing, packing, and logistics optimisation)",
  "Three Flexible Logistics Modes (Manual — Mode A; RFQ to LSPs — Mode B; Direct to SHIPs — Mode C)",
  "Transport-Mode-Aware Equipment (equipment selection drives logistics costs and packing)",
  "Incoterm-Driven Service Enforcement (mandatory logistics services enforced based on Incoterm)",
  "Non-Uniform Layer Stacking (real-world packing with mixed layer configurations supported)",
  "One-Click Core (every irreversible action is a single click)",
  "Non-Marketplace (platform never suggests alternative buyers or service providers)",
] as const;

// ============ v18 §8.2 — Complete Workflow Steps (25 steps) ============

export interface SellerStep {
  step: number;
  name: string;
  actor: string;
  description: string;
  output: string;
  aiAssistance?: string;
  governorGate?: string;
}

export const SELLER_WORKFLOW_STEPS: SellerStep[] = [
  {
    step: 1,
    name: "Receive & Review Buyer Request",
    actor: "Seller (Trade Manager)",
    description: "Smart Inbox notification 'New trade request from [Buyer]'. Review buyer's parsed specifications (containers, commodities, Incoterm, acceptance criteria, special instructions, settlement preferences).",
    output: "Request acknowledged; seller's intent to engage established",
    aiAssistance: "A1 plain-language summary of buyer's request",
  },
  {
    step: 2,
    name: "Seller Request Understanding (Seller Brief)",
    actor: "Seller (Trade Manager)",
    description: "System compiles a seller-facing brief: buyer identity (masked if not a saved contact), commodity, quantity, ports, Incoterm, settlement structure, mandatory lab/QC, document checklist.",
    output: "Seller brief document",
    aiAssistance: "A2 (Product Form Agent) structured extraction",
  },
  {
    step: 3,
    name: "Seller Feasibility Check (Mandatory)",
    actor: "Seller (Trade Manager) + A2 (Readiness Score)",
    description: "Mandatory feasibility check: commodity in stock? Quality specs match? Lab capacity available? Logistics feasible? QC provider coverage? All must be yes before pricing.",
    output: "Feasibility verdict (GO / NO-GO with reasons)",
    aiAssistance: "A2 (Readiness Score) + A2 (Fraud Detection)",
    governorGate: "G1U14 — feasibility check mandatory before pricing",
  },
  {
    step: 4,
    name: "Seller Decision",
    actor: "Seller",
    description: "Accept / Reject / Request Clarification. If accept, proceed to pricing. If reject, buyer is notified with reason. If clarification, secure-channel message to buyer.",
    output: "Decision + reason",
  },
  {
    step: 5,
    name: "Loading Origin & Availability",
    actor: "Seller",
    description: "Select country of loading, port of loading. Optional: alternative loading point (geocoded). Distance to port auto-calculated (OSRM).",
    output: "Loading origin + distance-to-port",
    aiAssistance: "A1 (Route Oracle) suggests nearest port",
  },
  {
    step: 6,
    name: "Product & Availability Confirmation",
    actor: "Seller",
    description: "Confirm commodity + quantity availability. AI checks seller's catalogue + stock levels. For multi-commodity trades, per-commodity confirmation required.",
    output: "Availability confirmation per commodity",
    aiAssistance: "A2 (Product Form Agent) checks stock",
  },
  {
    step: 7,
    name: "Product & Quality Matching",
    actor: "Seller + A2 (Quality Assessment)",
    description: "Match buyer's acceptance criteria (quality specs, ripeness, size, grade) against seller's product catalogue. Highlight mismatches.",
    output: "Match report + mismatches",
    aiAssistance: "A2 (Quality Assessment) + A1 plain-language explanation",
  },
  {
    step: 8,
    name: "Packing & Containerisation",
    actor: "Seller + A2 (Packing Solver)",
    description: "Design packing plan with non-uniform layer stacking (real-world packing). SSCC barcodes generated. Acceptance criteria references per pallet.",
    output: "Packing plan (JSON with pallets, layers, SSCC barcodes)",
    aiAssistance: "A2 (Packing Solver) optimises pallet arrangement",
    governorGate: "G1U15 — packing plan lock required before quote submission",
  },
  {
    step: 9,
    name: "Logistics Planning",
    actor: "Seller",
    description: "Select one of three flexible logistics modes: Mode A (Manual), Mode B (RFQ to LSPs), Mode C (Direct to SHIPs). Each mode produces a logistics quote.",
    output: "Logistics quote(s) from selected mode",
    aiAssistance: "A1 (Container Advisor) for equipment selection; A2 (Port Congestion Detection) for timing",
  },
  {
    step: 10,
    name: "Alternative Port / Route Scenarios",
    actor: "Seller",
    description: "Generate alternative port/route scenarios (e.g., Alexandria vs. Damietta; direct vs. transshipment).",
    output: "Scenario list with cost + ETA comparison",
    aiAssistance: "A2 (Schedule Optimiser) feasibility per scenario",
  },
  {
    step: 11,
    name: "Cost Engine",
    actor: "System (auto)",
    description: "Cost engine assembles: EXW price + packing costs + logistics costs + insurance + government fees (RIA) + SGTX platform fee (Dynamic Fee Engine).",
    output: "Total cost breakdown",
    aiAssistance: "A2 (Pricing Dynamics) for market-aware EXW; Dynamic Fee Engine for SGTX fee",
  },
  {
    step: 12,
    name: "EXW Price Lock",
    actor: "Seller",
    description: "Lock the EXW price based on live market chart (FAO, USDA, World Bank) + AI fair price badge. Once locked, the price is immutable for this quote.",
    output: "Locked EXW price",
    aiAssistance: "A1 (Groq) fair price badge + A2 (Pricing Dynamics) market analysis",
    governorGate: "G1U16 — EXW price lock signed by seller (QES)",
  },
  {
    step: 13,
    name: "Margin Intelligence",
    actor: "Seller + A1 (Pricing Dynamics)",
    description: "AI suggests margin based on anonymised platform aggregates (differentially private). Seller sets final margin.",
    output: "Margin % locked",
    aiAssistance: "A2 (Pricing Dynamics) anonymised range; seller decides",
  },
  {
    step: 14,
    name: "Scenario Builder (Internal)",
    actor: "Seller",
    description: "Internal-only scenario comparison: base scenario + 2-3 alternatives. NOT shared with buyer. Helps seller choose final quote composition.",
    output: "Selected scenario for quote",
  },
  {
    step: 15,
    name: "Seller Confidentiality",
    actor: "Seller",
    description: "Seller marks which cost components are confidential (e.g., EXW base, margin, logistics cost). Confidential components are hidden from buyer; only the total is shown.",
    output: "Confidentiality flags per cost component",
  },
  {
    step: 16,
    name: "Documentation Readiness",
    actor: "Seller + A2 (Document Requirement Extractor)",
    description: "Confirm all required documents are ready (commercial invoice, packing list, CoO, phytosanitary, fumigation cert, etc.). Trigger-driven by commodity + origin + destination.",
    output: "Document readiness report",
    aiAssistance: "A2 (Document Requirement Extractor) trigger-driven checklist",
    governorGate: "G1U17 — mandatory documents must be ready",
  },
  {
    step: 17,
    name: "Regulatory / Export Readiness",
    actor: "Seller + A2 (RIA)",
    description: "Confirm export licence valid, customs registration valid, sanctions cleared, RIA compliance check passed.",
    output: "Regulatory readiness report",
    aiAssistance: "A2 (Regulatory Intelligence Agent) — export + import country rules",
    governorGate: "G1U18 — RIA compliance passed",
  },
  {
    step: 18,
    name: "Document Generation",
    actor: "System (auto)",
    description: "Auto-generate: packing list, commercial invoice, customs declaration draft. All documents reference the USTN (when issued) or the Request UUID.",
    output: "Generated documents (PDF + XML + JSON)",
    aiAssistance: "A1 (Tenant Message Generator) for cover letters",
  },
  {
    step: 19,
    name: "Delivery Schedule Confirmation",
    actor: "Seller + A2 (Schedule Optimiser)",
    description: "Confirm delivery window matches buyer's request. If can't meet, propose alternative window with reasoning.",
    output: "Confirmed or proposed delivery schedule",
    aiAssistance: "A2 (Schedule Optimiser) feasibility + alternatives",
  },
  {
    step: 20,
    name: "Multi-Shipment Response",
    actor: "Seller",
    description: "If buyer requested multi-shipment: accept, modify, or reject the proposed schedule. Each shipment gets its own USTN at lock.",
    output: "Multi-shipment schedule (accepted / modified / rejected)",
    governorGate: "G1U19 — multi-shipment schedule lock",
  },
  {
    step: 21,
    name: "Quote Construction",
    actor: "Seller",
    description: "Assemble final quote: EXW price (locked) + packing plan (locked) + logistics costs (selected mode) + insurance + government fees + SGTX platform fee + margin + alternative delivery options. All assembled into a single quote JSON.",
    output: "Final quote JSON + PDF",
    aiAssistance: "A1 (Settlement Structure Recommender) for settlement structure",
  },
  {
    step: 22,
    name: "Quote Status Model",
    actor: "System",
    description: "Quote enters DRAFT status → submitted → SUBMITTED → buyer reviews → ACCEPTED / REJECTED / COUNTERED / EXPIRED.",
    output: "Quote status set",
  },
  {
    step: 23,
    name: "Quote Versioning",
    actor: "System",
    description: "Quotes are versioned. Counter-offers create new versions. All versions preserved in quote_versions table.",
    output: "Quote version incremented",
  },
  {
    step: 24,
    name: "Quote Expiry",
    actor: "System",
    description: "Quotes expire after a seller-set duration (default 7 days; max 30 days). Expired quotes cannot be accepted; seller must issue a new quote.",
    output: "Expiry timestamp set",
  },
  {
    step: 25,
    name: "Negotiation (Phase 3 bridge)",
    actor: "Buyer + Seller",
    description: "If buyer counters, the negotiation workflow (Section 9) takes over. The Seller Workflow ends at quote submission; negotiation is a separate phase.",
    output: "Hand-off to Section 9 (Negotiation)",
  },
];

// ============ v18 §8.2.9 — Three Flexible Logistics Modes ============

export interface LogisticsMode {
  mode: string;
  name: string;
  description: string;
  useCase: string;
  output: string;
}

export const LOGISTICS_MODES: LogisticsMode[] = [
  {
    mode: "A",
    name: "Manual Entry",
    description: "Seller enters logistics costs manually based on their own contracts with carriers/forwarders.",
    useCase: "Seller has pre-negotiated rates with specific carriers; no RFQ needed.",
    output: "Manual logistics cost line items",
  },
  {
    mode: "B",
    name: "RFQ to Logistics Service Providers (LSPs)",
    description: "Seller broadcasts RFQ to saved LSP contacts. Each LSP submits a quote from their GTID. System collects quotes and presents them for selection.",
    useCase: "Seller wants competitive bids from multiple LSPs.",
    output: "Multiple LSP quotes for selection",
  },
  {
    mode: "C",
    name: "Direct to Shipping Lines (SHIPs)",
    description: "Seller requests booking directly from saved SHIP contacts. Each SHIP submits a booking quote from their GTID. System collects and presents for selection.",
    useCase: "Seller wants to deal directly with the ocean carrier (no forwarder intermediary).",
    output: "Multiple SHIP booking quotes for selection",
  },
];

// ============ v18 §8.2.22 — Quote Status Model ============

export const QUOTE_STATUSES = [
  { status: "DRAFT", description: "Seller is still constructing the quote", whoCanAdvance: "Seller (submit)" },
  { status: "SUBMITTED", description: "Quote submitted to buyer for review", whoCanAdvance: "Buyer (accept/reject/counter)" },
  { status: "ACCEPTED", description: "Buyer accepted the quote — proceeds to contract lock (Section 9)", whoCanAdvance: "System (auto)" },
  { status: "REJECTED", description: "Buyer rejected the quote — seller can revise", whoCanAdvance: "Seller (revise → new version)" },
  { status: "COUNTERED", description: "Buyer countered — enters negotiation (Section 9)", whoCanAdvance: "Negotiation workflow" },
  { status: "EXPIRED", description: "Quote expired (default 7 days; max 30 days)", whoCanAdvance: "Seller (issue new quote)" },
  { status: "WITHDRAWN", description: "Seller withdrew the quote before buyer response", whoCanAdvance: "—" },
];

// ============ v18 §8.1 — Seller Workflow Timeline ============

export const SELLER_WORKFLOW_TIMELINE = {
  phase: "Phase 2 — Quote, Packing & Logistics",
  days: "Days 5-8 (seller prepares and submits quote)",
  oneClickGuarantee: "From opening the request to submitting the quote, approximately 12-15 clicks (excluding data entry). Voice commands available for packing and logistics selections.",
} as const;

// ============ v18 §8.1 — Phase 2 Components ============

export const PHASE_2_COMPONENTS = [
  "Loading Origin (where the goods will be loaded)",
  "EXW Price Lock (pricing the goods with AI market intelligence)",
  "Packing & Containerisation (designing the physical packing plan with non-uniform layer stacking)",
  "Logistics Orchestration (determining logistics costs through three flexible modes)",
  "Alternative Delivery Ports (providing options to the buyer)",
  "Multi-Shipment Response (accepting, modifying, or rejecting multi-shipment schedules)",
  "Quote Submission (assembling the final price and submitting to the buyer)",
] as const;

// ============ v18 §8.1 — Quote Composition ============

export const QUOTE_COMPOSITION = [
  "EXW price (with AI market intelligence)",
  "Packing plan (with non-uniform layers, SSCC barcodes, and acceptance criteria references)",
  "Logistics costs (selected from the three flexible modes)",
  "Alternative delivery options",
  "SGTX platform fee (engine-determined, calculated on the Canonical Fee Basis per Section 9.27)",
  "Full multi-shipment schedule (if applicable)",
  "All generated documents (packing list, invoice, customs declaration)",
] as const;

// ============ Convenience: full canonical seller workflow payload ============

export function getSellerWorkflowPayload() {
  return {
    principles: SELLER_WORKFLOW_PRINCIPLES,
    steps: SELLER_WORKFLOW_STEPS,
    logistics_modes: LOGISTICS_MODES,
    quote_statuses: QUOTE_STATUSES,
    timeline: SELLER_WORKFLOW_TIMELINE,
    phase_2_components: PHASE_2_COMPONENTS,
    quote_composition: QUOTE_COMPOSITION,
    counts: {
      principles: SELLER_WORKFLOW_PRINCIPLES.length, // 12
      steps: SELLER_WORKFLOW_STEPS.length, // 25
      logistics_modes: LOGISTICS_MODES.length, // 3
      quote_statuses: QUOTE_STATUSES.length, // 7
      phase_2_components: PHASE_2_COMPONENTS.length, // 7
      quote_composition_items: QUOTE_COMPOSITION.length, // 7
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
