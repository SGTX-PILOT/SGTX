// @ts-nocheck
// =============================================================================
// SGTX v18 §11 — Service Provider Capability Model (Unified Portal Architecture)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the service capability
// catalogue + provider onboarding + RFQ/Quote/Review/Selection flow +
// geo-aware service matching.
//
// Consumed by:
//   • /api/v1/workflow/service-provider   — public canonical mirror
//   • /api/sgtx/workflow/service-provider — internal mirror
// =============================================================================

// ============ v18 §11.1 — Purpose & Model Principles ============

export const SERVICE_PROVIDER_PRINCIPLES = [
  "Unified Portal Architecture — a single GTID can offer any combination of services (Trucking + Customs Brokerage, etc.); portal tabs render dynamically from the service_capabilities array",
  "Capability Catalogue is First-Class — every capability has a stable code, display name, group, and default portal tab",
  "Provider Sub-Types — LSP sub-types (TRUCKING, FORWARDER, WAREHOUSING) and FIN sub-types (BANK, PRIVATE) recorded alongside capabilities",
  "Accreditation Flag — capabilities flagged requires_accreditation (e.g., LAB_TESTING ISO 17025, QC_INSPECTION ISO 17020) require proof",
  "Insurance Flag — capabilities flagged requires_insurance require active insurance certificate",
  "Geo-Aware Service Matching — provider port coverage validates serviceability for the origin/destination ports",
  "Unified Quotation Pattern — every provider type (LSP, SHIP, LAB, QC, CBR) follows the same RFQ → Quote → Review → Explicit Selection pattern",
  "Non-Marketplace — providers are explicitly selected by the buyer/seller from saved contacts; no auto-suggestions",
  "Quote Transparency — every quote is transparently priced (line items visible); the platform never hides costs",
] as const;

// ============ v18 §11.2 — Service Capability Definitions ============

export interface ServiceCapability {
  capabilityCode: string;
  capabilityName: string;
  capabilityGroup: string;
  defaultPortalTab: string;
  requiresAccreditation?: boolean;
  requiresInsurance?: boolean;
}

export const SERVICE_CAPABILITIES: ServiceCapability[] = [
  { capabilityCode: "TRUCKING", capabilityName: "Trucking", capabilityGroup: "LOGISTICS", defaultPortalTab: "dispatch", requiresInsurance: true },
  { capabilityCode: "FORWARDING", capabilityName: "Freight Forwarding", capabilityGroup: "LOGISTICS", defaultPortalTab: "forwarder_console" },
  { capabilityCode: "WAREHOUSING", capabilityName: "Warehousing", capabilityGroup: "LOGISTICS", defaultPortalTab: "warehouse_dashboard", requiresInsurance: true },
  { capabilityCode: "OCEAN_FREIGHT", capabilityName: "Ocean Freight", capabilityGroup: "LOGISTICS", defaultPortalTab: "booking_requests" },
  { capabilityCode: "AIR_FREIGHT", capabilityName: "Air Freight", capabilityGroup: "LOGISTICS", defaultPortalTab: "booking_requests" },
  { capabilityCode: "CUSTOMS_BROKERAGE", capabilityName: "Customs Brokerage", capabilityGroup: "BROKERAGE", defaultPortalTab: "certification_requests", requiresAccreditation: true, requiresInsurance: true },
  { capabilityCode: "PHYSICAL_HANDLING", capabilityName: "Physical Document Handling", capabilityGroup: "BROKERAGE", defaultPortalTab: "physical_jobs", requiresInsurance: true },
  { capabilityCode: "STORAGE", capabilityName: "Document Storage", capabilityGroup: "BROKERAGE", defaultPortalTab: "storage_management", requiresInsurance: true },
  { capabilityCode: "AUDIT_REPRESENTATION", capabilityName: "Audit Representation", capabilityGroup: "BROKERAGE", defaultPortalTab: "audit_representation", requiresAccreditation: true },
  { capabilityCode: "LAB_TESTING", capabilityName: "Laboratory Testing", capabilityGroup: "LAB", defaultPortalTab: "testing_jobs", requiresAccreditation: true },
  { capabilityCode: "QC_INSPECTION", capabilityName: "QC Inspection", capabilityGroup: "QC", defaultPortalTab: "inspection_jobs", requiresAccreditation: true },
];

// ============ v18 §11.3 — Provider Onboarding & Verification ============

