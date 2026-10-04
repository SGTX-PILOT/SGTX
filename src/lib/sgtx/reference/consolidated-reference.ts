// @ts-nocheck
// =============================================================================
// SGTX v18 §15-§24 — Consolidated Canonical Reference (Governor Gates,
// Portal Architecture, Data Model, API Index, Canonical Tx State,
// Global Trade Graph, Platform Guarantees, Add-Ons, Network Effects, Roadmap)
// -----------------------------------------------------------------------------
// This module consolidates the high-level canonical reference data from the
// final 10 sections of the v18 blueprint (§15-§24). Each section's full
// detail is in its own dedicated module where applicable; this module
// captures the cross-section reference data that auditors + downstream
// teams need at a glance.
//
// Consumed by:
//   • /api/v1/reference/consolidated   — public canonical mirror
//   • /api/sgtx/reference/consolidated — internal mirror
// =============================================================================

// ============ v18 §15 — Governor Gates Complete Matrix ============

export const GOVERNOR_GATES_MATRIX = {
  total_gates: 42, // G1U1 through G1U42
  gate_prefixes: {
    G1U1_G1U8: "Buyer Workflow (§6) — seller verification, incoterm, transport, commodity, lab tests, QC, AI advisor, documentation, criticality",
    G1U9_G1U13: "Financing Pre-Clearance CFR (§7) — financier KYB, CFR QES, CFR validated at lock, formal request auto-created, bank confirmation",
    G1U14_G1U19: "Seller Workflow (§8) — feasibility, packing lock, EXW lock, doc readiness, regulatory, multi-shipment",
    G1U20_G1U27: "Negotiation Phase 3 (§9) — Clause Forge, upload contract, mutual confirmation, contract signed, contract validated, fee precondition, sanctions cleared, regulatory pre-clearance",
    G1U28_G1U33: "Formal Trade Finance Phase 4 (§10) — amount, agreement signed, disbursement, collateral release, default declaration, financing closure",
    G1U34_G1U37: "Service Provider + Physical Execution (§11-12) — provider capabilities, pallet status, QC hold release, milestone-triggered payments",
    G1U38_G1U42: "Settlement + Post-Trade (§13-14) — settlement instruction signed, reconciliation, distressed cargo, dispute resolution, USTN closure",
  },
  enforcement_model: {
    flow: "Every mutating API call → Governor governorDecide() → OPA Rego policy evaluation → WasmEdge constitutional check → AI Decision Merger (A1+A2+A3 advisory) → Final verdict (ALLOW / DENY / CONDITIONAL)",
    denyIsBlocking: "OPA DENY is blocking — no downstream component can override",
    conditionalWorkflow: "CONDITIONAL returns a Decision Panel with remediation actions",
    loomAnchor: "Every Governor decision Loom-anchored (G4)",
    auditLog: "All decisions stored in governor_decisions table with policy version + signature",
  },
} as const;

// ============ v18 §16 — Portal Architecture & Universal Command Center ============

export const PORTAL_ARCHITECTURE = {
  portals: [
    { code: "TRD", name: "Trader Portal", description: "Buyer + Seller modes (DUAL toggle), trade request creation, quote submission, contract signing" },
    { code: "LSP", name: "LSP Portal", description: "RFQ inbox, dispatch, load planning, mobile app for drivers" },
    { code: "SHIP", name: "Shipping Line Portal", description: "Booking requests, vessel schedule, eBL management, milestone updates" },
    { code: "LAB", name: "Laboratory Portal", description: "Test jobs, sample instructions, results submission, MRL, certificate issuance" },
    { code: "QC", name: "QC Inspection Portal", description: "Inspection jobs, AR defect detection, AQL sampling, conditional pass" },
    { code: "CBR", name: "Customs Broker Portal", description: "Certification requests, physical document handling, storage, audit representation" },
    { code: "FIN", name: "Financier Portal", description: "RFQ inbox, bids, portfolio, repayment monitoring, collateral management" },
    { code: "GOV", name: "Government Portal", description: "Live trade monitor, anonymous trade view, multi-agency coordination, permit issuance" },
    { code: "MP", name: "Marketplace Partner Portal", description: "API-only access, webhook configuration, revenue share tracking" },
    { code: "ADM", name: "Admin Portal", description: "Constitutional policies, Governor log, tenant management, special rate manager" },
  ],
  command_center_components: [
    "Smart Inbox (default landing — 4-part structure WHAT/WHY/DEADLINE/ACTION, 9 categories, 3 priority bands)",
    "Trade Command Center (universal dashboard — executive cards, quick actions, AI assistant, recent activity, integrations health, Trade Health Score composite)",
    "Dual Trader-Mode Toggle (BUY/SELL/DUAL — JWT claim, audited switch)",
    "Universal Search + USTN Resolution (6 entity types — shipments, quotes, contracts, financing, disputes, contacts)",
  ],
  trade_health_score: {
    formula: "Compliance 20% + Documentation 20% + Logistics 15% + Payment 15% + Risk 20% + Timeline 10%",
    range: "0-100 composite",
    refresh: "Real-time on state change + 15-min materialized view for analytics",
    breakdownPanel: "Click score → sub-scores + AI-generated plain-language summary (A1)",
  },
  wcag_compliance: "WCAG 2.2 AA — semantic HTML, ARIA, keyboard nav, screen reader support, 44px touch targets",
  responsive_design: "Mobile-first; md/lg/xl breakpoints; sidebar hidden on mobile with hamburger menu",
} as const;

