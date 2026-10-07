// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #1: Trader Portal — Buyer Mode
// Dashboard data (sample/demonstration) per §2.5.1 Smart Inbox, §2.5.2 TCC,
// §16.8.6.1 Trader Portal (Buyer) features, §16.9 Buyer Dashboard.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight, FileSignature, FileText, DollarSign, Package,
  ShieldAlert, Inbox, Users, BellRing, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, TrendingDown,
  Ship, Container, FlaskConical, ClipboardCheck,
  Landmark, Zap, Search, Bell, Palette, Languages, ChevronRight,
  Wallet, FileCheck, Truck, Gavel, Scale, MessageSquare, Banknote,
} from "lucide-react";

// ── Active tenant (the "logged-in" buyer for the demo) ────────────────────────
export const BUYER_TENANT = {
  name: "Nile Harvest Trading Co.",
  gtid: "SGTX-EG-26-NH3T-0042",
  kybTier: 3,
  traderMode: "BUY" as const,
  avatarInitials: "NH",
  trustScore: 87,
  tradeCount: 142,
  activeTrades: 7,
  openObligations: 5,
};

// ── §2.5.1 SMART INBOX — 4-part structure: WHAT / WHY / DEADLINE / ACTION ─────
export interface InboxItem {
  id: string;
  what: string;
  why: string;
  deadline: string;
  action: string;
  priority: number; // 0-100
  band: "High" | "Medium" | "Low";
  category: string;
  icon: LucideIcon;
  ustn?: string;
}