export const PROVIDER_ONBOARDING = {
  steps: [
    "1. Tenant registers as LSP, SHIP, LAB, QC, FIN, GOV, MP, or CBR per §4.3 onboarding wizard",
    "2. Tenant declares service_capabilities array (e.g., ['TRUCKING', 'WAREHOUSING'] for an LSP)",
    "3. For each capability flagged requires_accreditation: tenant uploads accreditation certificate (e.g., ISO 17025 for LAB_TESTING)",
    "4. For each capability flagged requires_insurance: tenant uploads active insurance certificate with expiry date",
    "5. RIA validates accreditation against the accreditation body (e.g., ISO 17025 against the accreditation issuer)",
    "6. RIA validates insurance expiry date (must be future-dated)",
    "7. Governor verifies all required capabilities are properly accredited + insured (G1U34)",
    "8. Tenant's portal tabs render dynamically based on declared capabilities",
  ],
  geoCoverageStep: "After onboarding, tenant configures provider_port_coverage per capability (port UN/LOCODE + country + last verified date)",
  governorGate: "G1U34 — provider capabilities accredited + insured + geo-coverage configured",
} as const;

// ============ v18 §11.4 — RFQ → Quote → Review → Explicit Selection Flow ============

export const RFQ_QUOTE_FLOW = {
  unifiedPattern: "Every provider type (LSP, SHIP, LAB, QC, CBR) follows the same RFQ → Quote → Review → Explicit Selection pattern",
  steps: [
    { step: "RFQ", actor: "Buyer or Seller", action: "Broadcasts RFQ to selected saved-contact providers with the required capability", output: "RFQ sent to N providers" },
    { step: "Quote", actor: "Provider", action: "Submits quote from provider's GTID with line-item pricing", output: "Quote JSON (line items + total + SLA + ETA + conditions)" },
    { step: "Review", actor: "Buyer or Seller", action: "Reviews all received quotes side-by-side with AI assistance (A1 plain-language comparison)", output: "Comparison report" },
    { step: "Explicit Selection", actor: "Buyer or Seller", action: "Explicitly selects one quote (no auto-selection — non-marketplace rule)", output: "Selected provider + quote acceptance" },
    { step: "Service Addendum", actor: "Provider + Buyer/Seller", action: "Both sign a service addendum (QES) referencing the USTN", output: "Signed service addendum" },
  ],
  transparencyRule: "Every quote is transparently priced — line items visible. No hidden costs. Provider's margin is the provider's business (not visible to the buyer).",
  nonMarketplaceRule: "The platform never auto-selects a provider. The buyer/seller explicitly chooses from received quotes.",
} as const;

// ============ v18 §11.4.1 — Provider Eligibility Filtering ============

export const PROVIDER_ELIGIBILITY_FILTERING = {
  filters: [
    "service_capability — provider must declare the required capability",
    "geo_coverage — provider must service the origin/destination port (provider_port_coverage table)",
    "accreditation_valid — for capabilities flagged requires_accreditation, the accreditation must be valid (not expired, not revoked)",
    "insurance_valid — for capabilities flagged requires_insurance, the insurance must be future-dated",
    "sanctions_cleared — provider's GTID sanctions-cleared",
    "lifecycle_state — provider's tenant lifecycle_state must be VERIFIED (not SUSPENDED, ARCHIVED, etc.)",
  ],
  aiAssistance: "A2 (Port Congestion Detection) flags providers at congested ports; A1 (Container Advisor) suggests alternative providers from saved contacts (advisory only)",
} as const;

// ============ v18 §11.4.2 — Unified Quotation Pattern ============

export const UNIFIED_QUOTATION_PATTERN = {
  commonFields: [
    "quote_number — unique per quote",
    "provider_gtid — the quoting provider's GTID",
    "trade_ustn (or trade_request_uuid if pre-lock)",
    "capability_code — the service capability being quoted",
    "line_items — JSON array of {description, quantity, unit, unit_price, total}",
    "total_usd — total in USD (currency conversion applied)",
    "currency — original currency",
    "sla — service level agreement (e.g., '48 hours for lab testing')",
    "eta — estimated delivery time",
    "conditions — JSON array of conditions",
    "validity — quote validity (default 7 days; max 30 days)",
    "provider_signature — QES signature by the provider",
  ],
  providerSpecificFields: {
    TRUCKING: ["per_km_rate", "vehicle_type", "fleet_availability"],
    FORWARDING: ["forwarder_licence_number", "subcontractor_network_size"],
    WAREHOUSING: ["storage_address", "temperature_controlled_capacity_m3", "storage_rate_per_m3_per_day"],
    OCEAN_FREIGHT: ["vessel_name", "vessel_imo", "container_type", "base_freight_rate", "baf_surcharges"],
    AIR_FREIGHT: ["flight_number", "uld_type", "air_waybill_template"],
    CUSTOMS_BROKERAGE: ["broker_licence_number", "bond_amount", "insurance_amount"],
    PHYSICAL_HANDLING: ["handling_rate_per_document", "physical_address"],
    STORAGE: ["storage_rate_per_document_per_day", "vault_certification"],
    AUDIT_REPRESENTATION: ["auditor_qualification", "audit_scope"],
    LAB_TESTING: ["test_panels", "fees_per_test", "sample_instructions", "iso_17025_certificate"],
    QC_INSPECTION: ["inspection_plans", "aql_sampling_defaults", "fee_schedules", "iso_17020_certificate"],
  },
} as const;