// ============ v18 §17 — Complete Data Model (PostgreSQL Schema) ============

export const DATA_MODEL = {
  database: "PostgreSQL 16+ (production); SQLite (dev); Turso libsql (cloud dev)",
  table_count: "425+ tables across 24 domains",
  domains: [
    "Identity & Tenancy (§4) — tenants, employees, saved_contacts, tenant_verified_ids, gtid_resolution_logs, ustn_counters, gtid_revocation_logs",
    "USTN Lifecycle (§5) — trades, shipments, ustn_settlement_manifests, ustn_counters, pallet_details, container_details",
    "Buyer Workflow (§6) — trade_requests, trade_request_commodities, trade_request_drafts, trade_request_readiness",
    "Seller Workflow (§8) — quotes, quote_versions, packing_plans, pallet_details, service_quotations",
    "Negotiation (§9) — negotiation_versions, contracts, contract_addenda, fee_locks, settlement_manifests",
    "Financing (§7, §10) — conditional_financing_references, financing_requests, financing_bids, financing_agreements, financing_agreement_annexes, collateral_pledges, collateral_release_evidence, bank_confirmation_proofs",
    "Service Provider (§11) — service_capability_definitions, provider_port_coverage, service_quotations",
    "Physical Execution (§12) — shipments, milestones, pallet_scans, container_scans, mobile_app_events, ustn_qr_codes",
    "Settlement (§13) — settlement_manifests, settlement_legs, reconciliation_records, monthly_reconciliation_statements",
    "Post-Trade (§14) — distressed_cargo_declarations, disputes, dispute_evidence, dispute_mediation, evidence_packages",
    "Constitutional (§3) — governor_decisions, opa_policies, loom_chain, multisig_requests, configuration_history",
    "AI (§3.4) — ai_inference_records, ai_agent_registry, ai_fallback_logs",
    "Trust (§4.12) — trust_passports, tri_history, trust_components",
    "Network (§4.11) — saved_contacts, contact_trust_scores",
    "Compliance (§4.2) — sanctions_screening, pep_screening, kyb_documents, kyb_status_history",
    "Operations (§12) — vessel_tracking, ais_pings, port_congestion, weather_data",
    "Customs (§11) — customs_declarations, customs_clearance, nafeza_acid_filings",
    "Documents (§6-9) — documents, document_versions, document_signatures, evidence_packages",
    "Audit (§3.5) — loom_chain, loom_anchors, audit_logs, governor_decisions",
    "Admin (§16) — admin_actions, configuration_history, special_rates, customer_care_sessions",
    "Add-Ons (§22) — 40+ add-on-specific tables (currency_risk, demurrage, cold_chain, etc.)",
    "Realtime (§2.5) — inbox_items, inbox_history, inbox_preferences, notifications",
    "Reference Data (§20) — jurisdictions, ports, hs_codes, incoterms, currencies, languages",
    "Mobile (§12) — mobile_app_sessions, mobile_app_events, qr_codes",
  ],
  key_invariants: [
    "Every table that stores transactional state has a USTN foreign key (where applicable)",
    "Every mutating action has a Governor decision row (governor_decisions.id) + Loom anchor",
    "Every AI inference is logged (ai_inference_records)",
    "Every external registry verification stores source classification + retrieval method + evidence reference",
    "Every irreversible action requires QES (where legally binding) or multisig (where constitutional)",
  ],
  indexes_strategy: "All foreign keys indexed; all USTN columns indexed; all timestamp columns indexed (descending) for time-series queries",
} as const;

