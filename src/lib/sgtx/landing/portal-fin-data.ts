// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #8: FIN (Financier — Bank)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.8 FIN Bank features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Banknote, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, FileText, ShieldAlert,
  Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Landmark, DollarSign, Timer, Award,
  FileSignature, BarChart3, Eye, Building2, ArrowUpRight,
  ArrowDownLeft, Percent, PiggyBank, CreditCard,
} from "lucide-react";

// ── Active tenant (the "logged-in" bank for the demo) ───────────────────────
export const FIN_TENANT = {
  name: "Cairo Amman Bank",
  gtid: "SGTX-EG-26-CA1B-0007",
  kybTier: 4,
  role: "FIN" as const,
  subType: "BANK" as const,
  avatarInitials: "CA",
  trustScore: 95,
  tradeCount: 67,
  activeLoans: 12,
  openOpportunities: 5,
  totalExposure: "$8.4M",
  portfolioYield: "6.8%",
  defaultRate: "1.2%",
  complianceScore: "98.5%",
};

// ── §2.5.1 SMART INBOX — FIN-specific items (4-part structure) ────────────
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

export const FIN_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0950",
    what: "New financing opportunity — Sahara Exports requests $420K trade finance (Frozen Strawberries)",
    why: "Auto-RFQ from seller. Full disclosure: verified trade, evidence-backed, USTN will mint at lock. Risk score 72 (low). Facility: Trade Finance Line. Your exposure limit allows $500K.",
    deadline: "2026-09-19 18:00 EET",
    action: "Review & Bid",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0948",
    what: "Margin call notice — USTN ...0038-3 collateral value dropped 8%",
    why: "Collateral (frozen mangoes) market value dropped from $50K to $46K. Margin requirement: 85%. Current LTV: 92%. Margin call: $4K top-up required within 48h.",
    deadline: "2026-09-20 12:00 EET",
    action: "Issue Margin Call",
    priority: 90,
    band: "High",
    category: "COMPLIANCE",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0038-3",
  },
  {
    id: "INB-2026-0946",
    what: "Repayment due — USTN ...0034-1 ($105K principal + $3.6K interest)",
    why: "Loan repayment due. 30-day settlement milestone reached. Borrower: Sahara Exports. ISO 20022 payment instruction ready. Auto-collect from registered account.",
    deadline: "2026-09-19 09:00 EET",
    action: "Process Repayment",
    priority: 85,
    band: "High",
    category: "NEEDS_PAYMENT",
    icon: DollarSign,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0943",
    what: "Co-financing opportunity — large trade ($1.2M, exceeds single-bank limit)",
    why: "Nile Harvest Trading requests $1.2M trade finance. Exceeds your $500K single-trade limit. Co-financing with 2 other banks requested. Your share: $400K (33%). Risk shared.",
    deadline: "2026-09-21 14:00 EET",
    action: "Review Co-Financing",
    priority: 70,
    band: "High",
    category: "NEW_OFFER",
    icon: Users,
  },
  {
    id: "INB-2026-0940",
    what: "Bid accepted — your $420K bid won (USTN ...0042-RQ)",
    why: "Your bid for Sahara Exports trade finance was accepted. Rate: 6.5% (vs 7.2% competitor). Facility: Trade Finance Line. Drawdown authorized on FeeLock. Collateral verified.",
    deadline: "—",
    action: "Setup Facility",
    priority: 75,
    band: "High",
    category: "GENERAL",
    icon: CheckCircle2,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0937",
    what: "Regulatory report due — CBE monthly exposure report",
    why: "Central Bank of Egypt requires monthly exposure report. Due in 5 days. Auto-generated from portfolio data. Total exposure: $8.4M. All within limits. Review and submit.",
    deadline: "2026-09-23 23:59 EET",
    action: "Review & Submit",
    priority: 55,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Landmark,
  },
  {
    id: "INB-2026-0934",
    what: "Collateral monitoring alert — reefer container temperature excursion (USTN ...0037-2)",
    why: "Collateral (frozen mangoes) had 2h temperature excursion (-15°C vs -18°C target). Collateral value at risk. Insurance claim filed. Adjusted collateral value: $44K (from $50K).",
    deadline: "—",
    action: "Review Collateral",
    priority: 65,
    band: "Medium",
    category: "SHIPMENT_ALERT",
    icon: ShieldAlert,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0930",
    what: "Settlement received — Interest payment $3.6K (USTN ...0034-1)",
    why: "Interest payment received via ISO 20022. $3.6K for month 1 of 6-month facility. Principal $105K due at closure. On-track. Reconciliation 100%.",
    deadline: "—",
    action: "View Payment",
    priority: 20,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0926",
    what: "Default risk alert — borrower Delta Ago risk score dropped to 58 (from 72)",
    why: "GNN Risk Engine flagged: Delta Ago risk score dropped 14 points. Sanctions proximity within 2 hops. 2 late payments in 30 days. Exposure: $280K. Recommend: increase collateral requirement.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Risk",
    priority: 72,
    band: "High",
    category: "COMPLIANCE",
    icon: TrendingUp,
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (FIN-specific metrics) ─────────────────
export const FIN_SUMMARY_CARDS = [
  { label: "Open Opportunities", value: "5", trend: "up" as const, delta: "+2 today", icon: Inbox, color: "text-emerald-300" },
  { label: "Active Loans", value: "12", trend: "up" as const, delta: "+1 this week", icon: Banknote, color: "text-blue-300" },
  { label: "Total Exposure", value: "$8.4M", trend: "up" as const, delta: "+$420K", icon: Wallet, color: "text-amber-300" },
  { label: "Portfolio Yield", value: "6.8%", trend: "up" as const, delta: "+0.3%", icon: Percent, color: "text-green-300" },
  { label: "Default Rate", value: "1.2%", trend: "down" as const, delta: "-0.4%", icon: AlertTriangle, color: "text-green-300" },
  { label: "Compliance", value: "98.5%", trend: "up" as const, delta: "+0.2%", icon: ShieldAlert, color: "text-emerald-300" },
];

// ── §16.8.6.8 QUICK ACTIONS (FIN-specific, max 8) ─────────────────────────
export const FIN_QUICK_ACTIONS = [
  { key: "opportunities", label: "Financing Opportunities", icon: Inbox, specRef: "§16.8.6.8", oneClick: false },
  { key: "bid", label: "Submit Bid", icon: DollarSign, specRef: "§10", oneClick: true },
  { key: "active-loans", label: "My Bids & Loans", icon: Banknote, specRef: "§16.8.6.8", oneClick: false },
  { key: "collateral", label: "Collateral Monitor", icon: ShieldAlert, specRef: "§10", oneClick: false },
  { key: "portfolio", label: "Portfolio & Compliance", icon: BarChart3, specRef: "§16.8.6.8", oneClick: false },
  { key: "reports", label: "Regulatory Reports", icon: FileText, specRef: "§16.8.6.8", oneClick: true },
  { key: "companies", label: "Financed Companies", icon: Building2, specRef: "§16.8.6.8", oneClick: false },
  { key: "exposure", label: "Exposure Limits", icon: Scale, specRef: "§4.9", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (FIN perspective) ───────────────────────────
export const FIN_HEALTH_SCORE = {
  total: 92,
  components: [
    { name: "Compliance", weight: 20, score: 98, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 96, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 85, icon: Banknote },
    { name: "Payment", weight: 15, score: 94, icon: DollarSign },
    { name: "Risk", weight: 20, score: 88, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 95, icon: Clock },
  ],
};

// ── ACTIVE FINANCING (FIN-filtered columns) ────────────────────────────────
export const FIN_ACTIVE_FINANCING = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    borrower: "Sahara Exports",
    facility: "Trade Finance Line",
    drawdown: "$420K (authorized)",
    repayment: "6-month, interest 6.5%",
    exposure: "$420K",
    riskScore: 72,
    collateral: "Frozen Strawberries ($105K CIF) + bank guarantee",
    status: "active",
    health: 88,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0038-3",
    borrower: "Sahara Exports",
    facility: "Multi-shipment facility",
    drawdown: "$210K (drawn 3/6)",
    repayment: "Per-shipment, interest 7.0%",
    exposure: "$210K",
    riskScore: 75,
    collateral: "Frozen Strawberries (multi-shipment) + collateral",
    status: "active",
    health: 82,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0037-2",
    borrower: "Sahara Exports",
    facility: "Trade Finance Line",
    drawdown: "$180K (drawn)",
    repayment: "6-month, interest 6.8%",
    exposure: "$180K (margin call: $4K)",
    riskScore: 68,
    collateral: "Frozen Mangoes ($44K, dropped from $50K) + guarantee",
    status: "margin_call",
    health: 65,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0034-1",
    borrower: "Sahara Exports",
    facility: "Trade Finance Line",
    drawdown: "$105K (drawn)",
    repayment: "Due today (principal + $3.6K interest)",
    exposure: "$108.6K (due)",
    riskScore: 78,
    collateral: "Dates ($88K CIF) + bank guarantee",
    status: "repayment_due",
    health: 91,
  },
  {
    ustn: "SGTX-EG-26-DA2F-0021",
    borrower: "Delta Agro",
    facility: "Trade Finance Line",
    drawdown: "$280K (drawn)",
    repayment: "3-month, interest 7.5%",
    exposure: "$280K (risk alert: score dropped to 58)",
    riskScore: 58,
    collateral: "Frozen Mangoes ($56K) + personal guarantee",
    status: "risk_alert",
    health: 55,
  },
];

// ── §16.8.6.8 FINANCING OPPORTUNITIES (auto-RFQ, full disclosure) ─────────
export interface FinancingOpportunity {
  id: string;
  ustn: string;
  borrower: string;
  borrowerGtid: string;
  amount: string;
  facility: string;
  term: string;
  riskScore: number;
  collateral: string;
  disclosure: string;
  yourBidRate: string;
  competitorRange: string;
  receivedAt: string;
  deadline: string;
  priority: number;
}

export const FIN_OPPORTUNITIES: FinancingOpportunity[] = [
  {
    id: "OPP-2026-0050",
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
    borrower: "Sahara Exports",
    borrowerGtid: "SGTX-EG-26-SX7K-0008",
    amount: "$420K",
    facility: "Trade Finance Line (single-shipment)",
    term: "6-month, interest-only, principal at closure",
    riskScore: 72,
    collateral: "Frozen Strawberries ($105K CIF) + bank guarantee $315K",
    disclosure: "Full disclosure: verified trade (28 prior trades, 0 defaults), evidence-backed (USTN minted at lock), sanctions clear, jurisdiction EU+Egypt",
    yourBidRate: "6.5% (your competitive rate)",
    competitorRange: "6.8%–7.5% (3 other banks bidding)",
    receivedAt: "2 hours ago",
    deadline: "2026-09-19 18:00 EET (22h remaining)",
    priority: 80,
  },
  {
    id: "OPP-2026-0049",
    ustn: "pre-USTN (Request SGTX-EG-26-DA2F-0014-RQ)",
    borrower: "Delta Agro",
    borrowerGtid: "SGTX-EG-26-DA2F-0014",
    amount: "$280K",
    facility: "Trade Finance Line",
    term: "3-month, interest-only",
    riskScore: 58,
    collateral: "Frozen Mangoes ($56K) + personal guarantee",
    disclosure: "Full disclosure: 12 prior trades, 2 late payments (30d), risk score dropped 14 points, GNN flagged sanctions proximity 2-hop. Caution advised.",
    yourBidRate: "— (not yet bid — risk review needed)",
    competitorRange: "7.5%–8.5% (2 banks, higher rates for risk)",
    receivedAt: "5 hours ago",
    deadline: "2026-09-20 14:00 EET (28h remaining)",
    priority: 65,
  },
  {
    id: "OPP-2026-0048",
    ustn: "pre-USTN (co-financing, 3 banks)",
    borrower: "Nile Harvest Trading",
    borrowerGtid: "SGTX-EG-26-NH3T-0042",
    amount: "$1.2M (your share: $400K, 33%)",
    facility: "Co-financed Trade Finance Line",
    term: "9-month, interest-only",
    riskScore: 80,
    collateral: "Multi-commodity portfolio + bank guarantees (3 banks shared)",
    disclosure: "Full disclosure: large trade, co-financing with 2 other banks, risk shared proportionally, evidence-backed, sanctions clear",
    yourBidRate: "6.2% (your share rate)",
    competitorRange: "6.0%–6.5% (co-financing syndicate)",
    receivedAt: "1 day ago",
    deadline: "2026-09-21 14:00 EET (48h remaining)",
    priority: 70,
  },
];

// ── §16.8.6.8 MY BIDS & ACTIVE LOANS (collateral monitoring) ──────────────
export const FIN_MY_BIDS = [
  { id: "BID-2026-0050", ustn: "pre-USTN (...0048-RQ)", borrower: "Sahara Exports", amount: "$420K", yourRate: "6.5%", status: "accepted", facility: "Trade Finance Line", setupRequired: true },
  { id: "BID-2026-0049", ustn: "pre-USTN (...0014-RQ)", borrower: "Delta Agro", amount: "$280K", yourRate: "— (risk review)", status: "pending", facility: "Trade Finance Line", setupRequired: false },
  { id: "BID-2026-0048", ustn: "pre-USTN (co-financing)", borrower: "Nile Harvest Trading", amount: "$400K (33%)", yourRate: "6.2%", status: "pending", facility: "Co-financed Line", setupRequired: false },
  { id: "BID-2026-0047", ustn: "SGTX-EG-26-NH3T-0042", borrower: "Sahara Exports", amount: "$420K", yourRate: "6.5%", status: "active", facility: "Trade Finance Line", setupRequired: false },
];

// ── §16.8.6.8 PORTFOLIO & COMPLIANCE ────────────────────────────────────────
export const FIN_PORTFOLIO = {
  totalExposure: "$8.4M",
  exposureLimit: "$12M (70% utilized)",
  activeLoans: 12,
  avgYield: "6.8%",
  defaultRate: "1.2% (1 loan at risk)",
  collateralCoverage: "135% (avg LTV 74%)",
  complianceScore: "98.5%",
  regulatoryReports: [
    { name: "CBE Monthly Exposure", due: "2026-09-23", status: "auto-generated", autoSubmit: true },
    { name: "AML Suspicious Activity (SAR)", due: "— (as needed)", status: "0 pending", autoSubmit: false },
    { name: "Basel III Capital Adequacy", due: "2026-09-30", status: "compliant (14.2%)", autoSubmit: true },
    { name: "IFRS 9 Expected Credit Loss", due: "2026-10-01", status: "calculating", autoSubmit: true },
  ],
};

// ── §16.8.6.8 FINANCED COMPANIES (private, audit-traced) ───────────────────
export const FIN_FINANCED_COMPANIES = [
  { name: "Sahara Exports", gtid: "SGTX-EG-26-SX7K-0008", activeLoans: 4, totalExposure: "$915K", trustScore: 91, tradesFinanced: 28, defaultRate: "0%", status: "preferred" },
  { name: "Delta Agro", gtid: "SGTX-EG-26-DA2F-0014", activeLoans: 2, totalExposure: "$560K", trustScore: 68, tradesFinanced: 12, defaultRate: "0% (2 late payments)", status: "at_risk" },
  { name: "Nile Harvest Trading", gtid: "SGTX-EG-26-NH3T-0042", activeLoans: 3, totalExposure: "$735K", trustScore: 87, tradesFinanced: 18, defaultRate: "0%", status: "preferred" },
  { name: "Mediterra Foods", gtid: "SGTX-IT-26-MF19-0021", activeLoans: 1, totalExposure: "$210K", trustScore: 88, tradesFinanced: 9, defaultRate: "0%", status: "active" },
  { name: "Najd Trading", gtid: "SGTX-SA-26-NT4K-0009", activeLoans: 2, totalExposure: "$420K", trustScore: 82, tradesFinanced: 14, defaultRate: "0%", status: "active" },
];

// ── §16.8.6.8 PERFORMANCE DASHBOARD ──────────────────────────────────────────
export const FIN_PERFORMANCE = {
  metrics: [
    { name: "Portfolio Yield (30d)", value: "6.8%", benchmark: "6.2%", status: "above", icon: Percent },
    { name: "Default Rate", value: "1.2%", benchmark: "2.5%", status: "above", icon: AlertTriangle },
    { name: "Bid Win Rate", value: "68%", benchmark: "54%", status: "above", icon: CheckCircle2 },
    { name: "Avg Loan Size", value: "$700K", benchmark: "$520K", status: "above", icon: Banknote },
    { name: "Collateral Coverage", value: "135%", benchmark: "120%", status: "above", icon: ShieldAlert },
    { name: "Compliance Score", value: "98.5%", benchmark: "96.2%", status: "above", icon: FileCheck },
  ],
  trend: "+0.5% (vs last month)",
  percentile: "Top 8% of corridor banks (CBE licensed)",
};

// ── §16.8.6.8 PORTAL FEATURE LIST (FIN Bank) ────────────────────────────────
export const FIN_PORTAL_FEATURES = [
  { name: "Financing Opportunities", desc: "Auto-RFQ with full disclosure (verified trade, evidence-backed, risk score, collateral)", section: "§16.8.6.8" },
  { name: "My Bids & Active Loans", desc: "Bid status (pending/accepted/active), collateral monitoring dashboard, margin call alerts", section: "§16.8.6.8" },
  { name: "Portfolio & Compliance", desc: "Exposure limits, regulatory reports (CBE, Basel III, IFRS 9), AML/SAR monitoring", section: "§16.8.6.8" },
  { name: "Financed Companies", desc: "Private, audit-traced borrower profiles, trust scores, default rates", section: "§16.8.6.8" },
  { name: "Collateral Monitoring", desc: "Real-time collateral value tracking, margin calls, temperature excursion alerts", section: "§10" },
  { name: "Risk Scoring (GNN)", desc: "Sanctions proximity, default prediction, credit scoring via Graph Neural Network", section: "§22.2.1" },
  { name: "Company Admin", desc: "Exposure limits, preferences, bid rate templates, co-financing syndicate management", section: "§4.9" },
];

// ── RECENT ACTIVITY FEED (FIN perspective) ────────────────────────────────
export const FIN_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "Auto-RFQ System", action: "New financing opportunity — $420K Sahara Exports", target: "OPP-2026-0050", type: "info" as const },
  { time: "1 h ago", actor: "GNN Risk Engine (A2)", action: "Margin call flagged — collateral dropped 8%", target: "USTN ...0038-3", type: "warning" as const },
  { time: "3 h ago", actor: "Borrower (Sahara Exports)", action: "Accepted your bid — $420K at 6.5%", target: "BID-2026-0050", type: "success" as const },
  { time: "5 h ago", actor: "Governor (G6)", action: "Interest payment received — $3.6K (ISO 20022)", target: "USTN ...0034-1", type: "success" as const },
  { time: "6 h ago", actor: "GNN Risk Engine (A2)", action: "Risk alert — Delta Ago score dropped to 58 (from 72)", target: "BID-2026-0049", type: "error" as const },
  { time: "8 h ago", actor: "Collateral Monitor", action: "Temperature excursion — collateral value adjusted", target: "USTN ...0037-2", type: "warning" as const },
  { time: "1 d ago", actor: "CBE Regulatory", action: "Monthly exposure report auto-generated — $8.4M total", target: "CBE-2026-09", type: "info" as const },
];

