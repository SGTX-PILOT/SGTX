"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #7 — CBR (Customs Broker) — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// v18 spec refs:
//   §2.5.1  Smart Inbox (CBR-specific items)
//   §2.5.2  Trade Command Center (CBR metrics)
//   §16.8.6.7 CBR feature list
//   §16.1.3 Hybrid device priority (mobile companion for document receipt)

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check,
} from "lucide-react";
import {
  CBR_TENANT, CBR_INBOX, CBR_SUMMARY_CARDS, CBR_QUICK_ACTIONS,
  CBR_HEALTH_SCORE, CBR_ACTIVE_DECLARATIONS, CBR_CERT_REQUESTS,
  PHYSICAL_DOC_JOBS, STORAGE_RECORDS, AUDIT_CASES, DIGITAL_SEAL,
  CBR_PERFORMANCE, CBR_PORTAL_FEATURES, CBR_RECENT_ACTIVITY,
  CBR_INTEGRATIONS, CBR_RECENT_DECISIONS, CBR_SIDEBAR_ROLE,
} from "@/lib/sgtx/landing/portal-cbr-data";
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
  return "bg-orange-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

const clearanceStatusColor = (s: string) => {
  if (s === "cleared") return "bg-emerald-500/15 text-emerald-300";
  if (s === "filed") return "bg-blue-500/15 text-blue-300";
  if (s === "filing") return "bg-amber-500/15 text-amber-300";
  if (s === "audit") return "bg-rose-500/15 text-rose-300";
  if (s === "draft") return "bg-slate-500/15 text-slate-400";
  return "bg-slate-500/15 text-slate-400";
};

const docJobStatusColor = (s: string) => {
  if (s === "dispatched") return "bg-emerald-500/15 text-emerald-300";
  if (s === "processing") return "bg-amber-500/15 text-amber-300";
  return "bg-slate-500/15 text-slate-400";
};

const storageStatusColor = (s: string) => {
  if (s === "expired") return "bg-rose-500/15 text-rose-300";
  if (s === "expiring_today") return "bg-red-500/15 text-red-300";
  if (s === "expiring_7d") return "bg-amber-500/15 text-amber-300";
  if (s === "expiring_14d") return "bg-yellow-500/15 text-yellow-300";
  return "bg-slate-500/15 text-slate-400";
};