// ============ v18 §11.4.3-11.4.7 — Provider-Specific Workflows ============

export const PROVIDER_SPECIFIC_WORKFLOWS = [
  {
    provider: "LSP (Trucking)",
    workflow: "RFQ → Quote (per_km_rate + vehicle_type + ETA) → Accept → Addendum → Dispatch → Load (barcode scans) → Deliver (proof of delivery)",
    app: "Mobile app for LSP drivers with barcode scanning + voice confirmation",
  },
  {
    provider: "SHIP (Ocean Freight)",
    workflow: "Booking Request → Quote (vessel + container_type + base_freight + BAF) → Confirm Booking → Issue eBL (QES) → Update Milestones (BOOKED, LOADED, DEPARTED, ARRIVED)",
    app: "Vessel Schedule dashboard + eBL Management portal",
  },
  {
    provider: "LAB (Laboratory Testing)",
    workflow: "Test Request → Quote (test_panels + fees + sample_instructions) → Accept → Sample Collection → Start Testing → Submit Results → MRL (Minimum Required Lab results) → Issue Certificate",
    app: "Testing Jobs dashboard + Sample Instructions portal",
  },
  {
    provider: "QC (Quality Control)",
    workflow: "Inspection Request → Quote (inspection_plans + AQL sampling + fees) → Accept → Schedule Inspection → Field Inspection (AR defect detection) → Submit Report → Conditional Pass with Action Plan OR Pass OR Fail",
    app: "Inspection Jobs dashboard + Mobile app for field inspections with AR + voice",
  },
  {
    provider: "CBR (Customs Broker)",
    workflow: "Service Request → Quote (certification_fee + physical_handling_fee + storage_fee) → Accept → Submit Declaration (Nafeza ACID) → Track Clearance → Issue Certificates (CoO, etc.) → Physical Document Handling → Storage",
    app: "Certification Requests dashboard + Physical Jobs portal + Storage Management",
  },
] as const;

// ============ v18 §11.5 — Geo-Aware Service Matching ============

export const GEO_AWARE_MATCHING = {
  principle: "Provider port coverage validates serviceability for the origin/destination ports before the RFQ is broadcast",
  portCoverageTable: "provider_port_coverage — (provider_gtid, service_capability, port_unlocode, country_code, is_active, last_verified)",
  validationFlow: [
    "1. Buyer/seller initiates RFQ for a service capability at a port",
    "2. System filters saved-contact providers by service_capability + geo_coverage at the port",
    "3. If no providers cover the port → A2 advisory: 'No providers service this port for this capability. Contact your network to add a provider.'",
    "4. If providers cover the port → RFQ broadcast to eligible providers",
    "5. A1 (Container Advisor) suggests typical pricing from anonymised platform aggregates (differentially private)",
  ],
  labTestRequirements: "Lab test requirements are determined at trade request time (RIA-driven) — see §6 Step 5. Labs must be able to perform the required tests.",
  qcRequirements: "QC requirements are determined at trade request time — see §6 Step 6. QC provider must have geo coverage at the origin port.",
} as const;

// ============ Convenience: full canonical service provider payload ============

export function getServiceProviderPayload() {
  return {
    principles: SERVICE_PROVIDER_PRINCIPLES,
    service_capabilities: SERVICE_CAPABILITIES,
    provider_onboarding: PROVIDER_ONBOARDING,
    rfq_quote_flow: RFQ_QUOTE_FLOW,
    provider_eligibility_filtering: PROVIDER_ELIGIBILITY_FILTERING,
    unified_quotation_pattern: UNIFIED_QUOTATION_PATTERN,
    provider_specific_workflows: PROVIDER_SPECIFIC_WORKFLOWS,
    geo_aware_matching: GEO_AWARE_MATCHING,
    counts: {
      principles: SERVICE_PROVIDER_PRINCIPLES.length, // 9
      service_capabilities: SERVICE_CAPABILITIES.length, // 11
      provider_onboarding_steps: PROVIDER_ONBOARDING.steps.length, // 8
      rfq_quote_flow_steps: RFQ_QUOTE_FLOW.steps.length, // 5
      eligibility_filters: PROVIDER_ELIGIBILITY_FILTERING.filters.length, // 6
      quotation_common_fields: UNIFIED_QUOTATION_PATTERN.commonFields.length, // 12
      provider_specific_workflows: PROVIDER_SPECIFIC_WORKFLOWS.length, // 5
      geo_matching_steps: GEO_AWARE_MATCHING.validationFlow.length, // 5
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