export const BUYER_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0941",
    what: "Sign contract for Frozen Strawberries (20,000 kg)",
    why: "Seller (Sahara Exports) has counter-signed. QES signature required within 48h or the offer expires and the trade restarts at Phase 1.",
    deadline: "2026-09-21 14:00 EET",
    action: "Sign Contract (QES)",
    priority: 95,
    band: "High",
    category: "NEEDS_SIGNATURE",
    icon: FileSignature,
    ustn: "pre-USTN (SGTX-EG-26-NH3T-0042 → will mint at lock)",
  },
  {
    id: "INB-2026-0938",
    what: "KYB/Compliance alert: UBO re-verification due",
    why: "Annual re-verification required for KYB Tier 3. Trade initiation will be blocked (G1U2) until completed.",
    deadline: "2026-09-25 23:59 EET",
    action: "Start Re-Verification",
    priority: 95,
    band: "High",
    category: "COMPLIANCE",
    icon: ShieldAlert,
  },
  {
    id: "INB-2026-0935",
    what: "Free-time expiry alert: Container EGIU-7721340 at Alexandria",
    why: "Free time expires in 36 hours. Demurrage of $85/day applies after expiry (Add-On 9 — §22.2.9).",
    deadline: "2026-09-20 06:00 EET",
    action: "Arrange Pickup",
    priority: 80,
    band: "High",
    category: "SHIPMENT_ALERT",
    icon: Clock,
    ustn: "SGTX-EG-26-NH3T-0039-2",
  },
  {
    id: "INB-2026-0933",
    what: "Quote received from Sahara Exports — Frozen Strawberries",
    why: "Seller locked EXW price at $4.20/kg (within anonymised historical range). Fee breakdown attached. Accept/counter/decline.",
    deadline: "2026-09-19 18:00 EET",
    action: "Review Quote",
    priority: 75,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (request SGTX-EG-26-NH3T-0042-RQ)",
  },
  {
    id: "INB-2026-0930",
    what: "Payment due: per-shipment fee for USTN SGTX-EG-26-NH3T-0038-4",
    why: "Shipment #4 of 6 in multi-shipment contract. FeeLock instruction is ACTIVE. Pay fee to unlock USTN generation for this shipment.",
    deadline: "2026-09-22 12:00 EET",
    action: "Pay Fee (one-click)",
    priority: 72,
    band: "High",
    category: "NEEDS_PAYMENT",
    icon: DollarSign,
    ustn: "SGTX-EG-26-NH3T-0038-4",
  },
  {
    id: "INB-2026-0928",
    what: "Lab results received: Pesticide residue panel (USTN ...0037-2)",
    why: "ISO 17025 lab (Nile Labs) submitted results. 2 of 14 mandatory tests returned non-compliant. Conditional QC hold flagged (G5U8).",
    deadline: "2026-09-24 10:00 EET",
    action: "Review Lab Results",
    priority: 70,
    band: "Medium",
    category: "COMPLIANCE",
    icon: FlaskConical,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0925",
    what: "Negotiation: counter-offer received on Incoterm for Frozen Strawberries",
    why: "Seller proposes CFR (instead of your requested CIF). Clause Forge drafted a side-by-side comparison. Review and accept/counter.",
    deadline: "2026-09-20 16:00 EET",
    action: "Open Clause Forge",
    priority: 68,
    band: "Medium",
    category: "NEGOTIATION",
    icon: FileText,
    ustn: "pre-USTN (SGTX-EG-26-NH3T-0042-RQ)",
  },
  {
    id: "INB-2026-0922",
    what: "Document upload: Commercial Invoice requested by broker",
    why: "CBR (Cairo Customs Brokers) requested the signed Commercial Invoice to begin customs declaration. Upload to avoid SLA credit.",
    deadline: "2026-09-21 09:00 EET",
    action: "Upload Document",
    priority: 58,
    band: "Medium",
    category: "NEEDS_DOCUMENT",
    icon: FileCheck,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0919",
    what: "Draft trade request recovered",
    why: "Your draft trade request (Frozen Mangoes, 15,000 kg) was auto-saved 3 days ago. Recover or discard.",
    deadline: "2026-09-30 23:59 EET",
    action: "Recover Draft",
    priority: 30,
    band: "Low",
    category: "GENERAL",
    icon: FileText,
  },
  {
    id: "INB-2026-0915",
    what: "SLA incident credit applied",
    why: "LSP (Delta Logistics) missed pickup window on USTN ...0034-1. $120 credit applied to your account automatically (SLA engine).",
    deadline: "—",
    action: "View Credit",
    priority: 18,
    band: "Low",
    category: "GENERAL",
    icon: CheckCircle2,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (key metrics with trend indicators) ───────
export interface SummaryCard {
  label: string;
  value: string;
  trend: "up" | "down" | "flat";
  delta: string;
  icon: LucideIcon;
  color: string;
}

export const BUYER_SUMMARY_CARDS: SummaryCard[] = [
  { label: "Active Trades", value: "7", trend: "up", delta: "+2 this week", icon: ArrowRight, color: "text-blue-300" },
  { label: "Pending Approvals", value: "5", trend: "up", delta: "+1 today", icon: Clock, color: "text-amber-300" },
  { label: "Documents to Sign", value: "3", trend: "down", delta: "-2 this week", icon: FileSignature, color: "text-purple-300" },
  { label: "Open Exposure", value: "$487K", trend: "flat", delta: "no change", icon: Wallet, color: "text-emerald-300" },
  { label: "On-Time Rate (30d)", value: "94.2%", trend: "up", delta: "+1.8%", icon: TrendingUp, color: "text-green-300" },
  { label: "Dispute Count", value: "1", trend: "down", delta: "-1 resolved", icon: Gavel, color: "text-rose-300" },
];

// ── §16.8.6.1 QUICK ACTIONS (max 8, role/mode-aware) ─────────────────────────
export interface QuickAction {
  key: string;
  label: string;
  icon: LucideIcon;
  specRef: string;
  oneClick: boolean;
}

export const BUYER_QUICK_ACTIONS: QuickAction[] = [
  { key: "new-trade", label: "New Trade Request", icon: ArrowRight, specRef: "§6 (13 sections)", oneClick: false },
  { key: "review-quote", label: "Review Quotes", icon: Inbox, specRef: "§8 quote", oneClick: false },
  { key: "sign-contract", label: "Sign Contract", icon: FileSignature, specRef: "§9 QES", oneClick: true },
  { key: "pay-fee", label: "Pay Fee (FeeLock)", icon: DollarSign, specRef: "§9.27", oneClick: true },
  { key: "financing", label: "Financing (CFR)", icon: Wallet, specRef: "§7", oneClick: false },
  { key: "saved-contacts", label: "Saved Contacts", icon: Users, specRef: "§4.1 trust", oneClick: false },
  { key: "customs-readiness", label: "Customs Readiness", icon: ClipboardCheck, specRef: "§6.8", oneClick: false },
  { key: "distressed-cargo", label: "Distressed Cargo", icon: AlertTriangle, specRef: "§14", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (0–100 composite, weighted) ────────────────────
export const TRADE_HEALTH_SCORE = {
  total: 82,
  components: [
    { name: "Compliance", weight: 20, score: 95, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 78, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 72, icon: Truck },
    { name: "Payment", weight: 15, score: 88, icon: DollarSign },
    { name: "Risk", weight: 20, score: 76, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 84, icon: Clock },
  ],
};

// ── ACTIVE TRADES (Shared Shipments Vault, buyer-filtered columns) ───────────
export interface ActiveTrade {
  ustn: string;
  counterparty: string;
  commodity: string;
  phase: string;
  milestone: string;
  nextAction: string;
  feeStatus: string;
  health: number;
}

export const BUYER_ACTIVE_TRADES: ActiveTrade[] = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    counterparty: "Sahara Exports (EG)",
    commodity: "Frozen Strawberries — 20,000 kg",
    phase: "Phase 3 · Negotiation",
    milestone: "Contract pending signature",
    nextAction: "Sign QES contract",
    feeStatus: "Quote received",
    health: 88,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0038",
    counterparty: "Sahara Exports (EG)",
    commodity: "Frozen Strawberries — Multi-shipment (6)",
    phase: "Phase 5 · Execution",
    milestone: "Shipment 4/6 — fee due",
    nextAction: "Pay per-shipment fee",
    feeStatus: "FeeLock ACTIVE (4/6)",
    health: 79,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0037",
    counterparty: "Delta Agro (EG)",
    commodity: "Frozen Mangoes — 12,000 kg",
    phase: "Phase 5 · Execution",
    milestone: "Lab results received (conditional)",
    nextAction: "Review 2 non-compliant tests",
    feeStatus: "Paid",
    health: 65,
  },
  {
    ustn: "SGXX-IT-26-NH3T-0036",
    counterparty: "Mediterra Foods (IT)",
    commodity: "Sun-Dried Tomatoes — 8,500 kg",
    phase: "Phase 5 · Execution",
    milestone: "Customs declaration in progress",
    nextAction: "Upload Commercial Invoice",
    feeStatus: "Paid",
    health: 91,
  },
  {
    ustn: "SGTX-SA-26-NH3T-0034",
    counterparty: "Najd Trading (SA)",
    commodity: "Dates — 25,000 kg",
    phase: "Phase 6 · Settlement",
    milestone: "Bank settlement in flight (ISO 20022)",
    nextAction: "Confirm receipt",
    feeStatus: "Paid",
    health: 84,
  },
];

// ── §2.5.2 EXTERNAL INTEGRATIONS HEALTH WIDGET ────────────────────────────────
export const EXTERNAL_INTEGRATIONS = [
  { name: "Nafeza (Customs)", status: "operational", latency: "180ms", icon: Landmark },
  { name: "CargoX (eBL)", status: "operational", latency: "240ms", icon: Ship },
  { name: "ETA (Single Window)", status: "degraded", latency: "1.2s", icon: FileCheck },
  { name: "CBE Reporting", status: "operational", latency: "320ms", icon: Banknote },
  { name: "Bank Settlement (ISO 20022)", status: "operational", latency: "410ms", icon: DollarSign },
];

// ── §2.5.2 RECENT ACTIVITY FEED (last 20 actions, real-time) ──────────────────
export interface ActivityEvent {
  time: string;
  actor: string;
  action: string;
  target: string;
  type: "info" | "success" | "warning" | "error";
}

export const RECENT_ACTIVITY: ActivityEvent[] = [
  { time: "2 min ago", actor: "Governor (G4)", action: "USTN minted", target: "SGTX-EG-26-NH3T-0038-4", type: "success" },
  { time: "18 min ago", actor: "Sahara Exports", action: "Counter-signed contract", target: "Request SGTX-EG-26-NH3T-0042-RQ", type: "success" },
  { time: "1 h ago", actor: "Nile Labs (LAB)", action: "Submitted lab results — 2 non-compliant", target: "USTN ...0037-2", type: "warning" },
  { time: "2 h ago", actor: "Cairo Customs Brokers", action: "Requested Commercial Invoice", target: "USTN ...0036-1", type: "info" },
  { time: "3 h ago", actor: "Governor (G6)", action: "Bank settlement confirmed (ISO 20022)", target: "USTN ...0034-1", type: "success" },
  { time: "5 h ago", actor: "Delta Logistics (LSP)", action: "SLA breach — pickup window missed", target: "USTN ...0034-1", type: "error" },
  { time: "6 h ago", actor: "You", action: "Paid per-shipment fee", target: "USTN ...0038-3", type: "info" },
  { time: "1 d ago", actor: "Sahara Exports", action: "Locked EXW price ($4.20/kg)", target: "Request ...0042-RQ", type: "info" },
];

// ── §16.8.6.1 PORTAL FEATURE LIST (Trader Portal — Buyer) ─────────────────────
export const BUYER_PORTAL_FEATURES = [
  { name: "Smart Inbox", desc: "Buyer-specific items (NEEDS_SIGNATURE, NEEDS_PAYMENT, etc.)", section: "§16.8.6.1" },
  { name: "New Trade Request", desc: "Structured container form, multi-shipment request", section: "§6" },
  { name: "Quote Review & Negotiation", desc: "Comparison table, partial acceptance, counter-offers, deadline extensions", section: "§9.1" },
  { name: "Contract Signing", desc: "Clause Forge integration, SGTX Witness Clause, own-contract upload", section: "§9.2" },
  { name: "Customs Readiness", desc: "Dynamic document checklist per jurisdiction", section: "§6.8" },
  { name: "Distressed Cargo", desc: "Buyer view of listings from saved contacts", section: "§14.1" },
  { name: "Disputes", desc: "Evidence autocompiler, mediation, arbitration preparation", section: "§14.2" },
  { name: "Saved Contacts", desc: "Trust passports of known counterparties", section: "§4.1" },
  { name: "Financing (Borrower view)", desc: "CFR declarations, financier matching, drawdown tracking", section: "§7, §10" },
  { name: "Company Admin", desc: "Role templates, employees, approval policies", section: "§4.9" },
];

// ── SAVED CONTACTS (Trust Passports) ─────────────────────────────────────────
export interface SavedContact {
  gtid: string;
  name: string;
  role: string;
  trustScore: number;
  trades: number;
  lastTrade: string;
}

export const BUYER_SAVED_CONTACTS: SavedContact[] = [
  { gtid: "SGTX-EG-26-SX7K-0008", name: "Sahara Exports", role: "Seller (TRD/SELL)", trustScore: 91, trades: 28, lastTrade: "2026-09-18" },
  { gtid: "SGTX-EG-26-DA2F-0014", name: "Delta Agro", role: "Seller (TRD/SELL)", trustScore: 84, trades: 12, lastTrade: "2026-09-16" },
  { gtid: "SGTX-IT-26-MF19-0021", name: "Mediterra Foods", role: "Seller (TRD/SELL)", trustScore: 88, trades: 9, lastTrade: "2026-09-14" },
  { gtid: "SGTX-EG-26-DL4C-0031", name: "Delta Logistics", role: "LSP", trustScore: 76, trades: 31, lastTrade: "2026-09-12" },
  { gtid: "SGTX-EG-26-NL8B-0044", name: "Nile Labs", role: "Laboratory (LAB)", trustScore: 93, trades: 47, lastTrade: "2026-09-15" },
  { gtid: "SGTX-EG-26-CC3A-0052", name: "Cairo Customs Brokers", role: "Customs Broker (CBR)", trustScore: 82, trades: 18, lastTrade: "2026-09-13" },
];

// ── RECENT GOVERNOR DECISIONS (plain-language panel) ─────────────────────────
export interface GovernorDecision {
  gate: string;
  type: string;
  ustn: string;
  verdict: "ALLOW" | "CONDITIONAL" | "DENY";
  reason: string;
  timestamp: string;
}

export const BUYER_RECENT_DECISIONS: GovernorDecision[] = [
  {
    gate: "G4",
    type: "USTN Mint (FeeLock → lock)",
    ustn: "SGTX-EG-26-NH3T-0038-4",
    verdict: "ALLOW",
    reason: "Fee within constitutional bounds (0.42% of Canonical Fee Basis). All G1–G3 gates passed. USTN minted; Loom hash appended.",
    timestamp: "2 min ago",
  },
  {
    gate: "G5",
    type: "Lab Results (conditional QC hold)",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "CONDITIONAL",
    reason: "2 of 14 mandatory pesticide tests returned non-compliant (EU MRL exceeded for Chlorpyrifos and Malathion). QC hold flag raised; action plan required before shipment can proceed.",
    timestamp: "1 h ago",
  },
  {
    gate: "G6",
    type: "Bank Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW",
    reason: "Bank settlement instruction (pain.001) accepted by CBE clearing. Reconciliation confidence 98.2% (≥95% threshold). Loom closure hash published.",
    timestamp: "3 h ago",
  },
];

// ── §16.1.6.1 GLOBAL HEADER + §16.1.6.2 SIDEBAR ───────────────────────────────
export const HEADER_ITEMS = [
  { label: "SGTX Logo", icon: ArrowRight, desc: "Returns to Smart Inbox" },
  { label: "Universal Search", icon: Search, desc: "GTID, USTN, Request Ref, Contract ID, Loom hash" },
  { label: "Notifications", icon: Bell, desc: "Bell with unread badge (5 unread)" },
  { label: "Dual-Mode Toggle", icon: ArrowRight, desc: "Trader portals only — BUY active" },
  { label: "Avatar", icon: Users, desc: "Profile menu, logout, mode preferences" },
];

export const SIDEBAR_ITEMS = [
  { label: "Smart Inbox", icon: Inbox, desc: "Default landing tab — 5 high-priority", active: true, badge: 5 },
  { label: "Shipments", icon: Package, desc: "Shared Shipments Vault (buyer-filtered)", active: false, badge: 7 },
  { label: "Disputes", icon: Gavel, desc: "Role-filtered — 1 open", active: false, badge: 1 },
  { label: "Notifications", icon: BellRing, desc: "System + broadcast", active: false, badge: 12 },
  { label: "Task Center", icon: CheckCircle2, desc: "Per-role task queue", active: false, badge: 0 },
  { label: "Help Center", icon: MessageSquare, desc: "Self-serve + customer care chatbot", active: false, badge: 0 },
  { label: "Company Admin", icon: Users, desc: "Tenant settings, employees, billing", active: false, badge: 0 },
];

// Role-specific sidebar tabs (buyer)
export const BUYER_SIDEBAR_ROLE = [
  { label: "New Trade", icon: ArrowRight, desc: "13-section trade request wizard" },
  { label: "Saved Contacts", icon: Users, desc: "Trust passports of known counterparties" },
  { label: "Financing", icon: Wallet, desc: "CFR declarations, drawdown tracking" },
];

// ── FINANCING PRE-CLEARANCE STATUS (CFR — §7) ────────────────────────────────
export const CFR_STATUS = {
  phase: "Pre-contract",
  status: "Pre-cleared",
  financier: "Cairo Amman Bank (FIN/BANK)",
  facility: "Trade Finance Line — $2M",
  declaredNeed: "$420K (buyer-side)",
  sellerDeclared: "Data-sovereign (not visible to buyer)",
  bindingPost: "Binding formal execution after FeeLock (G4)",
};

export { ChevronRight, Palette, Languages, Container, Ship, ClipboardCheck, Scale };