// ============ v18 §18 — API Endpoint Index ============

export const API_ENDPOINT_INDEX = {
  total_endpoints: "400+ v1 + sgtx mirror endpoints",
  categories: [
    "Public Verification & Health (§18.26) — /api/v1/blueprint, /constitution, /status, /keys, /public-endpoints, /openapi.json, /verify/loom, /gtid/resolve, /ustn/track, /evidence/package",
    "Authenticated Platform-Wide (§2.5) — /api/v1/search, /api/v1/employee/switch-context",
    "Identity & Onboarding (§4) — /api/v1/onboarding/start|step|complete|wizard, /api/v1/kyb/tiers",
    "USTN (§5) — /api/v1/ustn/format, /api/v1/ustn/track",
    "Buyer Workflow (§6) — /api/v1/workflow/buyer",
    "CFR Financing (§7) — /api/v1/workflow/cfr",
    "Seller Workflow (§8) — /api/v1/workflow/seller",
    "Negotiation (§9) — /api/v1/workflow/negotiation",
    "Formal Trade Finance (§10) — /api/v1/workflow/finance",
    "Service Provider (§11) — /api/v1/workflow/service-provider",
    "Physical Execution (§12) — /api/v1/workflow/physical-execution",
    "Settlement + Post-Trade (§13-14) — /api/v1/workflow/settlement",
    "Governor (§3, §15) — /api/sgtx/governor/decision|decisions|gates|verify-loom|modules|audit-cron|policy-author",
    "Constitutional (§3) — /api/v1/constitution, /api/sgtx/constitutional-policies, /api/sgtx/constitutional-policies/[id]/proposal",
    "AI (§3.4) — /api/sgtx/ai/chat, /api/sgtx/ai/hs-code, /api/sgtx/voice/*",
    "Smart Inbox (§2.5.1) — /api/sgtx/inbox, /api/sgtx/inbox/snooze, /api/sgtx/inbox/dismiss, /api/sgtx/inbox/history, /api/sgtx/inbox/preferences",
    "Dashboard (§2.5.2) — /api/sgtx/dashboard",
    "Trade (§6-9) — /api/sgtx/trade-request, /api/sgtx/quote-v2, /api/sgtx/negotiation, /api/sgtx/contract, /api/sgtx/feeling",
    "Financing (§7, §10) — /api/sgtx/financing/*",
    "Operations (§11, §12) — /api/sgtx/operations/*",
    "Money (§13) — /api/sgtx/invoice, /api/sgtx/payment, /api/sgtx/settlement",
    "Trust (§4.12) — /api/sgtx/trust-passport, /api/sgtx/tri",
    "Network (§4.11) — /api/sgtx/contacts, /api/sgtx/corridor",
    "Admin (§16) — /api/sgtx/admin/*, /api/sgtx/tenant, /api/sgtx/tenants",
    "Add-Ons (§22) — 40+ add-on-specific endpoint groups (demurrage, currency-risk, cold-chain, etc.)",
  ],
  rate_limit_strategy: "Per-IP + per-tenant in-memory rate limiters; public endpoints 100 req/min/IP, authenticated endpoints 50 req/min/IP, sensitive endpoints (verify/loom, evidence/package) 10 req/min/IP",
  auth_model: "Bearer JWT (HMAC-SHA256) verified by middleware; x-sgtx-payload header carries {gtid, tenantGtid, role, activeTraderMode}",
} as const;

// ============ v18 §19 — Canonical Transaction State & Settlement Architecture ============

