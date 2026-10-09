// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #10: GOV (Government)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.10 GOV features.
// Creative: Live trade flow map + risk heatmap matrix + clearance funnel + multi-agency stepper
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Globe2, ShieldAlert, Clock, AlertTriangle,
  CheckCircle2, TrendingUp, FileText, Landmark,
  Zap, Search, Bell, ChevronRight,
  FileCheck, Gavel, Scale, Eye, Building2,
  Stamp, Award, Users, BarChart3, MapPin,
  DollarSign, Percent, Crosshair, Activity,
} from "lucide-react";

// ── Active tenant (the "logged-in" government node for the demo) ────────────
export const GOV_TENANT = {
  name: "Egyptian Customs Authority (Nafeza Node)",
  gtid: "SGTX-EG-26-GOV-0001",
  kybTier: 4,
  role: "GOV" as const,
  avatarInitials: "EG",
  trustScore: 99,
  jurisdiction: "Egypt (Sovereign Node EG-01)",
  activeTrades: 142,
  pendingClearance: 8,
  autoClearanceRate: 87.3,
  flaggedTrades: 3,
  complianceScore: 99.2,
};

// ── §2.5.1 SMART INBOX — GOV-specific items ────────────────────────────────
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

export const GOV_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0952",
    what: "Auto-clearance recommendation — USTN ...0042 (Frozen Strawberries, risk 72, low)",
    why: "AI (A2) recommends auto-clearance. Risk score 72 (low), sanctions clear, HS code verified, duty calculated ($5,255). All documents verified. Approve or manual review.",
    deadline: "2026-09-19 06:00 EET",
    action: "Approve Auto-Clearance",
    priority: 75,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: CheckCircle2,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0950",
    what: "Trade flagged for manual review — USTN ...0037-2 (risk 55, lab non-compliant)",
    why: "2/14 lab tests non-compliant (Chlorpyrifos 8× EU MRL, Malathion 2.5× MRL). QC hold active. Risk score dropped to 55. Auto-clearance blocked. Manual review required.",
    deadline: "2026-09-19 12:00 EET",
    action: "Manual Review",
    priority: 90,
    band: "High",
    category: "COMPLIANCE",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0948",
    what: "Multi-agency approval needed — USTN ...0036-1 (Customs + Port Authority + Trade Ministry)",
    why: "Large trade ($52K CIF) requires multi-agency sign-off. Customs: approved. Port Authority: pending. Trade Ministry: pending. Visual stepper shows progress. Auto-clearance blocked until all 3 approve.",
    deadline: "2026-09-19 18:00 EET",
    action: "Track Multi-Agency",
    priority: 70,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: Users,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0945",
    what: "Document discrepancy flagged — USTN ...0034-1 (HS code mismatch: declared 0804.10 vs detected 0804.30)",
    why: "AI (A2 HF ViT) detected HS code discrepancy. Seller declared 0804.10 (Dates, 0% duty) but product appears to be 0804.30 (Processed Dates, 5% duty). Potential revenue loss: $4.4K. Manual verification required.",
    deadline: "2026-09-20 09:00 EET",
    action: "Verify HS Code",
    priority: 85,
    band: "High",
    category: "COMPLIANCE",
    icon: Eye,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0942",
    what: "Anonymous trade declassification request — intelligence sharing with EU partner",
    why: "EU customs authority requests declassification of 3 anonymous trades for investigation. Declassification audit log required. Sovereign approval needed. Data residency check: PDPL compliant.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Declassification",
    priority: 65,
    band: "Medium",
    category: "COMPLIANCE",
    icon: ShieldAlert,
  },
  {
    id: "INB-2026-0939",
    what: "Permit issuance ready — Phytosanitary + EUR.1 for USTN ...0042 (digital seal)",
    why: "All clearance conditions met. Permit ready for issuance. Apply government digital seal (Ed25519, registered with Nafeza). Auto-propagate to destination country (Italy).",
    deadline: "2026-09-19 14:00 EET",
    action: "Issue Permit + Seal",
    priority: 72,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: Stamp,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0936",
    what: "Loom chain verification — weekly audit (142 trades, 0 tampering)",
    why: "Weekly Loom hash chain verification. 142 trades verified, 0 tampering detected, 0 gaps in chain. Chain integrity: 100%. Audit report auto-generated for sovereign records.",
    deadline: "—",
    action: "View Audit Report",
    priority: 30,
    band: "Low",
    category: "GENERAL",
    icon: FileCheck,
  },
  {
    id: "INB-2026-0933",
    what: "Integration health — Nafeza connector degraded (latency 1.2s, usually 180ms)",
    why: "Nafeza single-window connector degraded. Latency increased from 180ms to 1.2s. Cause: server maintenance at Nafeza datacenter. Auto-failover to backup connector. Expected resolution: 2h.",
    deadline: "—",
    action: "View Integration Status",
    priority: 55,
    band: "Medium",
    category: "SHIPMENT_ALERT",
    icon: Activity,
  },
  {
    id: "INB-2026-0930",
    what: "Compliance monitor alert — sanctions screening failure rate up 0.3% (98.7% → 98.4%)",
    why: "Sanctions screening pass rate dropped from 98.7% to 98.4%. 3 additional trades flagged for sanctions review in last 24h. GNN risk engine updated with new sanctions list (OFAC SDN update). Monitoring active.",
    deadline: "—",
    action: "View Compliance Metrics",
    priority: 50,
    band: "Medium",
    category: "COMPLIANCE",
    icon: BarChart3,
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (GOV-specific) ──────────────────────────
export const GOV_SUMMARY_CARDS = [
  { label: "Active Trades", value: "142", trend: "up" as const, delta: "+12 today", icon: Activity, color: "text-indigo-300" },
  { label: "Pending Clearance", value: "8", trend: "down" as const, delta: "-3 cleared", icon: Clock, color: "text-amber-300" },
  { label: "Auto-Clearance", value: "87.3%", trend: "up" as const, delta: "+1.2%", icon: CheckCircle2, color: "text-emerald-300" },
  { label: "Flagged Trades", value: "3", trend: "up" as const, delta: "+1 (HS mismatch)", icon: AlertTriangle, color: "text-rose-300" },
  { label: "Compliance", value: "99.2%", trend: "up" as const, delta: "+0.1%", icon: ShieldAlert, color: "text-indigo-300" },
  { label: "Loom Integrity", value: "100%", trend: "flat" as const, delta: "0 tampering", icon: FileCheck, color: "text-gold-300" },
];

// ── §16.8.6.10 QUICK ACTIONS (GOV-specific, max 8) ─────────────────────────
export const GOV_QUICK_ACTIONS = [
  { key: "trade-monitor", label: "Live Trade Monitor", icon: Globe2, specRef: "§16.8.6.10", oneClick: false },
  { key: "clearance", label: "Clearance Workflow", icon: CheckCircle2, specRef: "§16.8.6.10", oneClick: true },
  { key: "doc-verify", label: "Document Verification", icon: Eye, specRef: "§16.8.6.10", oneClick: false },
  { key: "multi-agency", label: "Multi-Agency Workflow", icon: Users, specRef: "§16.8.6.10", oneClick: false },
  { key: "anonymous", label: "Anonymous Trade Mgmt", icon: ShieldAlert, specRef: "§16.8.6.10", oneClick: false },
  { key: "permit", label: "Permit Issuance (Seal)", icon: Stamp, specRef: "§16.8.6.10", oneClick: true },
  { key: "audit", label: "Audits & Reports", icon: FileCheck, specRef: "§16.8.6.10", oneClick: false },
  { key: "compliance", label: "Compliance Monitor", icon: BarChart3, specRef: "§16.8.6.10", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (GOV perspective) ───────────────────────────
export const GOV_HEALTH_SCORE = {
  total: 96,
  components: [
    { name: "Compliance", weight: 20, score: 99, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 98, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 92, icon: Globe2 },
    { name: "Payment", weight: 15, score: 97, icon: DollarSign },
    { name: "Risk", weight: 20, score: 94, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 95, icon: Clock },
  ],
};

// ── LIVE TRADE FLOWS (for SVG map) ──────────────────────────────────────────
export const TRADE_FLOWS = [
  { from: "Egypt", to: "Italy", ustn: "SGTX-EG-26-NH3T-0042", commodity: "Frozen Strawberries", risk: 72, status: "clearing", count: 28 },
  { from: "Egypt", to: "Saudi Arabia", ustn: "SGTX-EG-26-NH3T-0034", commodity: "Dates", risk: 78, status: "cleared", count: 42 },
  { from: "Egypt", to: "Italy", ustn: "SGTX-EG-26-NH3T-0037", commodity: "Frozen Mangoes", risk: 55, status: "flagged", count: 12 },
  { from: "Egypt", to: "UAE", ustn: "SGTX-EG-26-NH3T-0036", commodity: "Sun-Dried Tomatoes", risk: 80, status: "multi-agency", count: 9 },
  { from: "Egypt", to: "Turkey", ustn: "SGTX-EG-26-NH3T-0030", commodity: "Frozen Vegetables", risk: 76, status: "cleared", count: 18 },
  { from: "Egypt", to: "China", ustn: "SGTX-EG-26-NH3T-0028", commodity: "Frozen Fruit", risk: 82, status: "clearing", count: 33 },
];

// ── RISK HEATMAP DATA (countries × commodities) ─────────────────────────────
export const RISK_HEATMAP = {
  countries: ["Italy", "Saudi Arabia", "UAE", "Turkey", "China", "Kenya"],
  commodities: ["Frozen Fruit", "Dates", "Vegetables", "Textiles", "Electronics"],
  cells: [
    [72, 78, 80, 65, 85],
    [78, 82, 75, 60, 88],
    [80, 85, 78, 70, 90],
    [76, 80, 72, 68, 82],
    [82, 88, 85, 72, 92],
    [70, 75, 68, 60, 80],
  ],
};

// ── CLEARANCE PIPELINE FUNNEL DATA ──────────────────────────────────────────
export const CLEARANCE_FUNNEL = [
  { stage: "Submitted", count: 142, color: "#6366f1" },
  { stage: "Under Review", count: 28, color: "#8b5cf6" },
  { stage: "AI Auto-Clear", count: 124, color: "#10b981" },
  { stage: "Manual Review", count: 14, color: "#f59e0b" },
  { stage: "Flagged", count: 3, color: "#ef4444" },
  { stage: "Cleared", count: 131, color: "#06b6d4" },
];

// ── MULTI-AGENCY APPROVAL DATA ──────────────────────────────────────────────
export const MULTI_AGENCY_STEPS = [
  { agency: "Customs (Nafeza)", status: "approved", ustn: "...0036-1" },
  { agency: "Port Authority", status: "pending", ustn: "...0036-1" },
  { agency: "Trade Ministry", status: "pending", ustn: "...0036-1" },
  { agency: "Central Bank (CBE)", status: "not_required", ustn: "...0036-1" },
];

// ── §16.8.6.10 PORTAL FEATURE LIST (GOV) ────────────────────────────────────
export const GOV_PORTAL_FEATURES = [
  { name: "Live Trade Monitor", desc: "Real-time trade flows with risk scores and clearance status across all corridors", section: "§16.8.6.10" },
  { name: "Clearance Workflow", desc: "AI auto-clearance recommendation (A2) + manual review for flagged trades", section: "§16.8.6.10" },
  { name: "Document Verification", desc: "AI-flagged discrepancies (HS code, value, origin, sanctions) with confidence scores", section: "§16.8.6.10" },
  { name: "Multi-Agency Workflow", desc: "Visual stepper for multi-agency sign-off (Customs + Port + Ministry + CBE)", section: "§16.8.6.10" },
  { name: "Anonymous Trade Mgmt", desc: "Declassification audit log, intelligence sharing with partner jurisdictions", section: "§16.8.6.10" },
  { name: "Permit Issuance", desc: "Government digital seal (Ed25519) on permits, auto-propagated to destination", section: "§16.8.6.10" },
  { name: "Audits & Reports", desc: "Loom hash chain verification (weekly), sovereignty audit reports", section: "§16.8.6.10" },
  { name: "Compliance Monitor", desc: "Real-time sanctions screening, PEP, regulatory compliance metrics", section: "§16.8.6.10" },
  { name: "Connector Management", desc: "Nafeza, CargoX, ETA, CBE — health monitoring and failover", section: "§16.8.6.10" },
];

// ── RECENT ACTIVITY FEED (GOV perspective) ────────────────────────────────
export const GOV_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "AI Auto-Clearance (A2)", action: "Recommended clearance — USTN ...0042 (risk 72, 92% confidence)", target: "USTN ...0042", type: "success" as const },
  { time: "15 min ago", actor: "AI Document Check (A2)", action: "HS code discrepancy flagged — declared 0804.10 vs detected 0804.30", target: "USTN ...0034-1", type: "warning" as const },
  { time: "1 h ago", actor: "Loom Chain Verifier", action: "Weekly audit complete — 142 trades, 0 tampering, 100% integrity", target: "Loom-2026-W38", type: "success" as const },
  { time: "2 h ago", actor: "Customs (Nafeza)", action: "Multi-agency: Customs approved USTN ...0036-1", target: "USTN ...0036-1", type: "info" as const },
  { time: "3 h ago", actor: "GNN Risk Engine (A2)", action: "Sanctions screening — 3 trades flagged (OFAC SDN update)", target: "Batch-2026-0942", type: "warning" as const },
  { time: "5 h ago", actor: "Government Digital Seal", action: "Permit issued + sealed — Phytosanitary + EUR.1", target: "USTN ...0034-1", type: "success" as const },
  { time: "8 h ago", actor: "Nafeza Connector", action: "Degraded — latency 1.2s (maintenance), failover to backup", target: "Nafeza-API", type: "error" as const },
];

// ── EXTERNAL INTEGRATIONS (GOV-specific) ────────────────────────────────────
export const GOV_INTEGRATIONS = [
  { name: "Nafeza (Customs Single Window)", status: "degraded", latency: "1.2s (maintenance)", icon: Landmark },
  { name: "CargoX (eBL Platform)", status: "operational", latency: "240ms", icon: FileText },
  { name: "ETA (Single Window)", status: "operational", latency: "320ms", icon: Globe2 },
  { name: "CBE (Central Bank Reporting)", status: "operational", latency: "410ms", icon: DollarSign },
  { name: "Loom Verifier (Sovereign)", status: "operational", latency: "—", icon: FileCheck },
  { name: "GNN Sanctions Feed (OFAC/EU/UN)", status: "operational", latency: "180ms", icon: ShieldAlert },
];

// ── RECENT GOVERNOR DECISIONS (GOV perspective) ──────────────────────────────
export const GOV_RECENT_DECISIONS = [
  {
    gate: "G5U6",
    type: "Customs Clearance (Auto-Clearance Recommended)",
    ustn: "SGTX-EG-26-NH3T-0042",
    verdict: "CONDITIONAL" as const,
    reason: "AI (A2) recommends auto-clearance (92% confidence). Risk 72 (low). All documents verified. HS code correct. Duty $5,255 calculated. CONDITIONAL: awaiting government approval (sovereign node). If approved: auto-clear, issue permit + digital seal.",
    timestamp: "2 min ago",
  },
  {
    gate: "G5U6",
    type: "Customs Clearance (FLAGGED — Manual Review Required)",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "DENY" as const,
    reason: "2/14 lab tests non-compliant (Chlorpyrifos 8× EU MRL, Malathion 2.5× MRL). QC hold active. Auto-clearance BLOCKED. Risk 55 (medium-high). Manual review required. Potential rejection: cargo not compliant with EU Regulation 396/2005.",
    timestamp: "1 h ago",
  },
  {
    gate: "G5U2",
    type: "Permit Issued + Digital Seal Applied",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "All clearance conditions met. Government digital seal (Ed25519) applied to Phytosanitary + EUR.1 permits. Auto-propagated to destination (Saudi Arabia). Loom hash appended. Sovereign record updated.",
    timestamp: "5 h ago",
  },
];

// ── §16.1.6 SIDEBAR (GOV-specific role tabs) ────────────────────────────────
export const GOV_SIDEBAR_ROLE = [
  { label: "Trade Monitor", icon: Globe2, desc: "Live trade flows + risk" },
  { label: "Clearance", icon: CheckCircle2, desc: "Auto-clear + manual review" },
  { label: "Multi-Agency", icon: Users, desc: "Visual stepper" },
  { label: "Permits", icon: Stamp, desc: "Digital seal issuance" },
  { label: "Audit Reports", icon: FileCheck, desc: "Loom verification" },
];

// ── PERFORMANCE DASHBOARD ───────────────────────────────────────────────────
export const GOV_PERFORMANCE = {
  metrics: [
    { name: "Auto-Clearance Rate", value: "87.3%", benchmark: "82.1%", status: "above", icon: CheckCircle2 },
    { name: "Avg Clearance Time", value: "4.2h", benchmark: "6.8h", status: "above", icon: Clock },
    { name: "Document Accuracy", value: "98.5%", benchmark: "96.2%", status: "above", icon: Eye },
    { name: "Sanctions Pass Rate", value: "98.4%", benchmark: "97.8%", status: "above", icon: ShieldAlert },
    { name: "Loom Integrity", value: "100%", benchmark: "100%", status: "above", icon: FileCheck },
    { name: "Revenue Recovery (HS)", value: "$12.4K", benchmark: "$8.2K", status: "above", icon: DollarSign },
  ],
  trend: "+1.2% (auto-clearance rate improved)",
  percentile: "Sovereign Node EG-01 — 99.2% compliance score (top-tier)",
};
