"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #9 — FIN (PFI — Private Financier) — Dashboard
// Creative: Risk-Return Scatter Plot + Yield Ladder + Risk Appetite Gauge + CSV Export Preview
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check, Download,
  Inbox, DollarSign, Banknote, Wallet, Percent,
  AlertTriangle, CheckCircle2, ShieldAlert, Sparkles,
  BarChart3, Building2, Target, Clock, FileCheck,
  Scale, Users, Award, FileText, Eye,
} from "lucide-react";
import {
  PFI_TENANT, PFI_INBOX, PFI_SUMMARY_CARDS, PFI_QUICK_ACTIONS,
  PFI_HEALTH_SCORE, PFI_ACTIVE_FINANCING, PFI_OPPORTUNITIES,
  PFI_FINANCED_COMPANIES, PFI_PORTFOLIO, PFI_PERFORMANCE,
  PFI_PORTAL_FEATURES, PFI_RECENT_ACTIVITY, PFI_INTEGRATIONS,
  PFI_RECENT_DECISIONS, PFI_SIDEBAR_ROLE, RISK_RETURN_SCATTER,
} from "@/lib/sgtx/landing/portal-pfi-data";
import { SectionHeading } from "./sections-foundation";
import { SIDEBAR_ITEMS } from "@/lib/sgtx/landing/portal-buyer-data";

type PriorityBand = "All" | "High" | "Medium" | "Low";

const bandColor = (band: string) => {
  if (band === "High") return "border-red-500/30 bg-red-500/5";
  if (band === "Medium") return "border-amber-500/30 bg-amber-500/5";
  return "border-slate-500/30 bg-slate-500/5";
};

const verdictColor = (v: string) => {
  if (v === "ALLOW") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
  if (v === "CONDITIONAL") return "text-amber-300 bg-amber-500/10 border-amber-500/30";
  return "text-rose-300 bg-rose-500/10 border-rose-500/30";
};

