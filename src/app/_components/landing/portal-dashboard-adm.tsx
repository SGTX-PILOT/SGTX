"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #11 — Admin (Platform Governance Authority) — Dashboard
// Creative: Platform health mission control + governor timeline + jurisdiction matrix + multisig queue
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check,
  Server, Scale, FileText, Globe2, KeyRound,
  Eye, Building2, GitBranch, MessageSquare,
  AlertTriangle, CheckCircle2, ShieldAlert, Clock,
  DollarSign, BarChart3, Cpu, Database, Activity,
  FileCheck, Users, Settings, Layers,
} from "lucide-react";
import {
  ADM_TENANT, ADM_INBOX, ADM_SUMMARY_CARDS, ADM_QUICK_ACTIONS,
  ADM_HEALTH_SCORE, ADM_PORTAL_FEATURES, ADM_RECENT_ACTIVITY,
  ADM_INTEGRATIONS, ADM_RECENT_DECISIONS, ADM_SIDEBAR_ROLE,
  PLATFORM_HEALTH_METRICS, GOVERNOR_TIMELINE, MULTISIG_QUEUE,
} from "@/lib/sgtx/landing/portal-adm-data";
import { SectionHeading } from "./sections-foundation";
import { SIDEBAR_ITEMS } from "@/lib/sgtx/landing/portal-buyer-data";

type PriorityBand = "All" | "High" | "Medium" | "Low";
const bandColor = (b: string) => b === "High" ? "border-red-500/30 bg-red-500/5" : b === "Medium" ? "border-amber-500/30 bg-amber-500/5" : "border-slate-500/30 bg-slate-500/5";
const verdictColor = (v: string) => v === "ALLOW" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : v === "CONDITIONAL" ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-rose-300 bg-rose-500/10 border-rose-500/30";
const activityColor = (t: string) => t === "success" ? "bg-emerald-400" : t === "warning" ? "bg-amber-400" : t === "error" ? "bg-rose-400" : "bg-purple-400";
const integrationStatus = (s: string) => s === "operational" ? "text-emerald-300 bg-emerald-500/10" : s === "degraded" ? "text-amber-300 bg-amber-500/10" : "text-rose-300 bg-rose-500/10";
const healthColor = (v: number) => v >= 99 ? "#10b981" : v >= 90 ? "#f59e0b" : "#ef4444";

