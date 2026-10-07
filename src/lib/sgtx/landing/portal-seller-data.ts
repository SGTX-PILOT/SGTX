// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #2: Trader Portal — Seller Mode
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.2 Seller features,
// §16.10 Seller Dashboard.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, FileSignature, FileText, DollarSign, Package,
  ShieldAlert, Inbox, Users, BellRing, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, TrendingDown,
  Ship, Container, FlaskConical, ClipboardCheck,
  Landmark, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Truck, Gavel, Scale, MessageSquare,
  Banknote, Barcode, Layers, Boxes, Anchor,
  ArrowDownLeft, ArrowUpRight, Eye,
} from "lucide-react";

// ── Active tenant (the "logged-in" seller for the demo) ──────────────────────
export const SELLER_TENANT = {
  name: "Sahara Exports Co.",
  gtid: "SGTX-EG-26-SX7K-0008",
  kybTier: 3,
  traderMode: "SELL" as const,
  avatarInitials: "SE",
  trustScore: 91,
  tradeCount: 28,
  activeTrades: 5,
  openObligations: 4,
  cashPosition: "$1.24M",
  pendingRequests: 3,
};

// ── §2.5.1 SMART INBOX — seller-specific items (4-part structure) ───────────
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

export const SELLER_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0944",
    what: "New trade request received from Nile Harvest Trading (20,000 kg Frozen Strawberries)",
    why: "Buyer submitted a structured 13-section request. Priority 75. Accept, decline, or counter within 48h — otherwise the request auto-expires.",
    deadline: "2026-09-20 14:00 EET",
    action: "Review & Respond",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (Request SGTX-EG-26-NH3T-0042-RQ)",
  },
  {
    id: "INB-2026-0943",
    what: "EXW price lock reminder — Frozen Strawberries market moving",
    why: "Anonymised market range updated: $4.10–$4.35/kg. Your draft quote of $4.20/kg is within range. Lock before market shifts.",
    deadline: "2026-09-19 18:00 EET",
    action: "Lock EXW Price",
    priority: 78,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: DollarSign,
  },
  {
    id: "INB-2026-0940",
    what: "Lab quotation received from Nile Labs — 14 mandatory EU MRL tests",
    why: "Quotation: $1,840 (14 analytes + microbial + nutritional). Lab can start within 48h of approval. Auto-triggers certificate via Nafeza on completion.",
    deadline: "2026-09-21 12:00 EET",
    action: "Approve Lab Quotation",
    priority: 72,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: FlaskConical,
  },
  {
    id: "INB-2026-0937",
    what: "Packing plan validation complete — 2× 40ft Reefer @ -18°C",
    why: "AI Container Advisor validated: utilization 92%, stowage factor 1.4. Non-uniform layer stacking confirmed (no overload). Ready for quote submission.",
    deadline: "—",
    action: "View Packing Plan",
    priority: 65,
    band: "Medium",
    category: "GENERAL",
    icon: Boxes,
    ustn: "pre-USTN (Request ...0042-RQ)",
  },
  {
    id: "INB-2026-0936",
    what: "Logistics quotes received — 3 modes (A/B/C)",
    why: "Mode A (RFQ to 3 LSPs): Delta Logistics $8,200, Cairo Freight $9,100, Nile Transport $8,700. Mode B (direct to SHIP): Maersk $7,900. Mode C: $8,400.",
    deadline: "2026-09-20 10:00 EET",
    action: "Select Logistics Mode",
    priority: 68,
    band: "Medium",
    category: "NEEDS_APPROVAL",
    icon: Truck,
  },
  {
    id: "INB-2026-0934",
    what: "QC inspection booked — Cairo QC Services (pre-shipment + loading)",
    why: "AQL Level II, single sampling. Inspection date 2026-10-02 09:00. Inspector assigned: Ahmed M. (GTID SGTX-EG-26-CQ5A-0019).",
    deadline: "2026-10-02 09:00 EET",
    action: "Confirm Inspection",
    priority: 55,
    band: "Medium",
    category: "GENERAL",
    icon: ClipboardCheck,
  },
  {
    id: "INB-2026-0932",
    what: "Document finalisation: Phytosanitary Certificate pending signature",
    why: "Auto-generated from trade data. ETA/Nafeza auto-submission ready. QES signature required to release.",
    deadline: "2026-09-22 16:00 EET",
    action: "Sign Document (QES)",
    priority: 70,
    band: "Medium",
    category: "NEEDS_SIGNATURE",
    icon: FileSignature,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0929",
    what: "Barcode print job ready — 248 SSCC pallet labels (ZPL + PDF)",
    why: "Generated from packing plan. Print to Zebra ZT610 or download PDF. Labels required before container stuffing (G5U2).",
    deadline: "2026-09-30 18:00 EET",
    action: "Print Barcodes",
    priority: 42,
    band: "Low",
    category: "NEEDS_DOCUMENT",
    icon: Barcode,
  },
  {
    id: "INB-2026-0927",
    what: "Settlement received — USTN SGTX-EG-26-NH3T-0034-1 ($105,000)",
    why: "Bank settlement confirmed (ISO 20022). Reconciliation 98.2%. Funds available in cash position. Closure hash published on Loom.",
    deadline: "—",
    action: "View Settlement",
    priority: 15,
    band: "Low",
    category: "GENERAL",
    icon: Banknote,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (seller-specific metrics) ───────────────
export const SELLER_SUMMARY_CARDS = [
  { label: "Pending Requests", value: "3", trend: "up" as const, delta: "+1 today", icon: Inbox, color: "text-blue-300" },
  { label: "Active Quotes", value: "5", trend: "up" as const, delta: "+2 this week", icon: FileText, color: "text-purple-300" },
  { label: "EXW Locked (30d)", value: "$420K", trend: "up" as const, delta: "+$84K", icon: DollarSign, color: "text-emerald-300" },
  { label: "Cash Position", value: "$1.24M", trend: "up" as const, delta: "+$105K settled", icon: Wallet, color: "text-green-300" },
  { label: "On-Time Shipment", value: "96.1%", trend: "up" as const, delta: "+2.3%", icon: TrendingUp, color: "text-blue-300" },
  { label: "Lab Turnaround", value: "26h", trend: "down" as const, delta: "-4h faster", icon: Clock, color: "text-amber-300" },
];

// ── §16.8.6.2 QUICK ACTIONS (seller-specific, max 8) ────────────────────────
export const SELLER_QUICK_ACTIONS = [
  { key: "pending-requests", label: "Pending Requests", icon: Inbox, specRef: "§8.1", oneClick: false },
  { key: "exw-lock", label: "Lock EXW Price", icon: DollarSign, specRef: "§8.3", oneClick: true },
  { key: "packing", label: "Containerisation & Packing", icon: Boxes, specRef: "§8.4", oneClick: false },
  { key: "logistics-builder", label: "Logistics Builder (3 Modes)", icon: Truck, specRef: "§8.5", oneClick: false },
  { key: "submit-quote", label: "Submit Quote", icon: ArrowRight, specRef: "§8.8", oneClick: true },
  { key: "lab-selection", label: "Laboratory Selection", icon: FlaskConical, specRef: "§8.6", oneClick: false },
  { key: "barcode-print", label: "Barcode Print (SSCC)", icon: Barcode, specRef: "§8.4.3", oneClick: true },
  { key: "cash-position", label: "Cash Position", icon: Wallet, specRef: "§16.10", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (seller perspective) ──────────────────────────
export const SELLER_HEALTH_SCORE = {
  total: 88,
  components: [
    { name: "Compliance", weight: 20, score: 96, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 82, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 85, icon: Truck },
    { name: "Payment", weight: 15, score: 91, icon: DollarSign },
    { name: "Risk", weight: 20, score: 84, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 88, icon: Clock },
  ],
};

// ── ACTIVE TRADES (Shared Shipments Vault, seller-filtered columns) ──────────
export const SELLER_ACTIVE_TRADES = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    buyer: "Nile Harvest Trading (EG)",
    commodity: "Frozen Strawberries — 20,000 kg",
    phase: "Phase 2 · Quote",
    milestone: "EXW lock pending",
    nextAction: "Lock EXW $4.20/kg",
    feeStatus: "Quote drafting",
    health: 88,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0038",
    buyer: "Nile Harvest Trading (EG)",
    commodity: "Frozen Strawberries — Multi-shipment (6)",
    phase: "Phase 5 · Execution",
    milestone: "Shipment 3/6 in transit",
    nextAction: "Generate USTN (4/6)",
    feeStatus: "FeeLock ACTIVE (3/6)",
    health: 82,
  },
  {
    ustn: "SGTX-EG-26-DA2F-0021",
    buyer: "Delta Foods Italia (IT)",
    commodity: "Frozen Mangoes — 12,000 kg",
    phase: "Phase 5 · Execution",
    milestone: "Lab results submitted",
    nextAction: "Finalise documents",
    feeStatus: "Paid",
    health: 91,
  },
  {
    ustn: "SGTX-SA-26-NT4K-0009",
    buyer: "Najd Trading (SA)",
    commodity: "Dates — 25,000 kg",
    phase: "Phase 6 · Settlement",
    milestone: "Bank settlement confirmed",
    nextAction: "Await closure",
    feeStatus: "Paid",
    health: 95,
  },
  {
    ustn: "SGTX-EG-26-MF19-0017",
    buyer: "Mediterra Foods (IT)",
    commodity: "Sun-Dried Tomatoes — 8,500 kg",
    phase: "Phase 3 · Negotiation",
    milestone: "Counter-offer sent (Incoterm)",
    nextAction: "Await buyer response",
    feeStatus: "Quote submitted",
    health: 79,
  },
];

// ── §16.8.6.2 PENDING REQUESTS (accept / decline / counter) ─────────────────
export const PENDING_REQUESTS = [
  {
    id: "RQ-2026-0042",
    buyer: "Nile Harvest Trading Co.",
    buyerGtid: "SGTX-EG-26-NH3T-0042",
    commodity: "Frozen Strawberries — 20,000 kg",
    incoterm: "CIF (buyer requested)",
    deliveryWindow: "2026-10-04 to 2026-10-25",
    marketRange: "$4.10–$4.35/kg",
    yourDraftQuote: "$4.20/kg EXW",
    receivedAt: "2 hours ago",
    expires: "2026-09-20 14:00 EET (46h)",
    priority: 80,
  },
  {
    id: "RQ-2026-0041",
    buyer: "Delta Foods Italia",
    buyerGtid: "SGTX-IT-26-DF3A-0021",
    commodity: "Frozen Mangoes — 8,000 kg",
    incoterm: "FOB (buyer requested)",
    deliveryWindow: "2026-10-15 to 2026-11-01",
    marketRange: "$3.80–$4.05/kg",
    yourDraftQuote: "—",
    receivedAt: "1 day ago",
    expires: "2026-09-21 09:00 EET (28h)",
    priority: 68,
  },
  {
    id: "RQ-2026-0040",
    buyer: "Najd Trading",
    buyerGtid: "SGTX-SA-26-NT4K-0009",
    commodity: "Frozen Dates — 15,000 kg",
    incoterm: "CFR (buyer requested)",
    deliveryWindow: "2026-11-01 to 2026-11-20",
    marketRange: "$2.85–$3.10/kg",
    yourDraftQuote: "$2.98/kg EXW",
    receivedAt: "2 days ago",
    expires: "2026-09-22 16:00 EET (12h)",
    priority: 60,
  },
];

// ── §8.3 EXW PRICE LOCK WIDGET (live market chart data) ──────────────────────
export const EXW_MARKET_DATA = {
  commodity: "Frozen Strawberries (Grade A, IQF)",
  yourPrice: "$4.20/kg",
  marketLow: "$4.10/kg",
  marketHigh: "$4.35/kg",
  marketAvg: "$4.22/kg",
  trend: "+1.8% (7d)",
  withinRange: true,
  history: [
    { day: "Sep 12", price: 4.12 },
    { day: "Sep 13", price: 4.15 },
    { day: "Sep 14", price: 4.14 },
    { day: "Sep 15", price: 4.18 },
    { day: "Sep 16", price: 4.21 },
    { day: "Sep 17", price: 4.19 },
    { day: "Sep 18", price: 4.22 },
  ],
  fairPriceAssessment: "Your $4.20/kg is at the 45th percentile of the anonymised historical range (last 90 days). Fair price confirmed (A2 assessment, 91% confidence).",
};

// ── §8.5 LOGISTICS BUILDER (3 modes) ─────────────────────────────────────────
export const LOGISTICS_MODES = [
  {
    mode: "A",
    name: "RFQ to 3 LSPs",
    description: "Broadcast RFQ to 3 logistics service providers. Anonymous comparison. Seller selects.",
    quotes: [
      { provider: "Delta Logistics", price: "$8,200", eta: "14 days", selected: true },
      { provider: "Cairo Freight", price: "$9,100", eta: "12 days", selected: false },
      { provider: "Nile Transport", price: "$8,700", eta: "13 days", selected: false },
    ],
    recommended: true,
  },
  {
    mode: "B",
    name: "Direct to SHIP",
    description: "Direct booking with shipping line. Contract rate auto-applied. eBL via webhook.",
    quotes: [
      { provider: "Maersk Line", price: "$7,900", eta: "14 days", selected: false },
      { provider: "MSC", price: "$8,100", eta: "15 days", selected: false },
    ],
    recommended: false,
  },
  {
    mode: "C",
    name: "Direct to SHIP (seller-managed)",
    description: "Seller manages trucking + ocean separately. Maximum control, more coordination.",
    quotes: [
      { provider: "Custom arrangement", price: "$8,400", eta: "16 days", selected: false },
    ],
    recommended: false,
  },
];

// ── §8.6 LABORATORY SELECTION ────────────────────────────────────────────────
export const LAB_OPTIONS = [
  { lab: "Nile Labs", gtid: "SGTX-EG-26-NL8B-0044", accreditation: "ISO 17025", tests: "14 mandatory EU MRL", price: "$1,840", turnaround: "26h", trustScore: 93, distance: "12 km" },
  { lab: "Alexandria Testing Center", gtid: "SGTX-EG-26-AT2C-0051", accreditation: "ISO 17025", tests: "14 mandatory EU MRL", price: "$1,920", turnaround: "30h", trustScore: 87, distance: "45 km" },
  { lab: "Cairo Food Labs", gtid: "SGTX-EG-26-CF7L-0063", accreditation: "ISO 17025 + GMP", tests: "14 mandatory + nutritional", price: "$2,100", turnaround: "28h", trustScore: 90, distance: "8 km" },
];

// ── §8.7 QC BOOKING (AI-recommended inspection points) ──────────────────────
export const QC_BOOKING = {
  inspectionType: "Pre-shipment + Loading supervision",
  aqlLevel: "Level II (normal) — single sampling",
  provider: "Cairo QC Services (GTID SGTX-EG-26-CQ5A-0019)",
  inspector: "Ahmed M. — 18 trades, 0 overrides",
  scheduledDate: "2026-10-02 09:00 EET",
  aiRecommended: "AI recommended inspection at 3 points: (1) pre-stuffing, (2) container loading, (3) seal application. Defect detection via on-device HF ViT (A2).",
  coverageValidated: true,
};

// ── §8.9 BARCODE PRINT (SSCC pallet labels) ──────────────────────────────────
export const BARCODE_JOBS = [
  { job: "SSCC-2026-0042", ustn: "pre-USTN (...0042-RQ)", pallets: 248, format: "ZPL + PDF", printer: "Zebra ZT610 (Port 1)", status: "Ready" },
  { job: "SSCC-2026-0038-3", ustn: "SGTX-EG-26-NH3T-0038-3", pallets: 124, format: "ZPL", printer: "Zebra ZT610 (Port 1)", status: "Printed" },
  { job: "SSCC-2026-0036-1", ustn: "SGTX-EG-26-NH3T-0036-1", pallets: 96, format: "PDF", printer: "—", status: "Downloaded" },
];

// ── CASH POSITION (rolling forecast) ──────────────────────────────────────────
export const CASH_POSITION = {
  current: "$1.24M",
  incoming: "$105K (USTN ...0034-1 settled)",
  pending: "$420K (3 active quotes, if all accepted)",
  outgoing: "$48K (lab + QC + logistics)",
  netForecast30d: "$1.72M",
  forecastPoints: [
    { date: "Sep 18", value: 1.24 },
    { date: "Sep 25", value: 1.35 },
    { date: "Oct 02", value: 1.52 },
    { date: "Oct 09", value: 1.68 },
    { date: "Oct 16", value: 1.72 },
  ],
};

// ── §16.8.6.2 PORTAL FEATURE LIST (Trader Portal — Seller) ───────────────────
export const SELLER_PORTAL_FEATURES = [
  { name: "Smart Inbox", desc: "Seller-specific items (pending requests, EXW reminders, lab quotes, QC bookings)", section: "§16.8.6.2" },
  { name: "Pending Requests", desc: "Accept / decline / counter with anonymised market range comparison", section: "§8.1" },
  { name: "EXW Price Lock", desc: "Live market chart + fair price assessment (A2)", section: "§8.3" },
  { name: "Containerisation & Packing", desc: "Non-uniform layers, 3D viewer, collaborative editing", section: "§8.4" },
  { name: "Logistics Builder", desc: "Modes A (RFQ to LSPs), B (direct to SHIP), C (seller-managed) with alternative ports", section: "§8.5" },
  { name: "Quote Submission", desc: "SGTX fee calculation, transparent breakdown", section: "§8.8" },
  { name: "Laboratory Selection", desc: "Accredited labs, quotations, results, certificates (Nafeza auto-trigger)", section: "§8.6" },
  { name: "QC Booking", desc: "AI-recommended inspection points, AQL enforcement", section: "§8.7" },
  { name: "Document Finalisation", desc: "Digital signature, ETA/Nafeza auto-submission", section: "§8.8.3" },
  { name: "Barcode Print", desc: "ZPL/PDF generation for SSCC pallet labels", section: "§8.4.3" },
  { name: "Distressed Cargo & Notifications", desc: "Declaration, triage, accelerated outreach to saved contacts", section: "§14.1" },
  { name: "Cash Position", desc: "Rolling forecast (30/60/90 day)", section: "§16.10" },
  { name: "Company Admin", desc: "Data scopes, hidden cost components", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (seller perspective) ────────────────────────────────
export const SELLER_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "Nile Harvest Trading", action: "Submitted trade request — 20,000 kg Frozen Strawberries", target: "Request ...0042-RQ", type: "info" as const },
  { time: "1 h ago", actor: "Nile Labs (LAB)", action: "Quotation submitted — $1,840 (14 EU MRL tests)", target: "Request ...0042-RQ", type: "info" as const },
  { time: "3 h ago", actor: "AI Container Advisor (A2)", action: "Packing plan validated — 92% utilization", target: "Request ...0042-RQ", type: "success" as const },
  { time: "4 h ago", actor: "You", action: "Drafted quote — $4.20/kg EXW", target: "Request ...0042-RQ", type: "info" as const },
  { time: "6 h ago", actor: "Delta Foods Italia", action: "Counter-offer received (Incoterm)", target: "Request ...0021-RQ", type: "warning" as const },
  { time: "8 h ago", actor: "Governor (G6)", action: "Settlement confirmed — $105K", target: "USTN ...0034-1", type: "success" as const },
  { time: "1 d ago", actor: "Cairo QC Services", action: "Inspection scheduled — 2026-10-02 09:00", target: "Request ...0042-RQ", type: "info" as const },
];

// ── EXTERNAL INTEGRATIONS (seller-specific) ──────────────────────────────────
export const SELLER_INTEGRATIONS = [
  { name: "Nafeza (Customs)", status: "operational", latency: "180ms", icon: Landmark },
  { name: "CargoX (eBL)", status: "operational", latency: "240ms", icon: Ship },
  { name: "ETA (Single Window)", status: "operational", latency: "320ms", icon: FileCheck },
  { name: "Egypt Trust (QES)", status: "operational", latency: "150ms", icon: FileSignature },
  { name: "Zebra Printers (ZPL)", status: "operational", latency: "—", icon: Barcode },
];

// ── RECENT GOVERNOR DECISIONS (seller perspective) ───────────────────────────
export const SELLER_RECENT_DECISIONS = [
  {
    gate: "G3",
    type: "Quote Submission",
    ustn: "pre-USTN (Request ...0042-RQ)",
    verdict: "ALLOW" as const,
    reason: "EXW $4.20/kg within fair price range (45th percentile). Fee breakdown transparent (0.144%). All G1–G2 gates passed by buyer. Quote dispatched to buyer Smart Inbox.",
    timestamp: "4 h ago",
  },
  {
    gate: "G4",
    type: "FeeLock + USTN Mint (Shipment 3/6)",
    ustn: "SGTX-EG-26-NH3T-0038-3",
    verdict: "ALLOW" as const,
    reason: "Per-shipment fee paid by buyer. FeeLock ACTIVE. USTN minted for shipment 3 of 6. Loom hash appended. eBL webhook dispatched to CargoX.",
    timestamp: "1 d ago",
  },
  {
    gate: "G6",
    type: "Bank Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Buyer settlement confirmed. pain.001 accepted by CBE clearing. $105K received. Reconciliation 98.2%. Funds reflected in cash position.",
    timestamp: "8 h ago",
  },
];

// ── §16.1.6 SIDEBAR (seller-specific role tabs) ──────────────────────────────
export const SELLER_SIDEBAR_ROLE = [
  { label: "Pending Requests", icon: Inbox, desc: "Accept / decline / counter" },
  { label: "EXW Price Lock", icon: DollarSign, desc: "Live market chart" },
  { label: "Packing", icon: Boxes, desc: "Non-uniform layers, 3D viewer" },
  { label: "Logistics Builder", icon: Truck, desc: "Modes A/B/C" },
  { label: "Barcode Print", icon: Barcode, desc: "SSCC labels (ZPL/PDF)" },
];