const activityColor = (t: string) => {
  if (t === "success") return "bg-emerald-400";
  if (t === "warning") return "bg-amber-400";
  if (t === "error") return "bg-rose-400";
  return "bg-amber-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

const loanStatusColor = (s: string) => {
  if (s === "active") return "bg-emerald-500/15 text-emerald-300";
  if (s === "distressed") return "bg-rose-500/15 text-rose-300";
  if (s === "repayment_due") return "bg-blue-500/15 text-blue-300";
  if (s === "default_risk") return "bg-red-500/15 text-red-300";
  if (s === "co_financed") return "bg-purple-500/15 text-purple-300";
  if (s === "closing") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-500/15 text-slate-400";
};

const companyStatusColor = (s: string) => {
  if (s === "preferred") return "bg-emerald-500/15 text-emerald-300";
  if (s === "active") return "bg-blue-500/15 text-blue-300";
  if (s === "closing") return "bg-amber-500/15 text-amber-300";
  if (s === "at_risk") return "bg-rose-500/15 text-rose-300";
  return "bg-slate-500/15 text-slate-400";
};

export function PfiPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0951");
  const [showFullDashboard, setShowFullDashboard] = useState(false);
  const [showCsvPreview, setShowCsvPreview] = useState(false);

  const filteredInbox = priorityFilter === "All" ? PFI_INBOX : PFI_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.9 · Portal #9 — FIN (PFI — Private Financier)"
          title="PFI Dashboard — Live Preview"
          subtitle="The default post-login landing surface for a Private Financier (Nile Capital Partners, GTID SGTX-EG-26-NC7P-0011, KYB Tier 4, FIN/PRIVATE). Niche specialization, higher yield, CSV export."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-amber-500/30"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #f43f5e)' }}>
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Creative: Risk-return scatter plot, yield ladder, risk appetite gauge, CSV export preview. Niche: distressed cargo, high-risk borrowers.
          </span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div key="pfi-dash" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="rounded-2xl border border-[rgba(245,158,11,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(245,158,11,0.15)] bg-[rgba(2,6,23,0.95)]">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md" style={{ background: 'linear-gradient(135deg, #f59e0b, #f43f5e)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>S</div>
                    <span className="text-xs font-bold text-white">SGTX</span>
                  </div>
                  <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input placeholder="Search USTN, GTID, Bid, Loan, Borrower, Loom hash…" className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.12)] rounded-lg focus:outline-none focus:border-amber-400/40" aria-label="Universal search" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono">FIN</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-mono">PRIVATE</span>
                    <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(245,158,11,0.08)]" aria-label="Notifications"><Bell className="w-4 h-4" /><span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">6</span></button>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-[10px] font-bold text-white">{PFI_TENANT.avatarInitials}</div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex">
                  {/* Sidebar */}
                  <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(245,158,11,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[2400px] overflow-y-auto">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
                    {SIDEBAR_ITEMS.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${activeTab === item.label.toLowerCase().replace(/\s/g, "-") ? "bg-amber-500/15 text-amber-200 border-amber-400/30" : "text-slate-300 hover:bg-[rgba(245,158,11,0.06)] hover:text-white border-transparent"}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span>{item.badge > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">{item.badge}</span>}
                      </button>); })}
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">PFI Role</p>
                    {PFI_SIDEBAR_ROLE.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(245,158,11,0.06)] hover:text-white transition-all text-left border border-transparent"><Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span></button>); })}
                    <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.1)]">
                      <p className="text-[9px] text-slate-400 truncate">{PFI_TENANT.name}</p>
                      <p className="text-[10px] font-mono text-amber-300 truncate">{PFI_TENANT.gtid}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{PFI_TENANT.kybTier}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono">{PFI_TENANT.role}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 flex-wrap"><span className="text-rose-300">Aggressive</span><span>·</span><span>Trust {PFI_TENANT.trustScore}</span></div>
                    </div>
                  </aside>

                  {/* Main content */}
                  <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
                    <PfiWelcomeBar />

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {PFI_SUMMARY_CARDS.map((c) => { const Icon = c.icon; const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus; return (
                        <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(245,158,11,0.1)] bg-[rgba(15,23,42,0.6)]">
                          <div className="flex items-center justify-between mb-1"><Icon className={`w-3.5 h-3.5 ${c.color}`} /><TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? (c.label.includes("Default") ? "text-rose-400" : "text-emerald-400") : "text-slate-500"}`} /></div>
                          <div className="text-lg font-bold text-white">{c.value}</div><div className="text-[9px] text-slate-400">{c.label}</div><div className={`text-[10px] ${c.trend === "up" ? "text-emerald-400" : "text-rose-400"}`}>{c.delta}</div>
                        </div>); })}
                    </div>

                    {/* Quick actions */}
                    <div>
                      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /> Quick Actions (PFI role aware, max 8)</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {PFI_QUICK_ACTIONS.map((a) => { const Icon = a.icon; return (
                          <button key={a.key} onClick={() => a.key === "portfolio" && setShowCsvPreview(!showCsvPreview)} className="p-2.5 rounded-lg border border-[rgba(245,158,11,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(245,158,11,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                            <div className="flex items-center justify-between mb-1"><Icon className="w-4 h-4 text-amber-300 group-hover:scale-110 transition-transform" />{a.oneClick && <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">1-CLICK</span>}</div>
                            <p className="text-[10px] font-semibold text-white leading-tight">{a.label}</p><p className="text-[10px] text-slate-500 mt-0.5">{a.specRef}</p>
                          </button>); })}
                      </div>
                    </div>

                    {/* ✦ CREATIVE: Risk-Return Scatter Plot + Risk Appetite Gauge */}
                    <RiskReturnScatterPlot />
                    <RiskAppetiteGauge />

                    {/* Smart Inbox (PFI-specific) */}
                    <PfiSmartInbox filteredInbox={filteredInbox} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} expandedInbox={expandedInbox} setExpandedInbox={setExpandedInbox} />

                    {/* Financing Opportunities (niche + auto-RFQ) */}
                    <PfiOpportunitiesPanel />

                    {/* ✦ CREATIVE: Yield Ladder */}
                    <YieldLadderCard />

                    {/* ✦ CREATIVE: CSV Export Preview */}
                    {showCsvPreview && <CsvExportPreview />}

                    {/* Active Financing table */}
                    <PfiActiveFinancingTable />

                    {/* Two-column: Financed Companies + Portfolio */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <PfiFinancedCompaniesCard />
                      <PfiPortfolioCard setShowCsvPreview={setShowCsvPreview} />
                    </div>

                    {/* Two-column: Health Score + Performance */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <PfiHealthScoreCard />
                      <PfiPerformanceCard />
                    </div>

                    {/* Two-column: Integrations + Activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <PfiIntegrationsCard />
                      <PfiActivityFeed />
                    </div>

                    {/* Governor Decisions */}
                    <PfiDecisionsPanel />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showFullDashboard && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PFI_PORTAL_FEATURES.map((f, i) => (
              <motion.div key={f.name} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(245,158,11,0.1)] bg-[rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between mb-1"><h4 className="text-[11px] font-semibold text-white">{f.name}</h4><span className="text-[10px] font-mono text-slate-500">{f.section}</span></div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>))}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function PfiWelcomeBar() {
  const health = PFI_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : "#f59e0b";
  return (
    <div className="p-4 rounded-xl border border-[rgba(245,158,11,0.15)] bg-gradient-to-r from-amber-950/30 to-rose-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{PFI_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-amber-300">{PFI_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{PFI_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono">{PFI_TENANT.role}/{PFI_TENANT.subType}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-mono">{PFI_TENANT.riskAppetite}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(245,158,11,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-white">{health}</span><span className="text-[10px] text-slate-500">HEALTH</span></div>
        </div>
        <div className="hidden sm:block"><p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p><p className="text-[9px] text-slate-500">PFI composite (0–100)</p><p className="text-[9px] text-amber-400 mt-1">● Good (88 trust, aggressive)</p></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Risk-Return Scatter Plot (SVG 2D matrix)
// ═══════════════════════════════════════════════════════════════════════════════
function RiskReturnScatterPlot() {
  const minRisk = 40; const maxRisk = 90; const minYield = 6; const maxYield = 14;
  const riskRange = maxRisk - minRisk; const yieldRange = maxYield - minYield;
  const statusColor = (s: string) => s === "active" ? "#10b981" : s === "distressed" ? "#ef4444" : s === "default_risk" ? "#dc2626" : s === "co_financed" ? "#8b5cf6" : s === "repayment_due" ? "#3b82f6" : s === "closing" ? "#f59e0b" : "#64748b";
  const maxAmount = Math.max(...RISK_RETURN_SCATTER.map(p => p.amount));

  return (
    <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" /> ✦ Risk-Return Scatter Plot (Portfolio Positioning)<span className="text-[9px] text-slate-500 font-normal ml-1">X=risk, Y=yield, size=amount</span></h3>
      <div className="relative w-full h-48 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(pct => <line key={`v${pct}`} x1={pct} y1="0" x2={pct} y2="55" stroke="rgba(148,163,184,0.06)" strokeWidth="0.2" />)}
          {[0, 14, 28, 42, 55].map(pct => <line key={`h${pct}`} x1="0" y1={pct} x2="100" y2={pct} stroke="rgba(148,163,184,0.06)" strokeWidth="0.2" />)}
          {/* Risk zones */}
          <rect x="0" y="0" width="33" height="55" fill="rgba(16,185,129,0.04)" />
          <rect x="33" y="0" width="33" height="55" fill="rgba(245,158,11,0.04)" />
          <rect x="66" y="0" width="34" height="55" fill="rgba(244,63,94,0.04)" />
          <text x="16" y="3" textAnchor="middle" fill="#10b981" fontSize="2" opacity="0.6">Low Risk</text>
          <text x="50" y="3" textAnchor="middle" fill="#f59e0b" fontSize="2" opacity="0.6">Medium</text>
          <text x="83" y="3" textAnchor="middle" fill="#f43f5e" fontSize="2" opacity="0.6">High Risk</text>
          {/* Scatter points */}
          {RISK_RETURN_SCATTER.map((p, i) => {
            const x = ((p.riskScore - minRisk) / riskRange) * 100;
            const y = 55 - ((p.yield - minYield) / yieldRange) * 50;
            const r = 1.5 + (p.amount / maxAmount) * 2.5;
            const color = statusColor(p.status);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={r} fill={color} opacity="0.8" stroke={color} strokeWidth="0.3" />
                <text x={x} y={y - r - 1} textAnchor="middle" fill="#94a3b8" fontSize="1.8">{p.borrower.split(" ")[0]}</text>
              </g>
            );
          })}
          {/* Axis labels */}
          <text x="50" y="59" textAnchor="middle" fill="#64748b" fontSize="2.5">Risk Score →</text>
          <text x="2" y="28" textAnchor="middle" fill="#64748b" fontSize="2.5" transform="rotate(-90 2 28)">Yield %</text>
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        {["active", "distressed", "default_risk", "co_financed", "repayment_due", "closing"].map(s => (
          <span key={s} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: statusColor(s) }} /> {s.replace(/_/g, " ")}</span>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Risk Appetite Gauge (circular)
// ═══════════════════════════════════════════════════════════════════════════════
function RiskAppetiteGauge() {
  // Portfolio avg risk score = 72 → position on conservative(40)→aggressive(90) scale
  const avgRisk = Math.round(RISK_RETURN_SCATTER.reduce((a, p) => a + p.riskScore, 0) / RISK_RETURN_SCATTER.length);
  const appetitePct = ((avgRisk - 40) / 50) * 100; // 40=conservative, 90=aggressive
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (appetitePct / 100) * circumference * 0.75; // 270° arc
  const appetiteLabel = avgRisk >= 80 ? "Aggressive" : avgRisk >= 65 ? "Moderate-Aggressive" : avgRisk >= 50 ? "Moderate" : "Conservative";
  const appetiteColor = avgRisk >= 75 ? "#f43f5e" : avgRisk >= 60 ? "#f59e0b" : "#10b981";

  return (
    <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Target className="w-3.5 h-3.5 text-amber-400" /> ✦ Risk Appetite Gauge (Portfolio Positioning)</h3>
      <div className="flex items-center gap-4">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24" viewBox="0 0 80 80">
            {/* Background arc (270°) */}
            <path d="M 20 60 A 36 36 0 1 1 60 60" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="6" strokeLinecap="round" />
            {/* Appetite arc */}
            <path d="M 20 60 A 36 36 0 1 1 60 60" fill="none" stroke={appetiteColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference * 0.75} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease, stroke 0.3s" }} />
            {/* Tick marks */}
            <text x="20" y="68" fill="#10b981" fontSize="3" textAnchor="middle">Cons</text>
            <text x="40" y="10" fill="#f59e0b" fontSize="3" textAnchor="middle">Mod</text>
            <text x="60" y="68" fill="#f43f5e" fontSize="3" textAnchor="middle">Aggr</text>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
            <span className="text-lg font-bold" style={{ color: appetiteColor }}>{avgRisk}</span>
            <span className="text-[10px] text-slate-500">AVG RISK</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-slate-400">Current Appetite</p>
          <p className="text-sm font-bold" style={{ color: appetiteColor }}>{appetiteLabel}</p>
          <div className="mt-2 space-y-1 text-[9px]">
            <div className="flex justify-between"><span className="text-slate-500">Portfolio avg risk</span><span className="font-mono text-white">{avgRisk}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Highest risk loan</span><span className="font-mono text-rose-300">{Math.min(...RISK_RETURN_SCATTER.map(p => p.riskScore))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Lowest risk loan</span><span className="font-mono text-emerald-300">{Math.max(...RISK_RETURN_SCATTER.map(p => p.riskScore))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Niche trades</span><span className="font-mono text-amber-300">{PFI_PORTFOLIO.nicheTrades}</span></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 italic">PFI premium: +1.9% yield over bank avg (8.4% vs 6.5%)</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX (PFI-specific)
// ═══════════════════════════════════════════════════════════════════════════════
function PfiSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" /> Smart Inbox — PFI-Specific Items<span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part)</span></h3>
        <div className="flex items-center gap-1">{(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-amber-500/20 border-amber-400/40 text-amber-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(245,158,11,0.1)] text-slate-400 hover:text-slate-200"}`}>{b}<span className="ml-0.5 text-[10px] text-slate-500">{b === "All" ? PFI_INBOX.length : PFI_INBOX.filter(i => i.band === b).length}</span></button>)}</div>
      </div>
      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredInbox.map((item: any, i: number) => { const Icon = item.icon; const expanded = expandedInbox === item.id; return (
          <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`rounded-lg border ${bandColor(item.band)} overflow-hidden`}>
            <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(245,158,11,0.04)] transition-colors">
              <div className="w-7 h-7 rounded-md bg-[rgba(245,158,11,0.1)] flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-amber-300" /></div>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-[11px] font-semibold text-white truncate">{item.what}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${item.band === "High" ? "bg-red-500/15 text-red-300" : item.band === "Medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{item.priority}</span></div><p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p></div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>{expanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(245,158,11,0.06)]">
              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-amber-300 font-mono mt-1">{item.ustn}</p>}</div>
                <div className="flex flex-col gap-1"><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p><button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-amber-500 to-rose-500 hover:shadow-lg hover:shadow-amber-500/30 transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button><div className="flex gap-1 mt-0.5"><button className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Snooze 2h</button><button className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Dismiss</button></div></div>
              </div>
            </motion.div>)}</AnimatePresence>
          </motion.div>); })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCING OPPORTUNITIES (niche + auto-RFQ)
