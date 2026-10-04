// @ts-nocheck
// =============================================================================
// SGTX v18 §4.2 — Tenant Model & KYB Tiers canonical data
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for:
//   • KYB Tier Model (4 tiers: Basic, Standard, Enhanced, Diplomatic)
//   • KYB Tier Requirements per Portal (10 portal types with required tier +
//     additional requirements)
//   • KYB Status Model (4 states: PENDING, VERIFIED, Manual review required,
//     REJECTED)
//   • Sanctions & PEP Screening behaviour (sanctions hit → SUSPENDED;
//     PEP flag → ENHANCED_DD)
//   • Registry Source Classification Model (5 source types in descending
//     authority order: Authoritative API, Licensed commercial, Official
//     published, Verified manual evidence, Secondary source)
//
// Consumed by:
//   • /api/v1/kyb/tiers              — public canonical mirror
//   • /api/sgtx/kyb/tiers            — internal mirror (auth not required)
//   • /admin (Tenant Management)     — for visualisation
//   • /api/sgtx/kyb/approve          — for tier validation
//   • /api/v1/onboarding/*           — for tier determination during onboarding
//
// All values match v18 §4.2 tables exactly. Layer 1 invariants; amendment
// requires versioned change control per §3.6.
// =============================================================================

// ============ v18 §4.2.2 — KYB Tier Model ============

export interface KybTier {
  tier: number; // 1, 2, 3, or 4 (Diplomatic)
  name: string; // "Basic" | "Standard" | "Enhanced" | "Diplomatic"
  scope: string;
  typicalRequirement: string;
}

export const KYB_TIERS: KybTier[] = [
  {
    tier: 1,
    name: "Basic",
    scope: "Low-risk, API-only",
    typicalRequirement:
      "Registration + tax ID; signed revenue-share participation agreement for Marketplace Partners",
  },
  {
    tier: 2,
    name: "Standard",
    scope: "Full trade participation",
    typicalRequirement:
      "Commercial register, tax ID, UBO declaration, entity-type-specific documents",
  },
  {
    tier: 3,
    name: "Enhanced",
    scope: "Banks and high-risk financiers",
    typicalRequirement:
      "CBE accreditation (Egypt) or equivalent, compliance officer, jurisdiction-dependent documentation",
  },
  {
    tier: 4,
    name: "Diplomatic",
    scope: "Government",
    typicalRequirement: "Manual onboarding via Platform Governance Authority",
  },
];

// ============ v18 §4.2.3 — KYB Tier Requirements per Portal ============

export interface KybPortalRequirement {
  portal: string;
  requiredTier: string; // human-readable tier requirement
  tier: number; // numeric tier (1, 2, 3, or 4 for Diplomatic)
  additionalRequirements: string[];
}

export const KYB_PORTAL_REQUIREMENTS: KybPortalRequirement[] = [
  {
    portal: "Trader (Buyer/Seller)",
    requiredTier: "Tier 2 (Standard) or Tier 1 (low-risk only)",
    tier: 2,
    additionalRequirements: [],
  },
  {
    portal: "Logistics (LSP)",
    requiredTier: "Tier 2",
    tier: 2,
    additionalRequirements: ["Business licence", "Insurance", "Fleet list (trucking)"],
  },
  {
    portal: "Shipping Line",
    requiredTier: "Tier 2",
    tier: 2,
    additionalRequirements: ["IMO number", "Vessel registry", "eBL platform"],
  },
  {
    portal: "Laboratory",
    requiredTier: "Tier 2",
    tier: 2,
    additionalRequirements: ["ISO 17025 certificate"],
  },
  {
    portal: "QC",
    requiredTier: "Tier 2",
    tier: 2,
    additionalRequirements: ["ISO 17020 certificate"],
  },
  {
    portal: "Customs Broker",
    requiredTier: "Tier 2",
    tier: 2,
    additionalRequirements: ["Broker licence", "Bond", "Insurance"],
  },
  {
    portal: "Financier (Bank)",
    requiredTier: "Tier 3",
    tier: 3,
    additionalRequirements: ["CBE accreditation", "Compliance officer"],
  },
  {
    portal: "Financier (PFI)",
    requiredTier: "Tier 2 (or Tier 3 depending on jurisdiction)",
    tier: 2,
    additionalRequirements: ["Proof of registration/exemption"],
  },
  {
    portal: "Government",
    requiredTier: "Diplomatic channel",
    tier: 4,
    additionalRequirements: ["Manual onboarding via Platform Governance Authority"],
  },
  {
    portal: "Admin",
    requiredTier: "—",
    tier: 0,
    additionalRequirements: ["Multisig member (3/5)"],
  },
  {
    portal: "Marketplace Partner",
    requiredTier: "Tier 1 (Basic)",
    tier: 1,
    additionalRequirements: ["Signed revenue-share agreement"],
  },
];

