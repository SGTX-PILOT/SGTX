"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #5 — LAB (Laboratory) — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// v18 spec refs:
//   §2.5.1  Smart Inbox (LAB-specific items)
//   §2.5.2  Trade Command Center (LAB metrics)
//   §16.8.7 / §16.8.6.5 LAB feature list
//   §16.1.3 Web-First device priority (no dedicated mobile app)

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check,
} from "lucide-react";
import {
  LAB_TENANT, LAB_INBOX, LAB_SUMMARY_CARDS, LAB_QUICK_ACTIONS,
  LAB_HEALTH_SCORE, LAB_ACTIVE_JOBS, LAB_TESTING_JOBS, TEST_RESULTS,
  CERTIFICATES, LAB_PERFORMANCE, ACCREDITATIONS, EQUIPMENT,
  LAB_PORTAL_FEATURES, LAB_RECENT_ACTIVITY, LAB_INTEGRATIONS,
  LAB_RECENT_DECISIONS, LAB_SIDEBAR_ROLE,
} from "@/lib/sgtx/landing/portal-lab-data";
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
  return "bg-violet-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

const testResultColor = (s: string) => {
  if (s === "compliant") return "bg-emerald-500/15 text-emerald-300";
  if (s === "non_compliant") return "bg-rose-500/15 text-rose-300";
  return "bg-amber-500/15 text-amber-300";
};

const certStatusColor = (s: string) => {
  if (s === "issued") return "bg-emerald-500/15 text-emerald-300";
  if (s === "pending") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-500/15 text-slate-400";
};

const equipStatusColor = (s: string) => {
  if (s === "calibrated") return "bg-emerald-500/15 text-emerald-300";
  if (s === "calibration_due") return "bg-amber-500/15 text-amber-300";
  return "bg-rose-500/15 text-rose-300";
};

export function LabPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0945");
  const [showFullDashboard, setShowFullDashboard] = useState(false);

  const filteredInbox = priorityFilter === "All"
    ? LAB_INBOX
    : LAB_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.7 · Portal #5 — LAB (Laboratory)"
          title="LAB Dashboard — Live Preview"
          subtitle="The default post-login landing surface for an authenticated Laboratory (Nile Laboratories, GTID SGTX-EG-26-NL8B-0044, KYB Tier 3, ISO 17025:2017). Web-First device priority."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-violet-500/30"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            LAB-specific: Testing Jobs, Result Submission (MRL validation), Certificates (Nafeza auto-trigger), Sample Tracking, Accreditations, Equipment Calibration.
          </span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div
              key="lab-dashboard"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <LabPortalFrame
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                priorityFilter={priorityFilter}
                setPriorityFilter={setPriorityFilter}
                filteredInbox={filteredInbox}
                expandedInbox={expandedInbox}
                setExpandedInbox={setExpandedInbox}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!showFullDashboard && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {LAB_PORTAL_FEATURES.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)]"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[11px] font-semibold text-white">{f.name}</h4>
                  <span className="text-[10px] font-mono text-slate-500">{f.section}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PORTAL FRAME
