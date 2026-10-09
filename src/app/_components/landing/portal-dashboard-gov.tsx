"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #10 — GOV (Government) — Dashboard
// Creative: Live trade flow map + risk heatmap matrix + clearance funnel + multi-agency stepper
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check,
  Globe2, CheckCircle2, Eye, Users, ShieldAlert,
  Stamp, FileCheck, BarChart3, Landmark, Clock,
  AlertTriangle, DollarSign, Activity, FileText,
  Building2, Scale, Award,
} from "lucide-react";
import {
  GOV_TENANT, GOV_INBOX, GOV_SUMMARY_CARDS, GOV_QUICK_ACTIONS,
  GOV_HEALTH_SCORE, GOV_PORTAL_FEATURES, GOV_RECENT_ACTIVITY,
  GOV_INTEGRATIONS, GOV_RECENT_DECISIONS, GOV_SIDEBAR_ROLE,
  TRADE_FLOWS, RISK_HEATMAP, CLEARANCE_FUNNEL, MULTI_AGENCY_STEPS,
  GOV_PERFORMANCE,
} from "@/lib/sgtx/landing/portal-gov-data";
import { SectionHeading } from "./sections-foundation";
import { SIDEBAR_ITEMS } from "@/lib/sgtx/landing/portal-buyer-data";

type PriorityBand = "All" | "High" | "Medium" | "Low";

const bandColor = (b: string) => b === "High" ? "border-red-500/30 bg-red-500/5" : b === "Medium" ? "border-amber-500/30 bg-amber-500/5" : "border-slate-500/30 bg-slate-500/5";
const verdictColor = (v: string) => v === "ALLOW" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : v === "CONDITIONAL" ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-rose-300 bg-rose-500/10 border-rose-500/30";
const activityColor = (t: string) => t === "success" ? "bg-emerald-400" : t === "warning" ? "bg-amber-400" : t === "error" ? "bg-rose-400" : "bg-indigo-400";
const integrationStatus = (s: string) => s === "operational" ? "text-emerald-300 bg-emerald-500/10" : s === "degraded" ? "text-amber-300 bg-amber-500/10" : "text-rose-300 bg-rose-500/10";
const flowStatusColor = (s: string) => s === "cleared" ? "#10b981" : s === "flagged" ? "#ef4444" : s === "multi-agency" ? "#8b5cf6" : "#6366f1";

