"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #1 — Trader Portal: Buyer Mode — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// v18 spec refs:
//   §2.5.1  Smart Inbox (4-part WHAT/WHY/DEADLINE/ACTION, priority bands)
//   §2.5.2  Trade Command Center (executive summary, quick actions, health score,
//           AI assistant, activity feed, integrations health)
//   §16.1.6 Global header + Sidebar pattern
//   §16.8.6.1 Trader Portal (Buyer) feature list
//   §16.9   Buyer Dashboard
//   §7      CFR Financing Pre-Clearance status

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import {
  BUYER_TENANT, BUYER_INBOX, BUYER_SUMMARY_CARDS, BUYER_QUICK_ACTIONS,
  TRADE_HEALTH_SCORE, BUYER_ACTIVE_TRADES, EXTERNAL_INTEGRATIONS,
  RECENT_ACTIVITY, BUYER_PORTAL_FEATURES, BUYER_SAVED_CONTACTS,
  BUYER_RECENT_DECISIONS, SIDEBAR_ITEMS, BUYER_SIDEBAR_ROLE, CFR_STATUS,
} from "@/lib/sgtx/landing/portal-buyer-data";
import { SectionHeading } from "./sections-foundation";

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
  return "bg-blue-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

export function BuyerPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0941");
  const [showFullDashboard, setShowFullDashboard] = useState(false);

  const filteredInbox = priorityFilter === "All"
    ? BUYER_INBOX
    : BUYER_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.9 · Portal #1 — Trader Portal (Buyer Mode)"
          title="Buyer Dashboard — Live Preview"
          subtitle="The default post-login landing surface for an authenticated Buyer (Nile Harvest Trading Co., GTID SGTX-EG-26-NH3T-0042, KYB Tier 3). Smart Inbox is the default tab."
        />

        {/* Toggle to expand the full interactive dashboard */}
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Click to open the full portal frame with sidebar, Smart Inbox, TCC panels, and Trade Health Score.
          </span>
        </div>

        <AnimatePresence mode="wait">
          {showFullDashboard && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <PortalFrame
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

        {/* Always-visible portal features list (even when dashboard collapsed) */}
        {!showFullDashboard && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {BUYER_PORTAL_FEATURES.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)]"
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
// PORTAL FRAME — header + sidebar + main content
// ═══════════════════════════════════════════════════════════════════════════════
function PortalFrame({
  activeTab, setActiveTab, priorityFilter, setPriorityFilter,
  filteredInbox, expandedInbox, setExpandedInbox,
}: any) {
  return (
    <div className="rounded-2xl border border-[rgba(56,189,248,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* ── Global Header (§16.1.6.1) ─────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(56,189,248,0.15)] bg-[rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>
            S
          </div>
          <span className="text-xs font-bold text-white">SGTX</span>
        </div>

        {/* Universal Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search USTN, GTID, Request Ref, Contract ID, Loom hash…"
            className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.12)] rounded-lg focus:outline-none focus:border-blue-400/40"
            aria-label="Universal search"
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Dual-Mode Toggle (Trader portals only) */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.12)]">
            <button className="px-2 py-0.5 text-[10px] font-bold text-white rounded-full bg-gradient-to-r from-blue-500 to-purple-500">BUY</button>
            <button className="px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded-full" onClick={(e) => e.preventDefault()}>SELL</button>
            <button className="px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded-full" onClick={(e) => e.preventDefault()}>DUAL</button>
          </div>
          {/* Notifications */}
          <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.08)]" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">5</span>
          </button>
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white">
            {BUYER_TENANT.avatarInitials}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ───────────────────────────────────────── */}
      <div className="flex">
        {/* Sidebar (§16.1.6.2) — hidden on mobile */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(56,189,248,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[1400px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
          {SIDEBAR_ITEMS.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left ${
                  activeTab === item.label.toLowerCase().replace(/\s/g, "-")
                    ? "bg-blue-500/15 text-blue-200 border border-blue-400/30"
                    : "text-slate-300 hover:bg-[rgba(59,130,246,0.06)] hover:text-white border border-transparent"
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
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">Buyer Role</p>
          {BUYER_SIDEBAR_ROLE.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(59,130,246,0.06)] hover:text-white transition-all text-left border border-transparent"
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tenant card */}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.1)]">
            <p className="text-[9px] text-slate-400 truncate">{BUYER_TENANT.name}</p>
            <p className="text-[10px] font-mono text-blue-300 truncate">{BUYER_TENANT.gtid}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{BUYER_TENANT.kybTier}</span>
              <span className="text-[10px] text-slate-500">Trust {BUYER_TENANT.trustScore}</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
          {/* Welcome bar with Trade Health Score gauge */}
          <WelcomeBar />

          {/* Executive summary cards (§2.5.2) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {BUYER_SUMMARY_CARDS.map((c) => {
              const Icon = c.icon;
              const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
              return (
                <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.6)]">
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

          {/* Quick actions grid (§16.8.6.1 — max 8) */}
          <div>
            <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-400" /> Quick Actions (role + mode aware, max 8)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {BUYER_QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(56,189,248,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-4 h-4 text-blue-300 group-hover:scale-110 transition-transform" />
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

          {/* Smart Inbox (default tab — §2.5.1) */}
          <SmartInboxPanel
            filteredInbox={filteredInbox}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            expandedInbox={expandedInbox}
            setExpandedInbox={setExpandedInbox}
          />

          {/* Active Trades table (Shared Shipments Vault, buyer-filtered) */}
          <ActiveTradesTable />

          {/* Two-column: Trade Health Score + External Integrations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <TradeHealthScoreCard />
            <ExternalIntegrationsCard />
          </div>

          {/* Two-column: Recent Activity + Recent Governor Decisions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RecentActivityFeed />
            <RecentDecisionsPanel />
          </div>

          {/* CFR Financing Pre-Clearance status */}
          <CFRStatusCard />

          {/* Saved Contacts (Trust Passports) */}
          <SavedContactsCard />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + TRADE HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function WelcomeBar() {
  const health = TRADE_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : health >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl border border-[rgba(56,189,248,0.15)] bg-gradient-to-r from-blue-950/30 to-purple-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{BUYER_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-blue-300">{BUYER_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{BUYER_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">{BUYER_TENANT.traderMode} MODE</span>
        </div>
      </div>

      {/* Trade Health Score gauge */}
      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(56,189,248,0.1)" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6"
              strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{health}</span>
            <span className="text-[10px] text-slate-500">HEALTH</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p>
          <p className="text-[9px] text-slate-500">Composite (0–100)</p>
          <p className="text-[9px] text-emerald-400 mt-1">● Healthy</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX PANEL (§2.5.1 — 4-part WHAT/WHY/DEADLINE/ACTION)
// ═══════════════════════════════════════════════════════════════════════════════
function SmartInboxPanel({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Smart Inbox — Default Landing Tab
          <span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part: WHAT / WHY / DEADLINE / ACTION)</span>
        </h3>
        <div className="flex items-center gap-1">
          {(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => (
            <button
              key={b}
              onClick={() => setPriorityFilter(b)}
              className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${
                priorityFilter === b
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {b}
              <span className="ml-0.5 text-[10px] text-slate-500">
                {b === "All" ? BUYER_INBOX.length : BUYER_INBOX.filter(i => i.band === b).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1 custom-scroll">
        {filteredInbox.map((item: any, i: number) => {
          const Icon = item.icon;
          const expanded = expandedInbox === item.id;
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className={`rounded-lg border ${bandColor(item.band)} overflow-hidden`}
            >
              <button
                onClick={() => setExpandedInbox(expanded ? null : item.id)}
                className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(59,130,246,0.04)] transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-[rgba(59,130,246,0.1)] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-white truncate">{item.what}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${
                      item.band === "High" ? "bg-red-500/15 text-red-300" :
                      item.band === "Medium" ? "bg-amber-500/15 text-amber-300" :
                      "bg-slate-500/15 text-slate-300"
                    }`}>
                      {item.priority}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-[rgba(56,189,248,0.06)]"
                  >
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p>
                        <p className="text-slate-200 leading-relaxed">{item.what}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p>
                        <p className="text-slate-400 leading-relaxed">{item.why}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p>
                        <p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>
                        {item.ustn && (
                          <p className="text-[9px] text-blue-300 font-mono mt-1">{item.ustn}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p>
                        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-blue-500 to-purple-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all">
                          {item.action} <ChevronRight className="w-3 h-3" />
                        </button>
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
// ACTIVE TRADES TABLE (Shared Shipments Vault, buyer-filtered)
// ═══════════════════════════════════════════════════════════════════════════════
function ActiveTradesTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
        Active Trades — Shared Shipments Vault (buyer-filtered columns)
      </h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(56,189,248,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2.5 py-1.5 font-medium">USTN</th>
              <th className="px-2.5 py-1.5 font-medium">Counterparty</th>
              <th className="px-2.5 py-1.5 font-medium">Commodity</th>
              <th className="px-2.5 py-1.5 font-medium">Phase</th>
              <th className="px-2.5 py-1.5 font-medium">Next Action</th>
              <th className="px-2.5 py-1.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {BUYER_ACTIVE_TRADES.map((t, i) => (
              <tr key={t.ustn} className="border-t border-[rgba(56,189,248,0.06)] hover:bg-[rgba(59,130,246,0.04)] cursor-pointer">
                <td className="px-2.5 py-1.5 font-mono text-blue-300 text-[9px]">{t.ustn}</td>
                <td className="px-2.5 py-1.5 text-slate-200">{t.counterparty}</td>
                <td className="px-2.5 py-1.5 text-slate-300">{t.commodity}</td>
                <td className="px-2.5 py-1.5 text-purple-300 text-[9px]">{t.phase}</td>
                <td className="px-2.5 py-1.5 text-amber-300">{t.nextAction}</td>
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${t.health}%`,
                          background: t.health >= 80 ? "#10b981" : t.health >= 65 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">{t.health}</span>
                  </div>
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
// TRADE HEALTH SCORE BREAKDOWN (§2.5.2 / §16.13.8)
// ═══════════════════════════════════════════════════════════════════════════════
function TradeHealthScoreCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-300 mb-3">
        Trade Health Score Breakdown
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.13.8 · weighted composite)</span>
      </h3>
      <div className="space-y-2">
        {TRADE_HEALTH_SCORE.components.map((c) => {
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
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${c.score}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full"
                  style={{ background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-[rgba(56,189,248,0.08)] flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Composite Total</span>
        <span className="text-lg font-black text-emerald-300">{TRADE_HEALTH_SCORE.total}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL INTEGRATIONS HEALTH (§2.5.2 — Nafeza, CargoX, ETA, bank)
// ═══════════════════════════════════════════════════════════════════════════════
function ExternalIntegrationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-300 mb-3">
        External Integrations Health
        <span className="text-[9px] text-slate-500 font-normal ml-1">(aggregated every 10s)</span>
      </h3>
      <div className="space-y-1.5">
        {EXTERNAL_INTEGRATIONS.map((int) => {
          const Icon = int.icon;
          return (
            <div key={int.name} className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-200">{int.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-500">{int.latency}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${integrationStatus(int.status)}`}>
                  ● {int.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECENT ACTIVITY FEED (§2.5.2 — last 20 actions, real-time)
// ═══════════════════════════════════════════════════════════════════════════════
function RecentActivityFeed() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-300 mb-3">
        Recent Activity Feed
        <span className="text-[9px] text-slate-500 font-normal ml-1">(real-time via NATS)</span>
      </h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {RECENT_ACTIVITY.map((e, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">{e.actor}</span> {e.action}{" "}
                <span className="font-mono text-blue-300 text-[9px]">{e.target}</span>
              </p>
              <p className="text-[10px] text-slate-500">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECENT GOVERNOR DECISIONS (§3.5.8 plain-language panel)
// ═══════════════════════════════════════════════════════════════════════════════
function RecentDecisionsPanel() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-300 mb-3">
        Recent Governor Decisions
        <span className="text-[9px] text-slate-500 font-normal ml-1">(plain-language panel — §3.5.8)</span>
      </h3>
      <div className="space-y-2">
        {BUYER_RECENT_DECISIONS.map((d, i) => (
          <div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(56,189,248,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span>
                <span className="text-[10px] text-slate-200">{d.type}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>
                {d.verdict}
              </span>
            </div>
            <p className="text-[9px] text-blue-300 font-mono mb-1">{d.ustn}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p>
            <p className="text-[10px] text-slate-500 mt-1">{d.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CFR FINANCING PRE-CLEARANCE STATUS (§7)
// ═══════════════════════════════════════════════════════════════════════════════
function CFRStatusCard() {
  const c = CFR_STATUS;
  return (
    <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-950/15 to-[rgba(2,6,23,0.6)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-semibold text-slate-200">
          Financing Pre-Clearance (CFR)
          <span className="text-[9px] text-slate-500 font-normal ml-1">(§7 — Conditional Financing Reference)</span>
        </h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
          ● {c.status}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Phase</p>
          <p className="text-slate-200">{c.phase}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Financier</p>
          <p className="text-slate-200">{c.financier}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Facility</p>
          <p className="text-slate-200">{c.facility}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Declared Need (buyer)</p>
          <p className="text-emerald-300 font-mono">{c.declaredNeed}</p>
        </div>
        <div className="col-span-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Seller Declaration</p>
          <p className="text-slate-400 italic">{c.sellerDeclared}</p>
        </div>
      </div>
      <p className="text-[9px] text-slate-500 mt-2 pt-2 border-t border-emerald-500/10">
        ⚠ {c.bindingPost}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED CONTACTS (Trust Passports)
// ═══════════════════════════════════════════════════════════════════════════════
function SavedContactsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-300 mb-3">
        Saved Contacts — Trust Passports
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§4.1 — non-marketplace: only invited, known parties)</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {BUYER_SAVED_CONTACTS.map((c) => {
          const trustColor = c.trustScore >= 85 ? "text-emerald-300" : c.trustScore >= 70 ? "text-amber-300" : "text-rose-300";
          return (
            <div key={c.gtid} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(56,189,248,0.06)] hover:border-[rgba(56,189,248,0.2)] transition-all">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-semibold text-white truncate">{c.name}</p>
                <span className={`text-[9px] font-mono font-bold ${trustColor}`}>{c.trustScore}</span>
              </div>
              <p className="text-[10px] font-mono text-blue-300 truncate">{c.gtid}</p>
              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                <span>{c.role}</span>
                <span>{c.trades} trades</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
