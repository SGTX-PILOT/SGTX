// SGTX Platform Feature Registry (feature-toggles-zk-breakglass)
// Defines the 20 core/addon platform features that can be toggled ON/OFF by the
// Platform Admin. This is NOT the Part 11 addon library (GNN/ZK/PQC/etc activation);
// this is a separate CORE feature toggle layer for product capabilities.
//
// Six core E2E workflow features (trade_request, quote_submission, contract_signing,
// payment, milestone_tracking, settlement) have `canDeactivate=false` because the
// end-to-end SGTX workflow cannot function without them.

export type FeatureCategory =
  | "CORE"
  | "FINANCE"
  | "LOGISTICS"
  | "SECURITY"
  | "COMPLIANCE"
  | "AI"
  | "ADDON";

export interface FeatureSpec {
  featureKey: string;
  featureName: string;
  featureCategory: FeatureCategory;
  description: string;
  canDeactivate: boolean;
}

// 6 CORE E2E workflow features (cannot be deactivated — the SGTX pipeline depends on them)
// + 20 product features that can be toggled.
export const PLATFORM_FEATURES: FeatureSpec[] = [
  // CORE — E2E workflow (canDeactivate=false)
  {
    featureKey: "trade_request",
    featureName: "Trade Request",
    featureCategory: "CORE",
    description: "Initiate inbound/outbound trade requests (Phase 0). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },
  {
    featureKey: "quote_submission",
    featureName: "Quote Submission",
    featureCategory: "CORE",
    description: "Seller quote building & packing defaults (Phase 1). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },
  {
    featureKey: "contract_signing",
    featureName: "Contract Signing",
    featureCategory: "CORE",
    description: "Contract + addenda signing & QES (Phase 2). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },
  {
    featureKey: "payment",
    featureName: "Payment & FeeLock",
    featureCategory: "CORE",
    description: "One-click payment orchestration, FeeLock, PSP split (Part 6). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },
  {
    featureKey: "milestone_tracking",
    featureName: "Milestone Tracking",
    featureCategory: "CORE",
    description: "Shipment milestones + container release (Parts 7-8). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },
  {
    featureKey: "settlement",
    featureName: "FX & Settlement",
    featureCategory: "CORE",
    description: "FX reconciliation & settlement (CBE IPN). Core E2E workflow — cannot be deactivated.",
    canDeactivate: false,
  },

  // FINANCE
  {
    featureKey: "financing",
    featureName: "Trade Financing",
    featureCategory: "FINANCE",
    description: "Universal trade finance RFQs, bids, agreements, disbursement (Part 3B).",
    canDeactivate: true,
  },
  {
    featureKey: "trade_finance",
    featureName: "DeFi Pools",
    featureCategory: "FINANCE",
    description: "DeFi protocol pools for stablecoin-backed trade finance.",
    canDeactivate: true,
  },
  {
    featureKey: "defi",
    featureName: "DeFi Risk Engine",
    featureCategory: "FINANCE",
    description: "DeFi protocol risk scoring, liquidation alerts, and pool composition.",
    canDeactivate: true,
  },

  // LOGISTICS
  {
    featureKey: "distressed_cargo",
    featureName: "Distressed Cargo",
    featureCategory: "LOGISTICS",
    description: "Distressed cargo declaration, assessment, microcontract liquidation.",
    canDeactivate: true,
  },
  {
    featureKey: "roro_corridors",
    featureName: "RoRo Corridors",
    featureCategory: "LOGISTICS",
    description: "Roll-on/roll-out designated trade corridors with simplified clearance.",
    canDeactivate: true,
  },
  {
    featureKey: "digital_twin",
    featureName: "Digital Twin",
    featureCategory: "LOGISTICS",
    description: "Container/cargo digital-twin telemetry streaming & simulation.",
    canDeactivate: true,
  },
  {
    featureKey: "barcodes",
    featureName: "Barcodes & Pallets",
    featureCategory: "LOGISTICS",
    description: "SGTX-barcoded carton/pallet tracking + scan verify.",
    canDeactivate: true,
  },

  // COMPLIANCE
  {
    featureKey: "disputes",
    featureName: "Disputes",
    featureCategory: "COMPLIANCE",
    description: "Dispute filing, mediation, arbitration, partial release.",
    canDeactivate: true,
  },
  {
    featureKey: "pdpl",
    featureName: "PDPL Compliance",
    featureCategory: "COMPLIANCE",
    description: "Personal Data Protection Law — DSR, consent, breach management.",
    canDeactivate: true,
  },
  {
    featureKey: "trade_memory",
    featureName: "Trade Memory",
    featureCategory: "COMPLIANCE",
    description: "Historical trade memory, anomalies, insights engine.",
    canDeactivate: true,
  },

  // SECURITY
  {
    featureKey: "self_healing",
    featureName: "Self-Healing",
    featureCategory: "SECURITY",
    description: "Automated circuit-breaker + self-healing of integrations.",
    canDeactivate: true,
  },
  {
    featureKey: "pentest",
    featureName: "Pentest Findings",
    featureCategory: "SECURITY",
    description: "Pentest + threat-finding ingestion and mitigation tracking.",
    canDeactivate: true,
  },

  // AI
  {
    featureKey: "gnn_risk",
    featureName: "GNN Risk Engine",
    featureCategory: "AI",
    description: "Graph Neural Network sanctions-proximity and trade-graph risk.",
    canDeactivate: true,
  },
  {
    featureKey: "causal_inference",
    featureName: "Causal Inference",
    featureCategory: "AI",
    description: "Counterfactual root-cause analysis for disputes and incidents.",
    canDeactivate: true,
  },
  {
    featureKey: "federated_learning",
    featureName: "Federated Learning",
    featureCategory: "AI",
    description: "Privacy-preserving federated model training across tenant peers.",
    canDeactivate: true,
  },

  // ADDON
  {
    featureKey: "pqc",
    featureName: "PQC (Dilithium3)",
    featureCategory: "ADDON",
    description: "Post-quantum cryptographic signatures (Part 11.5).",
    canDeactivate: true,
  },
  {
    featureKey: "zk_proofs",
    featureName: "ZK Proofs",
    featureCategory: "ADDON",
    description: "Zero-knowledge reserve & price proofs (Part 11.5).",
    canDeactivate: true,
  },
  {
    featureKey: "marketplace",
    featureName: "Marketplace Partners",
    featureCategory: "ADDON",
    description: "External marketplace lead attribution + revenue share.",
    canDeactivate: true,
  },
  {
    featureKey: "sandbox",
    featureName: "Sandbox",
    featureCategory: "ADDON",
    description: "Sandbox tenants, reset, exit-to-production workflows.",
    canDeactivate: true,
  },
  {
    featureKey: "courier_tracking",
    featureName: "Courier Tracking",
    featureCategory: "ADDON",
    description: "Last-mile courier tracking integration.",
    canDeactivate: true,
  },
  {
    featureKey: "gtid_chat",
    featureName: "GTID Chat",
    featureCategory: "ADDON",
    description: "Inter-tenant secure chat keyed by GTID.",
    canDeactivate: true,
  },
];

export const FEATURE_KEY_SET: Set<string> = new Set(
  PLATFORM_FEATURES.map((f) => f.featureKey),
);

export function getFeatureSpec(featureKey: string): FeatureSpec | undefined {
  return PLATFORM_FEATURES.find((f) => f.featureKey === featureKey);
}

export function isValidFeatureKey(featureKey: string): boolean {
  return FEATURE_KEY_SET.has(featureKey);
}

// Category order for UI display
export const CATEGORY_ORDER: FeatureCategory[] = [
  "CORE",
  "FINANCE",
  "LOGISTICS",
  "COMPLIANCE",
  "SECURITY",
  "AI",
  "ADDON",
];

export const CATEGORY_META: Record<
  FeatureCategory,
  { label: string; color: string; description: string }
> = {
  CORE: {
    label: "Core E2E Workflow",
    color: "#ca8a04",
    description: "Mandatory pipeline stages — cannot be deactivated.",
  },
  FINANCE: {
    label: "Finance",
    color: "#0891b2",
    description: "Trade finance, DeFi pools, risk engine.",
  },
  LOGISTICS: {
    label: "Logistics",
    color: "#c2410c",
    description: "Cargo, corridors, digital twin, barcodes.",
  },
  COMPLIANCE: {
    label: "Compliance",
    color: "#9333ea",
    description: "Disputes, PDPL, trade memory.",
  },
  SECURITY: {
    label: "Security",
    color: "#dc2626",
    description: "Self-healing, pentest findings.",
  },
  AI: {
    label: "AI",
    color: "#16a34a",
    description: "GNN risk, causal inference, federated learning.",
  },
  ADDON: {
    label: "Add-on",
    color: "#0d6efd",
    description: "PQC, ZK, marketplace, sandbox, courier, chat.",
  },
};
