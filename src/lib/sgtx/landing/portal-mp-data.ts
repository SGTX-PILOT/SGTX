// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #12: Marketplace Partner
// Dashboard data per §2.5.1, §2.5.2, §16.8.6.12 MP features.
// Creative: Leads funnel + revenue share donut + API usage sparkline + webhook health
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  Zap, Search, Bell, ChevronRight, DollarSign,
  FileCheck, Eye, Users, BarChart3, KeyRound,
  Webhook, Globe2, Settings, Activity, Percent,
  FileText, ShieldAlert, Building2, Award,
} from "lucide-react";

// ── Active tenant (the "logged-in" marketplace partner for the demo) ─────────
export const MP_TENANT = {
  name: "TradeBridge Marketplace",
  gtid: "SGTX-EG-26-MP01-0003",
  kybTier: 3,
  role: "MP" as const,
  avatarInitials: "TB",
  trustScore: 84,
  agreementStatus: "Active (Revenue Share: 15%)",
  leadsSubmitted: 287,
  leadsConverted: 42,
  conversionRate: 14.6,
  revenueEarned: "$12.6K",
  apiCallsToday: 1240,
  apiRateLimit: "5000/day",
  webhookEndpoint: "https://tradebridge.example/webhooks/sgtx",
};

// ── §2.5.1 SMART INBOX — MP-specific items ────────────────────────────────
export interface InboxItem {
  id: string; what: string; why: string; deadline: string; action: string;
  priority: number; band: "High" | "Medium" | "Low"; category: string; icon: LucideIcon; ustn?: string;
}