// ============ v18 §4.2.4 — KYB Status Model ============

export interface KybStatus {
  status: string; // PENDING | VERIFIED | MANUAL_REVIEW | REJECTED
  description: string;
  transitions: string[]; // valid next states
}

export const KYB_STATUSES: KybStatus[] = [
  {
    status: "PENDING",
    description: "Initial state; documents not yet submitted.",
    transitions: ["VERIFIED", "MANUAL_REVIEW", "REJECTED"],
  },
  {
    status: "VERIFIED",
    description:
      "All required documents verified (auto-verified at confidence ≥90% with registry match, or manually approved).",
    transitions: ["PENDING"], // re-pending if periodic re-KYB triggers
  },
  {
    status: "MANUAL_REVIEW",
    description:
      "Confidence <85% or registry unavailable; escalates to A3 human review.",
    transitions: ["VERIFIED", "REJECTED"],
  },
  {
    status: "REJECTED",
    description: "Mismatch with official records; the tenant may appeal.",
    transitions: ["PENDING"], // appeal re-opens the case
  },
];

// ============ v18 §4.2.5 — Sanctions & PEP Screening ============

export const SANCTIONS_PEP_SCREENING = {
  triggers: {
    onboarding: "Sanctions and PEP screening runs on tenant onboarding.",
    listUpdates: "Sanctions and PEP screening re-runs on list updates.",
  },
  sanctionsHit: {
    lifecycleState: "SUSPENDED",
    sanctionsCleared: false,
    resolutionResponse: "Sanctions flag shown in resolution responses.",
  },
  pepFlag: {
    pepStatus: "ENHANCED_DD",
    requirement: "Enhanced due diligence before the tenant can progress to VERIFIED.",
  },
  screeningAuthority: "A2 (HF local) — the badge is informational; the Governor decides enforcement.",
  lists: [
    "OFAC SDN",
    "EU Consolidated",
    "UK OFSI",
    "UN 1267",
  ],
  matchAlgorithm: "Levenshtein-based fuzzy matching",
  clearanceThreshold: 0.85, // matchScore >= 0.85 blocks approval
} as const;

// ============ v18 §4.2.6 — Registry Source Classification Model ============

export interface RegistrySourceType {
  sourceType: string;
  verificationSemantics: string;
  permissibleUse: string;
  authorityRank: number; // 1 (highest) to 5 (lowest)
}

export const REGISTRY_SOURCE_TYPES: RegistrySourceType[] = [
  {
    sourceType: "Authoritative API",
    verificationSemantics:
      "Real-time response from the registry operator; confirmation ID stored",
    permissibleUse:
      "Primary verification; can satisfy KYB evidence requirements directly",
    authorityRank: 1,
  },
  {
    sourceType: "Licensed commercial source",
    verificationSemantics: "Provider contract and SLA; provider reference stored",
    permissibleUse: "Primary or supplementary verification per compliance policy",
    authorityRank: 2,
  },
  {
    sourceType: "Official published data",
    verificationSemantics: "Official publication reference and date stored",
    permissibleUse: "Supplementary verification; policy-dependent primacy",
    authorityRank: 3,
  },
  {
    sourceType: "Verified manual evidence",
    verificationSemantics:
      "Compliance-officer verification with identity, timestamp, and Loom anchoring",
    permissibleUse: "Fallback verification where no higher source exists",
    authorityRank: 4,
  },
  {
    sourceType: "Secondary source",
    verificationSemantics: "Provenance chain stored; confidence recorded",
    permissibleUse:
      "Context and risk signals only; never sole basis for a pass decision",
    authorityRank: 5,
  },
];