// ═══════════════════════════════════════════════════════════════════════════════
function PfiOpportunitiesPanel() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5 text-amber-400" /> Financing Opportunities — Auto-RFQ + Niche (Bank-Declined)<span className="text-[9px] text-slate-500 font-normal ml-1">(§16.8.6.9)</span></h3>
      <div className="space-y-2">
        {PFI_OPPORTUNITIES.map((o, i) => (
          <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className={`p-3 rounded-lg border ${o.isNiche ? "border-rose-500/20 bg-rose-950/5" : "border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.5)]"}`}>
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500">{o.id}</span>
                  {o.isNiche && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-bold border border-rose-500/20">✦ NICHE</span>}
                  {o.bankDeclined && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 font-medium">Bank Declined</span>}
                  <span className="text-[11px] font-semibold text-white">{o.borrower}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${o.riskScore >= 75 ? "bg-emerald-500/15 text-emerald-300" : o.riskScore >= 60 ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"}`}>Risk {o.riskScore}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{o.amount} · {o.facility}</p>
                {o.isNiche && o.nicheReason && <p className="text-[9px] text-rose-300 mt-1">✦ {o.nicheReason}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30 transition-all">Submit Bid</button>
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-slate-500/20 border border-slate-400/30 text-slate-200 hover:bg-slate-500/30 transition-all">Decline</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Term</p><p className="text-slate-300">{o.term}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Yield Potential</p><p className="text-emerald-300 font-mono font-bold">{o.yieldPotential}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Collateral</p><p className="text-slate-300 text-[9px]">{o.collateral}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Deadline</p><p className="text-amber-300 font-mono text-[9px]">{o.deadline}</p></div>
            </div>
            <div className="mt-2 pt-2 border-t border-[rgba(245,158,11,0.06)]"><p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Full Disclosure</p><p className="text-[9px] text-slate-400 leading-relaxed">{o.disclosure}</p></div>
          </motion.div>))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Yield Ladder (SVG bar ranking)
// ═══════════════════════════════════════════════════════════════════════════════
function YieldLadderCard() {
  const sorted = [...PFI_ACTIVE_FINANCING].sort((a, b) => b.yield - a.yield);
  const maxYield = Math.max(...sorted.map(l => l.yield));
  const riskColor = (r: number) => r >= 75 ? "#10b981" : r >= 60 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-amber-400" /> ✦ Yield Ladder (Loans Ranked by Yield, color = risk)<span className="text-[9px] text-slate-500 font-normal ml-1">PFI yield spectrum</span></h3>
      <div className="space-y-1.5">
        {sorted.map((loan, i) => {
          const widthPct = (loan.yield / maxYield) * 100;
          const color = riskColor(loan.riskScore);
          return (
            <div key={loan.ustn} className="flex items-center gap-2">
              <div className="w-16 text-[9px] text-slate-400 truncate shrink-0">{loan.borrower.split(" ")[0]}</div>
              <div className="flex-1 h-5 rounded bg-slate-800/50 overflow-hidden relative">
                <motion.div className="h-full rounded flex items-center justify-end pr-1.5" style={{ background: `${color}40`, borderLeft: `2px solid ${color}` }} initial={{ width: 0 }} whileInView={{ width: `${widthPct}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.05 }}>
                  <span className="text-[9px] font-bold text-white">{loan.yield.toFixed(1)}%</span>
                </motion.div>
              </div>
              <div className="w-12 text-[10px] text-slate-500 shrink-0 text-right">R{loan.riskScore}</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Low risk (≥75)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> Medium (60–74)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> High risk (&lt;60)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: CSV Export Preview (interactive)
// ═══════════════════════════════════════════════════════════════════════════════
function CsvExportPreview() {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Download className="w-3.5 h-3.5 text-emerald-400" /> ✦ CSV Export Preview (LP Reporting)<span className="text-[9px] text-slate-500 font-normal ml-1">{PFI_PORTFOLIO.csvPreview.length - 1} loans · auto-generated</span></h3>
      <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-lg border border-[rgba(16,185,129,0.1)]">
        <table className="w-full text-[9px] font-mono">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)]"><tr className="text-left text-slate-400">{PFI_PORTFOLIO.csvPreview[0].split(",").map((h, i) => <th key={i} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {PFI_PORTFOLIO.csvPreview.slice(1).map((row, i) => (
              <tr key={i} className="border-t border-[rgba(16,185,129,0.06)] hover:bg-[rgba(16,185,129,0.04)]">{row.split(",").map((cell, j) => <td key={j} className="px-2 py-1 text-slate-300">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[9px] text-slate-500">{PFI_PORTFOLIO.csvPreview.length - 1} rows · CSV format · ready for LP portal</p>
        <button className="flex items-center gap-1 px-3 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-lg transition-all"><Download className="w-3 h-3" /> Download CSV</button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE FINANCING TABLE
// ═══════════════════════════════════════════════════════════════════════════════
function PfiActiveFinancingTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2">Active Financing — PFI-Filtered</h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(245,158,11,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur"><tr className="text-left text-slate-400"><th className="px-2.5 py-1.5 font-medium">USTN</th><th className="px-2.5 py-1.5 font-medium">Borrower</th><th className="px-2.5 py-1.5 font-medium">Yield</th><th className="px-2.5 py-1.5 font-medium">Exposure</th><th className="px-2.5 py-1.5 font-medium">Risk</th><th className="px-2.5 py-1.5 font-medium">Status</th><th className="px-2.5 py-1.5 font-medium">Health</th></tr></thead>
          <tbody>{PFI_ACTIVE_FINANCING.map((t) => (<tr key={t.ustn} className="border-t border-[rgba(245,158,11,0.06)] hover:bg-[rgba(245,158,11,0.04)] cursor-pointer">
            <td className="px-2.5 py-1.5 font-mono text-amber-300 text-[9px]">{t.ustn}</td><td className="px-2.5 py-1.5 text-slate-200 text-[9px]">{t.borrower}</td>
            <td className="px-2.5 py-1.5 text-emerald-300 font-mono font-bold text-[9px]">{t.yield.toFixed(1)}%</td><td className="px-2.5 py-1.5 text-amber-300 font-mono text-[9px]">{t.exposure}</td>
            <td className="px-2.5 py-1.5"><span className={`text-[9px] font-mono font-bold ${t.riskScore >= 75 ? "text-emerald-300" : t.riskScore >= 60 ? "text-amber-300" : "text-rose-300"}`}>{t.riskScore}</span></td>
            <td className="px-2.5 py-1.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${loanStatusColor(t.status)}`}>{t.status.replace(/_/g, " ")}</span></td>
            <td className="px-2.5 py-1.5">{t.health > 0 ? <div className="flex items-center gap-1.5"><div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.health}%`, background: t.health >= 85 ? "#10b981" : t.health >= 65 ? "#f59e0b" : "#ef4444" }} /></div><span className="text-[9px] text-slate-400 font-mono">{t.health}</span></div> : <span className="text-[9px] text-slate-600">—</span>}</td>
          </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCED COMPANIES + PORTFOLIO
// ═══════════════════════════════════════════════════════════════════════════════
function PfiFinancedCompaniesCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-amber-400" /> Financed Companies (private, audit-traced)</h3>
      <div className="space-y-1.5">{PFI_FINANCED_COMPANIES.map((c) => (
        <div key={c.gtid} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(245,158,11,0.06)]">
          <div className="flex items-center justify-between mb-1"><div><p className="text-[10px] font-semibold text-white">{c.name}</p><p className="text-[10px] font-mono text-amber-300">{c.gtid}</p></div><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${companyStatusColor(c.status)}`}>{c.status.replace(/_/g, " ")}</span></div>
          <div className="grid grid-cols-3 gap-2 text-[9px]"><div><p className="text-[10px] text-slate-500">Exposure</p><p className="text-amber-300 font-mono">{c.totalExposure}</p></div><div><p className="text-[10px] text-slate-500">Yield Avg</p><p className="text-emerald-300 font-mono">{c.yieldAvg}</p></div><div><p className="text-[10px] text-slate-500">Trust</p><p className="text-white font-mono">{c.trustScore}</p></div></div>
          {c.nicheTrades > 0 && <p className="text-[10px] text-rose-300 mt-1">✦ {c.nicheTrades} niche trade(s)</p>}
        </div>))}
      </div>
    </div>
  );
}

function PfiPortfolioCard({ setShowCsvPreview }: any) {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-amber-400" /> Portfolio (Simplified + CSV Export)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.9</span></h3>
      <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10"><p className="text-[10px] text-slate-500 uppercase">Exposure</p><p className="text-amber-300 font-bold font-mono">{PFI_PORTFOLIO.totalExposure}</p></div>
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10"><p className="text-[10px] text-slate-500 uppercase">Avg Yield</p><p className="text-emerald-300 font-bold font-mono">{PFI_PORTFOLIO.avgYield}</p></div>
        <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10"><p className="text-[10px] text-slate-500 uppercase">Default Rate</p><p className="text-rose-300 font-mono">{PFI_PORTFOLIO.defaultRate}</p></div>
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10"><p className="text-[10px] text-slate-500 uppercase">Collateral</p><p className="text-amber-300 font-mono">{PFI_PORTFOLIO.collateralCoverage}</p></div>
      </div>
      <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 mb-3"><p className="text-[10px] text-slate-500 uppercase">Niche Trades</p><p className="text-rose-300 font-mono">{PFI_PORTFOLIO.nicheTrades} (distressed + high-risk)</p></div>
      <button onClick={() => setShowCsvPreview(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-lg transition-all"><Download className="w-3 h-3" /> Preview / Export CSV</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH + PERFORMANCE + INTEGRATIONS + ACTIVITY + DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════
function PfiHealthScoreCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3><div className="space-y-2">{PFI_HEALTH_SCORE.components.map((c) => { const Icon = c.icon; const color = c.score >= 85 ? "#10b981" : c.score >= 70 ? "#f59e0b" : "#ef4444"; return <div key={c.name}><div className="flex items-center justify-between mb-0.5 text-[10px]"><div className="flex items-center gap-1.5"><Icon className="w-3 h-3 text-slate-400" /><span className="text-slate-300">{c.name}</span><span className="text-[10px] text-slate-500 font-mono">({c.weight}%)</span></div><span className="font-mono text-white font-bold">{c.score}</span></div><div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden"><motion.div initial={{ width: 0 }} whileInView={{ width: `${c.score}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: color }} /></div></div>; })}</div><div className="mt-3 pt-2 border-t border-[rgba(245,158,11,0.08)] flex items-center justify-between"><span className="text-[10px] text-slate-400">Composite Total</span><span className="text-lg font-black text-amber-300">{PFI_HEALTH_SCORE.total}</span></div></div>;
}
function PfiPerformanceCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Performance Dashboard <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.9)</span></h3><div className="space-y-1.5">{PFI_PERFORMANCE.metrics.map((m) => { const Icon = m.icon; return <div key={m.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]"><div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-300">{m.name}</span></div><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-white font-mono">{m.value}</span><span className="text-[10px] text-slate-500">vs {m.benchmark}</span><span className={`text-[10px] px-1 py-0.5 rounded ${m.status === "above" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{m.status === "above" ? "↑" : "↓"}</span></div></div>; })}</div><div className="mt-2 pt-2 border-t border-[rgba(245,158,11,0.08)]"><p className="text-[10px] text-amber-300 font-semibold">● {PFI_PERFORMANCE.trend}</p><p className="text-[9px] text-slate-400 mt-0.5">{PFI_PERFORMANCE.percentile}</p></div></div>;
}
function PfiIntegrationsCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations</h3><div className="space-y-1.5">{PFI_INTEGRATIONS.map((int) => { const Icon = int.icon; return <div key={int.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]"><div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-200">{int.name}</span></div><div className="flex items-center gap-2"><span className="text-[9px] font-mono text-slate-500">{int.latency}</span><span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${integrationStatus(int.status)}`}>● {int.status}</span></div></div>; })}</div></div>;
}
function PfiActivityFeed() {
  return <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time)</span></h3><div className="space-y-2 max-h-60 overflow-y-auto">{PFI_RECENT_ACTIVITY.map((e, i) => (<div key={i} className="flex items-start gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} /><div className="flex-1 min-w-0"><p className="text-[10px] text-slate-300 leading-relaxed"><span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-amber-300 text-[9px]">{e.target}</span></p><p className="text-[10px] text-slate-500">{e.time}</p></div></div>))}</div></div>;
}
function PfiDecisionsPanel() {
  return <div className="p-3.5 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(§3.5.8)</span></h3><div className="space-y-2">{PFI_RECENT_DECISIONS.map((d, i) => (<div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(245,158,11,0.06)]"><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-1.5"><span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span><span className="text-[10px] text-slate-200">{d.type}</span></div><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span></div><p className="text-[9px] text-amber-300 font-mono mb-1">{d.ustn}</p><p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p><p className="text-[10px] text-slate-500 mt-1">{d.timestamp}</p></div>))}</div></div>;
}