// ═══════════════════════════════════════════════════════════════════════════════
function LabPortalFrame({
  activeTab, setActiveTab, priorityFilter, setPriorityFilter,
  filteredInbox, expandedInbox, setExpandedInbox,
}: any) {
  return (
    <div className="rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* ── Global Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(124,58,237,0.15)] bg-[rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>
            S
          </div>
          <span className="text-xs font-bold text-white">SGTX</span>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search USTN, GTID, Sample ID, Test Panel, Certificate, Loom hash…"
            className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.12)] rounded-lg focus:outline-none focus:border-violet-400/40"
            aria-label="Universal search"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-mono">LAB</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono">ISO 17025</span>
          <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(124,58,237,0.08)]" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">5</span>
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
            {LAB_TENANT.avatarInitials}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ───────────────────────────────────────── */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(124,58,237,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[2000px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
          {SIDEBAR_ITEMS.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${
                  activeTab === item.label.toLowerCase().replace(/\s/g, "-")
                    ? "bg-violet-500/15 text-violet-200 border-violet-400/30"
                    : "text-slate-300 hover:bg-[rgba(124,58,237,0.06)] hover:text-white border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold">{item.badge}</span>
                )}
              </button>
            );
          })}
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">LAB Role</p>
          {LAB_SIDEBAR_ROLE.map((item: any) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(124,58,237,0.06)] hover:text-white transition-all text-left border border-transparent">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tenant card */}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.1)]">
            <p className="text-[9px] text-slate-400 truncate">{LAB_TENANT.name}</p>
            <p className="text-[10px] font-mono text-violet-300 truncate">{LAB_TENANT.gtid}</p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{LAB_TENANT.kybTier}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-mono">{LAB_TENANT.role}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 flex-wrap">
              <span className="text-emerald-300">{LAB_TENANT.accreditation.split(":")[0]}</span>
              <span>·</span>
              <span>{LAB_TENANT.accreditedTests} tests</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
          <LabWelcomeBar />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {LAB_SUMMARY_CARDS.map((c) => {
              const Icon = c.icon;
              const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
              return (
                <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.6)]">
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    <TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-emerald-400" : "text-slate-500"}`} />
                  </div>
                  <div className="text-lg font-bold text-white">{c.value}</div>
                  <div className="text-[9px] text-slate-400">{c.label}</div>
                  <div className={`text-[10px] ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-emerald-400" : "text-slate-500"}`}>{c.delta}</div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div>
            <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-violet-400" /> Quick Actions (LAB role aware, max 8)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LAB_QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(124,58,237,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-4 h-4 text-violet-300 group-hover:scale-110 transition-transform" />
                      {a.oneClick && (
                        <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">1-CLICK</span>
                      )}
                    </div>
                    <p className="text-[10px] font-semibold text-white leading-tight">{a.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{a.specRef}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smart Inbox (LAB-specific) */}
          <LabSmartInbox
            filteredInbox={filteredInbox}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            expandedInbox={expandedInbox}
            setExpandedInbox={setExpandedInbox}
          />

          {/* Testing Jobs (sample tracking) */}
          <TestingJobsPanel />

          {/* Two-column: Test Results (MRL validation) + Certificates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TestResultsCard />
            <CertificatesCard />
          </div>

          {/* Active Jobs table */}
          <LabActiveJobsTable />

          {/* Two-column: Accreditations + Equipment Calibration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AccreditationsCard />
            <EquipmentCalibrationCard />
          </div>

          {/* Two-column: Health Score + Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LabHealthScoreCard />
            <LabPerformanceCard />
          </div>

          {/* Two-column: Integrations + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LabIntegrationsCard />
            <LabActivityFeed />
          </div>

          {/* Governor Decisions */}
          <LabDecisionsPanel />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function LabWelcomeBar() {
  const health = LAB_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : health >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl border border-[rgba(124,58,237,0.15)] bg-gradient-to-r from-violet-950/30 to-indigo-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{LAB_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-violet-300">{LAB_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{LAB_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-mono">{LAB_TENANT.role}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">{LAB_TENANT.accreditation}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(124,58,237,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{health}</span>
            <span className="text-[10px] text-slate-500">HEALTH</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p>
          <p className="text-[9px] text-slate-500">LAB composite (0–100)</p>
          <p className="text-[9px] text-emerald-400 mt-1">● Excellent (93 trust)</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX (LAB-specific)
// ═══════════════════════════════════════════════════════════════════════════════
function LabSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
          Smart Inbox — LAB-Specific Items
          <span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part: WHAT / WHY / DEADLINE / ACTION)</span>
        </h3>
        <div className="flex items-center gap-1">
          {(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => (
            <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-violet-500/20 border-violet-400/40 text-violet-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(124,58,237,0.1)] text-slate-400 hover:text-slate-200"}`}>
              {b}
              <span className="ml-0.5 text-[10px] text-slate-500">{b === "All" ? LAB_INBOX.length : LAB_INBOX.filter(i => i.band === b).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
        {filteredInbox.map((item: any, i: number) => {
          const Icon = item.icon;
          const expanded = expandedInbox === item.id;
          return (
            <motion.div key={item.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className={`rounded-lg border ${bandColor(item.band)} overflow-hidden`}>
              <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(124,58,237,0.04)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[rgba(124,58,237,0.1)] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-violet-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-white truncate">{item.what}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${item.band === "High" ? "bg-red-500/15 text-red-300" : item.band === "Medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{item.priority}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(124,58,237,0.06)]">
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-violet-300 font-mono mt-1">{item.ustn}</p>}</div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p>
                        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-violet-500 to-indigo-500 hover:shadow-lg hover:shadow-violet-500/30 transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button>
                        <div className="flex gap-1 mt-0.5">
                          <button className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Snooze 2h</button>
                          <button className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Dismiss</button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTING JOBS (sample tracking)
// ═══════════════════════════════════════════════════════════════════════════════
function TestingJobsPanel() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
        <FlaskConical className="w-3.5 h-3.5 text-violet-400" /> Testing Jobs — Sample Tracking
        <span className="text-[9px] text-slate-500 font-normal">(§16.8.7 · chain-of-custody + test panels)</span>
      </h3>
      <div className="space-y-2">
        {LAB_TESTING_JOBS.map((job, i) => (
          <motion.div key={job.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="p-3 rounded-lg border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500">{job.id}</span>
                  <span className="text-[11px] font-semibold text-white">{job.seller}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{job.commodity}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 transition-all">Submit Results</button>
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-violet-500/20 border border-violet-400/30 text-violet-200 hover:bg-violet-500/30 transition-all">View Details</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Test Panel</p><p className="text-slate-300">{job.testPanel}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Analytes</p><p className="text-violet-300 font-mono">{job.analytes}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Fee</p><p className="text-emerald-300 font-mono">{job.fee}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">USTN</p><p className="text-slate-400 font-mono text-[9px]">{job.ustn}</p></div>
            </div>
            <div className="mt-2 pt-2 border-t border-[rgba(124,58,237,0.06)]">
              <p className="text-[9px] text-slate-400">{job.sampleStatus}</p>
              <div className="flex items-center justify-between mt-1 text-[9px] text-slate-500">
                <span>Received {job.receivedAt}</span>
                <span className="text-amber-400 font-mono">⏱ {job.deadline}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST RESULTS (MRL validation) + CERTIFICATES
// ═══════════════════════════════════════════════════════════════════════════════
function TestResultsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Scale className="w-3.5 h-3.5 text-violet-400" /> MRL Validation — Test Results
        <span className="text-[9px] text-slate-500 font-normal ml-1">(EU Regulation 396/2005)</span>
      </h3>
      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-[rgba(124,58,237,0.08)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2 py-1.5 font-medium">Analyte</th>
              <th className="px-2 py-1.5 font-medium">EU MRL</th>
              <th className="px-2 py-1.5 font-medium">Detected</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {TEST_RESULTS.map((r) => (
              <tr key={r.analyte} className="border-t border-[rgba(124,58,237,0.06)]">
                <td className="px-2 py-1.5 text-slate-200">{r.analyte}</td>
                <td className="px-2 py-1.5 text-slate-400 font-mono text-[9px]">{r.euMrl}</td>
                <td className="px-2 py-1.5 text-slate-300 font-mono text-[9px]">{r.detected}</td>
                <td className="px-2 py-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${testResultColor(r.status)}`}>{r.status.replace("_", " ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[9px] text-rose-300 mt-2 font-semibold">⚠ 2/14 non-compliant: Chlorpyrifos (8× EU MRL), Malathion (2.5× EU MRL). Conditional QC hold raised.</p>
    </div>
  );
}

function CertificatesCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <FileSignature className="w-3.5 h-3.5 text-violet-400" /> Certificates — Nafeza Auto-Trigger
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.8.7)</span>
      </h3>
      <div className="space-y-1.5">
        {CERTIFICATES.map((c) => (
          <div key={c.id} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-500">{c.id}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${certStatusColor(c.status)}`}>{c.status}</span>
              </div>
              <span className="text-[10px] text-slate-500">{c.timestamp}</span>
            </div>
            <p className="text-[10px] font-semibold text-white">{c.type}</p>
            <p className="text-[9px] text-violet-300 font-mono mt-0.5">{c.ustn}</p>
            <div className="flex items-center gap-2 text-[9px] text-slate-400 mt-0.5 flex-wrap">
              <span>Trigger: {c.trigger}</span>
              {c.nafeza === "auto-propagated" && <span className="text-emerald-400">✓ Nafeza propagated</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE JOBS TABLE (LAB-filtered)
// ═══════════════════════════════════════════════════════════════════════════════
function LabActiveJobsTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2">Active Testing Jobs — LAB-Filtered Columns</h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(124,58,237,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2.5 py-1.5 font-medium">USTN</th>
              <th className="px-2.5 py-1.5 font-medium">Seller</th>
              <th className="px-2.5 py-1.5 font-medium">Test Panel</th>
              <th className="px-2.5 py-1.5 font-medium">Result</th>
              <th className="px-2.5 py-1.5 font-medium">Certificate</th>
              <th className="px-2.5 py-1.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {LAB_ACTIVE_JOBS.map((t) => (
              <tr key={t.ustn} className="border-t border-[rgba(124,58,237,0.06)] hover:bg-[rgba(124,58,237,0.04)] cursor-pointer">
                <td className="px-2.5 py-1.5 font-mono text-violet-300 text-[9px]">{t.ustn}</td>
                <td className="px-2.5 py-1.5 text-slate-200 text-[9px]">{t.seller}</td>
                <td className="px-2.5 py-1.5 text-slate-300 text-[9px]">{t.testPanel}</td>
                <td className="px-2.5 py-1.5 text-[9px]">
                  {t.status === "completed" ? <span className="text-emerald-300">{t.result}</span> :
                   t.status === "conditional" ? <span className="text-amber-300">{t.result}</span> :
                   t.status === "testing" ? <span className="text-violet-300">{t.result}</span> :
                   <span className="text-slate-500">{t.result}</span>}
                </td>
                <td className="px-2.5 py-1.5 text-slate-400 text-[9px]">{t.certificate}</td>
                <td className="px-2.5 py-1.5">
                  {t.health > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${t.health}%`, background: t.health >= 85 ? "#10b981" : t.health >= 65 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">{t.health}</span>
                    </div>
                  ) : (
                    <span className="text-[9px] text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCREDITATIONS + EQUIPMENT CALIBRATION
// ═══════════════════════════════════════════════════════════════════════════════
function AccreditationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Award className="w-3.5 h-3.5 text-violet-400" /> Accreditations
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§4.9 · annual renewal)</span>
      </h3>
      <div className="space-y-1.5">
        {ACCREDITATIONS.map((a) => (
          <div key={a.name} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-white">{a.name}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">{a.status}</span>
            </div>
            <p className="text-[9px] text-slate-400">{a.issuer}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{a.scope}</p>
            <div className="flex items-center justify-between mt-1 text-[9px]">
              <span className="text-slate-500">Valid until: <span className="text-slate-300 font-mono">{a.valid}</span></span>
              <span className={`font-mono ${parseInt(a.renewal) < 90 ? "text-amber-400" : "text-emerald-400"}`}>{a.renewal} to renew</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EquipmentCalibrationCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Microscope className="w-3.5 h-3.5 text-violet-400" /> Equipment Calibration
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.8.7)</span>
      </h3>
      <div className="space-y-1.5">
        {EQUIPMENT.map((e) => (
          <div key={e.name} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-semibold text-white">{e.name}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${equipStatusColor(e.status)}`}>{e.status.replace("_", " ")}</span>
            </div>
            <p className="text-[9px] text-slate-400">{e.purpose}</p>
            <div className="flex items-center justify-between mt-1 text-[9px]">
              <span className="text-slate-500">Last: <span className="text-slate-300 font-mono">{e.lastCal}</span></span>
              <span className="text-slate-500">Next: <span className="text-amber-300 font-mono">{e.nextCal}</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE + PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
function LabHealthScoreCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score Breakdown <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3>
      <div className="space-y-2">
        {LAB_HEALTH_SCORE.components.map((c) => {
          const Icon = c.icon;
          const color = c.score >= 85 ? "#10b981" : c.score >= 70 ? "#f59e0b" : "#ef4444";
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-0.5 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-300">{c.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">({c.weight}%)</span>
                </div>
                <span className="font-mono text-white font-bold">{c.score}</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                <motion.div initial={{ width: 0 }} whileInView={{ width: `${c.score}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="h-full rounded-full" style={{ background: color }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-[rgba(124,58,237,0.08)] flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Composite Total</span>
        <span className="text-lg font-black text-emerald-300">{LAB_HEALTH_SCORE.total}</span>
      </div>
    </div>
  );
}

function LabPerformanceCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Performance Dashboard <span className="text-[9px] text-slate-500 font-normal">(§16.8.7)</span></h3>
      <div className="space-y-1.5">
        {LAB_PERFORMANCE.metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-300">{m.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-white font-mono">{m.value}</span>
                <span className="text-[10px] text-slate-500">vs {m.benchmark}</span>
                <span className={`text-[10px] px-1 py-0.5 rounded ${m.status === "above" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{m.status === "above" ? "↑" : "↓"}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 pt-2 border-t border-[rgba(124,58,237,0.08)]">
        <p className="text-[10px] text-emerald-300 font-semibold">● {LAB_PERFORMANCE.trend}</p>
        <p className="text-[9px] text-slate-400 mt-0.5">{LAB_PERFORMANCE.percentile}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS + ACTIVITY + DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════
function LabIntegrationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations Health <span className="text-[9px] text-slate-500 font-normal">(aggregated every 10s)</span></h3>
      <div className="space-y-1.5">
        {LAB_INTEGRATIONS.map((int) => {
          const Icon = int.icon;
          return (
            <div key={int.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-200">{int.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-500">{int.latency}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${integrationStatus(int.status)}`}>● {int.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LabActivityFeed() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time via NATS)</span></h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {LAB_RECENT_ACTIVITY.map((e, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-violet-300 text-[9px]">{e.target}</span>
              </p>
              <p className="text-[10px] text-slate-500">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LabDecisionsPanel() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(plain-language §3.5.8)</span></h3>
      <div className="space-y-2">
        {LAB_RECENT_DECISIONS.map((d, i) => (
          <div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span>
                <span className="text-[10px] text-slate-200">{d.type}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span>
            </div>
            <p className="text-[9px] text-violet-300 font-mono mb-1">{d.ustn}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p>
            <p className="text-[10px] text-slate-500 mt-1">{d.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export icons
import { FlaskConical, Scale, FileSignature, Award, Microscope } from "lucide-react";
