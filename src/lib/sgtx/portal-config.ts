// SGTX Portal Registry — defines all 10+ portals with their nav structure.
import type { LucideIcon } from "lucide-react";
import {
  ShoppingBag, Store, Truck, Ship, FlaskConical, ShieldCheck, Landmark,
  Building2, Banknote, Landmark as GovIcon, Settings, Users, Lock, Gavel, Globe2, FileText,
  Crown, Activity, AlertTriangle, Cpu, Network, Gauge, ScrollText,
  Plug, Webhook, KeyRound, FlaskConical as FlaskBeaker, Handshake,
  BarChart3, ClipboardList, Warehouse, PackageCheck, FileClock, Repeat, Boxes, Receipt,
  MessagesSquare, Globe,
  Layers, Thermometer, Award, CheckCircle2,
  Scale,
  History,
  // ADDON-UI — extra icons needed for the per-portal add-on tab entries.
  Clock, CalendarClock,
  // RAIL-ENGINE — Train icon for the LSP portal Rail tab (Article 54).
  Train,
  // AIR-ENGINE — Plane icon for the SHIP portal Air Cargo tab (Articles 47-52).
  Plane,
} from "lucide-react";

export interface PortalTab {
  id: string;
  label: string;
  icon: LucideIcon;
  group?: string;
}

export interface PortalConfig {
  id: string;
  name: string;
  shortName: string;
  role: string;
  tenantType: string;
  tenantGtid: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: string; // hex
  defaultTenantGtid: string;
  tabs: PortalTab[];
  dualMode?: boolean;
}

