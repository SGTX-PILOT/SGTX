// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #3: LSP (Logistics Service Provider)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.3 LSP features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Truck, MapPin, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, TrendingDown, Package, Container, Anchor,
  Landmark, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Route, Warehouse, Smartphone, BarChart3,
  FileText, ShieldAlert, Navigation, QrCode,
  Boxes, ClipboardCheck, DollarSign, Timer,
} from "lucide-react";

// ── Active tenant (the "logged-in" LSP for the demo) ─────────────────────────
export const LSP_TENANT = {
  name: "Delta Logistics Co.",
  gtid: "SGTX-EG-26-DL4C-0031",
  kybTier: 3,
  role: "LSP" as const,
  avatarInitials: "DL",
  trustScore: 76,
  tradeCount: 31,
  activeShipments: 8,
  openRFQs: 4,
  drivers: 12,
  trucks: 8,
  onTimeRate: 94.2,
};

// ── §2.5.1 SMART INBOX — LSP-specific items (4-part structure) ─────────────
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

export const LSP_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0945",
    what: "New RFQ from Sahara Exports — Alexandria → Genoa (2× 40ft Reefer)",
    why: "Directed RFQ (seller selected your company). Quote within 24h. 14-day transit window. Reefer -18°C. $8,200 market-competitive.",
    deadline: "2026-09-19 16:00 EET",
    action: "View RFQ & Quote",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0942",
    what: "Anonymous broadcast RFQ — Cairo → Damietta (3× 20ft Dry)",
    why: "Broadcast to 5 LSPs in your corridor. Anonymous comparison. You don't see other quotes. Accept or decline.",
    deadline: "2026-09-20 10:00 EET",
    action: "View Anonymous RFQ",
    priority: 65,
    band: "Medium",
    category: "NEW_OFFER",
    icon: Inbox,
  },
  {
    id: "INB-2026-0939",
    what: "Clarification request from seller — reefer temperature variance",
    why: "Seller (Sahara Exports) asks: 'Can you guarantee -18°C ±0.5°C continuous?' Structured Q&A. Your answer affects the RFQ award.",
    deadline: "2026-09-18 18:00 EET",
    action: "Answer Clarification",
    priority: 75,
    band: "High",
    category: "NEGOTIATION",
    icon: MessageSquare,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0936",
    what: "Dispatch reminder — USTN ...0038-3 pickup today 14:00",
    why: "Shipment 3/6 in multi-shipment contract. Driver assigned (Ahmed K.). Truck EGY-7721. GPS geofence armed at Sahara Cold Storage #3.",
    deadline: "2026-09-18 14:00 EET",
    action: "Confirm Dispatch",
    priority: 85,
    band: "High",
    category: "SHIPMENT_ALERT",
    icon: Truck,
    ustn: "SGTX-EG-26-NH3T-0038-3",
  },
  {
    id: "INB-2026-0933",
    what: "Driver app offline — Mohamed S. (Truck EGY-5543) queue: 3 items",
    why: "Driver mobile app offline for 22 min. 3 queued actions (2 milestone scans, 1 GPS stamp). Auto-retry in progress. Will sync when connection resumes.",
    deadline: "—",
    action: "View Driver Status",
    priority: 60,
    band: "Medium",
    category: "SHIPMENT_ALERT",
    icon: Smartphone,
  },
  {
    id: "INB-2026-0930",
    what: "SLA incident credit applied — $120 to Nile Harvest Trading",
    why: "You missed the pickup window on USTN ...0034-1 (12 min late due to traffic). $120 SLA credit auto-applied to buyer. No dispute — automatic.",
    deadline: "—",
    action: "View SLA Report",
    priority: 25,
    band: "Low",
    category: "GENERAL",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0928",
    what: "Customs broker requested gate-out confirmation — USTN ...0036-1",
    why: "Cairo Customs Brokers needs gate-out timestamp for customs declaration. Auto-captured from geofence exit. Confirm and release.",
    deadline: "2026-09-19 09:00 EET",
    action: "Confirm Gate-Out",
    priority: 58,
    band: "Medium",
    category: "NEEDS_APPROVAL",
    icon: CheckCircle2,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0925",
    what: "Invoice accuracy dispute — Sahara Exports ($45 discrepancy)",
    why: "Seller disputes detention charge ($45) on USTN ...0032-1. Free time expiry vs actual gate-out: 2h difference. Evidence package available.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Dispute",
    priority: 45,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Gavel,
    ustn: "SGTX-EG-26-NH3T-0032-1",
  },
  {
    id: "INB-2026-0920",
    what: "Settlement received — USTN ...0034-1 ($8,200 logistics fee)",
    why: "Bank settlement confirmed (ISO 20022). $8,200 logistics fee received. Reconciliation 98.2%. Funds in cash position.",
    deadline: "—",
    action: "View Settlement",
    priority: 15,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (LSP-specific metrics) ─────────────────
export const LSP_SUMMARY_CARDS = [
  { label: "Open RFQs", value: "4", trend: "up" as const, delta: "+2 today", icon: Inbox, color: "text-blue-300" },
  { label: "Active Shipments", value: "8", trend: "up" as const, delta: "+1 today", icon: Truck, color: "text-emerald-300" },
  { label: "Drivers Online", value: "10/12", trend: "up" as const, delta: "+2 this hour", icon: Users, color: "text-purple-300" },
  { label: "Trucks Deployed", value: "8", trend: "flat" as const, delta: "no change", icon: Truck, color: "text-cyan-300" },
  { label: "On-Time Rate (30d)", value: "94.2%", trend: "down" as const, delta: "-1.8% (SLA incident)", icon: TrendingUp, color: "text-amber-300" },
  { label: "Invoice Accuracy", value: "97.1%", trend: "up" as const, delta: "+0.5%", icon: FileCheck, color: "text-green-300" },
];

// ── §16.8.6.3 QUICK ACTIONS (LSP-specific, max 8) ───────────────────────────
export const LSP_QUICK_ACTIONS = [
  { key: "rfq-inbox", label: "RFQ Inbox", icon: Inbox, specRef: "§16.8.6.3", oneClick: false },
  { key: "dispatch-planner", label: "Dispatch Planner (VRP)", icon: Route, specRef: "§16.8.6.3", oneClick: false },
  { key: "driver-assign", label: "Driver Assignment", icon: Users, specRef: "§16.8.6.3", oneClick: true },
  { key: "warehouse", label: "Warehouse Dashboard", icon: Warehouse, specRef: "§16.8.6.3", oneClick: false },
  { key: "forwarder", label: "Forwarder Console", icon: Package, specRef: "§16.8.6.3", oneClick: false },
  { key: "driver-app", label: "Driver App Management", icon: Smartphone, specRef: "§16.8.6.3", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: BarChart3, specRef: "§16.8.6.3", oneClick: false },
  { key: "invoice", label: "Invoice & Settlement", icon: DollarSign, specRef: "§13", oneClick: true },
];

// ── §2.5.2 TRADE HEALTH SCORE (LSP perspective) ─────────────────────────────
export const LSP_HEALTH_SCORE = {
  total: 79,
  components: [
    { name: "Compliance", weight: 20, score: 88, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 82, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 74, icon: Truck },
    { name: "Payment", weight: 15, score: 85, icon: DollarSign },
    { name: "Risk", weight: 20, score: 72, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 76, icon: Clock },
  ],
};

// ── ACTIVE SHIPMENTS (Shared Shipments Vault, LSP-filtered columns) ──────────
export const LSP_ACTIVE_SHIPMENTS = [
  {
    ustn: "SGTX-EG-26-NH3T-0038-3",
    seller: "Sahara Exports",
    buyer: "Nile Harvest Trading",
    route: "6th of October → Alexandria → Genoa",
    equipment: "2× 40ft Reefer @ -18°C",
    milestone: "Pickup in progress",
    nextAction: "Confirm pickup scan",
    driver: "Ahmed K. (EGY-7721)",
    health: 88,
    status: "in_transit",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    buyer: "Mediterra Foods (IT)",
    route: "Cairo → Alexandria → Naples",
    equipment: "1× 40ft Dry",
    milestone: "Gate-out confirmed",
    nextAction: "Await vessel departure",
    driver: "Mohamed S. (EGY-5543)",
    health: 91,
    status: "in_transit",
  },
  {
    ustn: "SGTX-EG-26-DA2F-0021",
    seller: "Delta Agro",
    buyer: "Delta Foods Italia",
    route: "Borg El Arab → Damietta → Genoa",
    equipment: "1× 40ft Reefer @ -18°C",
    milestone: "Vessel in transit",
    nextAction: "Track vessel (AIS)",
    driver: "— (ocean leg)",
    health: 85,
    status: "in_transit",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0034-1",
    seller: "Sahara Exports",
    buyer: "Najd Trading (SA)",
    route: "Cairo → Alexandria → Jeddah",
    equipment: "1× 40ft Dry",
    milestone: "Delivered (closure pending)",
    nextAction: "Confirm delivery scan",
    driver: "Khaled A. (EGY-3388)",
    health: 72,
    status: "delivered",
  },
  {
    ustn: "SGTX-EG-26-SX7K-0008-RQ",
    seller: "Sahara Exports (pending)",
    buyer: "Nile Harvest Trading (pending)",
    route: "6th of October → Alexandria → Genoa",
    equipment: "2× 40ft Reefer @ -18°C",
    milestone: "RFQ under review",
    nextAction: "Submit quote",
    driver: "— (not dispatched)",
    health: 0,
    status: "pending",
  },
];

// ── §16.8.6.3 RFQ INBOX (directed + anonymous broadcast) ─────────────────────
export interface RFQ {
  id: string;
  type: "directed" | "anonymous";
  from: string;
  route: string;
  equipment: string;
  pickupWindow: string;
  deliveryWindow: string;
  transitDays: number;
  yourDraftQuote: string;
  marketRange: string;
  receivedAt: string;
  expires: string;
  priority: number;
}

export const LSP_RFQS: RFQ[] = [
  {
    id: "RFQ-2026-0045",
    type: "directed",
    from: "Sahara Exports Co.",
    route: "6th of October City → Alexandria → Genoa",
    equipment: "2× 40ft Reefer @ -18°C",
    pickupWindow: "2026-10-04 08:00–12:00",
    deliveryWindow: "2026-10-18 (14 days)",
    transitDays: 14,
    yourDraftQuote: "$8,200",
    marketRange: "$7,900–$9,100",
    receivedAt: "2 hours ago",
    expires: "2026-09-19 16:00 EET (22h)",
    priority: 80,
  },
  {
    id: "RFQ-2026-0044",
    type: "anonymous",
    from: "Anonymous (5 LSPs broadcast)",
    route: "Cairo → Damietta",
    equipment: "3× 20ft Dry",
    pickupWindow: "2026-09-25 06:00–10:00",
    deliveryWindow: "2026-09-26 (1 day)",
    transitDays: 1,
    yourDraftQuote: "—",
    marketRange: "Hidden (anonymous)",
    receivedAt: "3 hours ago",
    expires: "2026-09-20 10:00 EET (34h)",
    priority: 65,
  },
  {
    id: "RFQ-2026-0043",
    type: "directed",
    from: "Delta Agro",
    route: "Borg El Arab → Damietta → Genoa",
    equipment: "1× 40ft Reefer @ -18°C",
    pickupWindow: "2026-09-28 08:00–12:00",
    deliveryWindow: "2026-10-12 (14 days)",
    transitDays: 14,
    yourDraftQuote: "$4,400",
    marketRange: "$4,200–$4,600",
    receivedAt: "1 day ago",
    expires: "2026-09-21 09:00 EET (12h)",
    priority: 60,
  },
  {
    id: "RFQ-2026-0042",
    type: "anonymous",
    from: "Anonymous (3 LSPs broadcast)",
    route: "Nasr City → Sokhna Port",
    equipment: "2× 40ft Dry",
    pickupWindow: "2026-10-01 06:00–10:00",
    deliveryWindow: "2026-10-02 (1 day)",
    transitDays: 1,
    yourDraftQuote: "—",
    marketRange: "Hidden (anonymous)",
    receivedAt: "2 days ago",
    expires: "2026-09-22 16:00 EET (4h)",
    priority: 55,
  },
];

// ── §16.8.6.3 DISPATCH PLANNER (ORTools VRP with driver assignment) ─────────
export const DISPATCH_PLAN = {
  algorithm: "Google ORTools VRP (Vehicle Routing Problem)",
  optimizedFor: "Minimize total distance + respect time windows + reefer fuel cost",
  trucksDeployed: 8,
  driversAssigned: 10,
  pendingDispatches: 3,
  routes: [
    {
      id: "ROUTE-001",
      ustn: "SGTX-EG-26-NH3T-0038-3",
      driver: "Ahmed K.",
      truck: "EGY-7721 (Reefer 40ft)",
      stops: 3,
      distance: "62 km",
      duration: "2h 15m",
      status: "in_progress",
      pickups: ["Sahara Cold Storage #3", "Alexandria Port Gate 4"],
      deliveries: ["Alexandria Terminal C-12"],
    },
    {
      id: "ROUTE-002",
      ustn: "SGTX-EG-26-NH3T-0036-1",
      driver: "Mohamed S.",
      truck: "EGY-5543 (Dry 40ft)",
      stops: 2,
      distance: "48 km",
      duration: "1h 40m",
      status: "completed",
      pickups: ["Sahara Cold Storage #1"],
      deliveries: ["Alexandria Port Gate 2"],
    },
    {
      id: "ROUTE-003",
      ustn: "SGTX-EG-26-NH3T-0034-1",
      driver: "Khaled A.",
      truck: "EGY-3388 (Dry 40ft)",
      stops: 2,
      distance: "55 km",
      duration: "1h 55m",
      status: "completed",
      pickups: ["Cairo Warehouse #7"],
      deliveries: ["Alexandria Port Gate 1"],
    },
    {
      id: "ROUTE-004",
      ustn: "pending (RFQ-2026-0045)",
      driver: "— (unassigned)",
      truck: "— (unassigned)",
      stops: 2,
      distance: "62 km",
      duration: "2h 15m",
      status: "pending",
      pickups: ["Sahara Cold Storage #3"],
      deliveries: ["Alexandria Port Gate 4"],
    },
  ],
};

// ── §16.8.6.3 WAREHOUSE DASHBOARD ─────────────────────────────────────────────
export const WAREHOUSE_STATUS = [
  { facility: "Delta Warehouse #1 (6th of October)", capacity: "85%", utilization: "1,360 / 1,600 pallets", reeferSlots: "12/20 active", inbound: 3, outbound: 2, status: "operational" },
  { facility: "Delta Warehouse #2 (Borg El Arab)", capacity: "62%", utilization: "496 / 800 pallets", reeferSlots: "8/10 active", inbound: 1, outbound: 1, status: "operational" },
  { facility: "Delta Cold Storage #3 (Nasr City)", capacity: "94%", utilization: "752 / 800 pallets", reeferSlots: "18/20 active", inbound: 2, outbound: 3, status: "near_capacity" },
];

// ── §16.8.6.3 DRIVER MOBILE APP MANAGEMENT ───────────────────────────────────
export const DRIVERS = [
  { name: "Ahmed K.", gtid: "SGTX-EG-26-DM3A-0101", truck: "EGY-7721 (Reefer)", status: "online", queue: 0, lastSync: "2 min ago", location: "En route to Alexandria", rating: 4.8 },
  { name: "Mohamed S.", gtid: "SGTX-EG-26-DM3A-0102", truck: "EGY-5543 (Dry)", status: "offline", queue: 3, lastSync: "22 min ago", location: "Alexandria Port", rating: 4.6 },
  { name: "Khaled A.", gtid: "SGTX-EG-26-DM3A-0103", truck: "EGY-3388 (Dry)", status: "online", queue: 0, lastSync: "1 min ago", location: "Cairo (returning)", rating: 4.9 },
  { name: "Mostafa R.", gtid: "SGTX-EG-26-DM3A-0104", truck: "EGY-4421 (Reefer)", status: "online", queue: 1, lastSync: "5 min ago", location: "6th of October City", rating: 4.7 },
  { name: "Tarek M.", gtid: "SGTX-EG-26-DM3A-0105", truck: "— (off-duty)", status: "off_duty", queue: 0, lastSync: "3 hours ago", location: "—", rating: 4.5 },
];

// ── §16.8.6.3 PERFORMANCE DASHBOARD (anonymous benchmark) ───────────────────
export const LSP_PERFORMANCE = {
  metrics: [
    { name: "On-Time Rate (30d)", value: "94.2%", benchmark: "91.8%", status: "above", icon: TrendingUp },
    { name: "Invoice Accuracy", value: "97.1%", benchmark: "95.4%", status: "above", icon: FileCheck },
    { name: "Dispute Rate", value: "2.3%", benchmark: "3.1%", status: "above", icon: Gavel },
    { name: "SLA Incidents (30d)", value: "2", benchmark: "3.5", status: "above", icon: AlertTriangle },
    { name: "Avg Transit (ocean)", value: "14.2 days", benchmark: "15.1 days", status: "above", icon: Anchor },
    { name: "Driver Utilization", value: "83%", benchmark: "78%", status: "above", icon: Users },
  ],
  trend: "+2.1% (vs last month)",
  percentile: "Top 23% of corridor LSPs (anonymous benchmark)",
};

// ── §16.8.6.3 PORTAL FEATURE LIST (LSP) ──────────────────────────────────────
export const LSP_PORTAL_FEATURES = [
  { name: "RFQ Inbox", desc: "Directed RFQs (seller selected you) + anonymous broadcast RFQs (5 LSPs)", section: "§16.8.6.3" },
  { name: "Clarification Request Workflow", desc: "Structured Q&A with the seller (e.g. reefer temperature variance)", section: "§16.8.6.3" },
  { name: "Dispatch Planner", desc: "ORTools VRP with driver assignment, time windows, reefer fuel cost optimization", section: "§16.8.6.3" },
  { name: "Warehouse Dashboard", desc: "Capacity utilization, reefer slots, inbound/outbound", section: "§16.8.6.3" },
  { name: "Forwarder Console", desc: "Forwarding-only operations (booking, documentation, tracking)", section: "§16.8.6.3" },
  { name: "Driver Mobile App Management", desc: "QR pairing, offline queue monitoring, sync status, geofence alerts", section: "§16.8.6.3" },
  { name: "Performance Dashboard", desc: "On-time, disputes, invoice accuracy, anonymous benchmark vs corridor peers", section: "§16.8.6.3" },
  { name: "Company Admin", desc: "Anonymous RFQ opt-out, service catalogue, fee schedules", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (LSP perspective) ──────────────────────────────────
export const LSP_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "Ahmed K. (Driver)", action: "Pickup scan — SSCC 0037621 confirmed", target: "USTN ...0038-3", type: "success" as const },
  { time: "12 min ago", actor: "Seller (Sahara Exports)", action: "Submitted clarification request — reefer temp variance", target: "RFQ-2026-0045", type: "info" as const },
  { time: "25 min ago", actor: "ORTools VRP", action: "Route optimized — ROUTE-001 (62km, 2h15m)", target: "USTN ...0038-3", type: "success" as const },
  { time: "1 h ago", actor: "Mohamed S. (Driver)", action: "App offline — 3 actions queued", target: "EGY-5543", type: "warning" as const },
  { time: "2 h ago", actor: "Governor (G6)", action: "Settlement confirmed — $8,200 logistics fee", target: "USTN ...0034-1", type: "success" as const },
  { time: "3 h ago", actor: "Cairo Customs Brokers", action: "Requested gate-out confirmation", target: "USTN ...0036-1", type: "info" as const },
  { time: "5 h ago", actor: "You", action: "Submitted quote — $8,200 (RFQ-2026-0045)", target: "RFQ-2026-0045", type: "info" as const },
  { time: "6 h ago", actor: "SLA Engine", action: "Credit applied — $120 (12 min late pickup)", target: "USTN ...0034-1", type: "error" as const },
];

// ── EXTERNAL INTEGRATIONS (LSP-specific) ──────────────────────────────────────
export const LSP_INTEGRATIONS = [
  { name: "OSRM (Navigation)", status: "operational", latency: "85ms", icon: Navigation },
  { name: "NATS WebSocket", status: "operational", latency: "12ms", icon: MessageSquare },
  { name: "Google ORTools VRP", status: "operational", latency: "—", icon: Route },
  { name: "AIS Vessel Tracking", status: "operational", latency: "200ms", icon: Anchor },
  { name: "ZITADEL (Driver Auth)", status: "operational", latency: "150ms", icon: Users },
  { name: "Zebra Scanner (QR/SSCC)", status: "operational", latency: "—", icon: QrCode },
];

// ── RECENT GOVERNOR DECISIONS (LSP perspective) ──────────────────────────────
export const LSP_RECENT_DECISIONS = [
  {
    gate: "G5",
    type: "Milestone Release (pickup confirmed)",
    ustn: "SGTX-EG-26-NH3T-0038-3",
    verdict: "ALLOW" as const,
    reason: "Driver Ahmed K. scanned SSCC pallet label at Sahara Cold Storage #3. GPS geofence armed. Pickup milestone confirmed. Per-shipment fee payment authorized to seller.",
    timestamp: "2 min ago",
  },
  {
    gate: "G5",
    type: "Gate-Out Confirmation",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "CONDITIONAL" as const,
    reason: "Geofence exit detected at Alexandria Port Gate 2. Gate-out timestamp captured. Awaiting customs broker confirmation before milestone release (G5U3 external fact reconciliation).",
    timestamp: "3 h ago",
  },
  {
    gate: "G6",
    type: "Logistics Fee Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Logistics fee $8,200 settled via pain.001. Reconciliation 98.2% confidence (≥95% threshold). SLA credit $120 applied (12 min late pickup). Net received: $8,080.",
    timestamp: "2 h ago",
  },
];

// ── §16.1.6 SIDEBAR (LSP-specific role tabs) ────────────────────────────────
export const LSP_SIDEBAR_ROLE = [
  { label: "RFQ Inbox", icon: Inbox, desc: "Directed + anonymous broadcast" },
  { label: "Dispatch Planner", icon: Route, desc: "ORTools VRP + driver assignment" },
  { label: "Warehouse", icon: Warehouse, desc: "Capacity + reefer slots" },
  { label: "Forwarder Console", icon: Package, desc: "Forwarding operations" },
  { label: "Driver App", icon: Smartphone, desc: "QR pairing + offline queue" },
];