export const CANONICAL_TX_STATE = {
  principle: "Single coherent state-vector — no subsystem may introduce a second competing state architecture (Point 35)",
  state_vector: {
    ustn: "canonical namespace",
    phase: "Phase 1-8 (current phase)",
    status: "16 lifecycle statuses (INITIATED → COMPLETED)",
    parties: "buyer_gtid + seller_gtid + financier_gtid + provider_gtids[]",
    financial_state: "FeeLock state + settlement manifest state + financing agreement state",
    documentary_state: "documents[] with status (PENDING/VERIFIED/REJECTED)",
    regulatory_state: "RIA compliance status + sanctions + PEP + jurisdictions[]",
    physical_state: "shipment milestones + container/pallet status + AIS tracking",
    governance_state: "Governor decision history + Loom chain anchor",
  },
  multi_clock_semantics: "Each party + each external system has its own clock; the platform reconciles across all clocks (§12.1.7)",
  finality_rules: [
    "Settlement ≠ closure (Point 31) — settlement is one closure condition, not THE closure condition",
    "Timeout never creates finality (Point 30) — UNKNOWN state subject to reconciliation",
    "Evidence integrity ≠ legal authority (Point 32) — hash-verified record doesn't constitute a legal fact",
    "Assertion ≠ confirmation (Point 33) — party statement is never equivalent to external confirmation",
    "External-system divergence must be represented (Point 34) — never silently overwritten",
  ],
  reconciliation_model: {
    trigger: "External authoritative system returns a fact that contradicts internal state",
    behavior: "Both internal + external records preserved; reconciliation control plane evaluates; Loom chain shows divergence + resolution path",
    governorGate: "G1U43 (canonical reconciliation) — pure function evaluated by WasmEdge",
  },
  financial_exposure_engine: "Tracks exposure independently of transaction state (Point 36) — exposure may remain open after settlement; must remain visible until cleared",
} as const;

// ============ v18 §20 — Global Trade Graph, Jurisdiction Fabric & Transport Engines ============

export const GLOBAL_TRADE_GRAPH = {
  graph_model: "Nodes = tenants (GTIDs) + ports + jurisdictions; Edges = trade relationships + corridors + regulatory edges",
  gnn_purpose: "Trust analytics for KNOWN parties only — never recommends or ranks counterparties (Point 22)",
  gnn_implementation: "Graph Neural Network (A2 authority) — sanctions proximity (2-hop), trust score propagation, anomaly detection",
  jurisdiction_fabric: {
    table: "jurisdictions (ISO 3166-1 alpha-2 + sanctions status + regulatory profile)",
    ria_driven: "Regulatory Intelligence Agent (A3) compiles jurisdiction rules per (origin, destination, commodity, incoterm) tuple",
    jurisdiction_supremacy: "Strictest rule among buyer, seller, logistics, financier, and governing-law jurisdictions always applies (Pillar III)",
  },
  transport_engines: [
    "Ocean Container Engine — vessel schedules, port congestion, BAF surcharges, container utilisation",
    "Air Cargo Engine — flight schedules, ULD availability, airport congestion, IATA rates",
    "Road Corridor Engine — OSRM routing, border crossings, trucking rates, fleet availability",
    "Rail Freight Engine — train schedules, container wagon availability, rail terminal congestion",
    "RoRo Engine — vessel schedules, vehicle deck availability, port handling",
    "Multimodal Engine — combines 2+ engines for end-to-end routing",
  ],
  corridor_reference: "Trade Corridor Network (TCN) — pre-computed corridors with historical performance + typical pricing (anonymised, differentially private)",
} as const;

// ============ v18 §21 — Platform Guarantees: Security, Availability & Privacy ============

export const PLATFORM_GUARANTEES = {
  security: [
    "Passkey (WebAuthn) authentication — no passwords",
    "Step-up authentication for irreversible actions (multisig + QES)",
    "All mutating actions Governor-gated (G1)",
    "Loom audit chain — SHA-256 hash-chained, externally verifiable (G4)",
    "Post-quantum readiness — Dilithium3 for archival signatures (simulated until liboqs wired)",
    "Penetration testing schedule + security audit trail",
  ],
  availability: [
    "99.9% uptime SLA target",
    "Multi-region deployment (EG-CAIRO-EAST, EU-FRA, US-EAST sovereign nodes)",
    "Graceful degradation — A1/A2 AI fallback chain (Groq → Ollama → static templates)",
    "Hourly Loom chain verification — P0 incident on mismatch",
    "Cron-based audit + reconciliation jobs",
  ],
  privacy: [
    "PDPL (Egyptian Personal Data Protection Law) compliance",
    "GDPR compliance for EU tenants",
    "Data localization per jurisdiction (sovereign nodes)",
    "Right to be forgotten — tenant data deletion workflow",
    "Consent management (§4.8) — explicit consent for trust components, verified IDs, financing history, dispute history",
    "DPIA (Data Protection Impact Assessment) workflow for new features",
    "DPO (Data Protection Officer) role with audit + reporting authority",
  ],
} as const;