export function GovPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0950");
  const [showFullDashboard, setShowFullDashboard] = useState(false);
  const filteredInbox = priorityFilter === "All" ? GOV_INBOX : GOV_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.10 · Portal #10 — GOV (Government)"
          title="Government Dashboard — Live Preview"
          subtitle="The default post-login landing surface for a Government Node (Egyptian Customs Authority / Nafeza Node, GTID SGTX-EG-26-GOV-0001, KYB Tier 4, GOV). Sovereign oversight, multi-agency, real-time compliance."
        />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-indigo-500/30"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #f59e0b)' }}>
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse</> : <><Zap className="w-3.5 h-3.5" /> Open Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: live trade flow map, risk heatmap matrix, clearance funnel, multi-agency stepper.</span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div key="gov-dash" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="rounded-2xl border border-[rgba(79,70,229,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(79,70,229,0.15)] bg-[rgba(2,6,23,0.95)]">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md" style={{ background: 'linear-gradient(135deg, #4f46e5, #f59e0b)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>S</div>
                    <span className="text-xs font-bold text-white">SGTX</span>
                  </div>
                  <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input placeholder="Search USTN, GTID, Trade, Permit, HS Code, Loom hash…" className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.12)] rounded-lg focus:outline-none focus:border-indigo-400/40" aria-label="Universal search" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-mono">GOV</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-mono">SOVEREIGN</span>
                    <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(79,70,229,0.08)]" aria-label="Notifications"><Bell className="w-4 h-4" /><span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[8px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">8</span></button>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white">{GOV_TENANT.avatarInitials}</div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex">
                  <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(79,70,229,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[2600px] overflow-y-auto">
                    <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
                    {SIDEBAR_ITEMS.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${activeTab === item.label.toLowerCase().replace(/\s/g, "-") ? "bg-indigo-500/15 text-indigo-200 border-indigo-400/30" : "text-slate-300 hover:bg-[rgba(79,70,229,0.06)] hover:text-white border-transparent"}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span>{item.badge > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">{item.badge}</span>}
                      </button>); })}
                    <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">GOV Role</p>
                    {GOV_SIDEBAR_ROLE.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(79,70,229,0.06)] hover:text-white transition-all text-left border border-transparent"><Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span></button>); })}
                    <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.1)]">
                      <p className="text-[9px] text-slate-400 truncate">{GOV_TENANT.name}</p>
                      <p className="text-[8px] font-mono text-indigo-300 truncate">{GOV_TENANT.gtid}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{GOV_TENANT.kybTier}</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono">{GOV_TENANT.role}</span>
                      </div>
                      <p className="text-[8px] text-amber-300 mt-1">{GOV_TENANT.jurisdiction}</p>
                    </div>
                  </aside>

                  {/* Main content */}
                  <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
                    <GovWelcomeBar />

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {GOV_SUMMARY_CARDS.map((c) => { const Icon = c.icon; const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus; return (
                        <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(79,70,229,0.1)] bg-[rgba(15,23,42,0.6)]">
                          <div className="flex items-center justify-between mb-1"><Icon className={`w-3.5 h-3.5 ${c.color}`} /><TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? (c.label.includes("Pending") ? "text-emerald-400" : "text-rose-400") : "text-slate-500"}`} /></div>
                          <div className="text-lg font-bold text-white">{c.value}</div><div className="text-[9px] text-slate-400">{c.label}</div><div className={`text-[8px] ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? (c.label.includes("Pending") ? "text-emerald-400" : "text-rose-400") : "text-slate-500"}`}>{c.delta}</div>
                        </div>); })}
                    </div>

                    {/* Quick actions */}
                    <div>
                      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-indigo-400" /> Quick Actions (GOV sovereign, max 8)</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {GOV_QUICK_ACTIONS.map((a) => { const Icon = a.icon; return (
                          <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(79,70,229,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(79,70,229,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                            <div className="flex items-center justify-between mb-1"><Icon className="w-4 h-4 text-indigo-300 group-hover:scale-110 transition-transform" />{a.oneClick && <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">1-CLICK</span>}</div>
                            <p className="text-[10px] font-semibold text-white leading-tight">{a.label}</p><p className="text-[8px] text-slate-500 mt-0.5">{a.specRef}</p>
                          </button>); })}
                      </div>
                    </div>

                    {/* ✦ CREATIVE 1: Live Trade Flow Map */}
                    <LiveTradeFlowMap />

                    {/* ✦ CREATIVE 2: Risk Heatmap Matrix */}
                    <RiskHeatmapMatrix />

                    {/* Smart Inbox (GOV-specific) */}
                    <GovSmartInbox filteredInbox={filteredInbox} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} expandedInbox={expandedInbox} setExpandedInbox={setExpandedInbox} />

                    {/* ✦ CREATIVE 3: Clearance Pipeline Funnel */}
                    <ClearancePipelineFunnel />

                    {/* ✦ CREATIVE 4: Multi-Agency Approval Stepper */}
                    <MultiAgencyStepper />

                    {/* Two-column: Health Score + Performance */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <GovHealthScoreCard />
                      <GovPerformanceCard />
                    </div>

                    {/* Two-column: Integrations + Activity */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <GovIntegrationsCard />
                      <GovActivityFeed />
                    </div>

                    {/* Governor Decisions */}
                    <GovDecisionsPanel />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showFullDashboard && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {GOV_PORTAL_FEATURES.map((f, i) => (
              <motion.div key={f.name} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(79,70,229,0.1)] bg-[rgba(15,23,42,0.5)]">
                <div className="flex items-center justify-between mb-1"><h4 className="text-[11px] font-semibold text-white">{f.name}</h4><span className="text-[8px] font-mono text-slate-500">{f.section}</span></div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>))}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR
// ═══════════════════════════════════════════════════════════════════════════════
function GovWelcomeBar() {
  const health = GOV_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  return (
    <div className="p-4 rounded-xl border border-[rgba(79,70,229,0.15)] bg-gradient-to-r from-indigo-950/30 to-amber-950/15 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{GOV_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-indigo-300">{GOV_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{GOV_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono">{GOV_TENANT.role}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono">{GOV_TENANT.jurisdiction}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(79,70,229,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-white">{health}</span><span className="text-[8px] text-slate-500">HEALTH</span></div>
        </div>
        <div className="hidden sm:block"><p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p><p className="text-[9px] text-slate-500">GOV sovereign (0–100)</p><p className="text-[9px] text-emerald-400 mt-1">● Excellent (99 trust)</p></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Live Trade Flow Map (SVG)
// ═══════════════════════════════════════════════════════════════════════════════
function LiveTradeFlowMap() {
  // Simplified coordinates (Egypt at center-left, destinations spread right)
  const egypt = { x: 20, y: 50 };
  const destPositions: Record<string, { x: number; y: number }> = {
    "Italy": { x: 50, y: 25 },
    "Saudi Arabia": { x: 55, y: 55 },
    "UAE": { x: 70, y: 60 },
    "Turkey": { x: 45, y: 20 },
    "China": { x: 85, y: 40 },
    "Kenya": { x: 45, y: 75 },
  };
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5 text-indigo-400" /> ✦ Live Trade Flow Monitor (Real-time routes + risk + clearance)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.10</span></h3>
      <div className="relative w-full h-56 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 90" preserveAspectRatio="xMidYMid meet">
          {/* Simplified land masses (background) */}
          <ellipse cx="20" cy="50" rx="8" ry="12" fill="rgba(79,70,229,0.06)" />
          <ellipse cx="55" cy="25" rx="10" ry="6" fill="rgba(79,70,229,0.04)" />
          <ellipse cx="75" cy="55" rx="15" ry="8" fill="rgba(79,70,229,0.04)" />
          <ellipse cx="88" cy="40" rx="6" ry="10" fill="rgba(79,70,229,0.04)" />
          {/* Egypt node */}
          <circle cx={egypt.x} cy={egypt.y} r="3" fill="#4f46e5" />
          <text x={egypt.x} y={egypt.y + 6} textAnchor="middle" fill="#818cf8" fontSize="3" fontWeight="bold">EGYPT</text>
          {/* Trade routes */}
          {TRADE_FLOWS.map((flow, i) => {
            const dest = destPositions[flow.to];
            if (!dest) return null;
            const color = flowStatusColor(flow.status);
            const midX = (egypt.x + dest.x) / 2;
            const midY = (egypt.y + dest.y) / 2 - 5;
            return (
              <g key={i}>
                {/* Route line */}
                <path d={`M ${egypt.x} ${egypt.y} Q ${midX} ${midY} ${dest.x} ${dest.y}`} fill="none" stroke={color} strokeWidth="0.4" strokeDasharray="1.5,0.8" opacity="0.6" />
                {/* Animated dot on route */}
                <circle r="0.8" fill={color}>
                  <animateMotion dur={`${3 + i}s`} repeatCount="indefinite" path={`M ${egypt.x} ${egypt.y} Q ${midX} ${midY} ${dest.x} ${dest.y}`} />
                </circle>
                {/* Destination node */}
                <circle cx={dest.x} cy={dest.y} r="2" fill={color} opacity="0.8" />
                <text x={dest.x} y={dest.y - 3} textAnchor="middle" fill="#94a3b8" fontSize="2">{flow.to.length > 5 ? flow.to.substring(0, 4) + "…" : flow.to}</text>
                {/* Risk badge */}
                <text x={dest.x} y={dest.y + 4} textAnchor="middle" fill={flow.risk >= 75 ? "#10b981" : flow.risk >= 60 ? "#f59e0b" : "#ef4444"} fontSize="1.8" fontWeight="bold">R{flow.risk}</text>
                {/* Count */}
                <text x={midX} y={midY - 1} textAnchor="middle" fill={color} fontSize="1.5" opacity="0.7">{flow.count} trades</text>
              </g>
            );
          })}
          {/* Legend */}
          <g>
            <circle cx="5" cy="85" r="1" fill="#10b981" /><text x="7" y="86" fill="#10b981" fontSize="1.8">cleared</text>
            <circle cx="20" cy="85" r="1" fill="#6366f1" /><text x="22" y="86" fill="#6366f1" fontSize="1.8">clearing</text>
            <circle cx="35" cy="85" r="1" fill="#ef4444" /><text x="37" y="86" fill="#ef4444" fontSize="1.8">flagged</text>
            <circle cx="50" cy="85" r="1" fill="#8b5cf6" /><text x="52" y="86" fill="#8b5cf6" fontSize="1.8">multi-agency</text>
          </g>
        </svg>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 mt-2">
        {TRADE_FLOWS.map((f, i) => (
          <div key={i} className="p-1.5 rounded bg-[rgba(255,255,255,0.02)] border border-[rgba(79,70,229,0.06)] text-center">
            <p className="text-[8px] text-slate-500">{f.from}→{f.to.length > 5 ? f.to.substring(0, 3) + "…" : f.to}</p>
            <p className="text-[9px] font-bold" style={{ color: flowStatusColor(f.status) }}>{f.commodity.split(" ")[0]}</p>
            <p className="text-[7px] text-slate-400">R{f.risk} · {f.count}t</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Risk Heatmap Matrix (SVG grid)
// ═══════════════════════════════════════════════════════════════════════════════
function RiskHeatmapMatrix() {
  const cellColor = (risk: number) => risk >= 85 ? "rgba(16,185,129,0.4)" : risk >= 75 ? "rgba(245,158,11,0.3)" : risk >= 65 ? "rgba(249,115,22,0.3)" : "rgba(244,63,94,0.3)";
  const textColor = (risk: number) => risk >= 75 ? "#10b981" : risk >= 65 ? "#f59e0b" : "#ef4444";
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-indigo-400" /> ✦ Risk Heatmap Matrix (Countries × Commodities)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.10 compliance monitor</span></h3>
      <div className="overflow-x-auto rounded-lg border border-[rgba(79,70,229,0.08)]">
        <table className="w-full text-[9px]">
          <thead>
            <tr className="text-slate-400">
              <th className="px-1.5 py-1 font-medium text-left">Commodity ↓ / Country →</th>
              {RISK_HEATMAP.countries.map(c => <th key={c} className="px-1.5 py-1 font-medium text-center text-[8px]">{c.length > 5 ? c.substring(0, 4) + "…" : c}</th>)}
            </tr>
          </thead>
          <tbody>
            {RISK_HEATMAP.commodities.map((com, ri) => (
              <tr key={com}>
                <td className="px-1.5 py-1 text-slate-300 text-[8px]">{com}</td>
                {RISK_HEATMAP.cells[ri].map((risk, ci) => (
                  <td key={ci} className="px-1 py-1 text-center" style={{ background: cellColor(risk) }}>
                    <span className="font-mono font-bold text-[9px]" style={{ color: textColor(risk) }}>{risk}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/40" /> Low risk (≥85)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/30" /> Medium (75-84)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500/30" /> Elevated (65-74)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500/30" /> High (&lt;65)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Clearance Pipeline Funnel (SVG)
// ═══════════════════════════════════════════════════════════════════════════════
function ClearancePipelineFunnel() {
  const maxCount = CLEARANCE_FUNNEL[0].count;
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-indigo-400" /> ✦ Clearance Pipeline Funnel (Throughput + Bottlenecks)</h3>
      <div className="space-y-1">
        {CLEARANCE_FUNNEL.map((stage, i) => {
          const widthPct = (stage.count / maxCount) * 100;
          return (
            <div key={stage.stage} className="flex items-center gap-2">
              <div className="w-24 text-[9px] text-slate-300 shrink-0">{stage.stage}</div>
              <div className="flex-1 h-6 rounded bg-slate-800/40 overflow-hidden relative">
                <motion.div className="h-full rounded flex items-center justify-end pr-2" style={{ background: `${stage.color}30`, borderLeft: `2px solid ${stage.color}` }} initial={{ width: 0 }} whileInView={{ width: `${widthPct}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08 }}>
                  <span className="text-[9px] font-bold text-white">{stage.count}</span>
                </motion.div>
              </div>
              <div className="w-12 text-[8px] text-slate-500 shrink-0 text-right">{((stage.count / maxCount) * 100).toFixed(0)}%</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[9px]">
        <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-center"><p className="text-[8px] text-slate-500">Auto-Clear Rate</p><p className="text-emerald-300 font-bold">{((CLEARANCE_FUNNEL[2].count / CLEARANCE_FUNNEL[0].count) * 100).toFixed(1)}%</p></div>
        <div className="p-1.5 rounded bg-amber-500/5 border border-amber-500/10 text-center"><p className="text-[8px] text-slate-500">Manual Review</p><p className="text-amber-300 font-bold">{CLEARANCE_FUNNEL[3].count} trades</p></div>
        <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/10 text-center"><p className="text-[8px] text-slate-500">Flagged</p><p className="text-rose-300 font-bold">{CLEARANCE_FUNNEL[4].count} trades</p></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: Multi-Agency Approval Stepper (SVG)
