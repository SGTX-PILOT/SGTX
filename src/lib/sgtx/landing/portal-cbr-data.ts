// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #7: CBR (Customs Broker)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.7 CBR features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, FileText, ScanLine, Clock, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, ShieldAlert,
  Landmark, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Stamp, Award, FileSignature, Archive,
  DollarSign, Timer, BadgeCheck, Package, MapPin,
  QrCode, Building2, Eye,
} from "lucide-react";

// ── Active tenant (the "logged-in" customs broker for the demo) ─────────────
export const CBR_TENANT = {
  name: "Cairo Customs Brokers",
  gtid: "SGTX-EG-26-CC3A-0052",
  kybTier: 3,
  role: "CBR" as const,
  avatarInitials: "CC",
  trustScore: 82,
  tradeCount: 18,
  activeJobs: 6,
  pendingCerts: 3,
  license: "Egyptian Customs Authority License #CBR-2026-0052",
  digitalSeal: "Ed25519 (registered with Nafeza)",
  onTimeFiling: 94.8,
  certAccuracy: 96.2,
};

// ── §2.5.1 SMART INBOX — CBR-specific items (4-part structure) ───────────
export interface InboxItem {
  id: string;
  what: string;
  why: string;
  deadline: string;
  action: string;
  priority: number;
  band: "High" | "Medium" | "Low";
  category: string;
  icon: LucideIcon;
  ustn?: string;
}