// ============ v18 §22 — Platform Add-Ons & Extended Capabilities ============

export const PLATFORM_ADDONS = [
  { code: "DEMURRAGE", name: "Demurrage & Detention Management", description: "Track port free-time, calculate demurrage/detention, dispute charges" },
  { code: "CURRENCY_RISK", name: "Currency Risk Management", description: "FX exposure tracking + hedge recommendations" },
  { code: "COLD_CHAIN", name: "Cold Chain Management", description: "Reefer container telemetry + temperature excursion alerts" },
  { code: "GOV_SANDBOX", name: "Government API Sandbox", description: "Test government API integrations (Nafeza, ETA, etc.) without production impact" },
  { code: "DISTRESSED", name: "Distressed Cargo Marketplace", description: "Non-marketplace accelerated outreach for distressed cargo recovery" },
  { code: "BONDS", name: "Bond Issuance", description: "Trade-finance bond issuance + tracking" },
  { code: "BACK_TO_BACK_LC", name: "Back-to-Back L/C", description: "Letter of Credit back-to-back workflow" },
  { code: "DEFERRED_PAYMENTS", name: "Deferred Payment Tracking", description: "Future-dated payment instruction tracking + reminder schedule" },
  { code: "BROKER_LIABILITY", name: "Broker Liability Insurance", description: "Customs broker liability coverage" },
  { code: "CARGO_INSURANCE", name: "Cargo Insurance Marketplace", description: "Non-marketplace insurance RFQ to saved contacts" },
  { code: "CARBON_FOOTPRINT", name: "Carbon Footprint Tracking", description: "Per-shipment CO2e calculation + offset options" },
  { code: "ECO_PACKAGING", name: "Eco-Packaging Rating", description: "Packaging sustainability scoring" },
  { code: "CONNECTOR_RISK", name: "Connector Risk Assessment", description: "Risk assessment for external connector integrations" },
  { code: "DATA_LOCALIZATION", name: "Data Localization Engine", description: "Per-jurisdiction data residency rules" },
  { code: "DIGITAL_TWIN", name: "Digital Twin", description: "Per-shipment digital twin with real-time state vector" },
  { code: "DWELL_TIME", name: "Dwell Time Analytics", description: "Port/terminal dwell time analytics" },
  { code: "EU_PESTICIDES", name: "EU Pesticides MRL", description: "EU Maximum Residue Limits compliance" },
  { code: "FTA", name: "Free Trade Agreement Engine", description: "FTA preference determination + certificate of origin" },
  { code: "FX", name: "FX Rate Engine", description: "Real-time FX rates + historical + forward" },
  { code: "GNRI", name: "Global Network Risk Index", description: "Aggregate risk index per corridor" },
  { code: "INSURANCE", name: "Insurance Recommender", description: "AI insurance recommendations (A1 advisory)" },
  { code: "LC_MATCHING", name: "L/C Matching", description: "Letter of Credit matching engine" },
  { code: "MICRO_CONTRACT", name: "Micro-Contract Engine", description: "Smart contract templates for micro-trades" },
  { code: "MOBILE", name: "Mobile App", description: "LSP driver + QC inspector + Buyer apps with barcode + voice" },
  { code: "NOWLUN", name: "Nowlun Integration", description: "Shipping line schedule integration" },
  { code: "PENTEST", name: "Penetration Testing Hub", description: "Scheduled + on-demand pentests" },
  { code: "PERMIT", name: "Permit Management", description: "Government permit tracking + renewal alerts" },
  { code: "PESTICIDES", name: "Pesticides Database", description: "Codex + regional pesticides MRL database" },
  { code: "PORT_PAIR", name: "Port Pair Reference", description: "Pre-computed port pair distances + typical transit times" },
  { code: "POST_CLOSURE", name: "Post-Closure Reclaim", description: "Post-closure evidence addition (never modification)" },
  { code: "PQC", name: "Post-Quantum Cryptography", description: "Dilithium3 + Kyber768 readiness" },
  { code: "REEFER_POWER", name: "Reefer Power Management", description: "Reefer container power management at port + on vessel" },
  { code: "REGIONAL_PESTICIDES", name: "Regional Pesticides", description: "Regional pesticide MRL overrides" },
  { code: "REGULATORY_PRECHECK", name: "Regulatory Pre-Check", description: "Pre-trade regulatory feasibility check" },
  { code: "REGULATORY_SIMULATION", name: "Regulatory Simulation", description: "Simulate regulatory impact of trade structure changes" },
  { code: "REGULATORY_SNAPSHOT", name: "Regulatory Snapshot", description: "Point-in-time regulatory state for a trade" },
  { code: "REINSPECTION", name: "Re-Inspection Workflow", description: "QC re-inspection after CONDITIONAL_PASS" },
  { code: "SHIPPERS_DECLARATION", name: "Shippers Declaration", description: "Dangerous goods shippers declaration" },
  { code: "SIGNATURE_LEGALITY", name: "Digital Signature Legality", description: "Per-jurisdiction signature legality registry" },
  { code: "SINGLE_WINDOW", name: "Single Window Integration", description: "Egyptian Single Window for Foreign Trade integration" },
  { code: "SLA", name: "SLA Management", description: "SLA tracking + incident credits" },
  { code: "SPECIAL_RATE", name: "Special Rate Manager", description: "Per-tenant SGTX fee rate overrides (multisig)" },
  { code: "TCN", name: "Trade Corridor Network", description: "Pre-computed corridors + historical performance" },
  { code: "TERMINAL", name: "Terminal Integration", description: "Port terminal integration (gate, crane, yard)" },
  { code: "THREATS", name: "Threat Intelligence", description: "Sanctions + cyber + physical threat feeds" },
  { code: "VALUATION", name: "Cargo Valuation Engine", description: "Per-commodity real-time valuation" },
  { code: "VESSEL_TRACKING", name: "Vessel Tracking (AIS)", description: "AIS vessel position tracking + ETA" },
  { code: "VOICE", name: "Voice Command", description: "Voice intent extraction (Vosk + HF Mixtral)" },
  { code: "WORKFLOW", name: "Workflow Engine", description: "Configurable workflow steps per tenant" },
  { code: "WORLDWIDE_ROUTES", name: "Worldwide Routes Dashboard", description: "All trade lanes with status indicators" },
  { code: "ZK", name: "Zero-Knowledge Proofs", description: "Private settlement proofs (price confidentiality)" },
];