export const MP_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0954", what: "New lead converted — Sahara Exports trade intent ($380K Frozen Strawberries → Italy)",
    why: "Lead from TradeBridge marketplace converted to SGTX trade request. Buyer (Nile Harvest) submitted 13-section form. Revenue share: 15% of SGTX fee ($22.75). USTN minted. Payment pending.",
    deadline: "—", action: "View Revenue", priority: 75, band: "High", category: "GENERAL", icon: DollarSign, ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0952", what: "Revenue attribution dispute — SGTX claims lead originated from organic search, not marketplace",
    why: "SGTX platform disputes attribution for lead #L-2026-0042. Claims buyer found SGTX directly (organic). TradeBridge claims referral cookie present. Evidence required: referral URL, cookie timestamp, IP match.",
    deadline: "2026-09-22 12:00 EET", action: "Submit Evidence", priority: 70, band: "High", category: "COMPLIANCE", icon: ShieldAlert,
  },
  {
    id: "INB-2026-0950", what: "Webhook delivery failed — 3 deliveries to your endpoint failed (timeout after 5s)",
    why: "SGTX sent 3 webhook events (trade.created, trade.locked, trade.settled). All timed out after 5s. Your endpoint may be down or slow. Auto-retry: 3 attempts (1s, 2s, 4s). Check endpoint health.",
    deadline: "—", action: "Check Webhook", priority: 65, band: "Medium", category: "SHIPMENT_ALERT", icon: Webhook,
  },
  {
    id: "INB-2026-0948", what: "API rate limit warning — 1240/5000 calls today (24.8% used, on track)",
    why: "API usage today: 1240 calls (24.8% of 5000 daily limit). On track for ~1800 by end of day (36%). No risk of rate limit breach. Peak usage: 9:00-11:00 EET (trade submission rush).",
    deadline: "—", action: "View API Analytics", priority: 40, band: "Low", category: "GENERAL", icon: BarChart3,
  },
  {
    id: "INB-2026-0945", what: "Agreement renewal due — revenue share agreement expires in 30 days",
    why: "Current agreement: 15% revenue share, expires 2026-10-19. Renewal proposal: maintain 15% (market standard). New terms: API v2 access, expanded webhook events, sandbox with synthetic data. Review and sign.",
    deadline: "2026-10-19 23:59 EET", action: "Review Agreement", priority: 55, band: "Medium", category: "NEGOTIATION", icon: FileText,
  },
  {
    id: "INB-2026-0942", what: "New API key generated — sandbox key (synthetic data only, no real trades)",
    why: "New API key created for sandbox testing. Key: MP-SANDBOX-2026-0042. Rate: 1000/day (sandbox). Scope: synthetic data only. Cannot create real trades. For integration testing.",
    deadline: "—", action: "View API Keys", priority: 30, band: "Low", category: "GENERAL", icon: KeyRound,
  },
  {
    id: "INB-2026-0939", what: "Lead quality alert — 3 leads rejected (incomplete buyer data, missing GTID)",
    why: "3 leads submitted with incomplete buyer data (missing GTID, no KYB tier). SGTX requires GTID for all leads (non-marketplace §2.6). Update lead form to require GTID field. Resubmit after correction.",
    deadline: "—", action: "Fix Lead Form", priority: 50, band: "Medium", category: "COMPLIANCE", icon: AlertTriangle,
  },
  {
    id: "INB-2026-0935", what: "Revenue received — $22.75 (15% of $151.34 SGTX fee, USTN ...0042)",
    why: "Revenue share payment received via ISO 20022. $22.75 = 15% of $151.34 SGTX trade fee. Settlement confirmed. Reconciliation 100%. Total revenue YTD: $12.6K (42 converted leads).",
    deadline: "—", action: "View Payment", priority: 25, band: "Low", category: "GENERAL", icon: DollarSign, ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0930", what: "IP whitelist update — add new IP range (203.0.113.0/24) for API access",
    why: "Your API requests from new IP range (203.0.113.0/24) were blocked (IP not whitelisted). Add to whitelist in Company Admin. Current whitelist: 198.51.100.0/24. Max: 5 IP ranges.",
    deadline: "—", action: "Update IP Whitelist", priority: 45, band: "Medium", category: "GENERAL", icon: Settings,
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (MP-specific) ──────────────────────────
export const MP_SUMMARY_CARDS = [
  { label: "Leads Submitted", value: "287", trend: "up" as const, delta: "+18 today", icon: Inbox, color: "text-cyan-300" },
  { label: "Converted", value: "42", trend: "up" as const, delta: "+2 today", icon: CheckCircle2, color: "text-emerald-300" },
  { label: "Conversion Rate", value: "14.6%", trend: "up" as const, delta: "+1.2%", icon: Percent, color: "text-fuchsia-300" },
  { label: "Revenue (YTD)", value: "$12.6K", trend: "up" as const, delta: "+$22.75", icon: DollarSign, color: "text-emerald-300" },
  { label: "API Calls Today", value: "1,240", trend: "up" as const, delta: "24.8% of limit", icon: BarChart3, color: "text-cyan-300" },
  { label: "Webhook Health", value: "97.2%", trend: "down" as const, delta: "-2.1% (3 failed)", icon: Webhook, color: "text-amber-300" },
];

// ── §16.8.6.12 QUICK ACTIONS (MP-specific, max 8) ──────────────────────────
export const MP_QUICK_ACTIONS = [
  { key: "leads", label: "Leads Management", icon: Inbox, specRef: "§16.8.6.12", oneClick: false },
  { key: "webhook", label: "Webhook Management", icon: Webhook, specRef: "§16.8.6.12", oneClick: false },
  { key: "revenue", label: "Revenue Attribution", icon: DollarSign, specRef: "§16.8.6.12", oneClick: false },
  { key: "api-keys", label: "API Key Management", icon: KeyRound, specRef: "§16.8.6.12", oneClick: true },
  { key: "sandbox", label: "Sandbox (Synthetic)", icon: Eye, specRef: "§16.8.6.12", oneClick: false },
  { key: "agreement", label: "Agreement", icon: FileText, specRef: "§16.8.6.12", oneClick: false },
  { key: "analytics", label: "API Analytics", icon: BarChart3, specRef: "§16.8.6.12", oneClick: false },
  { key: "admin", label: "Company Admin (IP)", icon: Settings, specRef: "§4.9", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (MP perspective) ──────────────────────────
export const MP_HEALTH_SCORE = {
  total: 84,
  components: [
    { name: "Compliance", weight: 20, score: 88, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 82, icon: FileCheck },
    { name: "Integration", weight: 15, score: 90, icon: Webhook },
    { name: "Payment", weight: 15, score: 85, icon: DollarSign },
    { name: "Risk", weight: 20, score: 78, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 82, icon: Clock },
  ],
};

// ── LEADS FUNNEL DATA (for SVG funnel) ────────────────────────────────────
export const LEADS_FUNNEL = [
  { stage: "Leads Submitted", count: 287, color: "#06b6d4" },
  { stage: "Qualified (GTID verified)", count: 198, color: "#0891b2" },
  { stage: "Sent to SGTX", count: 124, color: "#0e7490" },
  { stage: "Trade Created", count: 62, color: "#a855f7" },
  { stage: "Converted (USTN minted)", count: 42, color: "#c026d3" },
  { stage: "Revenue Earned", count: 38, color: "#10b981" },
];

// ── REVENUE SHARE DATA (for SVG donut) ───────────────────────────────────
export const REVENUE_SHARE = {
  partnerShare: 15,
  sgtxShare: 85,
  partnerRevenue: "$12.6K",
  sgtxRevenue: "$71.4K",
  totalRevenue: "$84.0K",
  ytd: "42 converted leads × avg $300 SGTX fee × 15% share",
};

// ── API USAGE DATA (for SVG sparkline) ───────────────────────────────────
export const API_USAGE_SPARKLINE = [
  { hour: "00:00", calls: 45 },
  { hour: "03:00", calls: 32 },
  { hour: "06:00", calls: 78 },
  { hour: "09:00", calls: 285 },
  { hour: "12:00", calls: 195 },
  { hour: "15:00", calls: 220 },
  { hour: "18:00", calls: 165 },
  { hour: "21:00", calls: 120 },
  { hour: "now", calls: 1240 },
];

// ── WEBHOOK DELIVERY DATA (for SVG health tracker) ───────────────────────
export const WEBHOOK_DELIVERIES = [
  { event: "trade.created", delivered: true, latency: "180ms", retries: 0 },
  { event: "trade.locked", delivered: true, latency: "210ms", retries: 0 },
  { event: "trade.settled", delivered: false, latency: "timeout", retries: 3 },
  { event: "trade.milestone", delivered: true, latency: "195ms", retries: 0 },
  { event: "fee.calculated", delivered: true, latency: "165ms", retries: 0 },
  { event: "document.verified", delivered: true, latency: "220ms", retries: 0 },
  { event: "ustn.minted", delivered: true, latency: "175ms", retries: 0 },
  { event: "closure.published", delivered: false, latency: "timeout", retries: 2 },
];

// ── §16.8.6.12 PORTAL FEATURE LIST (MP) ────────────────────────────────────
export const MP_PORTAL_FEATURES = [
  { name: "Dashboard", desc: "Real-time metrics (leads, conversions, revenue, API, webhooks)", section: "§16.8.6.12" },
  { name: "Leads Management", desc: "Intent inbox — submit leads with buyer GTID, qualify, track conversion", section: "§16.8.6.12" },
  { name: "Webhook Management", desc: "Delivery logs (success/failure/timeout), auto-retry (3 attempts), endpoint health", section: "§16.8.6.12" },
  { name: "Revenue Attribution", desc: "Dispute resolution — evidence submission (referral cookie, IP match, URL)", section: "§16.8.6.12" },
  { name: "API Key Management", desc: "Production + sandbox keys, usage analytics, rate limit tracking (5000/day)", section: "§16.8.6.12" },
  { name: "Sandbox", desc: "Synthetic data for integration testing (no real trades, no revenue)", section: "§16.8.6.12" },
  { name: "Agreement", desc: "Revenue share proposals (15% partner / 85% SGTX), renewal, terms", section: "§16.8.6.12" },
  { name: "Company Admin", desc: "IP whitelisting (max 5 ranges), webhook URL config, API scopes", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (MP perspective) ────────────────────────────────
export const MP_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "SGTX Platform", action: "Lead converted — USTN minted, revenue $22.75", target: "USTN ...0042", type: "success" as const },
  { time: "1 h ago", actor: "Webhook Engine", action: "3 deliveries failed (timeout after 5s)", target: "webhook-endpoint", type: "error" as const },
  { time: "3 h ago", actor: "SGTX Platform", action: "Revenue attribution disputed — organic vs marketplace", target: "L-2026-0042", type: "warning" as const },
  { time: "5 h ago", actor: "API Gateway", action: "Rate limit check — 1240/5000 (24.8%, on track)", target: "API-KEY-PROD", type: "info" as const },
  { time: "8 h ago", actor: "SGTX Platform", action: "Revenue received — $22.75 (15% of $151.34)", target: "ISO-20022", type: "success" as const },
  { time: "12 h ago", actor: "Leads Engine", action: "3 leads rejected — incomplete buyer data (no GTID)", target: "L-2026-0044", type: "warning" as const },
  { time: "1 d ago", actor: "Agreement System", action: "Renewal reminder — expires in 30 days", target: "AGR-2026-001", type: "info" as const },
];

// ── EXTERNAL INTEGRATIONS (MP-specific) ─────────────────────────────────────
export const MP_INTEGRATIONS = [
  { name: "SGTX Marketplace API (v1)", status: "operational", latency: "85ms", icon: Globe2 },
  { name: "Webhook Delivery (outbound)", status: "degraded", latency: "3 failed (timeout)", icon: Webhook },
  { name: "Sandbox API (synthetic)", status: "operational", latency: "45ms", icon: Eye },
  { name: "Revenue Settlement (ISO 20022)", status: "operational", latency: "410ms", icon: DollarSign },
  { name: "Lead Qualification (GTID check)", status: "operational", latency: "120ms", icon: CheckCircle2 },
  { name: "IP Whitelist (5 ranges)", status: "operational", latency: "—", icon: Settings },
];

// ── RECENT GOVERNOR DECISIONS (MP perspective) ──────────────────────────────
export const MP_RECENT_DECISIONS = [
  { gate: "G1U1", type: "Lead Attribution Verified (referral cookie + IP match)", ustn: "SGTX-EG-26-NH3T-0042", verdict: "ALLOW" as const, reason: "Lead attribution verified: referral cookie present (tradebridge.ref=abc123), IP matches whitelisted range (198.51.100.0/24), timestamp before trade creation. Marketplace partner (TradeBridge) attributed. Revenue share: 15% of $151.34 = $22.75.", timestamp: "2 min ago" },
  { gate: "G1U1", type: "Lead Attribution Disputed (organic vs marketplace)", ustn: "L-2026-0042", verdict: "CONDITIONAL" as const, reason: "SGTX claims buyer found platform organically. TradeBridge claims referral cookie. Evidence required: referral URL, cookie timestamp, IP match. Pending resolution. Revenue held in escrow until resolved.", timestamp: "3 h ago" },
  { gate: "G6", type: "Revenue Settlement (ISO 20022)", ustn: "SGTX-EG-26-NH3T-0042", verdict: "ALLOW" as const, reason: "Revenue share $22.75 (15% of $151.34 SGTX fee) settled via pain.001 (CBE clearing). Reconciliation 100%. Attributed to TradeBridge Marketplace (referral verified).", timestamp: "8 h ago" },
];

// ── §16.1.6 SIDEBAR (MP-specific role tabs) ────────────────────────────────
export const MP_SIDEBAR_ROLE = [
  { label: "Leads", icon: Inbox, desc: "Intent inbox + conversion" },
  { label: "Webhooks", icon: Webhook, desc: "Delivery logs + health" },
  { label: "Revenue", icon: DollarSign, desc: "Attribution + disputes" },
  { label: "API Keys", icon: KeyRound, desc: "Production + sandbox" },
  { label: "Agreement", icon: FileText, desc: "Revenue share terms" },
];