export function AdmPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0953");
  const [showFullDashboard, setShowFullDashboard] = useState(false);
  const filteredInbox = priorityFilter === "All" ? ADM_INBOX : ADM_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading kicker="§16.8.6.11 · Portal #11 — Admin (Platform Governance Authority)" title="Admin Dashboard — Live Preview"
          subtitle="The default post-login landing surface for Platform Governance Authority (GTID SGTX-EG-26-ADM-0001, KYB T4, ADM). Multisig 3-of-5. Sovereign oversight of the entire platform." />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullDashboard(!showFullDashboard)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-purple-500/30" style={{ background: 'linear-gradient(135deg, #7c3aed, #94a3b8)' }}>
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse</> : <><Zap className="w-3.5 h-3.5" /> Open Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: platform health mission control, governor timeline, jurisdiction matrix, multisig queue.</span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div key="adm-dash" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(124,58,237,0.15)] bg-[rgba(2,6,23,0.95)]">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md" style={{ background: 'linear-gradient(135deg, #7c3aed, #94a3b8)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>S</div>
                    <span className="text-xs font-bold text-white">SGTX</span>
                  </div>
                  <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input placeholder="Search USTN, GTID, Multisig ID, Governor decision, Config hash…" className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.12)] rounded-lg focus:outline-none focus:border-purple-400/40" aria-label="Universal search" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-mono">ADM</span>
                    <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-400/15 text-slate-300 font-mono">3-of-5</span>
                    <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(124,58,237,0.08)]" aria-label="Notifications"><Bell className="w-4 h-4" /><span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[8px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">5</span></button>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-slate-400 flex items-center justify-center text-[10px] font-bold text-white">{ADM_TENANT.avatarInitials}</div>
                  </div>
                </div>

                {/* Body */}
                <div className="flex">
                  <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(124,58,237,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[2800px] overflow-y-auto">
                    <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
                    {SIDEBAR_ITEMS.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${activeTab === item.label.toLowerCase().replace(/\s/g, "-") ? "bg-purple-500/15 text-purple-200 border-purple-400/30" : "text-slate-300 hover:bg-[rgba(124,58,237,0.06)] hover:text-white border-transparent"}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span>{item.badge > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">{item.badge}</span>}
                      </button>); })}
                    <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">Admin Role</p>
                    {ADM_SIDEBAR_ROLE.map((item: any) => { const Icon = item.icon; return (
                      <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(124,58,237,0.06)] hover:text-white transition-all text-left border border-transparent"><Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate">{item.label}</span></button>); })}
                    <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.1)]">
                      <p className="text-[9px] text-slate-400 truncate">{ADM_TENANT.name}</p>
                      <p className="text-[8px] font-mono text-purple-300 truncate">{ADM_TENANT.gtid}</p>
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{ADM_TENANT.kybTier}</span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">{ADM_TENANT.role}</span>
                      </div>
                      <p className="text-[8px] text-slate-400 mt-1">{ADM_TENANT.multisigRole}</p>
                    </div>
                  </aside>

                  {/* Main content */}
                  <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
                    <AdmWelcomeBar />
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {ADM_SUMMARY_CARDS.map((c) => { const Icon = c.icon; const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus; return (
                        <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.6)]">
                          <div className="flex items-center justify-between mb-1"><Icon className={`w-3.5 h-3.5 ${c.color}`} /><TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-emerald-400" : "text-slate-500"}`} /></div>
                          <div className="text-lg font-bold text-white">{c.value}</div><div className="text-[9px] text-slate-400">{c.label}</div><div className={`text-[8px] ${c.trend === "up" ? "text-emerald-400" : "text-slate-500"}`}>{c.delta}</div>
                        </div>); })}
                    </div>
                    {/* Quick actions */}
                    <div>
                      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-purple-400" /> Quick Actions (Admin governance, max 8)</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ADM_QUICK_ACTIONS.map((a) => { const Icon = a.icon; return (
                          <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(124,58,237,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                            <div className="flex items-center justify-between mb-1"><Icon className="w-4 h-4 text-purple-300 group-hover:scale-110 transition-transform" />{a.oneClick && <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">1-CLICK</span>}</div>
                            <p className="text-[10px] font-semibold text-white leading-tight">{a.label}</p><p className="text-[8px] text-slate-500 mt-0.5">{a.specRef}</p>
                          </button>); })}
                      </div>
                    </div>
                    {/* ✦ CREATIVE 1: Platform Health Mission Control */}
                    <PlatformHealthMissionControl />
                    {/* ✦ CREATIVE 2: Governor Decision Timeline */}
                    <GovernorDecisionTimeline />
                    {/* Smart Inbox (Admin-specific) */}
                    <AdmSmartInbox filteredInbox={filteredInbox} priorityFilter={priorityFilter} setPriorityFilter={setPriorityFilter} expandedInbox={expandedInbox} setExpandedInbox={setExpandedInbox} />
                    {/* ✦ CREATIVE 3: Multisig Approval Queue */}
                    <MultisigApprovalQueue />
                    {/* Two-column: Health Score + Integrations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <AdmHealthScoreCard />
                      <AdmIntegrationsCard />
                    </div>
                    {/* Two-column: Activity + Decisions */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <AdmActivityFeed />
                      <AdmDecisionsPanel />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!showFullDashboard && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ADM_PORTAL_FEATURES.map((f, i) => (
              <motion.div key={f.name} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)]">
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
function AdmWelcomeBar() {
  const health = ADM_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  return (
    <div className="p-4 rounded-xl border border-[rgba(124,58,237,0.15)] bg-gradient-to-r from-purple-950/30 to-slate-800/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{ADM_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-purple-300">{ADM_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{ADM_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">{ADM_TENANT.role}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-400/15 text-slate-300 font-mono">{ADM_TENANT.multisigRole}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(124,58,237,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-white">{health}</span><span className="text-[8px] text-slate-500">HEALTH</span></div>
        </div>
        <div className="hidden sm:block"><p className="text-[10px] font-semibold text-slate-300">Platform Health Score</p><p className="text-[9px] text-slate-500">Admin sovereign (0–100)</p><p className="text-[9px] text-emerald-400 mt-1">● Perfect (100 trust, 3-of-5)</p></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Platform Health Mission Control (SVG gauges)
// ═══════════════════════════════════════════════════════════════════════════════
function PlatformHealthMissionControl() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-purple-400" /> ✦ Platform Health Mission Control (8 services)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.11</span></h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PLATFORM_HEALTH_METRICS.map((m, i) => {
          const Icon = m.icon;
          const color = healthColor(m.value);
          const circumference = 2 * Math.PI * 20;
          const offset = circumference - (m.value / 100) * circumference * 0.75;
          return (
            <motion.div key={m.name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              className={`p-2.5 rounded-lg border ${m.status === "healthy" ? "border-emerald-500/15 bg-emerald-500/5" : "border-amber-500/15 bg-amber-500/5"}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className="relative w-12 h-12 shrink-0">
                  <svg className="w-12 h-12" viewBox="0 0 50 50">
                    <path d="M 12 38 A 20 20 0 1 1 38 38" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="3" strokeLinecap="round" />
                    <path d="M 12 38 A 20 20 0 1 1 38 38" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={circumference * 0.75} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center"><span className="text-[10px] font-bold" style={{ color }}>{m.value.toFixed(1)}</span></div>
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] text-slate-400 truncate">{m.name}</p>
                  <p className={`text-[8px] ${m.status === "healthy" ? "text-emerald-300" : "text-amber-300"}`}>● {m.status}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-500 mt-2">6/8 healthy. 2 degraded (Bank Settlement + Nafeza — failover active). Uptime SLA: {ADM_TENANT.uptimeSLA} (target 99.9%).</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Governor Decision Timeline (SVG horizontal)
// ═══════════════════════════════════════════════════════════════════════════════
function GovernorDecisionTimeline() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-purple-400" /> ✦ Governor Decision Timeline (Last 24h — 8 decisions)<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.11 audit</span></h3>
      <div className="relative w-full h-20 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 25" preserveAspectRatio="xMidYMid meet">
          {/* Timeline axis */}
          <line x1="2" y1="15" x2="98" y2="15" stroke="rgba(148,163,184,0.15)" strokeWidth="0.2" />
          {/* Decision dots */}
          {GOVERNOR_TIMELINE.map((d, i) => {
            const x = 5 + (i / (GOVERNOR_TIMELINE.length - 1)) * 90;
            return <g key={i}>
              <circle cx={x} cy="15" r="2" fill={d.color} opacity="0.85" />
              <text x={x} y="10" textAnchor="middle" fill={d.color} fontSize="1.8" fontWeight="bold">{d.verdict}</text>
              <text x={x} y="22" textAnchor="middle" fill="#64748b" fontSize="1.5">{d.time}</text>
              <text x={x} y="25" textAnchor="middle" fill="#475569" fontSize="1.2">{d.gate}</text>
            </g>;
          })}
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ALLOW (6)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> CONDITIONAL (1)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> DENY (1)</span>
        <span className="text-slate-500">Total: 8 decisions in 24h. NL query available: "show all DENY with reason"</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Multisig Approval Queue (SVG progress bars)
// ═══════════════════════════════════════════════════════════════════════════════
function MultisigApprovalQueue() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-purple-400" /> ✦ Multisig Approval Queue (3-of-5 required)<span className="text-[9px] text-slate-500 font-normal ml-1">§3.5.9</span></h3>
      <div className="space-y-2">
        {MULTISIG_QUEUE.map((q, i) => {
          const pct = (q.approvals / q.required) * 100;
          const color = q.approvals >= q.required ? "#10b981" : q.approvals >= q.required - 1 ? "#f59e0b" : "#7c3aed";
          return (
            <motion.div key={q.id} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="p-2.5 rounded-lg border border-[rgba(124,58,237,0.08)] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-white leading-tight">{q.title}</p>
                  <p className="text-[8px] text-slate-500">{q.id} · {q.type}</p>
                </div>
                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-mono">{q.approvals}/{q.required} approved</span>
              </div>
              {/* Progress bar */}
              <div className="flex items-center gap-1 mb-1.5">
                {Array.from({ length: q.total }).map((_, j) => (
                  <div key={j} className={`w-full h-1.5 rounded-full ${j < q.approvals ? "bg-emerald-500" : j < q.required ? "bg-slate-700" : "bg-slate-800"}`} />
                ))}
              </div>
              <div className="flex items-center justify-between text-[8px] text-slate-500">
                <span>Impact: {q.impact}</span>
                <span className="text-amber-400 font-mono">⏱ {q.deadline}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX + REMAINING CARDS
// ═══════════════════════════════════════════════════════════════════════════════
function AdmSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" /> Smart Inbox — Admin-Specific<span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part)</span></h3>
        <div className="flex items-center gap-1">{(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-purple-500/20 border-purple-400/40 text-purple-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(124,58,237,0.1)] text-slate-400 hover:text-slate-200"}`}>{b}<span className="ml-0.5 text-[8px] text-slate-500">{b === "All" ? ADM_INBOX.length : ADM_INBOX.filter(i => i.band === b).length}</span></button>)}</div>
      </div>
      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredInbox.map((item: any, i: number) => { const Icon = item.icon; const expanded = expandedInbox === item.id; return (
          <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`rounded-lg border ${bandColor(item.band)} overflow-hidden`}>
            <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(124,58,237,0.04)] transition-colors">
              <div className="w-7 h-7 rounded-md bg-[rgba(124,58,237,0.1)] flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-purple-300" /></div>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-[11px] font-semibold text-white truncate">{item.what}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${item.band === "High" ? "bg-red-500/15 text-red-300" : item.band === "Medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{item.priority}</span></div><p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p></div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>{expanded && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(124,58,237,0.06)]">
              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-purple-300 font-mono mt-1">{item.ustn}</p>}</div>
                <div className="flex flex-col gap-1"><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p><button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-purple-500 to-slate-500 hover:shadow-lg transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button></div>
              </div>
            </motion.div>)}</AnimatePresence>
          </motion.div>); })}
      </div>
    </div>
  );
}
function AdmHealthScoreCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Platform Health Score <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3><div className="space-y-2">{ADM_HEALTH_SCORE.components.map((c) => { const Icon = c.icon; const color = c.score >= 95 ? "#10b981" : c.score >= 80 ? "#f59e0b" : "#ef4444"; return <div key={c.name}><div className="flex items-center justify-between mb-0.5 text-[10px]"><div className="flex items-center gap-1.5"><Icon className="w-3 h-3 text-slate-400" /><span className="text-slate-300">{c.name}</span><span className="text-[8px] text-slate-500 font-mono">({c.weight}%)</span></div><span className="font-mono text-white font-bold">{c.score}</span></div><div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden"><motion.div initial={{ width: 0 }} whileInView={{ width: `${c.score}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: color }} /></div></div>; })}</div><div className="mt-3 pt-2 border-t border-[rgba(124,58,237,0.08)] flex items-center justify-between"><span className="text-[10px] text-slate-400">Composite Total</span><span className="text-lg font-black text-emerald-300">{ADM_HEALTH_SCORE.total}</span></div></div>;
}
function AdmIntegrationsCard() {
  return <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Platform Integrations Health</h3><div className="space-y-1.5">{ADM_INTEGRATIONS.map((int) => { const Icon = int.icon; return <div key={int.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]"><div className="flex items-center gap-2"><Icon className="w-3.5 h-3.5 text-slate-400" /><span className="text-[10px] text-slate-200">{int.name}</span></div><div className="flex items-center gap-2"><span className="text-[9px] font-mono text-slate-500">{int.latency}</span><span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${integrationStatus(int.status)}`}>● {int.status}</span></div></div>; })}</div></div>;
}
function AdmActivityFeed() {
  return <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time)</span></h3><div className="space-y-2 max-h-60 overflow-y-auto">{ADM_RECENT_ACTIVITY.map((e, i) => (<div key={i} className="flex items-start gap-2"><span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} /><div className="flex-1 min-w-0"><p className="text-[10px] text-slate-300 leading-relaxed"><span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-purple-300 text-[9px]">{e.target}</span></p><p className="text-[8px] text-slate-500">{e.time}</p></div></div>))}</div></div>;
}
function AdmDecisionsPanel() {
  return <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(§3.5.8)</span></h3><div className="space-y-2">{ADM_RECENT_DECISIONS.map((d, i) => (<div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]"><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-1.5"><span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span><span className="text-[10px] text-slate-200">{d.type}</span></div><span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span></div><p className="text-[9px] text-purple-300 font-mono mb-1">{d.ustn}</p><p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p><p className="text-[8px] text-slate-500 mt-1">{d.timestamp}</p></div>))}</div></div>;
}