// ============ v18 §23 — Network Effects, Trade Corridor Network, Barcodes & Workflow ============

export const NETWORK_EFFECTS = {
  trade_corridor_network: "Pre-computed corridors (port pairs) with historical performance + typical pricing",
  barcodes: [
    "SSCC (GS1-128) for pallets — 18-digit numeric with check digit",
    "ISO 6346 for containers — 11-character alphanumeric with check digit",
    "USTN QR code (ISO/IEC 18004) for trade lookup",
    "GS1 DataMatrix for dense 2D marking (lab samples, small packages)",
  ],
  workflow_examples: [
    "First Trade (Buyer) — full journey from registration to settlement",
    "First Trade (Seller) — full journey from request to settlement",
    "Multi-Shipment — multi-shipment contract with independent USTNs",
    "Distressed Cargo — partial distress + MicroUSTN + triage",
    "Dispute — filing + mediation + resolution",
    "Financing — CFR pre-clearance + formal execution + repayment",
    "Customs — Nafeza ACID + import clearance + certificate of origin",
  ],
  network_effects: [
    "Trust Passport (§4.12) — portability across trades",
    "Trade Reliability Index (TRI) — accumulates with each trade",
    "Saved Contacts (§4.11) — relationship graph grows over time",
    "Anonymised Aggregate Stats — differentially private pricing/ETA references",
  ],
  non_marketplace_rule: "Network effects never surface unsolicited counterparties (Point 22 — GNN non-marketplace bounded)",
} as const;

// ============ v18 §24 — Canonical Terminology & Implementation Roadmap ============