// ── EXTERNAL INTEGRATIONS (FIN-specific) ─────────────────────────────────────
export const FIN_INTEGRATIONS = [
  { name: "CBE (Central Bank of Egypt)", status: "operational", latency: "320ms", icon: Landmark },
  { name: "ISO 20022 Bank Settlement", status: "operational", latency: "410ms", icon: DollarSign },
  { name: "GNN Risk Engine (Sanctions)", status: "operational", latency: "180ms", icon: TrendingUp },
  { name: "Credit Scoring (A2)", status: "operational", latency: "240ms", icon: BarChart3 },
  { name: "Collateral Registry", status: "operational", latency: "150ms", icon: ShieldAlert },
  { name: "AML/SAR Detection (A2)", status: "operational", latency: "200ms", icon: FileText },
];

// ── RECENT GOVERNOR DECISIONS (FIN perspective) ──────────────────────────────
export const FIN_RECENT_DECISIONS = [
  {
    gate: "G6",
    type: "Interest Payment (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Interest payment $3.6K received via pain.001 (CBE clearing). Month 1 of 6-month facility. Principal $105K due at closure. Reconciliation 100%. On-track loan.",
    timestamp: "5 h ago",
  },
  {
    gate: "G2",
    type: "Financing Pre-Clearance (CFR)",
    ustn: "pre-USTN (Request ...0048-RQ)",
    verdict: "ALLOW" as const,
    reason: "CFR pre-clearance for $420K trade finance. Borrower Sahara Exports (trust 91, 28 trades, 0 defaults). Collateral verified ($105K CIF + bank guarantee). Risk score 72 (low). Bid accepted at 6.5%.",
    timestamp: "3 h ago",
  },
  {
    gate: "G5",
    type: "Collateral Monitoring (Margin Call)",
    ustn: "SGTX-EG-26-NH3T-0038-3",
    verdict: "CONDITIONAL" as const,
    reason: "Collateral value dropped 8% (frozen mangoes $50K → $46K). LTV 92% (threshold 85%). Margin call $4K top-up required within 48h. GNN flagged. Borrower notified.",
    timestamp: "1 h ago",
  },
];

// ── §16.1.6 SIDEBAR (FIN-specific role tabs) ────────────────────────────────
export const FIN_SIDEBAR_ROLE = [
  { label: "Opportunities", icon: Inbox, desc: "Auto-RFQ + full disclosure" },
  { label: "My Bids", icon: DollarSign, desc: "Pending / accepted / active" },
  { label: "Active Loans", icon: Banknote, desc: "Collateral monitoring" },
  { label: "Portfolio", icon: BarChart3, desc: "Exposure + compliance" },
  { label: "Companies", icon: Building2, desc: "Financed (private)" },
];