export function CbrPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0949");
  const [showFullDashboard, setShowFullDashboard] = useState(false);

  const filteredInbox = priorityFilter === "All"
    ? CBR_INBOX
    : CBR_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.7 · Portal #7 — CBR (Customs Broker)"
          title="CBR Dashboard — Live Preview"
          subtitle="The default post-login landing surface for an authenticated Customs Broker (Cairo Customs Brokers, GTID SGTX-EG-26-CC3A-0052, KYB Tier 3). Hybrid device priority — mobile for document receipt."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-orange-500/30"
            style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b)' }}
          >
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            CBR-specific: Certification Requests, Physical Document Jobs (QR+GPS), Storage Retention, Audit Representation, Digital Seal.
          </span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div
              key="cbr-dashboard"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <CbrPortalFrame
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
            {CBR_PORTAL_FEATURES.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-lg border border-[rgba(249,115,22,0.1)] bg-[rgba(15,23,42,0.5)]"
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
function CbrPortalFrame({
  activeTab, setActiveTab, priorityFilter, setPriorityFilter,
  filteredInbox, expandedInbox, setExpandedInbox,
}: any) {
  return (
    <div className="rounded-2xl border border-[rgba(249,115,22,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* ── Global Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(249,115,22,0.15)] bg-[rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md"
            style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>
            S
          </div>
          <span className="text-xs font-bold text-white">SGTX</span>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search USTN, GTID, Declaration, HS Code, Document ID, Loom hash…"
            className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(249,115,22,0.12)] rounded-lg focus:outline-none focus:border-orange-400/40"
            aria-label="Universal search"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 font-mono">CBR</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-mono">Licensed</span>
          <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(249,115,22,0.08)]" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">7</span>
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white">
            {CBR_TENANT.avatarInitials}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ───────────────────────────────────────── */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(249,115,22,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[2200px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
          {SIDEBAR_ITEMS.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${
                  activeTab === item.label.toLowerCase().replace(/\s/g, "-")
                    ? "bg-orange-500/15 text-orange-200 border-orange-400/30"
                    : "text-slate-300 hover:bg-[rgba(249,115,22,0.06)] hover:text-white border-transparent"
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
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">CBR Role</p>
          {CBR_SIDEBAR_ROLE.map((item: any) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(249,115,22,0.06)] hover:text-white transition-all text-left border border-transparent">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tenant card */}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(249,115,22,0.1)]">
            <p className="text-[9px] text-slate-400 truncate">{CBR_TENANT.name}</p>
            <p className="text-[10px] font-mono text-orange-300 truncate">{CBR_TENANT.gtid}</p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{CBR_TENANT.kybTier}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 font-mono">{CBR_TENANT.role}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 flex-wrap">
              <span className="text-emerald-300">Licensed CBR</span>
              <span>·</span>
              <span>Ed25519 seal</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
          <CbrWelcomeBar />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {CBR_SUMMARY_CARDS.map((c) => {
              const Icon = c.icon;
              const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
              return (
                <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(249,115,22,0.1)] bg-[rgba(15,23,42,0.6)]">
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
              <Zap className="w-3.5 h-3.5 text-orange-400" /> Quick Actions (CBR role aware, max 8)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CBR_QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(249,115,22,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(249,115,22,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-4 h-4 text-orange-300 group-hover:scale-110 transition-transform" />
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

          {/* Smart Inbox (CBR-specific) */}
          <CbrSmartInbox
            filteredInbox={filteredInbox}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            expandedInbox={expandedInbox}
            setExpandedInbox={setExpandedInbox}
          />

          {/* Certification Requests (declaration preview) */}
          <CertRequestsPanel />

          {/* Two-column: Physical Document Jobs + Storage Management */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <PhysicalDocJobsCard />
            <StorageManagementCard />
          </div>

          {/* Active Declarations table */}
          <CbrActiveDeclarationsTable />

          {/* Two-column: Audit Representation + Digital Seal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AuditRepresentationCard />
            <DigitalSealCard />
          </div>

          {/* Two-column: Health Score + Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CbrHealthScoreCard />
            <CbrPerformanceCard />
          </div>

          {/* Two-column: Integrations + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <CbrIntegrationsCard />
            <CbrActivityFeed />
          </div>

          {/* Governor Decisions */}
          <CbrDecisionsPanel />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function CbrWelcomeBar() {
  const health = CBR_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : health >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl border border-[rgba(249,115,22,0.15)] bg-gradient-to-r from-orange-950/30 to-amber-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{CBR_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-orange-300">{CBR_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{CBR_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 font-mono">{CBR_TENANT.role}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">Licensed CBR</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(249,115,22,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{health}</span>
            <span className="text-[10px] text-slate-500">HEALTH</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p>
          <p className="text-[9px] text-slate-500">CBR composite (0–100)</p>
          <p className="text-[9px] text-emerald-400 mt-1">● Good (82 trust)</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX (CBR-specific)
// ═══════════════════════════════════════════════════════════════════════════════
function CbrSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
          Smart Inbox — CBR-Specific Items
          <span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part: WHAT / WHY / DEADLINE / ACTION)</span>
        </h3>
        <div className="flex items-center gap-1">
          {(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => (
            <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-orange-500/20 border-orange-400/40 text-orange-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(249,115,22,0.1)] text-slate-400 hover:text-slate-200"}`}>
              {b}
              <span className="ml-0.5 text-[10px] text-slate-500">{b === "All" ? CBR_INBOX.length : CBR_INBOX.filter(i => i.band === b).length}</span>
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
              <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(249,115,22,0.04)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[rgba(249,115,22,0.1)] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-orange-300" />
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
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(249,115,22,0.06)]">
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-orange-300 font-mono mt-1">{item.ustn}</p>}</div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p>
                        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-lg hover:shadow-orange-500/30 transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button>
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
// CERTIFICATION REQUESTS (declaration preview)
// ═══════════════════════════════════════════════════════════════════════════════
function CertRequestsPanel() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 text-orange-400" /> Certification Requests — Declaration Preview
        <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.7 · HS code + duty + documents)</span>
      </h3>
      <div className="space-y-2">
        {CBR_CERT_REQUESTS.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="p-3 rounded-lg border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500">{r.id}</span>
                  <span className="text-[11px] font-semibold text-white">{r.seller}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{r.commodity}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 transition-all">Start Declaration</button>
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-orange-500/20 border border-orange-400/30 text-orange-200 hover:bg-orange-500/30 transition-all">Preview</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">HS Code</p><p className="text-orange-300 font-mono">{r.hsCode}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Declared Value</p><p className="text-slate-300 font-mono text-[9px]">{r.declaredValue}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Duty Estimate</p><p className="text-emerald-300 font-mono">{r.dutyEstimate}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Origin → Dest</p><p className="text-slate-300">{r.origin} → {r.destination}</p></div>
            </div>
            <div className="mt-2 pt-2 border-t border-[rgba(249,115,22,0.06)]">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Required Documents ({r.documentsRequired.length})</p>
              <div className="flex flex-wrap gap-1">
                {r.documentsRequired.map((d, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/15">{d}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(249,115,22,0.06)] text-[9px] text-slate-500">
              <span>Digital seal: {r.digitalSeal}</span>
              <span className="text-amber-400 font-mono">⏱ {r.deadline}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHYSICAL DOC JOBS + STORAGE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
function PhysicalDocJobsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <ScanLine className="w-3.5 h-3.5 text-orange-400" /> Physical Document Jobs
        <span className="text-[9px] text-slate-500 font-normal ml-1">(QR + GPS tracking)</span>
      </h3>
      <div className="space-y-1.5">
        {PHYSICAL_DOC_JOBS.map((j) => (
          <div key={j.id} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(249,115,22,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-500">{j.id}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${docJobStatusColor(j.status)}`}>{j.status}</span>
              </div>
              <span className="text-[10px] text-slate-500">{j.photos} photos</span>
            </div>
            <p className="text-[9px] font-mono text-orange-300">{j.ustn}</p>
            <div className="text-[9px] text-slate-400 mt-0.5">{j.documents.join(", ")}</div>
            <div className="flex items-center gap-2 text-[9px] text-slate-400 mt-1 flex-wrap">
              <span>Courier: {j.courier}</span>
              <span>·</span>
              {j.qrScanned && <span className="text-emerald-400">✓ QR scanned</span>}
              <span>·</span>
              <span className="text-orange-300 font-mono text-[10px]">{j.gpsStamp}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
              <span>Received: {j.receivedAt}</span>
              <span className="text-amber-400 font-mono">{j.dispatchDeadline}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StorageManagementCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Archive className="w-3.5 h-3.5 text-orange-400" /> Storage Management
        <span className="text-[9px] text-slate-500 font-normal ml-1">(5-year retention per Egyptian law)</span>
      </h3>
      <div className="space-y-1.5">
        {STORAGE_RECORDS.map((s) => (
          <div key={s.ustn} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(249,115,22,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-slate-500">{s.ustn}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${storageStatusColor(s.status)}`}>{s.status.replace(/_/g, " ")}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-slate-400 flex-wrap">
              <span>Trade: {s.tradeDate}</span>
              <span>·</span>
              <span>Expiry: <span className="text-amber-300 font-mono">{s.retentionExpiry}</span></span>
              <span>·</span>
              <span>{s.documentCount} docs</span>
            </div>
            <p className="text-[9px] text-slate-400 mt-0.5">{s.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE DECLARATIONS TABLE (CBR-filtered)
// ═══════════════════════════════════════════════════════════════════════════════
function CbrActiveDeclarationsTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2">Active Declarations — CBR-Filtered Columns</h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(249,115,22,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2.5 py-1.5 font-medium">USTN</th>
              <th className="px-2.5 py-1.5 font-medium">Declaration</th>
              <th className="px-2.5 py-1.5 font-medium">HS Code</th>
              <th className="px-2.5 py-1.5 font-medium">Duty</th>
              <th className="px-2.5 py-1.5 font-medium">Status</th>
              <th className="px-2.5 py-1.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {CBR_ACTIVE_DECLARATIONS.map((t) => (
              <tr key={t.ustn} className="border-t border-[rgba(249,115,22,0.06)] hover:bg-[rgba(249,115,22,0.04)] cursor-pointer">
                <td className="px-2.5 py-1.5 font-mono text-orange-300 text-[9px]">{t.ustn}</td>
                <td className="px-2.5 py-1.5 text-slate-300 font-mono text-[9px]">{t.declaration}</td>
                <td className="px-2.5 py-1.5 text-slate-300 text-[9px]">{t.hsCode}</td>
                <td className="px-2.5 py-1.5 text-emerald-300 font-mono text-[9px]">{t.duty}</td>
                <td className="px-2.5 py-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${clearanceStatusColor(t.clearanceStatus)}`}>{t.clearanceStatus}</span>
                </td>
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
// AUDIT REPRESENTATION + DIGITAL SEAL
// ═══════════════════════════════════════════════════════════════════════════════
function AuditRepresentationCard() {
  return (
    <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/10">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Gavel className="w-3.5 h-3.5 text-rose-400" /> Audit Representation
        <span className="text-[9px] text-slate-500 font-normal ml-1">(legal point of contact)</span>
      </h3>
      <div className="space-y-1.5">
        {AUDIT_CASES.map((a) => (
          <div key={a.id} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-rose-500/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-mono text-slate-500">{a.id}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">{a.status}</span>
            </div>
            <p className="text-[9px] font-mono text-orange-300">{a.ustn}</p>
            <p className="text-[10px] font-semibold text-white mt-0.5">{a.auditType}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">Auditor: {a.auditor}</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[9px]">
              <div><p className="text-[10px] text-slate-500 uppercase">Hearing</p><p className="text-amber-300">{a.hearingDate}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase">Location</p><p className="text-slate-300">{a.location}</p></div>
            </div>
            <p className="text-[9px] text-slate-300 mt-1">{a.yourRole}</p>
            <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">{a.defense}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DigitalSealCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Stamp className="w-3.5 h-3.5 text-orange-400" /> Digital Seal Management
        <span className="text-[9px] text-slate-500 font-normal ml-1">(Ed25519 + Nafeza)</span>
      </h3>
      <div className="space-y-2 text-[10px]">
        <div className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(249,115,22,0.06)]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400">Type</span>
            <span className="text-orange-300 font-mono">{DIGITAL_SEAL.type}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400">Key ID</span>
            <span className="text-slate-200 font-mono">{DIGITAL_SEAL.keyId}</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-400">Status</span>
            <span className="text-emerald-300 font-medium">● {DIGITAL_SEAL.status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Expires</span>
            <span className="text-amber-300 font-mono">{DIGITAL_SEAL.expires}</span>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <p className="text-[9px] text-amber-300 font-semibold">⚠ Action Required</p>
          <p className="text-[9px] text-slate-400 mt-0.5">{DIGITAL_SEAL.reSignRequired}</p>
        </div>
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <p className="text-[9px] text-emerald-300 font-semibold">✓ New Seal Available</p>
          <p className="text-[9px] text-slate-400 mt-0.5">{DIGITAL_SEAL.newSealAvailable}</p>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
          <span className="text-slate-400">Declarations Signed</span>
          <span className="text-white font-bold font-mono">{DIGITAL_SEAL.declarationsSigned}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE + PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
function CbrHealthScoreCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score Breakdown <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3>
      <div className="space-y-2">
        {CBR_HEALTH_SCORE.components.map((c) => {
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
      <div className="mt-3 pt-2 border-t border-[rgba(249,115,22,0.08)] flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Composite Total</span>
        <span className="text-lg font-black text-emerald-300">{CBR_HEALTH_SCORE.total}</span>
      </div>
    </div>
  );
}

function CbrPerformanceCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Performance Dashboard <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.7)</span></h3>
      <div className="space-y-1.5">
        {CBR_PERFORMANCE.metrics.map((m) => {
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
      <div className="mt-2 pt-2 border-t border-[rgba(249,115,22,0.08)]">
        <p className="text-[10px] text-emerald-300 font-semibold">● {CBR_PERFORMANCE.trend}</p>
        <p className="text-[9px] text-slate-400 mt-0.5">{CBR_PERFORMANCE.percentile}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS + ACTIVITY + DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════
function CbrIntegrationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations Health <span className="text-[9px] text-slate-500 font-normal">(aggregated every 10s)</span></h3>
      <div className="space-y-1.5">
        {CBR_INTEGRATIONS.map((int) => {
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

function CbrActivityFeed() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time via NATS)</span></h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {CBR_RECENT_ACTIVITY.map((e, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-orange-300 text-[9px]">{e.target}</span>
              </p>
              <p className="text-[10px] text-slate-500">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CbrDecisionsPanel() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(249,115,22,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(plain-language §3.5.8)</span></h3>
      <div className="space-y-2">
        {CBR_RECENT_DECISIONS.map((d, i) => (
          <div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(249,115,22,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span>
                <span className="text-[10px] text-slate-200">{d.type}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span>
            </div>
            <p className="text-[9px] text-orange-300 font-mono mb-1">{d.ustn}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p>
            <p className="text-[10px] text-slate-500 mt-1">{d.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export icons
import { FileText, ScanLine, Archive, Gavel, Stamp, Landmark, FileSignature, Package, Building2, DollarSign, Clock, BadgeCheck, FileCheck, Scale, Timer } from "lucide-react";
