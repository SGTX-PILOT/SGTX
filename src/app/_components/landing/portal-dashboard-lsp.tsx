"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #3 — LSP (Logistics Service Provider) — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// v18 spec refs:
//   §2.5.1  Smart Inbox (LSP-specific items)
//   §2.5.2  Trade Command Center (LSP metrics)
//   §16.8.6.3 LSP feature list
//   §16.1.4.1 LSP Driver App

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check,
} from "lucide-react";
import {
  LSP_TENANT, LSP_INBOX, LSP_SUMMARY_CARDS, LSP_QUICK_ACTIONS,
  LSP_HEALTH_SCORE, LSP_ACTIVE_SHIPMENTS, LSP_RFQS, DISPATCH_PLAN,
  WAREHOUSE_STATUS, DRIVERS, LSP_PERFORMANCE, LSP_PORTAL_FEATURES,
  LSP_RECENT_ACTIVITY, LSP_INTEGRATIONS, LSP_RECENT_DECISIONS,
  LSP_SIDEBAR_ROLE,
} from "@/lib/sgtx/landing/portal-lsp-data";
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
  return "bg-cyan-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

const driverStatusColor = (s: string) => {
  if (s === "online") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  if (s === "offline") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-slate-500/15 text-slate-400 border-slate-500/30";
};

const routeStatusColor = (s: string) => {
  if (s === "in_progress") return "bg-cyan-500/15 text-cyan-300";
  if (s === "completed") return "bg-emerald-500/15 text-emerald-300";
  return "bg-slate-500/15 text-slate-400";
};