// ============ v18 §4.2.6 — Existing Registry Integrations ============

export const EXISTING_REGISTRY_INTEGRATIONS = [
  {
    registry: "GLEIF",
    purpose: "LEI verification",
    sourceType: "Authoritative API",
    authorityRank: 1,
  },
  {
    registry: "Nafeza",
    purpose: "Egyptian trade facts",
    sourceType: "Authoritative API",
    authorityRank: 1,
  },
  {
    registry: "Egyptian Trade Agreement (ETA)",
    purpose: "Egyptian trade agreements",
    sourceType: "Authoritative API",
    authorityRank: 1,
  },
  {
    registry: "Dun & Bradstreet",
    purpose: "Commercial data (DUNS)",
    sourceType: "Licensed commercial source",
    authorityRank: 2,
  },
  {
    registry: "Chamber of commerce attestations",
    purpose: "Business registration attestation",
    sourceType: "Verified manual evidence",
    authorityRank: 4,
  },
] as const;

// ============ v18 §4.2.1 — Tenant Record Model (fields) ============

export const TENANT_RECORD_FIELDS = {
  identity: [
    "gtid (unique)",
    "legal_name",
    "legal_name_ar (optional)",
    "type (tenant_type enum: TRD, LSP, SHIP, LAB, QC, FIN, GOV, MP, CBR)",
    "financier_subtype (BANK, PRIVATE)",
    "lsp_subtype (TRUCKING, FORWARDER, WAREHOUSING)",
    "jurisdiction",
  ],
  legalRegistration: ["tax_id", "commercial_register"],
  complianceState: [
    "kyb_tier (default 1)",
    "kyb_status (default 'PENDING')",
    "sanctions_cleared (default false)",
    "pep_status ('CLEAR', 'ENHANCED_DD', 'BLOCKED')",
  ],
  trust: ["trust_score (DECIMAL(5,2)) maintained by the TRI calculator"],
  lifecyclePreferences: [
    "lifecycle_state (default 'REGISTERED')",
    "default_trader_mode (BUY/SELL/DUAL, default DUAL)",
    "consent_settings (JSONB)",
  ],
  verifiedIdentifiers:
    "Linked rows in tenant_verified_ids (LEI, DUNS, CUSTOMS_REG, CHAMBER_REG, VAT_REG), each with status ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'), verification and expiry timestamps, reference URL, and is_public consent flag.",
} as const;

// ============ Convenience: full canonical KYB payload ============

export function getKybPayload() {
  return {
    kyb_tiers: KYB_TIERS,
    kyb_portal_requirements: KYB_PORTAL_REQUIREMENTS,
    kyb_statuses: KYB_STATUSES,
    sanctions_pep_screening: SANCTIONS_PEP_SCREENING,
    registry_source_types: REGISTRY_SOURCE_TYPES,
    existing_registry_integrations: EXISTING_REGISTRY_INTEGRATIONS,
    tenant_record_fields: TENANT_RECORD_FIELDS,
    counts: {
      kyb_tiers: KYB_TIERS.length, // 4
      portal_requirements: KYB_PORTAL_REQUIREMENTS.length, // 11
      kyb_statuses: KYB_STATUSES.length, // 4
      registry_source_types: REGISTRY_SOURCE_TYPES.length, // 5
      existing_registries: EXISTING_REGISTRY_INTEGRATIONS.length, // 5
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