// ═══════════════════════════════════════════════════════════════════════════════
function MultiAgencyStepper() {
  const statusColor = (s: string) => s === "approved" ? "#10b981" : s === "pending" ? "#f59e0b" : "#64748b";
  const statusIcon = (s: string) => s === "approved" ? "✓" : s === "pending" ? "⏳" : "—";
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-indigo-400" /> ✦ Multi-Agency Approval Stepper (USTN ...0036-1)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.10</span></h3>
      <div className="flex items-center justify-between gap-1 overflow-x-auto">
        {MULTI_AGENCY_STEPS.map((step, i) => {
          const color = statusColor(step.status);
          return (
            <div key={i} className="flex flex-col items-center gap-1 shrink-0 min-w-[80px]">
              {/* Step circle */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border-2" style={{ borderColor: color, background: `${color}20`, color }}>
                {step.status === "approved" ? <Check className="w-4 h-4" /> : step.status === "pending" ? <Clock className="w-4 h-4" /> : <span className="text-[8px]">N/A</span>}
              </div>
              {/* Connector line */}
              {i < MULTI_AGENCY_STEPS.length - 1 && (
                <div className="absolute" style={{ left: `calc(${(i + 1) * 25}% - 1px)`, top: "15px", width: "25%", height: "2px" }}>
                  <div className="w-full h-full" style={{ background: step.status === "approved" ? color : "rgba(100,116,139,0.2)" }} />
                </div>
              )}
              {/* Agency label */}
              <p className="text-[8px] text-center text-slate-300 leading-tight">{step.agency}</p>
              <p className="text-[7px] text-center" style={{ color }}>{step.status.replace(/_/g, " ")}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
        <p className="text-[9px] text-amber-300">⏳ 1/4 approved (Customs). Port Authority + Trade Ministry pending. CBE not required. Auto-clearance blocked until all required agencies approve. Deadline: 2026-09-19 18:00 EET.</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX + REMAINING CARDS
// ═══════════════════════════════════════════════════════════════════════════════
function GovSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" /> Smart Inbox — GOV-Specific<span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part)</span></h3>
        <div className="flex items-center gap-1">{(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(79,70,229,0.1)] text-slate-400 hover:text-slate-200"}`}>{b}<span className="ml-0.5 text-[8px] text-slate-500">{b === "All" ? GOV_INBOX.length : GOV_INBOX.filter(i => i.band === b).length}</span></button>)}</div>
      </div>
      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredInbox.map((item: any, i: number) => { const Icon = item.icon; const expanded = expandedInbox === item.id; return (
          <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`rounded-lg border ${bandColor(item.band)} overflow-hidden`}>
            <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(79,70,229,0.04)] transition-colors">
              <div className="w-7 h-7 rounded-md bg-[rgba(79,70,229,0.1)] flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-indigo-300" /></div>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-[11px] font-semibold text-white truncate">{item.what}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${item.band === "High" ? "bg-red-500/15 text-red-300" : item.band === "Medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{item.priority}</span></div><p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p></div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>{expanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(79,70,229,0.06)]">
              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-indigo-300 font-mono mt-1">{item.ustn}</p>}</div>
                <div className="flex flex-col gap-1"><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p><button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-indigo-500 to-amber-500 hover:shadow-lg transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button></div>
              </div>
            </motion.div>)}</AnimatePresence>
          </motion.div>); })}
      </div>
    </div>
  );
}
function GovHealthScoreCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3><div className="space-y-2">{GOV_HEALTH_SCORE.components.map((c) => { const Icon = c.icon; const color = c.score >= 85 ? "#10b981" : c.score >= 70 ? "#f59e0b" : "#ef4444"; return <div key={c.name}><div className="flex items-center justify-between mb-0.5 text-[10px]"><div className="flex items-center gap-1.5"><Icon className="w-3 h-3 text-slate-400" /><span className="text-slate-300">{c.name}</span><span className="text-[8px] text-slate-500 font-mono">({c.weight}%)</span></div><span className="font-mono text-white font-bold">{c.score}</span></div><div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden"><motion.div initial={{ width: 0 }} whileInView={{ width: `${c.score}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: color }} /></div></div>; })}</div><div className="mt-3 pt-2 border-t border-[rgba(79,70,229,0.08)] flex items-center justify-between"><span className="text-[10px] text-slate-400">Composite Total</span><span className="text-lg font-black text-emerald-300">{GOV_HEALTH_SCORE.total}</span></div></div>;
}
function GovPerformanceCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Performance Dashboard <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.10)</span></h3><div className="space-y-1.5">{GOV_PERFORMANCE.metrics.map((m) => { const Icon = m.icon; return <div key={m.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]"><div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-300">{m.name}</span></div><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-white font-mono">{m.value}</span><span className="text-[8px] text-slate-500">vs {m.benchmark}</span><span className={`text-[8px] px-1 py-0.5 rounded ${m.status === "above" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{m.status === "above" ? "↑" : "↓"}</span></div></div>; })}</div><div className="mt-2 pt-2 border-t border-[rgba(79,70,229,0.08)]"><p className="text-[10px] text-emerald-300 font-semibold">● {GOV_PERFORMANCE.trend}</p><p className="text-[9px] text-slate-400 mt-0.5">{GOV_PERFORMANCE.percentile}</p></div></div>;
}
function GovIntegrationsCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations <span className="text-[9px] text-slate-500 font-normal">(connector health)</span></h3><div className="space-y-1.5">{GOV_INTEGRATIONS.map((int) => { const Icon = int.icon; return <div key={int.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]"><div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-200">{int.name}</span></div><div className="flex items-center gap-2"><span className="text-[9px] font-mono text-slate-500">{int.latency}</span><span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${integrationStatus(int.status)}`}>● {int.status}</span></div></div>; })}</div></div>;
}
function GovActivityFeed() {
  return <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time)</span></h3><div className="space-y-2 max-h-60 overflow-y-auto">{GOV_RECENT_ACTIVITY.map((e, i) => (<div key={i} className="flex items-start gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} /><div className="flex-1 min-w-0"><p className="text-[10px] text-slate-300 leading-relaxed"><span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-indigo-300 text-[9px]">{e.target}</span></p><p className="text-[8px] text-slate-500">{e.time}</p></div></div>))}</div></div>;
}
function GovDecisionsPanel() {
  return <div className="p-3.5 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(§3.5.8)</span></h3><div className="space-y-2">{GOV_RECENT_DECISIONS.map((d, i) => (<div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(79,70,229,0.06)]"><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-1.5"><span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span><span className="text-[10px] text-slate-200">{d.type}</span></div><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span></div><p className="text-[9px] text-indigo-300 font-mono mb-1">{d.ustn}</p><p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p><p className="text-[8px] text-slate-500 mt-1">{d.timestamp}</p></div>))}</div></div>;
}