export function LspPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0945");
  const [showFullDashboard, setShowFullDashboard] = useState(false);

  const filteredInbox = priorityFilter === "All"
    ? LSP_INBOX
    : LSP_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.3 · Portal #3 — LSP (Logistics Service Provider)"
          title="LSP Dashboard — Live Preview"
          subtitle="The default post-login landing surface for an authenticated LSP (Delta Logistics Co., GTID SGTX-EG-26-DL4C-0031, KYB Tier 3). Hybrid device priority — web for dispatch, mobile for drivers."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-cyan-500/30"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)' }}
          >
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            LSP-specific: RFQ Inbox (directed + anonymous), Dispatch Planner (VRP), Warehouse, Forwarder Console, Driver App, Performance Benchmark.
          </span>
        </div>

        <AnimatePresence>
          {showFullDashboard && (
            <motion.div
              key="lsp-dashboard"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <LspPortalFrame
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
            {LSP_PORTAL_FEATURES.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)]"
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
function LspPortalFrame({
  activeTab, setActiveTab, priorityFilter, setPriorityFilter,
  filteredInbox, expandedInbox, setExpandedInbox,
}: any) {
  return (
    <div className="rounded-2xl border border-[rgba(6,182,212,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* ── Global Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(6,182,212,0.15)] bg-[rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>
            S
          </div>
          <span className="text-xs font-bold text-white">SGTX</span>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search USTN, GTID, Request Ref, Contract ID, Loom hash…"
            className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.12)] rounded-lg focus:outline-none focus:border-cyan-400/40"
            aria-label="Universal search"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* No dual-mode toggle for LSP (not a trader) */}
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono">LSP</span>
          <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(6,182,212,0.08)]" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">6</span>
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">
            {LSP_TENANT.avatarInitials}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ───────────────────────────────────────── */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(6,182,212,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[1800px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
          {SIDEBAR_ITEMS.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${
                  activeTab === item.label.toLowerCase().replace(/\s/g, "-")
                    ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30"
                    : "text-slate-300 hover:bg-[rgba(6,182,212,0.06)] hover:text-white border-transparent"
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
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">LSP Role</p>
          {LSP_SIDEBAR_ROLE.map((item: any) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(6,182,212,0.06)] hover:text-white transition-all text-left border border-transparent">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tenant card */}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.1)]">
            <p className="text-[9px] text-slate-400 truncate">{LSP_TENANT.name}</p>
            <p className="text-[10px] font-mono text-cyan-300 truncate">{LSP_TENANT.gtid}</p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{LSP_TENANT.kybTier}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono">{LSP_TENANT.role}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
              <span>Drivers {LSP_TENANT.drivers}</span>
              <span>·</span>
              <span>Trucks {LSP_TENANT.trucks}</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
          <LspWelcomeBar />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {LSP_SUMMARY_CARDS.map((c) => {
              const Icon = c.icon;
              const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
              return (
                <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.6)]">
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    <TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-rose-400" : "text-slate-500"}`} />
                  </div>
                  <div className="text-lg font-bold text-white">{c.value}</div>
                  <div className="text-[9px] text-slate-400">{c.label}</div>
                  <div className={`text-[10px] ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-rose-400" : "text-slate-500"}`}>{c.delta}</div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div>
            <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Quick Actions (LSP role aware, max 8)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LSP_QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(6,182,212,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-4 h-4 text-cyan-300 group-hover:scale-110 transition-transform" />
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

          {/* Smart Inbox (LSP-specific) */}
          <LspSmartInbox
            filteredInbox={filteredInbox}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            expandedInbox={expandedInbox}
            setExpandedInbox={setExpandedInbox}
          />

          {/* RFQ Inbox (directed + anonymous) */}
          <RfqInboxPanel />

          {/* Dispatch Planner (ORTools VRP) */}
          <DispatchPlannerCard />

          {/* Two-column: Warehouse + Driver App */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <WarehouseDashboardCard />
            <DriverAppCard />
          </div>

          {/* Active Shipments table */}
          <LspActiveShipmentsTable />

          {/* Two-column: Health Score + Performance Benchmark */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LspHealthScoreCard />
            <LspPerformanceCard />
          </div>

          {/* Two-column: Integrations + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LspIntegrationsCard />
            <LspActivityFeed />
          </div>

          {/* Governor Decisions */}
          <LspDecisionsPanel />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function LspWelcomeBar() {
  const health = LSP_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : health >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl border border-[rgba(6,182,212,0.15)] bg-gradient-to-r from-cyan-950/30 to-emerald-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{LSP_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-cyan-300">{LSP_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{LSP_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono">{LSP_TENANT.role}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">Trust {LSP_TENANT.trustScore}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(6,182,212,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{health}</span>
            <span className="text-[10px] text-slate-500">HEALTH</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p>
          <p className="text-[9px] text-slate-500">LSP composite (0–100)</p>
          <p className="text-[9px] text-amber-400 mt-1">● Good (2 SLA incidents)</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX (LSP-specific)
// ═══════════════════════════════════════════════════════════════════════════════
function LspSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
          Smart Inbox — LSP-Specific Items
          <span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part: WHAT / WHY / DEADLINE / ACTION)</span>
        </h3>
        <div className="flex items-center gap-1">
          {(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => (
            <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(6,182,212,0.1)] text-slate-400 hover:text-slate-200"}`}>
              {b}
              <span className="ml-0.5 text-[10px] text-slate-500">{b === "All" ? LSP_INBOX.length : LSP_INBOX.filter(i => i.band === b).length}</span>
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
              <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(6,182,212,0.04)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[rgba(6,182,212,0.1)] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-cyan-300" />
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
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(6,182,212,0.06)]">
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                      <div><p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-cyan-300 font-mono mt-1">{item.ustn}</p>}</div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p>
                        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-cyan-500 to-emerald-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button>
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
// RFQ INBOX (directed + anonymous broadcast)
// ═══════════════════════════════════════════════════════════════════════════════
function RfqInboxPanel() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
        <Inbox className="w-3.5 h-3.5 text-cyan-400" /> RFQ Inbox — Directed + Anonymous Broadcast
        <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.3 · non-marketplace: no provider rankings)</span>
      </h3>
      <div className="space-y-2">
        {LSP_RFQS.map((rfq, i) => (
          <motion.div key={rfq.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="p-3 rounded-lg border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500">{rfq.id}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${rfq.type === "directed" ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/20" : "bg-slate-500/15 text-slate-300 border-slate-500/20"}`}>
                    {rfq.type === "directed" ? "DIRECTED" : "ANONYMOUS"}
                  </span>
                  <span className="text-[11px] font-semibold text-white">{rfq.from}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{rfq.route} · {rfq.equipment}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {rfq.yourDraftQuote !== "—" ? (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 transition-all">Submit Quote</button>
                ) : (
                  <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/30 transition-all">Draft Quote</button>
                )}
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-rose-500/20 border border-rose-400/30 text-rose-200 hover:bg-rose-500/30 transition-all">Decline</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Pickup Window</p><p className="text-slate-300">{rfq.pickupWindow}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Delivery</p><p className="text-slate-300">{rfq.deliveryWindow} ({rfq.transitDays}d)</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Your Draft Quote</p><p className="text-cyan-300 font-mono">{rfq.yourDraftQuote}</p></div>
              <div><p className="text-[10px] text-slate-500 uppercase tracking-wider">Market Range</p><p className="text-slate-400">{rfq.marketRange}</p></div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(6,182,212,0.06)] text-[9px] text-slate-500">
              <span>Received {rfq.receivedAt}</span>
              <span className="text-amber-400 font-mono">⏱ Expires in {rfq.expires}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCH PLANNER (ORTools VRP)
// ═══════════════════════════════════════════════════════════════════════════════
function DispatchPlannerCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
        <Route className="w-3.5 h-3.5 text-cyan-400" /> Dispatch Planner — ORTools VRP
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.8.6.3 · driver assignment + time windows)</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-[10px]">
        <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/15"><p className="text-[10px] text-slate-500 uppercase">Trucks Deployed</p><p className="text-cyan-300 font-bold text-base">{DISPATCH_PLAN.trucksDeployed}</p></div>
        <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/15"><p className="text-[10px] text-slate-500 uppercase">Drivers Assigned</p><p className="text-emerald-300 font-bold text-base">{DISPATCH_PLAN.driversAssigned}</p></div>
        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/15"><p className="text-[10px] text-slate-500 uppercase">Pending Dispatches</p><p className="text-amber-300 font-bold text-base">{DISPATCH_PLAN.pendingDispatches}</p></div>
        <div className="p-2 rounded bg-purple-500/10 border border-purple-500/15"><p className="text-[10px] text-slate-500 uppercase">Optimized For</p><p className="text-purple-300 font-bold text-[9px] leading-tight">Min distance + time windows + reefer fuel</p></div>
      </div>

      {/* Routes table */}
      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-[rgba(6,182,212,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2 py-1.5 font-medium">Route</th>
              <th className="px-2 py-1.5 font-medium">Driver</th>
              <th className="px-2 py-1.5 font-medium">Stops</th>
              <th className="px-2 py-1.5 font-medium">Distance</th>
              <th className="px-2 py-1.5 font-medium">Duration</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {DISPATCH_PLAN.routes.map((r) => (
              <tr key={r.id} className="border-t border-[rgba(6,182,212,0.06)] hover:bg-[rgba(6,182,212,0.04)]">
                <td className="px-2 py-1.5 font-mono text-cyan-300 text-[9px]">{r.id}</td>
                <td className="px-2 py-1.5 text-slate-200">{r.driver}</td>
                <td className="px-2 py-1.5 text-slate-300">{r.stops}</td>
                <td className="px-2 py-1.5 text-slate-300 font-mono">{r.distance}</td>
                <td className="px-2 py-1.5 text-slate-300 font-mono">{r.duration}</td>
                <td className="px-2 py-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${routeStatusColor(r.status)}`}>{r.status.replace("_", " ")}</span>
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
// WAREHOUSE DASHBOARD + DRIVER APP
// ═══════════════════════════════════════════════════════════════════════════════
function WarehouseDashboardCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Warehouse className="w-3.5 h-3.5 text-cyan-400" /> Warehouse Dashboard
      </h3>
      <div className="space-y-2">
        {WAREHOUSE_STATUS.map((w) => {
          const cap = parseInt(w.capacity);
          const capColor = cap > 90 ? "#ef4444" : cap > 75 ? "#f59e0b" : "#10b981";
          return (
            <div key={w.facility} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-white truncate flex-1">{w.facility}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${w.status === "operational" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{w.status.replace("_", " ")}</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: w.capacity, background: capColor }} />
                </div>
                <span className="text-[9px] font-mono text-slate-300">{w.capacity}</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-slate-400 flex-wrap">
                <span>{w.utilization}</span>
                <span>·</span>
                <span className="text-cyan-300">{w.reeferSlots}</span>
                <span>·</span>
                <span>In: {w.inbound}</span>
                <span>·</span>
                <span>Out: {w.outbound}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriverAppCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3 flex items-center gap-1.5">
        <Smartphone className="w-3.5 h-3.5 text-cyan-400" /> Driver Mobile App Management
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.1.4.1 · offline-first)</span>
      </h3>
      <div className="space-y-1.5">
        {DRIVERS.map((d) => (
          <div key={d.gtid} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${d.status === "online" ? "bg-emerald-400" : d.status === "offline" ? "bg-amber-400" : "bg-slate-500"}`} />
                <p className="text-[10px] font-semibold text-white">{d.name}</p>
                {d.truck !== "— (off-duty)" && <span className="text-[10px] font-mono text-cyan-300">{d.truck}</span>}
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${driverStatusColor(d.status)}`}>{d.status.replace("_", " ")}</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] text-slate-400 flex-wrap">
              <span className="truncate">{d.location}</span>
              <span>·</span>
              <span>Last sync {d.lastSync}</span>
              {d.queue > 0 && <span className="text-amber-400 font-bold">· Queue: {d.queue}</span>}
              <span>· ⭐{d.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE SHIPMENTS TABLE (LSP-filtered)
// ═══════════════════════════════════════════════════════════════════════════════
function LspActiveShipmentsTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2">Active Shipments — Shared Shipments Vault (LSP-filtered)</h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(6,182,212,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2.5 py-1.5 font-medium">USTN</th>
              <th className="px-2.5 py-1.5 font-medium">Route</th>
              <th className="px-2.5 py-1.5 font-medium">Equipment</th>
              <th className="px-2.5 py-1.5 font-medium">Driver</th>
              <th className="px-2.5 py-1.5 font-medium">Milestone</th>
              <th className="px-2.5 py-1.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {LSP_ACTIVE_SHIPMENTS.map((t) => (
              <tr key={t.ustn} className="border-t border-[rgba(6,182,212,0.06)] hover:bg-[rgba(6,182,212,0.04)] cursor-pointer">
                <td className="px-2.5 py-1.5 font-mono text-cyan-300 text-[9px]">{t.ustn}</td>
                <td className="px-2.5 py-1.5 text-slate-300 text-[9px]">{t.route}</td>
                <td className="px-2.5 py-1.5 text-slate-300 text-[9px]">{t.equipment}</td>
                <td className="px-2.5 py-1.5 text-purple-300 text-[9px]">{t.driver}</td>
                <td className="px-2.5 py-1.5 text-amber-300 text-[9px]">{t.milestone}</td>
                <td className="px-2.5 py-1.5">
                  {t.health > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${t.health}%`, background: t.health >= 80 ? "#10b981" : t.health >= 65 ? "#f59e0b" : "#ef4444" }} />
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
// HEALTH SCORE + PERFORMANCE BENCHMARK
// ═══════════════════════════════════════════════════════════════════════════════
function LspHealthScoreCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score Breakdown <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3>
      <div className="space-y-2">
        {LSP_HEALTH_SCORE.components.map((c) => {
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
      <div className="mt-3 pt-2 border-t border-[rgba(6,182,212,0.08)] flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Composite Total</span>
        <span className="text-lg font-black text-amber-300">{LSP_HEALTH_SCORE.total}</span>
      </div>
    </div>
  );
}

function LspPerformanceCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Performance Dashboard <span className="text-[9px] text-slate-500 font-normal">(§16.8.6.3 · anonymous benchmark)</span></h3>
      <div className="space-y-1.5">
        {LSP_PERFORMANCE.metrics.map((m) => {
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
      <div className="mt-2 pt-2 border-t border-[rgba(6,182,212,0.08)]">
        <p className="text-[10px] text-emerald-300 font-semibold">● {LSP_PERFORMANCE.trend}</p>
        <p className="text-[9px] text-slate-400 mt-0.5">{LSP_PERFORMANCE.percentile}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS + ACTIVITY + DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════
function LspIntegrationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations Health <span className="text-[9px] text-slate-500 font-normal">(aggregated every 10s)</span></h3>
      <div className="space-y-1.5">
        {LSP_INTEGRATIONS.map((int) => {
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

function LspActivityFeed() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time via NATS)</span></h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {LSP_RECENT_ACTIVITY.map((e, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-cyan-300 text-[9px]">{e.target}</span>
              </p>
              <p className="text-[10px] text-slate-500">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LspDecisionsPanel() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(plain-language §3.5.8)</span></h3>
      <div className="space-y-2">
        {LSP_RECENT_DECISIONS.map((d, i) => (
          <div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span>
                <span className="text-[10px] text-slate-200">{d.type}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span>
            </div>
            <p className="text-[9px] text-cyan-300 font-mono mb-1">{d.ustn}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p>
            <p className="text-[10px] text-slate-500 mt-1">{d.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-export icons used in the component
import { Inbox, Route, Warehouse, Smartphone } from "lucide-react";
