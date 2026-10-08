// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #4: SHIP (Shipping Line)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.4 SHIP features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Ship, Anchor, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Package, Container,
  Landmark, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Navigation, FileText, ShieldAlert,
  DollarSign, Timer, Calendar, Globe2, BarChart3,
  FileSignature, Barcode,
} from "lucide-react";

// ── Active tenant (the "logged-in" shipping line for the demo) ───────────────
export const SHIP_TENANT = {
  name: "Maersk Line Egypt",
  gtid: "SGTX-EG-26-ML1A-0003",
  kybTier: 4,
  role: "SHIP" as const,
  avatarInitials: "ML",
  trustScore: 95,
  tradeCount: 247,
  activeVoyages: 6,
  openBookings: 9,
  vessels: 4,
  onTimeDeparture: 96.8,
};

// ── §2.5.1 SMART INBOX — SHIP-specific items (4-part structure) ────────────
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

export const SHIP_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0946",
    what: "New booking request — 2× 40ft Reefer (Alexandria → Genoa, MV Maersk Genoa)",
    why: "Seller (Sahara Exports via LSP Delta Logistics) requests booking. Contract rate auto-applied ($7,900). Voyage MXG-2610-04. ETD 2026-10-04. Confirm booking within 24h.",
    deadline: "2026-09-19 16:00 EET",
    action: "Confirm Booking",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0944",
    what: "eBL webhook received from CargoX — USTN ...0036-1 (Mediterra Foods)",
    why: "Electronic Bill of Lading issued via CargoX platform. Webhook verified (Ed25519 signature). Buyer (Mediterra Foods) can now claim cargo. Auto-propagated to Nafeza.",
    deadline: "—",
    action: "View eBL",
    priority: 70,
    band: "Medium",
    category: "GENERAL",
    icon: FileSignature,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0941",
    what: "Vessel schedule update — MV Maersk Alexandria ETA delayed +6h (port congestion)",
    why: "MV Maersk Alexandria (voyage MXA-2609-12) ETA Genoa delayed from 2026-09-25 08:00 to 14:00 due to Genoa port congestion. All affected USTNs auto-updated. Buyers/LSPs notified.",
    deadline: "—",
    action: "View Schedule Impact",
    priority: 75,
    band: "High",
    category: "SHIPMENT_ALERT",
    icon: Clock,
  },
  {
    id: "INB-2026-0938",
    what: "Gate-in confirmation required — Container EGIU-7721340 at Alexandria",
    why: "LSP (Delta Logistics) delivered container to Terminal C-12. Gate-in timestamp captured. Confirm receipt and assign to voyage MXG-2610-04. Reefer power connection required.",
    deadline: "2026-09-18 17:00 EET",
    action: "Confirm Gate-In",
    priority: 78,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: Anchor,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0935",
    what: "Freight invoice query — Sahara Exports disputes detention charge ($45)",
    why: "Seller disputes detention on USTN ...0032-1. Free time expiry vs actual gate-out: 2h difference. Contract rate terms apply. Evidence package available for resolution.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Dispute",
    priority: 50,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Gavel,
    ustn: "SGTX-EG-26-NH3T-0032-1",
  },
  {
    id: "INB-2026-0932",
    what: "Contract rate renewal due — Sahara Exports (annual review)",
    why: "Annual contract rate review for Frozen Strawberries corridor (Alexandria → Genoa). Current rate: $7,900/40ft Reefer. Market trend +2.1%. Proposed renewal: $8,050.",
    deadline: "2026-09-30 23:59 EET",
    action: "Review Contract Rate",
    priority: 55,
    band: "Medium",
    category: "NEGOTIATION",
    icon: DollarSign,
  },
  {
    id: "INB-2026-0929",
    what: "Reefer power connection alert — Container EGIU-7721340 needs -18°C",
    why: "Container requires reefer power at Terminal C-12. Temperature set to -18°C ±0.5°C. Monitoring active. Alarm if temperature exceeds ±1°C for >5 min.",
    deadline: "2026-09-18 17:30 EET",
    action: "Confirm Reefer Power",
    priority: 72,
    band: "High",
    category: "SHIPMENT_ALERT",
    icon: TrendingUp,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0926",
    what: "Freight invoice settlement received — USTN ...0034-1 ($7,900)",
    why: "Freight invoice settled (ISO 20022). $7,900 received. Reconciliation 99.1%. Credit terms honored (30-day net). Funds in cash position.",
    deadline: "—",
    action: "View Settlement",
    priority: 15,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0923",
    what: "Customs pre-arrival notification — USTN ...0036-1 (Genoa Customs)",
    why: "Genoa Customs pre-arrival notification auto-generated from eBL data. Cargo description, HS code, consignee, value transmitted. Awaiting customs clearance on arrival.",
    deadline: "2026-09-25 14:00 EET",
    action: "View Customs Notification",
    priority: 40,
    band: "Low",
    category: "COMPLIANCE",
    icon: Landmark,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (SHIP-specific metrics) ─────────────────
export const SHIP_SUMMARY_CARDS = [
  { label: "Open Bookings", value: "9", trend: "up" as const, delta: "+3 today", icon: Inbox, color: "text-blue-300" },
  { label: "Active Voyages", value: "6", trend: "up" as const, delta: "+1 this week", icon: Ship, color: "text-cyan-300" },
  { label: "Containers in Transit", value: "142", trend: "up" as const, delta: "+12", icon: Container, color: "text-emerald-300" },
  { label: "eBL Issued (30d)", value: "87", trend: "up" as const, delta: "+8", icon: FileSignature, color: "text-purple-300" },
  { label: "On-Time Departure", value: "96.8%", trend: "up" as const, delta: "+1.2%", icon: TrendingUp, color: "text-green-300" },
  { label: "eBL Latency", value: "2.1h", trend: "down" as const, delta: "-0.4h faster", icon: Clock, color: "text-amber-300" },
];

// ── §16.8.6.4 QUICK ACTIONS (SHIP-specific, max 8) ─────────────────────────
export const SHIP_QUICK_ACTIONS = [
  { key: "booking-requests", label: "Booking Requests", icon: Inbox, specRef: "§16.8.6.4", oneClick: false },
  { key: "ebl-management", label: "eBL Management", icon: FileSignature, specRef: "§16.8.6.4", oneClick: true },
  { key: "vessel-schedule", label: "Vessel Schedule", icon: Calendar, specRef: "§16.8.6.4", oneClick: false },
  { key: "freight-invoice", label: "Freight Invoices", icon: DollarSign, specRef: "§13", oneClick: true },
  { key: "contract-rate", label: "Contract Rate Manager", icon: Scale, specRef: "§16.8.6.4", oneClick: false },
  { key: "gate-in-out", label: "Gate-In/Out", icon: Anchor, specRef: "§12", oneClick: true },
  { key: "reefer-monitor", label: "Reefer Monitoring", icon: TrendingUp, specRef: "§12", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: BarChart3, specRef: "§16.8.6.4", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (SHIP perspective) ───────────────────────────
export const SHIP_HEALTH_SCORE = {
  total: 91,
  components: [
    { name: "Compliance", weight: 20, score: 96, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 93, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 88, icon: Ship },
    { name: "Payment", weight: 15, score: 92, icon: DollarSign },
    { name: "Risk", weight: 20, score: 86, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 94, icon: Clock },
  ],
};

// ── ACTIVE SHIPMENTS (Shared Shipments Vault, SHIP-filtered columns) ────────
export const SHIP_ACTIVE_SHIPMENTS = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    vessel: "MV Maersk Genoa",
    voyage: "MXG-2610-04",
    bl: "MAEU-2026-0042",
    container: "EGIU-7721340 (40ft Reefer -18°C)",
    gateIn: "2026-09-18 16:45",
    gateOut: "— (pending departure)",
    milestone: "Gate-in confirmed, reefer power on",
    health: 88,
    status: "at_port",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0036-1",
    vessel: "MV Maersk Alexandria",
    voyage: "MXA-2609-12",
    bl: "MAEU-2026-0036",
    container: "EGIU-5543210 (40ft Dry)",
    gateIn: "2026-09-12 14:20",
    gateOut: "2026-09-13 08:00",
    milestone: "In transit (ETA Genoa 09-25 14:00)",
    health: 91,
    status: "in_transit",
  },
  {
    ustn: "SGTX-EG-26-DA2F-0021",
    vessel: "MV Maersk Cairo",
    voyage: "MXC-2609-08",
    bl: "MAEU-2026-0021",
    container: "EGIU-3388774 (40ft Reefer -18°C)",
    gateIn: "2026-09-10 10:15",
    gateOut: "2026-09-11 06:00",
    milestone: "In transit (ETA Genoa 09-24 08:00)",
    health: 85,
    status: "in_transit",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0034-1",
    vessel: "MV Maersk Jeddah",
    voyage: "MXJ-2609-05",
    bl: "MAEU-2026-0034",
    container: "EGIU-4421988 (40ft Dry)",
    gateIn: "2026-09-05 12:00",
    gateOut: "2026-09-06 08:00",
    milestone: "Delivered (Jeddah 09-15), closure pending",
    health: 95,
    status: "delivered",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0038-3",
    vessel: "MV Maersk Genoa",
    voyage: "MXG-2609-15",
    bl: "MAEU-2026-0038",
    container: "EGIU-7721 (40ft Reefer -18°C)",
    gateIn: "— (pending gate-in)",
    gateOut: "—",
    milestone: "Booking confirmed, awaiting LSP delivery",
    health: 0,
    status: "pending",
  },
];

// ── §16.8.6.4 BOOKING REQUESTS (with contract-rate auto-application) ────────
export interface BookingRequest {
  id: string;
  seller: string;
  lsp: string;
  route: string;
  equipment: string;
  containerCount: number;
  voyage: string;
  etd: string;
  eta: string;
  contractRate: string;
  marketRate: string;
  rateType: "contract" | "spot";
  receivedAt: string;
  expires: string;
  priority: number;
}

export const SHIP_BOOKING_REQUESTS: BookingRequest[] = [
  {
    id: "BK-2026-0046",
    seller: "Sahara Exports Co.",
    lsp: "Delta Logistics",
    route: "Alexandria → Genoa",
    equipment: "40ft Reefer @ -18°C",
    containerCount: 2,
    voyage: "MXG-2610-04",
    etd: "2026-10-04 08:00 EET",
    eta: "2026-10-18 14:00 CEST",
    contractRate: "$7,900 / container",
    marketRate: "$8,500 (spot)",
    rateType: "contract",
    receivedAt: "2 hours ago",
    expires: "2026-09-19 16:00 EET (22h)",
    priority: 80,
  },
  {
    id: "BK-2026-0045",
    seller: "Delta Agro",
    lsp: "Cairo Freight",
    route: "Borg El Arab → Damietta → Genoa",
    equipment: "40ft Reefer @ -18°C",
    containerCount: 1,
    voyage: "MXC-2610-02",
    etd: "2026-09-28 08:00 EET",
    eta: "2026-10-12 08:00 CEST",
    contractRate: "$8,100 / container",
    marketRate: "$8,300 (spot)",
    rateType: "contract",
    receivedAt: "5 hours ago",
    expires: "2026-09-20 10:00 EET (28h)",
    priority: 70,
  },
  {
    id: "BK-2026-0044",
    seller: "Najd Trading",
    lsp: "Nile Transport",
    route: "Alexandria → Jeddah",
    equipment: "40ft Dry",
    containerCount: 1,
    voyage: "MXJ-2610-03",
    etd: "2026-10-01 08:00 EET",
    eta: "2026-10-08 06:00 AST",
    contractRate: "$4,200 / container",
    marketRate: "$4,500 (spot)",
    rateType: "contract",
    receivedAt: "1 day ago",
    expires: "2026-09-21 09:00 EET (12h)",
    priority: 60,
  },
];

// ── §16.8.6.4 eBL MANAGEMENT (webhook integration) ──────────────────────────
export const EBL_RECORDS = [
  { id: "eBL-2026-0044", ustn: "SGTX-EG-26-NH3T-0036-1", bl: "MAEU-2026-0036", buyer: "Mediterra Foods", status: "issued", webhookStatus: "delivered", cargoX: "verified", timestamp: "2 hours ago" },
  { id: "eBL-2026-0043", ustn: "SGTX-EG-26-DA2F-0021", bl: "MAEU-2026-0021", buyer: "Delta Foods Italia", status: "issued", webhookStatus: "delivered", cargoX: "verified", timestamp: "1 day ago" },
  { id: "eBL-2026-0042", ustn: "SGTX-EG-26-NH3T-0034-1", bl: "MAEU-2026-0034", buyer: "Najd Trading", status: "claimed", webhookStatus: "delivered", cargoX: "verified", timestamp: "10 days ago" },
  { id: "eBL-2026-0041", ustn: "pre-USTN (pending)", bl: "— (pending)", buyer: "—", status: "pending", webhookStatus: "—", cargoX: "—", timestamp: "— (awaiting gate-in)" },
];

// ── §16.8.6.4 VESSEL SCHEDULE (ETD/ETA propagation) ──────────────────────────
export const VESSEL_SCHEDULE = [
  { vessel: "MV Maersk Genoa", voyage: "MXG-2610-04", route: "Alexandria → Genoa", etd: "2026-10-04 08:00", eta: "2026-10-18 14:00", status: "scheduled", containers: 42, reefer: 18, capacity: "85%" },
  { vessel: "MV Maersk Alexandria", voyage: "MXA-2609-12", route: "Alexandria → Genoa", etd: "2026-09-13 08:00", eta: "2026-09-25 14:00", status: "in_transit", containers: 38, reefer: 22, capacity: "78%" },
  { vessel: "MV Maersk Cairo", voyage: "MXC-2609-08", route: "Alexandria → Genoa", etd: "2026-09-11 06:00", eta: "2026-09-24 08:00", status: "in_transit", containers: 35, reefer: 15, capacity: "72%" },
  { vessel: "MV Maersk Jeddah", voyage: "MXJ-2609-05", route: "Alexandria → Jeddah", etd: "2026-09-06 08:00", eta: "2026-09-15 06:00", status: "arrived", containers: 27, reefer: 5, capacity: "65%" },
];

// ── §16.8.6.4 FREIGHT INVOICES ───────────────────────────────────────────────
export const FREIGHT_INVOICES = [
  { id: "INV-2026-0034", ustn: "SGTX-EG-26-NH3T-0034-1", seller: "Sahara Exports", amount: "$7,900", terms: "30-day net", status: "settled", settledAt: "5 days ago" },
  { id: "INV-2026-0036", ustn: "SGTX-EG-26-NH3T-0036-1", seller: "Sahara Exports", amount: "$4,200", terms: "30-day net", status: "issued", settledAt: "— (due 2026-10-25)" },
  { id: "INV-2026-0038-3", ustn: "SGTX-EG-26-NH3T-0038-3", seller: "Sahara Exports", amount: "$7,900", terms: "30-day net", status: "pending", settledAt: "— (not yet issued)" },
  { id: "INV-2026-0032", ustn: "SGTX-EG-26-NH3T-0032-1", seller: "Sahara Exports", amount: "$4,150", terms: "30-day net", status: "disputed", settledAt: "— (detention charge $45 disputed)" },
];

// ── §16.8.6.4 CONTRACT RATE MANAGER (private rates per seller) ──────────────
export const CONTRACT_RATES = [
  { seller: "Sahara Exports", corridor: "Alexandria → Genoa", equipment: "40ft Reefer", rate: "$7,900", spot: "$8,500", discount: "-7.1%", renewal: "2026-09-30", status: "active" },
  { seller: "Delta Agro", corridor: "Borg El Arab → Genoa", equipment: "40ft Reefer", rate: "$8,100", spot: "$8,300", discount: "-2.4%", renewal: "2026-11-15", status: "active" },
  { seller: "Najd Trading", corridor: "Alexandria → Jeddah", equipment: "40ft Dry", rate: "$4,200", spot: "$4,500", discount: "-6.7%", renewal: "2026-12-01", status: "active" },
  { seller: "Mediterra Foods", corridor: "Genoa → Alexandria", equipment: "40ft Dry", rate: "$4,100", spot: "$4,300", discount: "-4.7%", renewal: "2026-10-20", status: "pending_renewal" },
];

// ── §16.8.6.4 PERFORMANCE DASHBOARD ──────────────────────────────────────────
export const SHIP_PERFORMANCE = {
  metrics: [
    { name: "On-Time Departure (30d)", value: "96.8%", benchmark: "94.2%", status: "above", icon: TrendingUp },
    { name: "On-Time Arrival (30d)", value: "93.1%", benchmark: "91.5%", status: "above", icon: Ship },
    { name: "eBL Latency (avg)", value: "2.1h", benchmark: "3.5h", status: "above", icon: Clock },
    { name: "Gate-In Accuracy", value: "99.2%", benchmark: "97.8%", status: "above", icon: Anchor },
    { name: "Reefer Temp Compliance", value: "98.7%", benchmark: "96.5%", status: "above", icon: TrendingUp },
    { name: "Invoice Dispute Rate", value: "1.2%", benchmark: "2.8%", status: "above", icon: Gavel },
  ],
  trend: "+1.4% (vs last month)",
  percentile: "Top 12% of corridor shipping lines",
};

// ── §16.8.6.4 PORTAL FEATURE LIST (SHIP) ─────────────────────────────────────
export const SHIP_PORTAL_FEATURES = [
  { name: "Booking Requests", desc: "Quote submission with contract-rate auto-application (no manual rate lookup)", section: "§16.8.6.4" },
  { name: "eBL Management", desc: "Electronic Bill of Lading via CargoX webhook (Ed25519 signature, auto-propagated to Nafeza)", section: "§16.8.6.4" },
  { name: "Vessel Schedule", desc: "ETD/ETA propagation to all affected USTNs; auto-notify buyers/LSPs on changes", section: "§16.8.6.4" },
  { name: "Freight Invoices", desc: "Credit/mandatory terms (30-day net); ISO 20022 settlement", section: "§13" },
  { name: "Contract Rate Manager", desc: "Private rates per seller per corridor; annual renewal workflow", section: "§16.8.6.4" },
  { name: "Performance Dashboard", desc: "On-time departure, eBL latency, gate-in accuracy, reefer temp compliance", section: "§16.8.6.4" },
  { name: "Company Admin", desc: "Ports served, eBL credentials (CargoX), webhook endpoints", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (SHIP perspective) ────────────────────────────────
export const SHIP_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "LSP (Delta Logistics)", action: "Delivered container to Terminal C-12 — gate-in pending", target: "USTN ...0042", type: "info" as const },
  { time: "1 h ago", actor: "CargoX Webhook", action: "eBL issued — MAEU-2026-0036", target: "USTN ...0036-1", type: "success" as const },
  { time: "2 h ago", actor: "Port of Genoa", action: "Congestion alert — ETA delayed +6h", target: "Voyage MXA-2609-12", type: "warning" as const },
  { time: "3 h ago", actor: "Seller (Sahara Exports)", action: "Submitted booking request — 2× 40ft Reefer", target: "BK-2026-0046", type: "info" as const },
  { time: "5 h ago", actor: "Governor (G6)", action: "Freight invoice settled — $7,900", target: "USTN ...0034-1", type: "success" as const },
  { time: "8 h ago", actor: "You", action: "Confirmed booking — contract rate $7,900", target: "BK-2026-0046", type: "info" as const },
  { time: "1 d ago", actor: "Reefer Monitor", action: "Temp compliance 98.7% (30d) — no excursions", target: "All reefer containers", type: "success" as const },
];

// ── EXTERNAL INTEGRATIONS (SHIP-specific) ────────────────────────────────────
export const SHIP_INTEGRATIONS = [
  { name: "CargoX (eBL Platform)", status: "operational", latency: "240ms", icon: FileSignature },
  { name: "Nafeza (Customs)", status: "operational", latency: "180ms", icon: Landmark },
  { name: "AIS Vessel Tracking", status: "operational", latency: "200ms", icon: Navigation },
  { name: "Port Community System", status: "operational", latency: "150ms", icon: Anchor },
  { name: "Reefer Telemetry (Cold Chain)", status: "operational", latency: "—", icon: TrendingUp },
  { name: "ISO 20022 Bank Gateway", status: "operational", latency: "410ms", icon: DollarSign },
];

// ── RECENT GOVERNOR DECISIONS (SHIP perspective) ──────────────────────────────
export const SHIP_RECENT_DECISIONS = [
  {
    gate: "G5",
    type: "Gate-In Confirmation",
    ustn: "SGTX-EG-26-NH3T-0042",
    verdict: "ALLOW" as const,
    reason: "Container EGIU-7721340 gate-in confirmed at Terminal C-12. Reefer power connected (-18°C ±0.5°C). Assigned to voyage MXG-2610-04. LSP (Delta Logistics) released from land leg.",
    timestamp: "2 min ago",
  },
  {
    gate: "G5",
    type: "eBL Issuance (CargoX Webhook)",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "ALLOW" as const,
    reason: "eBL MAEU-2026-0036 issued via CargoX. Ed25519 signature verified. Auto-propagated to Nafeza. Buyer (Mediterra Foods) can claim cargo on arrival. Loom hash appended.",
    timestamp: "1 h ago",
  },
  {
    gate: "G6",
    type: "Freight Invoice Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Freight invoice $7,900 settled via pain.001 (CBE clearing). 30-day net terms honored. Reconciliation 99.1%. Funds in cash position. Closure hash published.",
    timestamp: "5 h ago",
  },
];

// ── §16.1.6 SIDEBAR (SHIP-specific role tabs) ────────────────────────────────
export const SHIP_SIDEBAR_ROLE = [
  { label: "Booking Requests", icon: Inbox, desc: "Contract-rate auto-applied" },
  { label: "eBL Management", icon: FileSignature, desc: "CargoX webhook" },
  { label: "Vessel Schedule", icon: Calendar, desc: "ETD/ETA propagation" },
  { label: "Freight Invoices", icon: DollarSign, desc: "30-day net terms" },
  { label: "Contract Rates", icon: Scale, desc: "Private rates per seller" },
];
