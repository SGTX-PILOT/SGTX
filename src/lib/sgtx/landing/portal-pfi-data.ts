// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #9: FIN (PFI — Private Financier)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.9 PFI features.
// Creative: Risk-return scatter plot + yield ladder + risk appetite gauge + CSV export
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  DollarSign, ShieldAlert, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, Users, Banknote,
  Percent, BarChart3, Building2, Award, FileText,
  Download, Eye, Sparkles, PieChart, Target,
} from "lucide-react";

// ── Active tenant (the "logged-in" PFI for the demo) ─────────────────────────
export const PFI_TENANT = {
  name: "Nile Capital Partners",
  gtid: "SGTX-EG-26-NC7P-0011",
  kybTier: 4,
  role: "FIN" as const,
  subType: "PRIVATE" as const,
  avatarInitials: "NC",
  trustScore: 88,
  tradeCount: 34,
  activeLoans: 8,
  openOpportunities: 4,
  totalExposure: "$3.2M",
  portfolioYield: "8.4%",
  defaultRate: "2.1%",
  riskAppetite: "Aggressive",
  avgLoanSize: "$400K",
};

// ── §2.5.1 SMART INBOX — PFI-specific items ────────────────────────────────
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

export const PFI_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0951",
    what: "Niche opportunity — distressed cargo financing ($85K, 12% yield potential)",
    why: "Frozen mangoes rejected by buyer (quality dispute). Seller needs bridge financing to re-route. Bank declined (too risky). PFI opportunity: 12% yield, 3-month, collateral = cargo + insurance. Risk score 55 (medium-high).",
    deadline: "2026-09-19 18:00 EET",
    action: "Review Niche Opp",
    priority: 78,
    band: "High",
    category: "NEW_OFFER",
    icon: Sparkles,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0949",
    what: "New financing opportunity — Sahara Exports $380K trade finance (8% yield)",
    why: "Auto-RFQ from seller. Full disclosure. Risk score 74 (low-medium). Bank offered 6.5%. You can win at 8% (PFI premium for flexibility). 6-month, interest-only. Collateral verified.",
    deadline: "2026-09-19 14:00 EET",
    action: "Review & Bid",
    priority: 72,
    band: "High",
    category: "NEW_OFFER",
    icon: Inbox,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0947",
    what: "Repayment due — USTN ...0034-1 ($105K principal + $4.4K interest at 8.5%)",
    why: "3-month facility maturity. Borrower: Sahara Exports. ISO 20022 payment instruction ready. On-track (0 late payments). Auto-collect from registered account.",
    deadline: "2026-09-19 09:00 EET",
    action: "Process Repayment",
    priority: 85,
    band: "High",
    category: "NEEDS_PAYMENT",
    icon: DollarSign,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0944",
    what: "Co-financing invitation — bank syndicate requests your participation ($200K share)",
    why: "Cairo Amman Bank leads a $800K syndicate for Nile Harvest. Your share: $200K (25%) at 7.5%. Risk shared. You bring niche trade expertise. Bank brings regulatory cover.",
    deadline: "2026-09-21 12:00 EET",
    action: "Review Co-Financing",
    priority: 68,
    band: "Medium",
    category: "NEW_OFFER",
    icon: Users,
  },
  {
    id: "INB-2026-0941",
    what: "Collateral alert — USTN ...0037-2 cargo value dropped 12% (distressed)",
    why: "Frozen mangoes (collateral) market value dropped from $50K to $44K (quality dispute + temp excursion). LTV now 95%. Above 85% threshold. Margin call or renegotiate terms.",
    deadline: "2026-09-20 06:00 EET",
    action: "Renegotiate or Margin Call",
    priority: 80,
    band: "High",
    category: "COMPLIANCE",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0938",
    what: "Bid accepted — your 8% bid won (USTN ...0042-RQ, beat bank's 6.5%)",
    why: "Seller chose your 8% bid over bank's 6.5% — reason: faster approval (no banking committee), flexible terms, niche trade expertise. Facility: $380K, 6-month. Setup required.",
    deadline: "—",
    action: "Setup Facility",
    priority: 75,
    band: "High",
    category: "GENERAL",
    icon: CheckCircle2,
    ustn: "SGTX-EG-26-NH3T-0042",
  },
  {
    id: "INB-2026-0935",
    what: "CSV export ready — September portfolio performance report",
    why: "Monthly CSV export auto-generated. 8 active loans, $3.2M exposure, 8.4% avg yield, 2.1% default rate. Download or preview before sharing with LPs (limited partners).",
    deadline: "—",
    action: "Preview / Download CSV",
    priority: 45,
    band: "Medium",
    category: "GENERAL",
    icon: Download,
  },
  {
    id: "INB-2026-0930",
    what: "Settlement received — Interest $4.4K (USTN ...0034-1, 8.5% yield)",
    why: "Interest payment received via ISO 20022. $4.4K for month 2 of 3-month facility. Principal $105K due at closure. On-track. Above bank yield (6.5% → you earn 8.5%).",
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
    what: "Default risk — borrower Delta Agro missed payment (USTN ...0021)",
    why: "Delta Agro missed interest payment ($2.8K) on $280K facility. 7-day grace period. If not paid by Sep 25: default declared, collateral liquidated, GNN risk score updated. Exposure: $280K.",
    deadline: "2026-09-25 23:59 EET",
    action: "Monitor Default Risk",
    priority: 82,
    band: "High",
    category: "COMPLIANCE",
    icon: ShieldAlert,
    ustn: "SGTX-EG-26-DA2F-0021",
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (PFI-specific) ─────────────────────────
export const PFI_SUMMARY_CARDS = [
  { label: "Open Opportunities", value: "4", trend: "up" as const, delta: "+1 niche", icon: Inbox, color: "text-amber-300" },
  { label: "Active Loans", value: "8", trend: "up" as const, delta: "+1 today", icon: Banknote, color: "text-rose-300" },
  { label: "Total Exposure", value: "$3.2M", trend: "up" as const, delta: "+$380K", icon: Wallet, color: "text-amber-300" },
  { label: "Portfolio Yield", value: "8.4%", trend: "up" as const, delta: "+0.6% (vs bank 6.5%)", icon: Percent, color: "text-emerald-300" },
  { label: "Default Rate", value: "2.1%", trend: "up" as const, delta: "+0.3% (risk premium)", icon: AlertTriangle, color: "text-rose-300" },
  { label: "Niche Win Rate", value: "72%", trend: "up" as const, delta: "+5% (vs bank 0%)", icon: Sparkles, color: "text-amber-300" },
];

// ── §16.8.6.9 QUICK ACTIONS (PFI-specific, simplified, max 8) ─────────────
export const PFI_QUICK_ACTIONS = [
  { key: "opportunities", label: "Financing Opportunities", icon: Inbox, specRef: "§16.8.6.9", oneClick: false },
  { key: "bid", label: "Submit Bid", icon: DollarSign, specRef: "§10", oneClick: true },
  { key: "loans", label: "My Bids & Loans", icon: Banknote, specRef: "§16.8.6.9", oneClick: false },
  { key: "collateral", label: "Collateral Monitor", icon: ShieldAlert, specRef: "§10", oneClick: false },
  { key: "portfolio", label: "Portfolio (CSV Export)", icon: Download, specRef: "§16.8.6.9", oneClick: true },
  { key: "companies", label: "Financed Companies", icon: Building2, specRef: "§16.8.6.9", oneClick: false },
  { key: "risk-appetite", label: "Risk Appetite Settings", icon: Target, specRef: "§4.9", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: TrendingUp, specRef: "§16.8.6.9", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (PFI perspective) ───────────────────────────
export const PFI_HEALTH_SCORE = {
  total: 85,
  components: [
    { name: "Compliance", weight: 20, score: 90, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 87, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 80, icon: Banknote },
    { name: "Payment", weight: 15, score: 85, icon: DollarSign },
    { name: "Risk", weight: 20, score: 76, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 88, icon: Clock },
  ],
};

// ── ACTIVE FINANCING (PFI-filtered) ────────────────────────────────────────
export const PFI_ACTIVE_FINANCING = [
  { ustn: "SGTX-EG-26-NH3T-0042", borrower: "Sahara Exports", facility: "PFI Trade Finance", drawdown: "$380K (authorized)", repayment: "6-month, 8.0%", exposure: "$380K", riskScore: 74, yield: 8.0, status: "active", health: 88, collateral: "Frozen Strawberries + insurance" },
  { ustn: "SGTX-EG-26-NH3T-0037-2", borrower: "Sahara Exports", facility: "Distressed Cargo Bridge", drawdown: "$50K (drawn)", repayment: "3-month, 12.0%", exposure: "$50K (collateral dropped)", riskScore: 55, yield: 12.0, status: "distressed", health: 45, collateral: "Frozen Mangoes ($44K, was $50K)" },
  { ustn: "SGTX-EG-26-NH3T-0034-1", borrower: "Sahara Exports", facility: "PFI Trade Finance", drawdown: "$105K (drawn)", repayment: "3-month, 8.5%, due today", exposure: "$109.4K (due)", riskScore: 78, yield: 8.5, status: "repayment_due", health: 91, collateral: "Dates ($88K) + insurance" },
  { ustn: "SGTX-EG-26-DA2F-0021", borrower: "Delta Agro", facility: "PFI Trade Finance", drawdown: "$280K (drawn)", repayment: "3-month, 9.5%, payment missed", exposure: "$280K (default risk)", riskScore: 52, yield: 9.5, status: "default_risk", health: 42, collateral: "Frozen Mangoes ($56K) + personal guarantee" },
  { ustn: "SGTX-EG-26-NH3T-0036-1", borrower: "Sahara Exports", facility: "Co-financed (with Bank)", drawdown: "$200K (your share 25%)", repayment: "6-month, 7.5%", exposure: "$200K (shared risk)", riskScore: 80, yield: 7.5, status: "co_financed", health: 85, collateral: "Sun-Dried Tomatoes + bank guarantee" },
  { ustn: "SGTX-SA-26-NT4K-0009", borrower: "Najd Trading", facility: "PFI Trade Finance", drawdown: "$150K (drawn)", repayment: "4-month, 8.8%", exposure: "$150K", riskScore: 76, yield: 8.8, status: "active", health: 90, collateral: "Dates ($120K) + insurance" },
  { ustn: "SGTX-EG-26-NH3T-0038-3", borrower: "Sahara Exports", facility: "Multi-shipment PFI", drawdown: "$120K (drawn 2/3)", repayment: "Per-shipment, 9.0%", exposure: "$120K", riskScore: 70, yield: 9.0, status: "active", health: 82, collateral: "Frozen Strawberries (multi)" },
  { ustn: "SGTX-EG-26-NH3T-0030-1", borrower: "Mediterra Foods", facility: "PFI Trade Finance", drawdown: "$95K (drawn)", repayment: "2-month, 9.2%, closing", exposure: "$95K", riskScore: 82, yield: 9.2, status: "closing", health: 93, collateral: "Sun-Dried Tomatoes + insurance" },
];

// ── §16.8.6.9 FINANCING OPPORTUNITIES (auto-RFQ + niche) ──────────────────
export interface PfioOpportunity {
  id: string;
  ustn: string;
  borrower: string;
  amount: string;
  facility: string;
  term: string;
  riskScore: number;
  yieldPotential: string;
  collateral: string;
  disclosure: string;
  isNiche: boolean;
  nicheReason?: string;
  bankDeclined?: boolean;
  receivedAt: string;
  deadline: string;
  priority: number;
}

export const PFI_OPPORTUNITIES: PfioOpportunity[] = [
  {
    id: "OPP-2026-0051",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    borrower: "Sahara Exports",
    amount: "$50K",
    facility: "Distressed Cargo Bridge Finance",
    term: "3-month, interest-only, principal at closure",
    riskScore: 55,
    yieldPotential: "12.0% (distressed premium)",
    collateral: "Frozen Mangoes ($44K, was $50K) + cargo insurance $50K",
    disclosure: "Full disclosure: distressed cargo (buyer rejected, quality dispute), bank declined (too risky), PFI opportunity (bridge to re-route), GNN risk 55, sanctions clear",
    isNiche: true,
    nicheReason: "Distressed cargo — bank declined due to quality dispute + collateral depreciation",
    bankDeclined: true,
    receivedAt: "1 hour ago",
    deadline: "2026-09-19 18:00 EET (20h)",
    priority: 78,
  },
  {
    id: "OPP-2026-0050",
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
    borrower: "Sahara Exports",
    amount: "$380K",
    facility: "PFI Trade Finance",
    term: "6-month, interest-only",
    riskScore: 74,
    yieldPotential: "8.0% (PFI flexibility premium over bank 6.5%)",
    collateral: "Frozen Strawberries ($105K CIF) + insurance $275K",
    disclosure: "Full disclosure: verified trade (28 prior, 0 defaults), bank offered 6.5%, you win at 8% (faster approval, flexible terms), sanctions clear",
    isNiche: false,
    receivedAt: "2 hours ago",
    deadline: "2026-09-19 14:00 EET (16h)",
    priority: 72,
  },
  {
    id: "OPP-2026-0049",
    ustn: "pre-USTN (co-financing, with Cairo Amman Bank)",
    borrower: "Nile Harvest Trading",
    amount: "$200K (your share 25% of $800K syndicate)",
    facility: "Co-Financed Trade Finance",
    term: "6-month, interest-only",
    riskScore: 80,
    yieldPotential: "7.5% (syndicate rate, shared risk)",
    collateral: "Multi-commodity + bank guarantees (3 financiers shared)",
    disclosure: "Full disclosure: bank-led syndicate, your share 25%, risk shared, you bring niche expertise, bank brings regulatory cover",
    isNiche: false,
    receivedAt: "5 hours ago",
    deadline: "2026-09-21 12:00 EET (48h)",
    priority: 68,
  },
  {
    id: "OPP-2026-0048",
    ustn: "pre-USTN (Request SGTX-EG-26-DA2F-0014-RQ)",
    borrower: "Delta Agro",
    amount: "$150K",
    facility: "PFI Trade Finance (high-risk)",
    term: "3-month, interest-only",
    riskScore: 48,
    yieldPotential: "11.0% (high-risk premium)",
    collateral: "Frozen Mangoes ($30K) + personal guarantee + insurance $120K",
    disclosure: "Full disclosure: risk score 48 (high), 2 late payments, GNN flagged 2-hop sanctions proximity, bank declined, PFI opportunity (high yield, high risk)",
    isNiche: true,
    nicheReason: "High-risk borrower — bank declined due to sanctions proximity + late payments",
    bankDeclined: true,
    receivedAt: "1 day ago",
    deadline: "2026-09-20 14:00 EET (28h)",
    priority: 60,
  },
];

// ── §16.8.6.9 FINANCED COMPANIES (private, audit-traced) ──────────────────
export const PFI_FINANCED_COMPANIES = [
  { name: "Sahara Exports", gtid: "SGTX-EG-26-SX7K-0008", activeLoans: 4, totalExposure: "$655K", trustScore: 91, yieldAvg: "8.6%", status: "preferred", nicheTrades: 2 },
  { name: "Delta Agro", gtid: "SGTX-EG-26-DA2F-0014", activeLoans: 1, totalExposure: "$280K", trustScore: 52, yieldAvg: "9.5%", status: "at_risk", nicheTrades: 1 },
  { name: "Nile Harvest Trading", gtid: "SGTX-EG-26-NH3T-0042", activeLoans: 2, totalExposure: "$500K", trustScore: 87, yieldAvg: "8.2%", status: "active", nicheTrades: 0 },
  { name: "Najd Trading", gtid: "SGTX-SA-26-NT4K-0009", activeLoans: 1, totalExposure: "$150K", trustScore: 82, yieldAvg: "8.8%", status: "active", nicheTrades: 0 },
  { name: "Mediterra Foods", gtid: "SGTX-IT-26-MF19-0021", activeLoans: 1, totalExposure: "$95K", trustScore: 88, yieldAvg: "9.2%", status: "closing", nicheTrades: 0 },
];

// ── §16.8.6.9 PORTFOLIO & PERFORMANCE (simplified, CSV export) ────────────
export const PFI_PORTFOLIO = {
  totalExposure: "$3.2M",
  exposureLimit: "$5M (64% utilized)",
  activeLoans: 8,
  avgYield: "8.4%",
  defaultRate: "2.1% (1 loan at risk)",
  collateralCoverage: "128% (avg LTV 78%)",
  nicheTrades: "3 (distressed + high-risk)",
  csvExportReady: true,
  csvPreview: [
    "Loan_ID,USTN,Borrower,Amount,Rate,Term,Status,Risk,Yield,Collateral",
    "PFI-001,SGTX-EG-26-NH3T-0042,Sahara Exports,$380K,8.0%,6m,active,74,8.0%,Strawberries+$275K ins",
    "PFI-002,SGTX-EG-26-NH3T-0037-2,Sahara Exports,$50K,12.0%,3m,distressed,55,12.0%,Mangoes+$50K ins",
    "PFI-003,SGTX-EG-26-NH3T-0034-1,Sahara Exports,$105K,8.5%,3m,repayment_due,78,8.5%,Dates+$88K ins",
    "PFI-004,SGTX-EG-26-DA2F-0021,Delta Agro,$280K,9.5%,3m,default_risk,52,9.5%,Mangoes+$56K+PG",
    "PFI-005,SGTX-EG-26-NH3T-0036-1,Sahara Exports,$200K,7.5%,6m,co_financed,80,7.5%,Tomatoes+bank guar",
    "PFI-006,SGTX-SA-26-NT4K-0009,Najd Trading,$150K,8.8%,4m,active,76,8.8%,Dates+$120K ins",
    "PFI-007,SGTX-EG-26-NH3T-0038-3,Sahara Exports,$120K,9.0%,per-ship,active,70,9.0%,Strawberries multi",
    "PFI-008,SGTX-EG-26-NH3T-0030-1,Mediterra Foods,$95K,9.2%,2m,closing,82,9.2%,Tomatoes+$95K ins",
  ],
};

// ── §16.8.6.9 PERFORMANCE DASHBOARD ──────────────────────────────────────────
export const PFI_PERFORMANCE = {
  metrics: [
    { name: "Portfolio Yield (30d)", value: "8.4%", benchmark: "Bank avg 6.5%", status: "above", icon: Percent },
    { name: "Default Rate", value: "2.1%", benchmark: "Bank avg 1.2%", status: "below", icon: AlertTriangle },
    { name: "Niche Win Rate", value: "72%", benchmark: "Bank 0% (don't bid)", status: "above", icon: Sparkles },
    { name: "Avg Loan Size", value: "$400K", benchmark: "Bank $700K", status: "below", icon: Banknote },
    { name: "Collateral Coverage", value: "128%", benchmark: "Bank 135%", status: "below", icon: ShieldAlert },
    { name: "Approval Speed", value: "2.1h", benchmark: "Bank 48h (committee)", status: "above", icon: Clock },
  ],
  trend: "+0.6% yield vs last month",
  percentile: "Top 3 PFI in corridor (niche specialization)",
};

// ── SVG DATA: Risk-Return Scatter Plot (creative) ──────────────────────────
export interface ScatterPoint {
  ustn: string;
  borrower: string;
  riskScore: number;
  yield: number;
  amount: number;
  status: string;
}

export const RISK_RETURN_SCATTER: ScatterPoint[] = PFI_ACTIVE_FINANCING.map(f => ({
  ustn: f.ustn,
  borrower: f.borrower,
  riskScore: f.riskScore,
  yield: f.yield,
  amount: parseFloat(f.exposure.replace(/[^0-9.]/g, "")) || 100,
  status: f.status,
}));

// ── §16.8.6.9 PORTAL FEATURE LIST (PFI) ──────────────────────────────────────
export const PFI_PORTAL_FEATURES = [
  { name: "Financing Opportunities", desc: "Auto-RFQ + niche opportunities (distressed, high-risk) that banks decline", section: "§16.8.6.9" },
  { name: "My Bids & Active Loans", desc: "Collateral monitoring, margin calls, distressed cargo tracking", section: "§16.8.6.9" },
  { name: "Portfolio & Performance", desc: "Simplified dashboard with CSV export for LP reporting", section: "§16.8.6.9" },
  { name: "Financed Companies", desc: "Private, audit-traced borrower profiles with yield tracking", section: "§16.8.6.9" },
  { name: "Niche Specialization", desc: "Distressed cargo, high-risk borrowers, special-stock — bank-declined trades", section: "§14" },
  { name: "Risk Appetite Settings", desc: "Adjustable risk tolerance (conservative → moderate → aggressive)", section: "§4.9" },
  { name: "Co-Financing Network", desc: "Partner with banks on syndicates — bring niche expertise, share risk", section: "§10" },
];

// ── RECENT ACTIVITY FEED (PFI perspective) ────────────────────────────────
export const PFI_RECENT_ACTIVITY = [
  { time: "1 h ago", actor: "Auto-RFQ + Niche Detector", action: "New niche opportunity — distressed cargo $50K at 12%", target: "OPP-2026-0051", type: "info" as const },
  { time: "2 h ago", actor: "Borrower (Sahara Exports)", action: "Accepted your 8% bid over bank's 6.5%", target: "USTN ...0042", type: "success" as const },
  { time: "3 h ago", actor: "Collateral Monitor", action: "Distressed — cargo value dropped 12%", target: "USTN ...0037-2", type: "warning" as const },
  { time: "5 h ago", actor: "Cairo Amman Bank", action: "Co-financing invitation — $200K share (25%)", target: "OPP-2026-0049", type: "info" as const },
  { time: "8 h ago", actor: "Governor (G6)", action: "Interest received $4.4K (8.5% yield)", target: "USTN ...0034-1", type: "success" as const },
  { time: "12 h ago", actor: "Borrower (Delta Agro)", action: "Payment missed — 7-day grace period", target: "USTN ...0021", type: "error" as const },
  { time: "1 d ago", actor: "CSV Export Engine", action: "September portfolio report generated", target: "PFI-2026-09.csv", type: "info" as const },
];

// ── EXTERNAL INTEGRATIONS (PFI-specific) ─────────────────────────────────────
export const PFI_INTEGRATIONS = [
  { name: "ISO 20022 Bank Settlement", status: "operational", latency: "410ms", icon: DollarSign },
  { name: "GNN Risk Engine (Sanctions)", status: "operational", latency: "180ms", icon: TrendingUp },
  { name: "Credit Scoring (A2)", status: "operational", latency: "240ms", icon: BarChart3 },
  { name: "Cargo Insurance Registry", status: "operational", latency: "150ms", icon: ShieldAlert },
  { name: "Collateral Registry", status: "operational", latency: "150ms", icon: FileCheck },
  { name: "LP Reporting Portal (CSV)", status: "operational", latency: "—", icon: Download },
];

// ── RECENT GOVERNOR DECISIONS (PFI perspective) ──────────────────────────────
export const PFI_RECENT_DECISIONS = [
  {
    gate: "G6",
    type: "Interest Payment (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Interest $4.4K received (8.5% yield, month 2 of 3). Principal $105K due at closure. On-track. PFI yield premium: +2.0% over bank rate (6.5%). Reconciliation 100%.",
    timestamp: "8 h ago",
  },
  {
    gate: "G2",
    type: "Financing Pre-Clearance (PFI, niche)",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "CONDITIONAL" as const,
    reason: "PFI bridge financing for distressed cargo. Risk 55 (medium-high). Bank declined. Collateral dropped 12%. Conditional: margin call or renegotiate. 12% yield potential. Non-custodial (FeeLock instruction).",
    timestamp: "3 h ago",
  },
  {
    gate: "G5",
    type: "Default Risk Monitoring",
    ustn: "SGTX-EG-26-DA2F-0021",
    verdict: "CONDITIONAL" as const,
    reason: "Delta Agro missed payment ($2.8K). 7-day grace period. If unpaid by Sep 25: default declared, collateral liquidated ($56K + personal guarantee), GNN risk updated. Exposure $280K at risk.",
    timestamp: "12 h ago",
  },
];

// ── §16.1.6 SIDEBAR (PFI-specific role tabs) ────────────────────────────────
export const PFI_SIDEBAR_ROLE = [
  { label: "Opportunities", icon: Inbox, desc: "Auto-RFQ + niche" },
  { label: "My Loans", icon: Banknote, desc: "Collateral + distressed" },
  { label: "Portfolio (CSV)", icon: Download, desc: "LP reporting export" },
  { label: "Companies", icon: Building2, desc: "Financed (private)" },
  { label: "Risk Appetite", icon: Target, desc: "Conservative→Aggressive" },
];