export const PORTALS: PortalConfig[] = [
  {
    id: "trader-buyer",
    name: "Trader Portal — Buyer",
    shortName: "Buyer",
    role: "Importer",
    tenantType: "TRD",
    tenantGtid: "SGTX-DE-TRD-001234-5B6C",
    tagline: "Import · Inbound · Settlement",
    description: "Initiate trade requests, review quotes, manage inbound shipments, approve settlement.",
    icon: ShoppingBag,
    accent: "#1a6fb0",
    defaultTenantGtid: "SGTX-DE-TRD-001234-5B6C",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "new-trade", label: "New Trade Request", icon: ShoppingBag, group: "Trade" },
      // P7 fix — three new tabs giving the buyer dedicated views for each
      // stage of the trade lifecycle. Previously the buyer only saw Active
      // Trades as a metric on the Command Center card; Drafts were saved to
      // the DB but invisible; closed/cancelled trades had no view at all.
      { id: "active-trades", label: "Active Trades", icon: ShoppingBag, group: "Trade" },
      { id: "drafts", label: "Drafts", icon: FileText, group: "Trade" },
      { id: "history", label: "History", icon: History, group: "Trade" },
      { id: "quotes", label: "Quote Review & Negotiation", icon: Store, group: "Trade" },
      { id: "contract", label: "Contract Signing", icon: ShieldCheck, group: "Trade" },
      { id: "shipments", label: "Shipments", icon: Ship, group: "Trade" },
      { id: "container-compliance", label: "Container Compliance", icon: ShieldCheck, group: "Trade" },
      { id: "milestones", label: "Milestone Tracking", icon: PackageCheck, group: "Trade" },
      { id: "reefer-telemetry", label: "Reefer Monitoring", icon: Thermometer, group: "Trade" },
      { id: "documents", label: "Documents", icon: ShieldCheck, group: "Trade" },
      { id: "distressed", label: "Distressed Cargo", icon: FlaskConical, group: "Trade" },
      { id: "routes-reference", label: "Routes Reference", icon: Globe, group: "Trade" },
      // ADDON-UI — per-portal tabs for the highest-value add-ons. Each renders
      // the unified AddOnsHubScreen pre-set to the matching sub-tab. The Trade
      // group is the natural home for Demurrage (Add-On 9) and Cold Chain
      // (Add-On 12) since both are per-shipment operational concerns.
      { id: "demurrage", label: "Demurrage", icon: Clock, group: "Trade" },
      { id: "cold-chain", label: "Cold Chain", icon: Thermometer, group: "Trade" },
      // REC-P1 #4 — Lifecycle stage tabs (buyer portal)
      { id: "negotiations", label: "Negotiations", icon: MessagesSquare, group: "Trade" },
      { id: "purchase-orders", label: "Purchase Orders", icon: FileText, group: "Trade" },
      { id: "proforma-invoices", label: "Proforma Invoices", icon: Receipt, group: "Trade" },
      { id: "financing", label: "Financing (Borrower)", icon: Banknote, group: "Finance" },
      { id: "invoices", label: "Invoices & Payments", icon: Banknote, group: "Finance" },
      { id: "settlement", label: "FX & Settlement", icon: Banknote, group: "Finance" },
      { id: "disputes", label: "Disputes", icon: ShieldCheck, group: "Governance" },
      { id: "compliance", label: "Compliance", icon: ShieldCheck, group: "Governance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
      { id: "network", label: "Network (Contacts)", icon: Users, group: "Governance" },
      // P6 fix — passport moved here (next to the other Governance tabs) so the
      // sidebar group ordering is coherent. Previously it appeared at array
      // position 22 — between lifecycle (Governance) and chat (Admin) — which
      // broke the visual grouping.
      { id: "passport", label: "Trust Passport", icon: ShieldCheck, group: "Governance" },
      { id: "readiness", label: "Trade Readiness", icon: ShieldCheck, group: "Governance" },
      // ADDON-UI — Compliance Calendar (Add-On 18) is per-tenant regulatory
      // deadline tracking; sits naturally under Governance for the buyer.
      { id: "compliance-calendar", label: "Compliance Calendar", icon: CalendarClock, group: "Governance" },
      { id: "lifecycle", label: "Tenant Lifecycle", icon: ShieldCheck, group: "Governance" },
      { id: "org-graph", label: "Org Graph", icon: Building2, group: "Admin" },
      { id: "chat", label: "GTID Chat", icon: MessagesSquare, group: "Admin" },
      { id: "admin", label: "Company Admin", icon: Users, group: "Admin" },
    ],
  },
  {
    id: "trader-seller",
    name: "Trader Portal — Seller",
    shortName: "Seller",
    role: "Exporter",
    tenantType: "TRD",
    tenantGtid: "SGTX-EG-TRD-002139-7F3A",
    tagline: "Export · Outbound · Pricing",
    description: "Receive trade requests, lock EXW pricing, manage packing & outbound logistics.",
    icon: Store,
    accent: "#d4321a",
    defaultTenantGtid: "SGTX-EG-TRD-002139-7F3A",
    dualMode: true,
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "requests", label: "Pending Requests", icon: ShoppingBag, group: "Trade" },
      { id: "quote-builder", label: "Quote & Packing", icon: Store, group: "Trade" },
      { id: "contract", label: "Contract & Addenda", icon: ShieldCheck, group: "Trade" },
      { id: "shipments", label: "Outbound Shipments", icon: Ship, group: "Trade" },
      { id: "container-compliance", label: "Container Compliance", icon: ShieldCheck, group: "Trade" },
      { id: "milestones", label: "Milestone Tracking", icon: PackageCheck, group: "Trade" },
      { id: "documents", label: "Documents", icon: ShieldCheck, group: "Trade" },
      { id: "distressed", label: "Distressed Cargo", icon: FlaskConical, group: "Trade" },
      { id: "routes-reference", label: "Routes Reference", icon: Globe, group: "Trade" },
      { id: "lot-management", label: "Lot Management", icon: Layers, group: "Trade" },
      // ADDON-UI — seller-side surfaces for Demurrage (Add-On 9) and Cold Chain
      // (Add-On 12). Export containers also incur demurrage at the origin port
      // and reefers need temperature monitoring before vessel loading.
      { id: "demurrage", label: "Demurrage", icon: Clock, group: "Trade" },
      { id: "cold-chain", label: "Cold Chain", icon: Thermometer, group: "Trade" },
      // REC-P1 #4 — Lifecycle stage tabs (seller portal)
      { id: "negotiations", label: "Negotiations", icon: MessagesSquare, group: "Trade" },
      { id: "sales-orders", label: "Sales Orders", icon: FileText, group: "Trade" },
      { id: "proforma-invoices", label: "Proforma Invoices", icon: Receipt, group: "Trade" },
      { id: "financing", label: "Financing (Borrower)", icon: Banknote, group: "Finance" },
      { id: "invoices", label: "Invoices & SGTX Fee", icon: Banknote, group: "Finance" },
      { id: "settlement", label: "FX & Settlement", icon: Banknote, group: "Finance" },
      { id: "disputes", label: "Disputes", icon: ShieldCheck, group: "Governance" },
      { id: "compliance", label: "Compliance & KYB", icon: ShieldCheck, group: "Governance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
      { id: "network", label: "Network (Contacts)", icon: Users, group: "Governance" },
      { id: "readiness", label: "Trade Readiness", icon: ShieldCheck, group: "Governance" },
      { id: "lifecycle", label: "Tenant Lifecycle", icon: ShieldCheck, group: "Governance" },
      { id: "org-graph", label: "Org Graph", icon: Building2, group: "Admin" },
      { id: "passport", label: "Trust Passport", icon: ShieldCheck, group: "Governance" },
      { id: "chat", label: "GTID Chat", icon: MessagesSquare, group: "Admin" },
      { id: "admin", label: "Company Admin", icon: Users, group: "Admin" },
    ],
  },
  {
    id: "lsp",
    name: "Logistics Service Provider",
    shortName: "LSP",
    role: "Trucking & Forwarding",
    tenantType: "LSP",
    tenantGtid: "SGTX-EG-LSP-000120-4C7D",
    tagline: "Pickup · Trucking · Milestones",
    description: "Container pickup, trucking, milestone confirmations, addenda management.",
    icon: Truck,
    accent: "#c2410c",
    defaultTenantGtid: "SGTX-EG-LSP-000120-4C7D",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "assignments", label: "Assignments", icon: Truck, group: "Operations" },
      { id: "dispatch-planner", label: "Dispatch Planner", icon: ClipboardList, group: "Operations" },
      { id: "warehouse", label: "Warehouse", icon: Warehouse, group: "Operations" },
      { id: "milestones", label: "Milestone Confirmation", icon: ShieldCheck, group: "Operations" },
      { id: "addenda", label: "Logistics Addenda", icon: ShieldCheck, group: "Operations" },
      // RAIL-ENGINE (Article 54) — rail booking, train, wagon, terminal,
      // consignment (CIM/SMGS), transit, tracking, delivery. Surfaced under
      // the LSP portal since rail operations sit naturally next to trucking
      // dispatch and warehouse.
      { id: "rail", label: "Rail", icon: Train, group: "Operations" },
      { id: "worldwide-routes", label: "Worldwide Routes", icon: Globe, group: "Logistics" },
      { id: "fleet", label: "Fleet & Drivers", icon: Truck, group: "Resources" },
      // ROAD-ENGINE — Article 43-46 Road Corridor tab. Sits under Trade so the
      // LSP can manage corridors, road shipments, border crossings and GPS
      // tracking alongside their existing logistics operations.
      { id: "road-corridor", label: "Road Corridor", icon: Truck, group: "Trade" },
      { id: "performance", label: "Provider Performance", icon: BarChart3, group: "Performance" },
      { id: "invoices", label: "Invoices", icon: Banknote, group: "Finance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "ship",
    name: "Shipping Line",
    shortName: "Shipping",
    role: "Ocean Carrier",
    tenantType: "SHIP",
    tenantGtid: "SGTX-EG-SHP-000031-9E8F",
    tagline: "Vessels · Containers · Release",
    description: "Vessel schedules, container loading, B/L issuance, container release authorisation.",
    icon: Ship,
    accent: "#0d6efd",
    defaultTenantGtid: "SGTX-EG-SHP-000031-9E8F",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "vessels", label: "Vessel Fleet", icon: Ship, group: "Operations" },
      { id: "containers", label: "Container Release (CRA)", icon: ShieldCheck, group: "Operations" },
      { id: "booking-requests", label: "Booking Requests", icon: PackageCheck, group: "Operations" },
      { id: "bl", label: "Bill of Lading", icon: ShieldCheck, group: "Documents" },
      { id: "schedules", label: "Schedules & AIS", icon: Ship, group: "Operations" },
      { id: "reefer-telemetry", label: "Reefer Monitoring", icon: Thermometer, group: "Operations" },
      // AIR-ENGINE — Air Cargo tab (Articles 47-52). The SHIP portal is the
      // natural home for air-cargo operations since the tenant operates as a
      // carrier; air bookings nest under USTN like ocean bookings do.
      { id: "air-cargo", label: "Air Cargo", icon: Plane, group: "Trade" },
      // RORO-ENGINE — Art 55-86: RoRo & Rolling Cargo first-class engine.
      // Tab groups under "Trade" so it appears alongside the other
      // trade-execution tabs (TAB_SECTION routes it to the trade group).
      { id: "roro", label: "RoRo Cargo", icon: Ship, group: "Trade" },
      { id: "worldwide-routes", label: "Worldwide Routes", icon: Globe, group: "Logistics" },
      { id: "contract-rates", label: "Contract Rates", icon: Receipt, group: "Finance" },
      { id: "performance", label: "Carrier Performance", icon: BarChart3, group: "Performance" },
      { id: "invoices", label: "Invoices", icon: Banknote, group: "Finance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "lab",
    name: "Laboratory",
    shortName: "Lab",
    role: "Food & Pesticide Testing",
    tenantType: "LAB",
    tenantGtid: "SGTX-EG-LAB-000014-6F4D",
    tagline: "Sampling · Analysis · Reports",
    description: "Receive test requests, perform sampling, issue lab reports linked to USTN.",
    icon: FlaskConical,
    accent: "#16a34a",
    defaultTenantGtid: "SGTX-EG-LAB-000014-6F4D",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "requests", label: "Test Requests", icon: FlaskConical, group: "Lab" },
      { id: "queue", label: "Sampling Queue", icon: FlaskConical, group: "Lab" },
      { id: "reports", label: "Reports & Results", icon: ShieldCheck, group: "Lab" },
      { id: "certificates", label: "Certificates", icon: FileClock, group: "Lab" },
      { id: "performance", label: "Lab Performance", icon: BarChart3, group: "Performance" },
      { id: "invoices", label: "Invoices", icon: Banknote, group: "Finance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "qc",
    name: "Quality Control",
    shortName: "QC",
    role: "Pre-shipment Inspection",
    tenantType: "QC",
    tenantGtid: "SGTX-EG-QC-000022-8A1C",
    tagline: "Inspection · Defects · Pass/Fail",
    description: "Pre-shipment inspections, defect logging, conditional pass with action plans.",
    icon: ShieldCheck,
    accent: "#9333ea",
    defaultTenantGtid: "SGTX-EG-QC-000022-8A1C",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "schedule", label: "Inspection Schedule", icon: ShieldCheck, group: "QC" },
      { id: "field", label: "Field Inspections", icon: ShieldCheck, group: "QC" },
      { id: "reports", label: "QC Reports", icon: ShieldCheck, group: "QC" },
      { id: "re-inspections", label: "Re-inspections", icon: Repeat, group: "QC" },
      { id: "performance", label: "QC Performance", icon: BarChart3, group: "Performance" },
      { id: "invoices", label: "Invoices", icon: Banknote, group: "Finance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "cbr",
    name: "Customs Broker",
    shortName: "Broker",
    role: "Clearance & Certification",
    tenantType: "CBR",
    tenantGtid: "SGTX-EG-CBR-000009-5E7B",
    tagline: "Nafeza · EUR.1 · SAD",
    description: "File customs declarations via Nafeza, issue certificates of origin, manage clearance.",
    icon: Landmark,
    accent: "#ca8a04",
    defaultTenantGtid: "SGTX-EG-CBR-000009-5E7B",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "declarations", label: "Declarations (Nafeza)", icon: Landmark, group: "Customs" },
      { id: "certificates", label: "Certificates of Origin", icon: ShieldCheck, group: "Customs" },
      { id: "trade-certificates", label: "Trade Certificates", icon: Award, group: "Customs" },
      { id: "clearance", label: "Clearance Status", icon: ShieldCheck, group: "Customs" },
      { id: "physical-jobs", label: "Physical Document Jobs", icon: Boxes, group: "Customs" },
      { id: "performance", label: "Broker Performance", icon: BarChart3, group: "Performance" },
      { id: "invoices", label: "Invoices", icon: Banknote, group: "Finance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "bank",
    name: "Financier — Bank",
    shortName: "Bank",
    role: "Trade Finance",
    tenantType: "BANK",
    tenantGtid: "SGTX-EG-BNK-000007-1F8D",
    tagline: "Bids · Loans · DeFi · Settlement",
    description: "Review financing RFQs, submit bids, manage loan portfolio, DeFi pools, FX settlement.",
    icon: Landmark,
    accent: "#1e40af",
    defaultTenantGtid: "SGTX-EG-BNK-000007-1F8D",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "opportunities", label: "Financing Opportunities", icon: Banknote, group: "Finance" },
      { id: "portfolio", label: "My Bids & Active Loans", icon: Banknote, group: "Finance" },
      { id: "lc-management", label: "Letters of Credit", icon: FileText, group: "Finance" },
      { id: "defi", label: "DeFi Pools", icon: Banknote, group: "Finance" },
      { id: "preferences", label: "RFQ Preferences", icon: Settings, group: "Finance" },
      { id: "collateral", label: "Collateral & Margin Calls", icon: ShieldCheck, group: "Risk" },
      { id: "settlement", label: "FX & Settlement", icon: Landmark, group: "Operations" },
      { id: "compliance", label: "Portfolio Compliance", icon: ShieldCheck, group: "Risk" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "pfi",
    name: "Financier — Private",
    shortName: "Private Fin.",
    role: "Private Capital",
    tenantType: "PFI",
    tenantGtid: "SGTX-EG-PFI-000011-3C2E",
    tagline: "Bids · Loans · Portfolio",
    description: "Private trade finance, bid on RFQs, manage loan portfolio and borrower history.",
    icon: Building2,
    accent: "#be185d",
    defaultTenantGtid: "SGTX-EG-PFI-000011-3C2E",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "opportunities", label: "Financing Opportunities", icon: Banknote, group: "Finance" },
      { id: "portfolio", label: "My Bids & Active Loans", icon: Banknote, group: "Finance" },
      { id: "borrowers", label: "Financed Companies", icon: Users, group: "Risk" },
      { id: "preferences", label: "RFQ Preferences", icon: Settings, group: "Finance" },
      { id: "compliance", label: "Portfolio Compliance", icon: ShieldCheck, group: "Risk" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
    ],
  },
  {
    id: "gov",
    name: "Government Portal",
    shortName: "Government",
    role: "Customs · CBE · NFSA",
    tenantType: "GOV",
    tenantGtid: "SGTX-EG-GOV-000001-9A0B",
    tagline: "Visibility · Revenue · Compliance",
    description: "Real-time trade visibility, customs assessment, FX monitoring, food safety oversight.",
    icon: GovIcon,
    accent: "#b45309",
    defaultTenantGtid: "SGTX-EG-GOV-000001-9A0B",
    tabs: [
      { id: "command", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "trade-flow", label: "National Trade Flow", icon: Ship, group: "Oversight" },
      { id: "customs", label: "Customs Assessment", icon: Landmark, group: "Customs" },
      { id: "fx", label: "FX & Settlement (CBE)", icon: Banknote, group: "Monetary" },
      { id: "food-safety", label: "Food Safety (NFSA)", icon: ShieldCheck, group: "Oversight" },
      { id: "integrations", label: "Integrations Health", icon: ShieldCheck, group: "Platform" },
      { id: "governor", label: "Governor Decision", icon: ShieldCheck, group: "Governance" },
      { id: "opa", label: "OPA Policies", icon: FileText, group: "Governance" },
      { id: "loom", label: "Loom Verification", icon: Lock, group: "Governance" },
      { id: "jurisdictions", label: "Jurisdiction Matrix", icon: Globe2, group: "Governance" },
      { id: "qes", label: "QES Layer (Egypt Trust)", icon: ShieldCheck, group: "Governance" },
      { id: "device", label: "Device Trust & Auth", icon: ShieldCheck, group: "Governance" },
      { id: "evidence", label: "Court Evidence", icon: FileText, group: "Governance" },
      { id: "compliance-screen", label: "Compliance Screening", icon: ShieldCheck, group: "Governance" },
      { id: "sar", label: "Suspicious Activity Reports", icon: Gavel, group: "Governance" },
      { id: "ustn", label: "USTN Master Object", icon: FileText, group: "Governance" },
      { id: "journey", label: "Role Journey Maps", icon: Users, group: "Governance" },
      { id: "audit", label: "Audit Trail", icon: ShieldCheck, group: "Governance" },
      // Phase 5 — Transport & Logistics admin portal (§7 Global Provider Admin)
      { id: "transport", label: "Transport & Logistics", icon: Truck, group: "Governance" },
      // Phase 6 — Financial & Commercial Execution Fabric admin portal (§1–§10)
      { id: "finance", label: "Financial Execution", icon: Banknote, group: "Governance" },
      // Phase 7 — Post-Trade Completion Fabric admin portal (§1–§7)
      { id: "completion", label: "Post-Trade Completion", icon: CheckCircle2, group: "Governance" },
      // Phase 8 — Worldwide Integration Catalog + Gap Control Center (§1–§11)
      // NOTE: id is "integration-control" (NOT "integrations") to avoid React key
      // collision with the legacy "Integrations Health" tab above. Both tabs are
      // intentionally distinct: "Integrations Health" (id=integrations) renders
      // the legacy External Integrations Health monitor; "Integration Control
      // Center" (id=integration-control) renders the Phase 8 §1–§11 catalog.
      { id: "integration-control", label: "Integration Control Center", icon: Globe2, group: "Governance" },
      // Phase 9 — Worldwide Country Activation + Regulatory Change Management (§1–§7)
      { id: "regulatory-change", label: "Regulatory Change Center", icon: Scale, group: "Governance" },
      { id: "regulatory-snapshots", label: "Regulatory Snapshots", icon: ShieldCheck, group: "Governance" },
      // Phase 10 — Production Readiness Center (FINAL INTEGRATION PHASE — §1–§14)
      { id: "readiness-center", label: "Production Readiness", icon: ShieldCheck, group: "Governance" },
      // ADDON-UI — Government-relevant add-on surfaces. GRiRE (Add-On 28) is
      // the regulatory foundation; Force Majeure (Add-On 22) and Compliance
      // Calendar (Add-On 18) round out the regulator's situational trio.
      { id: "grir", label: "GRiRE Engine", icon: Globe2, group: "Governance" },
      { id: "force-majeure", label: "Force Majeure", icon: AlertTriangle, group: "Governance" },
      { id: "compliance-calendar", label: "Compliance Calendar", icon: CalendarClock, group: "Governance" },
    ],
  },
  {
    id: "admin",
    name: "Platform Admin",
    shortName: "Admin",
    role: "Platform Governance Authority",
    tenantType: "ADM",
    tenantGtid: "SGTX-ZZ-ADM-000001-A1B2",
    tagline: "Sovereign · Governance · Audit",
    description:
      "Constitutional layer — Governor decisions, integrations health, PQC re-signing, add-on toggles, multisig approvals, chaos testing.",
    icon: Crown,
    accent: "#ca8a04",
    defaultTenantGtid: "SGTX-ZZ-ADM-000001-A1B2",
    tabs: [
      { id: "command-center", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "metrics", label: "Metrics & Health", icon: Activity, group: "Monitoring" },
      { id: "incidents", label: "Incidents", icon: AlertTriangle, group: "Security" },
      { id: "threats", label: "Threat Findings", icon: ShieldCheck, group: "Security" },
      { id: "multisig", label: "Multisig Approvals", icon: Lock, group: "Governance" },
      { id: "add-ons", label: "Add-on Library", icon: Cpu, group: "Platform" },
      // ADDON-UI — Unified hub surfacing all 19 implemented add-ons (9-28,
      // excluding the reserved #27). Sits adjacent to the legacy Add-on Library
      // toggle but renders per-add-on dashboards rather than activation toggles.
      { id: "addons-hub", label: "Add-Ons Hub (9-28)", icon: Layers, group: "Platform" },
      { id: "competitor-benchmark", label: "Competitor Benchmark", icon: Award, group: "Platform" },
      { id: "integrations", label: "Integrations", icon: Network, group: "Platform" },
      { id: "sla", label: "SLA & Status", icon: Gauge, group: "Monitoring" },
      { id: "audit", label: "Governor Audit", icon: ScrollText, group: "Governance" },
    ],
  },
  {
    id: "marketplace-partner",
    name: "Marketplace Partner",
    shortName: "Marketplace",
    role: "External Platform · API Integration",
    tenantType: "MKT",
    tenantGtid: "SGTX-ZZ-MKT-000001-C3D4",
    tagline: "Leads · Webhooks · Revenue Share",
    description:
      "External marketplace platforms integrating via signed API. Lead attribution, webhook delivery, revenue share & sandbox.",
    icon: Plug,
    accent: "#0891b2",
    defaultTenantGtid: "SGTX-ZZ-MKT-000001-C3D4",
    tabs: [
      { id: "command-center", label: "Command Center", icon: Settings, group: "Overview" },
      { id: "leads", label: "Leads Management", icon: Handshake, group: "Attribution" },
      { id: "webhooks", label: "Webhook Management", icon: Webhook, group: "Integration" },
      { id: "revenue", label: "Revenue Attribution", icon: Banknote, group: "Finance" },
      { id: "api-keys", label: "API Key Management", icon: KeyRound, group: "Integration" },
      { id: "sandbox", label: "Sandbox", icon: FlaskBeaker, group: "Testing" },
      { id: "agreement", label: "Agreement (Revenue Share)", icon: FileText, group: "Legal" },
      { id: "company-admin", label: "Company Admin", icon: Users, group: "Admin" },
    ],
  },
];

export const PORTAL_MAP: Record<string, PortalConfig> = Object.fromEntries(
  PORTALS.map((p) => [p.id, p])
);