export const CBR_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0949",
    what: "New certification request — Customs declaration (Frozen Strawberries, 20,000 kg → Italy)",
    why: "Seller (Sahara Exports) requested customs declaration filing. HS code 0811.10.00. Origin: Egypt. Destination: Italy (EU). Duty calculation + EUR.1 certificate + phytosanitary required.",
    deadline: "2026-09-20 14:00 EET",
    action: "Start Declaration",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: FileText,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0947",
    what: "Physical document job — courier package received (USTN ...0036-1)",
    why: "Physical courier package arrived with original Phytosanitary + Health Certificate + Commercial Invoice. QR scan + GPS stamp required. Dispatch to Nafeza within 24h.",
    deadline: "2026-09-19 16:00 EET",
    action: "Process Documents",
    priority: 75,
    band: "High",
    category: "NEEDS_DOCUMENT",
    icon: ScanLine,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0945",
    what: "Declaration submission deadline — USTN ...0037-2 (24h to file)",
    why: "Customs declaration must be filed on Nafeza within 24h of gate-out. Gate-out confirmed 16:18. Filing deadline: tomorrow 16:18. HS code + value + origin + duty calculated.",
    deadline: "2026-09-19 16:18 EET",
    action: "File Declaration",
    priority: 90,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: Clock,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0942",
    what: "Retention expiry alert — documents for USTN ...0030-1 expire in 7 days",
    why: "Egyptian customs law requires 5-year document retention. USTN ...0030-1 (trade date 2021-09-22) reaches 5-year expiry. Archive or destroy per regulation.",
    deadline: "2026-09-25 23:59 EET",
    action: "Review Retention",
    priority: 50,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Archive,
    ustn: "SGTX-EG-26-NH3T-0030-1",
  },
  {
    id: "INB-2026-0939",
    what: "Audit representation request — customs audit on USTN ...0028-3",
    why: "Egyptian Customs Authority initiated audit on valuation declaration for USTN ...0028-3. You are the legal point of contact. Must represent client at audit hearing 2026-09-25.",
    deadline: "2026-09-25 10:00 EET",
    action: "Prepare Audit Defense",
    priority: 85,
    band: "High",
    category: "COMPLIANCE",
    icon: Gavel,
    ustn: "SGTX-EG-26-NH3T-0028-3",
  },
  {
    id: "INB-2026-0936",
    what: "Digital seal verification — new seal issued by Nafeza",
    why: "Nafeza issued new digital seal (Ed25519 key pair) for your CBR license. Old seal expires 2026-10-01. Re-sign all pending declarations with new seal before expiry.",
    deadline: "2026-10-01 23:59 EET",
    action: "Re-sign Declarations",
    priority: 60,
    band: "Medium",
    category: "GENERAL",
    icon: Stamp,
  },
  {
    id: "INB-2026-0933",
    what: "Duty calculation query — seller disputes tariff classification (HS code)",
    why: "Seller (Sahara Exports) disputes HS 0811.10.00 (Frozen Strawberries, 5% duty). Claims HS 0811.90.00 (other frozen fruit, 3% duty). RIA classification review needed.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review HS Classification",
    priority: 65,
    band: "Medium",
    category: "NEGOTIATION",
    icon: Scale,
    ustn: "pre-USTN (Request ...0048-RQ)",
  },
  {
    id: "INB-2026-0930",
    what: "Settlement received — Brokerage fee $420 (USTN ...0034-1)",
    why: "Brokerage fee settled (ISO 20022). $420 received for customs declaration + clearance processing. Reconciliation 100%. Declaration filed on time.",
    deadline: "—",
    action: "View Payment",
    priority: 18,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0927",
    what: "ACI (Advance Cargo Information) pre-arrival filing required",
    why: "Italy destination requires ACI filing 24h before vessel arrival at Genoa. Auto-triggered from eBL data. Needs your digital seal + customs broker license number.",
    deadline: "2026-10-17 14:00 CEST",
    action: "File ACI",
    priority: 45,
    band: "Low",
    category: "COMPLIANCE",
    icon: Landmark,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (CBR-specific metrics) ─────────────────
export const CBR_SUMMARY_CARDS = [
  { label: "Active Jobs", value: "6", trend: "up" as const, delta: "+2 today", icon: FileText, color: "text-orange-300" },
  { label: "Pending Certs", value: "3", trend: "up" as const, delta: "+1 today", icon: FileSignature, color: "text-amber-300" },
  { label: "Filed (30d)", value: "42", trend: "up" as const, delta: "+8", icon: CheckCircle2, color: "text-emerald-300" },
  { label: "On-Time Filing", value: "94.8%", trend: "up" as const, delta: "+1.5%", icon: Clock, color: "text-green-300" },
  { label: "Cert Accuracy", value: "96.2%", trend: "up" as const, delta: "+0.8%", icon: BadgeCheck, color: "text-blue-300" },
  { label: "Audit Rate", value: "2.3%", trend: "down" as const, delta: "-0.5%", icon: Gavel, color: "text-emerald-300" },
];

// ── §16.8.6.7 QUICK ACTIONS (CBR-specific, max 8) ─────────────────────────
export const CBR_QUICK_ACTIONS = [
  { key: "cert-requests", label: "Certification Requests", icon: FileText, specRef: "§16.8.6.7", oneClick: false },
  { key: "declaration-file", label: "File Declaration", icon: FileSignature, specRef: "§16.8.6.7", oneClick: true },
  { key: "physical-docs", label: "Physical Document Jobs", icon: ScanLine, specRef: "§16.8.6.7", oneClick: false },
  { key: "qr-scan", label: "QR Scan + GPS", icon: QrCode, specRef: "§16.8.6.7", oneClick: true },
  { key: "storage", label: "Storage Management", icon: Archive, specRef: "§16.8.6.7", oneClick: false },
  { key: "audit-rep", label: "Audit Representation", icon: Gavel, specRef: "§16.8.6.7", oneClick: false },
  { key: "digital-seal", label: "Digital Seal Mgmt", icon: Stamp, specRef: "§4.9", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: TrendingUp, specRef: "§16.8.6.7", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (CBR perspective) ───────────────────────────
export const CBR_HEALTH_SCORE = {
  total: 83,
  components: [
    { name: "Compliance", weight: 20, score: 92, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 88, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 76, icon: Package },
    { name: "Payment", weight: 15, score: 84, icon: DollarSign },
    { name: "Risk", weight: 20, score: 80, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 86, icon: Clock },
  ],
};

// ── ACTIVE DECLARATIONS (CBR-filtered columns) ─────────────────────────────
export const CBR_ACTIVE_DECLARATIONS = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg",
    declaration: "DEC-2026-0042",
    hsCode: "0811.10.00 (Frozen Strawberries)",
    value: "$84,000 EXW → $105,100 CIF",
    duty: "$5,255 (5% EU preferential)",
    clearanceStatus: "draft",
    exception: "—",
    health: 0,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    commodity: "Frozen Mangoes — 12,000 kg",
    declaration: "DEC-2026-0037",
    hsCode: "0811.11.00 (Frozen Mangoes)",
    value: "$50,400 EXW → $63,000 CIF",
    duty: "$3,150 (5% EU preferential)",
    clearanceStatus: "filing",
    exception: "HS code disputed by seller",
    health: 65,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    commodity: "Sun-Dried Tomatoes — 8,500 kg",
    declaration: "DEC-2026-0036",
    hsCode: "2002.90.00 (Dried Tomatoes)",
    value: "$42,500 EXW → $52,000 CIF",
    duty: "$2,600 (5% EU preferential)",
    clearanceStatus: "filed",
    exception: "—",
    health: 91,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0034-1",
    seller: "Sahara Exports",
    commodity: "Dates — 25,000 kg",
    declaration: "DEC-2026-0034",
    hsCode: "0804.10.00 (Dates)",
    value: "$74,500 EXW → $88,000 CIF",
    duty: "$0 (0% EU preferential — FTA)",
    clearanceStatus: "cleared",
    exception: "—",
    health: 95,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0028-3",
    seller: "Delta Agro",
    commodity: "Frozen Vegetables — 15,000 kg",
    declaration: "DEC-2026-0028",
    hsCode: "0710.80.00 (Frozen Vegetables)",
    value: "$45,000 EXW → $56,000 CIF",
    duty: "$2,800 (5% EU preferential)",
    clearanceStatus: "audit",
    exception: "Customs audit on valuation",
    health: 55,
  },
];

// ── §16.8.6.7 CERTIFICATION REQUESTS (declaration preview) ─────────────────
export interface CertRequest {
  id: string;
  ustn: string;
  seller: string;
  commodity: string;
  hsCode: string;
  origin: string;
  destination: string;
  declaredValue: string;
  dutyEstimate: string;
  documentsRequired: string[];
  digitalSeal: string;
  receivedAt: string;
  deadline: string;
  priority: number;
}

export const CBR_CERT_REQUESTS: CertRequest[] = [
  {
    id: "CERT-2026-0042",
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg",
    hsCode: "0811.10.00 (Frozen Strawberries, 5% EU duty)",
    origin: "Egypt",
    destination: "Italy (EU)",
    declaredValue: "$84,000 EXW → $105,100 CIF",
    dutyEstimate: "$5,255 (5% EU preferential rate, EUR.1 applied)",
    documentsRequired: ["Commercial Invoice", "Packing List", "Bill of Lading", "Certificate of Origin", "Phytosanitary Certificate", "EUR.1 Movement Certificate", "Health Certificate", "Freeze Certificate"],
    digitalSeal: "Ed25519 (Nafeza registered, expires 2026-10-01)",
    receivedAt: "2 hours ago",
    deadline: "2026-09-20 14:00 EET (22h remaining)",
    priority: 80,
  },
  {
    id: "CERT-2026-0041",
    ustn: "SGTX-EG-26-DA2F-0021",
    seller: "Delta Agro",
    commodity: "Frozen Mangoes — 8,000 kg",
    hsCode: "0811.11.00 (Frozen Mangoes, 5% EU duty)",
    origin: "Egypt",
    destination: "Italy (EU)",
    declaredValue: "$33,600 EXW → $42,000 CIF",
    dutyEstimate: "$2,100 (5% EU preferential, EUR.1 applied)",
    documentsRequired: ["Commercial Invoice", "Packing List", "Bill of Lading", "COO", "Phytosanitary", "EUR.1", "Health Certificate"],
    digitalSeal: "Ed25519 (Nafeza registered)",
    receivedAt: "5 hours ago",
    deadline: "2026-09-21 09:00 EET (28h remaining)",
    priority: 70,
  },
];

// ── §16.8.6.7 PHYSICAL DOCUMENT JOBS (QR + GPS tracking) ──────────────────
export const PHYSICAL_DOC_JOBS = [
  {
    id: "DOC-2026-0036",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    documents: ["Original Phytosanitary Certificate", "Original Health Certificate", "Commercial Invoice (signed)", "Packing List"],
    courier: "DHL Egypt",
    receivedAt: "2026-09-18 14:30 EET",
    qrScanned: true,
    gpsStamp: "30.0444°N, 31.2357°E (Cairo office)",
    photos: 4,
    status: "processing",
    dispatchDeadline: "2026-09-19 16:00 EET (24h)",
  },
  {
    id: "DOC-2026-0034",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    seller: "Sahara Exports",
    documents: ["Original Commercial Invoice", "Original Packing List", "COO", "Phytosanitary"],
    courier: "Aramex",
    receivedAt: "2026-09-15 10:15 EET",
    qrScanned: true,
    gpsStamp: "30.0444°N, 31.2357°E (Cairo office)",
    photos: 3,
    status: "dispatched",
    dispatchDeadline: "— (dispatched to Nafeza)",
  },
];

// ── §16.8.6.7 STORAGE MANAGEMENT (retention expiry) ───────────────────────
export const STORAGE_RECORDS = [
  { ustn: "SGTX-EG-26-NH3T-0030-1", tradeDate: "2021-09-22", retentionExpiry: "2026-09-22 (5-year)", status: "expiring_7d", documentCount: 12, action: "Archive or destroy" },
  { ustn: "SGTX-EG-26-NH3T-0029-1", tradeDate: "2021-09-18", retentionExpiry: "2026-09-18 (5-year)", status: "expiring_today", documentCount: 8, action: "Immediate review required" },
  { ustn: "SGTX-EG-26-NH3T-0028-3", tradeDate: "2021-09-15", retentionExpiry: "2026-09-15 (5-year)", status: "expired", documentCount: 10, action: "Destroy per regulation (audit trail preserved)" },
  { ustn: "SGTX-EG-26-NH3T-0031-1", tradeDate: "2021-10-02", retentionExpiry: "2026-10-02 (5-year)", status: "expiring_14d", documentCount: 9, action: "Review within 14 days" },
];

// ── §16.8.6.7 AUDIT REPRESENTATION ──────────────────────────────────────────
export const AUDIT_CASES = [
  {
    id: "AUD-2026-0028",
    ustn: "SGTX-EG-26-NH3T-0028-3",
    seller: "Delta Agro",
    auditType: "Valuation audit (customs value dispute)",
    auditor: "Egyptian Customs Authority — Audit Division",
    hearingDate: "2026-09-25 10:00 EET",
    location: "Customs House, Alexandria",
    yourRole: "Legal point of contact (licensed CBR)",
    defense: "Declared value $45,000 EXW is correct (market price confirmed by 3 comparable trades). Customs disputes undervaluation. Evidence: 3 comparable trade invoices + market analysis.",
    status: "preparing",
  },
];

// ── §16.8.6.7 DIGITAL SEAL MANAGEMENT ──────────────────────────────────────
export const DIGITAL_SEAL = {
  type: "Ed25519 (registered with Nafeza)",
  keyId: "CBR-2026-0052-SEAL-02",
  issued: "2025-10-01",
  expires: "2026-10-01 (12 days remaining)",
  status: "active",
  declarationsSigned: 142,
  reSignRequired: "3 pending declarations need re-sign before expiry",
  newSealAvailable: "New seal CBR-2026-0052-SEAL-03 issued by Nafeza (ready for activation)",
};

// ── §16.8.6.7 PERFORMANCE DASHBOARD ──────────────────────────────────────────
export const CBR_PERFORMANCE = {
  metrics: [
    { name: "On-Time Filing (30d)", value: "94.8%", benchmark: "92.3%", status: "above", icon: Clock },
    { name: "Certification Accuracy", value: "96.2%", benchmark: "94.5%", status: "above", icon: BadgeCheck },
    { name: "Audit Rate", value: "2.3%", benchmark: "3.8%", status: "above", icon: Gavel },
    { name: "Declaration Dispute Rate", value: "3.1%", benchmark: "4.5%", status: "above", icon: Scale },
    { name: "HS Code Accuracy", value: "97.8%", benchmark: "95.2%", status: "above", icon: FileCheck },
    { name: "Document Processing Time", value: "4.2h", benchmark: "6.5h", status: "above", icon: Timer },
  ],
  trend: "+1.2% (vs last month)",
  percentile: "Top 15% of corridor customs brokers (licensed)",
};

// ── §16.8.6.7 PORTAL FEATURE LIST (CBR) ──────────────────────────────────────
export const CBR_PORTAL_FEATURES = [
  { name: "Certification Requests", desc: "Declaration preview — HS code, value, duty calculation, required documents", section: "§16.8.6.7" },
  { name: "Physical Document Jobs", desc: "QR scanning + GPS tracking + photo capture for physical courier packages", section: "§16.8.6.7" },
  { name: "Storage Management", desc: "5-year retention per Egyptian customs law; expiry alerts; archive/destroy", section: "§16.8.6.7" },
  { name: "Audit Representation", desc: "Legal point of contact at customs audit hearings; defense preparation", section: "§16.8.6.7" },
  { name: "Digital Seal Management", desc: "Ed25519 seal registered with Nafeza; re-sign declarations on expiry", section: "§4.9" },
  { name: "Performance Dashboard", desc: "On-time filing, cert accuracy, audit rate, HS code accuracy, dispute rate", section: "§16.8.6.7" },
  { name: "Company Admin", desc: "Digital seal lifecycle, license management, service catalogue", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (CBR perspective) ────────────────────────────────
export const CBR_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "Seller (Sahara Exports)", action: "Submitted certification request — Frozen Strawberries", target: "CERT-2026-0042", type: "info" as const },
  { time: "1 h ago", actor: "DHL Courier", action: "Delivered physical package — 4 documents", target: "DOC-2026-0036", type: "info" as const },
  { time: "2 h ago", actor: "You", action: "QR scanned + GPS stamped 4 documents", target: "DOC-2026-0036", type: "success" as const },
  { time: "3 h ago", actor: "Nafeza", action: "Digital seal expiry alert — 12 days remaining", target: "CBR-2026-0052-SEAL-02", type: "warning" as const },
  { time: "5 h ago", actor: "Governor (G6)", action: "Brokerage fee settled — $420 (ISO 20022)", target: "USTN ...0034-1", type: "success" as const },
  { time: "6 h ago", actor: "Egyptian Customs Authority", action: "Initiated audit — valuation dispute", target: "USTN ...0028-3", type: "error" as const },
  { time: "1 d ago", actor: "You", action: "Filed declaration on Nafeza — DEC-2026-0034", target: "USTN ...0034-1", type: "success" as const },
];

// ── EXTERNAL INTEGRATIONS (CBR-specific) ─────────────────────────────────────
export const CBR_INTEGRATIONS = [
  { name: "Nafeza (Customs Single Window)", status: "operational", latency: "180ms", icon: Landmark },
  { name: "CargoX (eBL Platform)", status: "operational", latency: "240ms", icon: FileSignature },
  { name: "ACI (Advance Cargo Info)", status: "operational", latency: "320ms", icon: Package },
  { name: "Digital Seal (Ed25519 + Nafeza)", status: "operational", latency: "—", icon: Stamp },
  { name: "Egyptian Customs Authority", status: "operational", latency: "—", icon: Building2 },
  { name: "ISO 20022 Bank Gateway", status: "operational", latency: "410ms", icon: DollarSign },
];

// ── RECENT GOVERNOR DECISIONS (CBR perspective) ──────────────────────────────
export const CBR_RECENT_DECISIONS = [
  {
    gate: "G5",
    type: "Declaration Filed (Nafeza)",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "ALLOW" as const,
    reason: "Customs declaration DEC-2026-0036 filed on Nafeza. HS 2002.90.00. Value $52,000 CIF. Duty $2,600 (5% EU preferential, EUR.1 applied). Digital seal verified. Auto-propagated to ACI.",
    timestamp: "1 day ago",
  },
  {
    gate: "G5",
    type: "Physical Documents Processed (QR + GPS)",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "ALLOW" as const,
    reason: "4 physical documents QR-scanned + GPS-stamped at Cairo office (30.0444°N, 31.2357°E). Photos captured. Dispatched to Nafeza within 24h SLA. Chain-of-custody preserved.",
    timestamp: "2 hours ago",
  },
  {
    gate: "G6",
    type: "Brokerage Fee Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Brokerage fee $420 settled via pain.001 (CBE clearing). Reconciliation 100%. Declaration filed on time (94.8% on-time rate). Closure hash published.",
    timestamp: "5 hours ago",
  },
];

// ── §16.1.6 SIDEBAR (CBR-specific role tabs) ────────────────────────────────
export const CBR_SIDEBAR_ROLE = [
  { label: "Cert Requests", icon: FileText, desc: "Declaration preview" },
  { label: "Physical Docs", icon: ScanLine, desc: "QR + GPS tracking" },
  { label: "Storage", icon: Archive, desc: "Retention expiry" },
  { label: "Audit Rep", icon: Gavel, desc: "Legal point of contact" },
  { label: "Digital Seal", icon: Stamp, desc: "Ed25519 + Nafeza" },
];