export const CANONICAL_TERMINOLOGY_ROADMAP = {
  terminology_count: "200+ canonical terms defined",
  key_terms: [
    "USTN — Universal Shipment Tracking Number (§5)",
    "GTID — Global Trade Entity ID (§4.1)",
    "CFR — Conditional Financing Reference (§7)",
    "ERR — Execution Readiness Reference (§10.7)",
    "TRI — Trade Reliability Index (§4.12)",
    "GNN — Graph Neural Network (A2)",
    "RIA — Regulatory Intelligence Agent (A3)",
    "QES — Qualified Electronic Signature (§3.5.10)",
    "OPA — Open Policy Agent (§3.5.4)",
    "WasmEdge — WebAssembly runtime (§3.5.5)",
    "Loom — SHA-256 hash-chained audit log (§3.5.6)",
    "FeeLock — Non-custodial fee instruction (Pillar I)",
    "TCC — Trade Command Center (§2.5.2)",
    "TCN — Trade Corridor Network (§23)",
    "SSCC — Serial Shipping Container Code (§12.1.6)",
  ],
  roadmap_phases: [
    "P0 — Constitution + Identity + USTN + Governor (DONE)",
    "P1 — Buyer + Seller Workflows + Negotiation + Lock (DONE)",
    "P2 — Financing (CFR + Formal) + Service Provider + Physical Execution (DONE)",
    "P3 — Settlement + Reconciliation + Post-Trade (DONE)",
    "P4 — Portal Architecture + Universal Command Center + Add-Ons (DONE)",
    "P5 — Mobile App + Voice + AI Assistant refinements (ongoing)",
    "P6 — Worldwide Routes + Global Trade Graph + Jurisdiction Fabric (ongoing)",
    "P7 — Post-Quantum Cryptography + Zero-Knowledge Proofs (planned)",
  ],
  validation_gates: [
    "§24.4.11 — Unit tests pass for each subsystem",
    "§24.4.12 — Integration tests pass for each workflow phase",
    "§24.4.13 — End-to-end semantic convergence test (Business Workflow = API = DB = Event = Governor = Policy = External = Reconciliation = UI = Test)",
    "§24.7 — A transaction must never be reported as production-complete merely because individual service tests pass",
  ],
  success_condition: "Business Workflow = API Model = Database Model = Event Model = Governor Rules = Policy Engine = External Authority Model = Reconciliation Model = UI State = Test Assertions",
} as const;

// ============ Convenience: full consolidated reference payload ============

export function getConsolidatedReferencePayload() {
  return {
    governor_gates_matrix: GOVERNOR_GATES_MATRIX,
    portal_architecture: PORTAL_ARCHITECTURE,
    data_model: DATA_MODEL,
    api_endpoint_index: API_ENDPOINT_INDEX,
    canonical_tx_state: CANONICAL_TX_STATE,
    global_trade_graph: GLOBAL_TRADE_GRAPH,
    platform_guarantees: PLATFORM_GUARANTEES,
    platform_addons: PLATFORM_ADDONS,
    network_effects: NETWORK_EFFECTS,
    canonical_terminology_roadmap: CANONICAL_TERMINOLOGY_ROADMAP,
    counts: {
      governor_gates: GOVERNOR_GATES_MATRIX.total_gates, // 42
      governor_gate_groups: Object.keys(GOVERNOR_GATES_MATRIX.gate_prefixes).length, // 7
      portals: PORTAL_ARCHITECTURE.portals.length, // 10
      command_center_components: PORTAL_ARCHITECTURE.command_center_components.length, // 4
      health_score_components: 6, // Compliance + Documentation + Logistics + Payment + Risk + Timeline
      data_model_domains: DATA_MODEL.domains.length, // 24
      api_endpoint_categories: API_ENDPOINT_INDEX.categories.length, // 25
      canonical_tx_finality_rules: CANONICAL_TX_STATE.finality_rules.length, // 5
      transport_engines: GLOBAL_TRADE_GRAPH.transport_engines.length, // 6
      security_guarantees: PLATFORM_GUARANTEES.security.length, // 6
      availability_guarantees: PLATFORM_GUARANTEES.availability.length, // 5
      privacy_guarantees: PLATFORM_GUARANTEES.privacy.length, // 7
      platform_addons: PLATFORM_ADDONS.length, // 50
      barcode_formats: NETWORK_EFFECTS.barcodes.length, // 4
      workflow_examples: NETWORK_EFFECTS.workflow_examples.length, // 7
      key_terms: CANONICAL_TERMINOLOGY_ROADMAP.key_terms.length, // 15
      roadmap_phases: CANONICAL_TERMINOLOGY_ROADMAP.roadmap_phases.length, // 8
      validation_gates: CANONICAL_TERMINOLOGY_ROADMAP.validation_gates.length, // 4
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
