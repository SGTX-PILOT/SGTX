"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #2 — Trader Portal: Seller Mode — Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
//
// v18 spec refs:
//   §2.5.1  Smart Inbox (seller-specific items)
//   §2.5.2  Trade Command Center (seller metrics)
//   §16.8.6.2 Seller feature list
//   §16.10  Seller Dashboard
//   §8      Seller Workflow (Quote, Packing & Logistics)

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Bell, ChevronRight, ChevronDown, Zap, X,
  TrendingUp, TrendingDown, Minus, Check, DollarSign,
} from "lucide-react";
import {
  SELLER_TENANT, SELLER_INBOX, SELLER_SUMMARY_CARDS, SELLER_QUICK_ACTIONS,
  SELLER_HEALTH_SCORE, SELLER_ACTIVE_TRADES, PENDING_REQUESTS,
  EXW_MARKET_DATA, LOGISTICS_MODES, LAB_OPTIONS, QC_BOOKING,
  BARCODE_JOBS, CASH_POSITION, SELLER_PORTAL_FEATURES,
  SELLER_RECENT_ACTIVITY, SELLER_INTEGRATIONS, SELLER_RECENT_DECISIONS,
  SELLER_SIDEBAR_ROLE,
} from "@/lib/sgtx/landing/portal-seller-data";
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
  return "bg-blue-400";
};

const integrationStatus = (s: string) => {
  if (s === "operational") return "text-emerald-300 bg-emerald-500/10";
  if (s === "degraded") return "text-amber-300 bg-amber-500/10";
  return "text-rose-300 bg-rose-500/10";
};

export function SellerPortalDashboard() {
  const [activeTab, setActiveTab] = useState("smart-inbox");
  const [priorityFilter, setPriorityFilter] = useState<PriorityBand>("All");
  const [expandedInbox, setExpandedInbox] = useState<string | null>("INB-2026-0944");
  const [showFullDashboard, setShowFullDashboard] = useState(false);

  const filteredInbox = priorityFilter === "All"
    ? SELLER_INBOX
    : SELLER_INBOX.filter(i => i.band === priorityFilter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.10 · Portal #2 — Trader Portal (Seller Mode)"
          title="Seller Dashboard — Live Preview"
          subtitle="The default post-login landing surface for an authenticated Seller (Sahara Exports Co., GTID SGTX-EG-26-SX7K-0008, KYB Tier 3, SELL mode)."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullDashboard(!showFullDashboard)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-purple-500/30"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
          >
            {showFullDashboard ? <><X className="w-3.5 h-3.5" /> Collapse Full Dashboard</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Dashboard</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Seller-specific: Pending Requests, EXW Lock, Packing, Logistics Builder (3 modes), Lab Selection, QC Booking, Barcode Print, Cash Position.
          </span>
        </div>

        <AnimatePresence mode="wait">
          {showFullDashboard && (
            <motion.div
              key="seller-dashboard"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              <SellerPortalFrame
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
            {SELLER_PORTAL_FEATURES.map((f, i) => (
              <motion.div
                key={f.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03 }}
                className="p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)]"
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[11px] font-semibold text-white">{f.name}</h4>
                  <span className="text-[8px] font-mono text-slate-500">{f.section}</span>
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
// PORTAL FRAME — header + sidebar + main
// ═══════════════════════════════════════════════════════════════════════════════
function SellerPortalFrame({
  activeTab, setActiveTab, priorityFilter, setPriorityFilter,
  filteredInbox, expandedInbox, setExpandedInbox,
}: any) {
  return (
    <div className="rounded-2xl border border-[rgba(139,92,246,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* ── Global Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(139,92,246,0.15)] bg-[rgba(2,6,23,0.95)]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-md"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}>
            S
          </div>
          <span className="text-xs font-bold text-white">SGTX</span>
        </div>

        <div className="hidden md:flex flex-1 max-w-md mx-4 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            placeholder="Search USTN, GTID, Request Ref, Contract ID, Loom hash…"
            className="w-full pl-8 pr-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(139,92,246,0.12)] rounded-lg focus:outline-none focus:border-purple-400/40"
            aria-label="Universal search"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Dual-Mode Toggle — SELL active */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-[rgba(15,23,42,0.6)] border border-[rgba(139,92,246,0.12)]">
            <button className="px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded-full">BUY</button>
            <button className="px-2 py-0.5 text-[10px] font-bold text-white rounded-full bg-gradient-to-r from-purple-500 to-cyan-500">SELL</button>
            <button className="px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 rounded-full">DUAL</button>
          </div>
          <button className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(139,92,246,0.08)]" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[8px] font-bold text-white bg-red-500 rounded-full flex items-center justify-center">4</span>
          </button>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">
            {SELLER_TENANT.avatarInitials}
          </div>
        </div>
      </div>

      {/* ── Body: Sidebar + Main ───────────────────────────────────────── */}
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-52 lg:w-56 border-r border-[rgba(139,92,246,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[1600px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">Common Tabs</p>
          {SIDEBAR_ITEMS.map((item: any) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label.toLowerCase().replace(/\s/g, "-"))}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${
                  activeTab === item.label.toLowerCase().replace(/\s/g, "-")
                    ? "bg-purple-500/15 text-purple-200 border-purple-400/30"
                    : "text-slate-300 hover:bg-[rgba(139,92,246,0.06)] hover:text-white border-transparent"
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
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold mt-2">Seller Role</p>
          {SELLER_SIDEBAR_ROLE.map((item: any) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg text-slate-300 hover:bg-[rgba(139,92,246,0.06)] hover:text-white transition-all text-left border border-transparent">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Tenant card */}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(139,92,246,0.1)]">
            <p className="text-[9px] text-slate-400 truncate">{SELLER_TENANT.name}</p>
            <p className="text-[8px] font-mono text-purple-300 truncate">{SELLER_TENANT.gtid}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">T{SELLER_TENANT.kybTier}</span>
              <span className="text-[8px] text-slate-500">Trust {SELLER_TENANT.trustScore}</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-3 lg:p-4 space-y-4 max-w-full overflow-x-hidden">
          <SellerWelcomeBar />

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {SELLER_SUMMARY_CARDS.map((c) => {
              const Icon = c.icon;
              const TrendIcon = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
              return (
                <div key={c.label} className="p-2.5 rounded-lg border border-[rgba(139,92,246,0.1)] bg-[rgba(15,23,42,0.6)]">
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                    <TrendIcon className={`w-3 h-3 ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-rose-400" : "text-slate-500"}`} />
                  </div>
                  <div className="text-lg font-bold text-white">{c.value}</div>
                  <div className="text-[9px] text-slate-400">{c.label}</div>
                  <div className={`text-[8px] ${c.trend === "up" ? "text-emerald-400" : c.trend === "down" ? "text-emerald-400" : "text-slate-500"}`}>{c.delta}</div>
                </div>
              );
            })}
          </div>

          {/* Quick actions */}
          <div>
            <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-purple-400" /> Quick Actions (seller + SELL mode aware, max 8)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SELLER_QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button key={a.key} className="p-2.5 rounded-lg border border-[rgba(139,92,246,0.1)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(139,92,246,0.3)] hover:bg-[rgba(30,41,59,0.6)] transition-all text-left group">
                    <div className="flex items-center justify-between mb-1">
                      <Icon className="w-4 h-4 text-purple-300 group-hover:scale-110 transition-transform" />
                      {a.oneClick && (
                        <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">1-CLICK</span>
                      )}
                    </div>
                    <p className="text-[10px] font-semibold text-white leading-tight">{a.label}</p>
                    <p className="text-[8px] text-slate-500 mt-0.5">{a.specRef}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Smart Inbox (seller-specific) */}
          <SellerSmartInbox
            filteredInbox={filteredInbox}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            expandedInbox={expandedInbox}
            setExpandedInbox={setExpandedInbox}
          />

          {/* Pending Requests (accept/decline/counter) */}
          <PendingRequestsPanel />

          {/* Two-column: EXW Price Lock + Cash Position */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ExwPriceLockCard />
            <CashPositionCard />
          </div>

          {/* Logistics Builder (3 modes) */}
          <LogisticsBuilderCard />

          {/* Active Trades table */}
          <SellerActiveTradesTable />

          {/* Two-column: Trade Health Score + External Integrations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SellerHealthScoreCard />
            <SellerIntegrationsCard />
          </div>

          {/* Two-column: Lab Selection + QC Booking */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LabSelectionCard />
            <QCBookingCard />
          </div>

          {/* Barcode Print jobs */}
          <BarcodePrintCard />

          {/* Two-column: Recent Activity + Governor Decisions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <SellerActivityFeed />
            <SellerDecisionsPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WELCOME BAR + HEALTH GAUGE
// ═══════════════════════════════════════════════════════════════════════════════
function SellerWelcomeBar() {
  const health = SELLER_HEALTH_SCORE.total;
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (health / 100) * circumference;
  const healthColor = health >= 80 ? "#10b981" : health >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-4 rounded-xl border border-[rgba(139,92,246,0.15)] bg-gradient-to-r from-purple-950/30 to-cyan-950/20 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400">Welcome back,</p>
        <h3 className="text-sm font-bold text-white truncate">{SELLER_TENANT.name}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-purple-300">{SELLER_TENANT.gtid}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono">KYB T{SELLER_TENANT.kybTier}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-mono">{SELLER_TENANT.traderMode} MODE</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono">Cash {SELLER_TENANT.cashPosition}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-20 h-20">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(139,92,246,0.1)" strokeWidth="6" />
            <circle cx="32" cy="32" r="28" fill="none" stroke={healthColor} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{health}</span>
            <span className="text-[8px] text-slate-500">HEALTH</span>
          </div>
        </div>
        <div className="hidden sm:block">
          <p className="text-[10px] font-semibold text-slate-300">Trade Health Score</p>
          <p className="text-[9px] text-slate-500">Seller composite (0–100)</p>
          <p className="text-[9px] text-emerald-400 mt-1">● Excellent</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART INBOX (seller-specific)
// ═══════════════════════════════════════════════════════════════════════════════
function SellerSmartInbox({ filteredInbox, priorityFilter, setPriorityFilter, expandedInbox, setExpandedInbox }: any) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
          Smart Inbox — Seller-Specific Items
          <span className="text-[9px] text-slate-500 font-normal">(§2.5.1 · 4-part: WHAT / WHY / DEADLINE / ACTION)</span>
        </h3>
        <div className="flex items-center gap-1">
          {(["All", "High", "Medium", "Low"] as PriorityBand[]).map(b => (
            <button key={b} onClick={() => setPriorityFilter(b)} className={`px-2 py-0.5 text-[9px] font-medium rounded-full border transition-all ${priorityFilter === b ? "bg-purple-500/20 border-purple-400/40 text-purple-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(139,92,246,0.1)] text-slate-400 hover:text-slate-200"}`}>
              {b}
              <span className="ml-0.5 text-[8px] text-slate-500">{b === "All" ? SELLER_INBOX.length : SELLER_INBOX.filter(i => i.band === b).length}</span>
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
              <button onClick={() => setExpandedInbox(expanded ? null : item.id)} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-[rgba(139,92,246,0.04)] transition-colors">
                <div className="w-7 h-7 rounded-md bg-[rgba(139,92,246,0.1)] flex items-center justify-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-purple-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-semibold text-white truncate">{item.what}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 ${item.band === "High" ? "bg-red-500/15 text-red-300" : item.band === "Medium" ? "bg-amber-500/15 text-amber-300" : "bg-slate-500/15 text-slate-300"}`}>{item.priority}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 font-mono">{item.category} · {item.id}</p>
                </div>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t border-[rgba(139,92,246,0.06)]">
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-4 gap-2 text-[10px]">
                      <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHAT</p><p className="text-slate-200 leading-relaxed">{item.what}</p></div>
                      <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">WHY</p><p className="text-slate-400 leading-relaxed">{item.why}</p></div>
                      <div><p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">DEADLINE</p><p className="text-amber-300 leading-relaxed font-mono">{item.deadline}</p>{item.ustn && <p className="text-[9px] text-purple-300 font-mono mt-1">{item.ustn}</p>}</div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[8px] text-slate-500 uppercase tracking-wider font-bold mb-0.5">ACTION</p>
                        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white rounded-md bg-gradient-to-r from-purple-500 to-cyan-500 hover:shadow-lg hover:shadow-purple-500/30 transition-all">{item.action} <ChevronRight className="w-3 h-3" /></button>
                        <div className="flex gap-1 mt-0.5">
                          <button className="text-[8px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Snooze 2h</button>
                          <button className="text-[8px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 hover:text-slate-200">Dismiss</button>
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
// PENDING REQUESTS (accept / decline / counter)
// ═══════════════════════════════════════════════════════════════════════════════
function PendingRequestsPanel() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Pending Requests — Accept / Decline / Counter
        <span className="text-[9px] text-slate-500 font-normal">(§8.1 · anonymised market range comparison)</span>
      </h3>
      <div className="space-y-2">
        {PENDING_REQUESTS.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="p-3 rounded-lg border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.5)]">
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500">{r.id}</span>
                  <span className="text-[11px] font-semibold text-white">{r.buyer}</span>
                  <span className="text-[9px] font-mono text-purple-300">{r.buyerGtid}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{r.commodity}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 transition-all">Accept</button>
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30 transition-all">Counter</button>
                <button className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-md bg-rose-500/20 border border-rose-400/30 text-rose-200 hover:bg-rose-500/30 transition-all">Decline</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div><p className="text-[8px] text-slate-500 uppercase tracking-wider">Incoterm</p><p className="text-slate-300">{r.incoterm}</p></div>
              <div><p className="text-[8px] text-slate-500 uppercase tracking-wider">Delivery Window</p><p className="text-slate-300">{r.deliveryWindow}</p></div>
              <div><p className="text-[8px] text-slate-500 uppercase tracking-wider">Market Range</p><p className="text-emerald-300 font-mono">{r.marketRange}</p></div>
              <div><p className="text-[8px] text-slate-500 uppercase tracking-wider">Your Draft Quote</p><p className="text-purple-300 font-mono">{r.yourDraftQuote}</p></div>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(139,92,246,0.06)] text-[9px] text-slate-500">
              <span>Received {r.receivedAt}</span>
              <span className="text-amber-400 font-mono">⏱ Expires in {r.expires}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXW PRICE LOCK WIDGET (live market chart + sparkline)
// ═══════════════════════════════════════════════════════════════════════════════
function ExwPriceLockCard() {
  const m = EXW_MARKET_DATA;
  const prices = m.history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const points = m.history.map((h, i) => `${(i / (m.history.length - 1)) * 100},${30 - ((h.price - min) / range) * 25}`).join(" ");

  return (
    <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> EXW Price Lock
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§8.3 · live market + fair price A2)</span>
      </h3>
      <p className="text-[9px] text-slate-400 mb-2">{m.commodity}</p>

      {/* Sparkline chart */}
      <div className="relative h-12 mb-2">
        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke="#10b981" strokeWidth="1.5" />
          <polyline points={`${points} 100,30 0,30`} fill="url(#exwGrad)" opacity="0.3" />
          <defs>
            <linearGradient id="exwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center p-1.5 rounded bg-emerald-500/10 border border-emerald-500/15">
          <p className="text-[8px] text-slate-500 uppercase">Your Price</p>
          <p className="text-emerald-300 font-bold font-mono">{m.yourPrice}</p>
        </div>
        <div className="text-center p-1.5 rounded bg-slate-700/30">
          <p className="text-[8px] text-slate-500 uppercase">Market Avg</p>
          <p className="text-slate-200 font-mono">{m.marketAvg}</p>
        </div>
        <div className="text-center p-1.5 rounded bg-slate-700/30">
          <p className="text-[8px] text-slate-500 uppercase">Range</p>
          <p className="text-slate-400 font-mono text-[9px]">{m.marketLow}–{m.marketHigh}</p>
        </div>
      </div>

      <div className="mt-2 pt-2 border-t border-emerald-500/10">
        <p className="text-[9px] text-emerald-300 font-semibold flex items-center gap-1">✓ Within range (45th percentile) · {m.trend}</p>
        <p className="text-[9px] text-slate-400 mt-1 leading-relaxed">{m.fairPriceAssessment}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH POSITION (rolling forecast with sparkline)
// ═══════════════════════════════════════════════════════════════════════════════
function CashPositionCard() {
  const c = CASH_POSITION;
  const values = c.forecastPoints.map(f => f.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = c.forecastPoints.map((f, i) => `${(i / (c.forecastPoints.length - 1)) * 100},${30 - ((f.value - min) / range) * 25}`).join(" ");

  return (
    <div className="p-3.5 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-2">
        Cash Position — Rolling Forecast (30d)
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§16.10)</span>
      </h3>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-black text-emerald-300">{c.current}</span>
        <span className="text-[9px] text-emerald-400">→ {c.netForecast30d} (30d)</span>
      </div>
      <div className="relative h-12 mb-2">
        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
          <polyline points={`${points} 100,30 0,30`} fill="url(#cashGrad)" opacity="0.3" />
          <defs>
            <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <div className="p-1.5 rounded bg-emerald-500/10"><p className="text-[8px] text-slate-500 uppercase">Incoming</p><p className="text-emerald-300 font-mono">{c.incoming}</p></div>
        <div className="p-1.5 rounded bg-amber-500/10"><p className="text-[8px] text-slate-500 uppercase">Outgoing</p><p className="text-amber-300 font-mono">{c.outgoing}</p></div>
        <div className="p-1.5 rounded bg-purple-500/10 col-span-2"><p className="text-[8px] text-slate-500 uppercase">Pending (if all quotes accepted)</p><p className="text-purple-300 font-mono">{c.pending}</p></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGISTICS BUILDER (3 modes A/B/C)
// ═══════════════════════════════════════════════════════════════════════════════
function LogisticsBuilderCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">
        Logistics Builder — 3 Modes
        <span className="text-[9px] text-slate-500 font-normal ml-1">(§8.5 · A: RFQ to LSPs, B: Direct to SHIP, C: Seller-managed)</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {LOGISTICS_MODES.map((mode) => (
          <div key={mode.mode} className={`p-3 rounded-lg border ${mode.recommended ? "border-emerald-500/30 bg-emerald-500/5" : "border-[rgba(139,92,246,0.1)] bg-[rgba(255,255,255,0.02)]"}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${mode.recommended ? "bg-emerald-500/20 text-emerald-300" : "bg-purple-500/20 text-purple-300"}`}>{mode.mode}</span>
                <span className="text-[10px] font-semibold text-white">{mode.name}</span>
              </div>
              {mode.recommended && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">RECOMMENDED</span>}
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed mb-2">{mode.description}</p>
            <div className="space-y-1">
              {mode.quotes.map((q, i) => (
                <button key={i} className={`w-full flex items-center justify-between p-1.5 rounded text-[9px] border transition-all ${q.selected ? "bg-emerald-500/10 border-emerald-500/20" : "bg-[rgba(255,255,255,0.02)] border-[rgba(139,92,246,0.06)] hover:border-[rgba(139,92,246,0.2)]"}`}>
                  <span className="text-slate-300 truncate">{q.provider}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-white font-mono font-bold">{q.price}</span>
                    <span className="text-slate-500">{q.eta}</span>
                    {q.selected && <Check className="w-3 h-3 text-emerald-400" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVE TRADES TABLE (seller-filtered)
// ═══════════════════════════════════════════════════════════════════════════════
function SellerActiveTradesTable() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-300 mb-2">Active Trades — Shared Shipments Vault (seller-filtered)</h3>
      <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-[rgba(139,92,246,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
            <tr className="text-left text-slate-400">
              <th className="px-2.5 py-1.5 font-medium">USTN</th>
              <th className="px-2.5 py-1.5 font-medium">Buyer</th>
              <th className="px-2.5 py-1.5 font-medium">Commodity</th>
              <th className="px-2.5 py-1.5 font-medium">Phase</th>
              <th className="px-2.5 py-1.5 font-medium">Next Action</th>
              <th className="px-2.5 py-1.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {SELLER_ACTIVE_TRADES.map((t) => (
              <tr key={t.ustn} className="border-t border-[rgba(139,92,246,0.06)] hover:bg-[rgba(139,92,246,0.04)] cursor-pointer">
                <td className="px-2.5 py-1.5 font-mono text-purple-300 text-[9px]">{t.ustn}</td>
                <td className="px-2.5 py-1.5 text-slate-200">{t.buyer}</td>
                <td className="px-2.5 py-1.5 text-slate-300">{t.commodity}</td>
                <td className="px-2.5 py-1.5 text-purple-300 text-[9px]">{t.phase}</td>
                <td className="px-2.5 py-1.5 text-amber-300">{t.nextAction}</td>
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-10 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${t.health}%`, background: t.health >= 85 ? "#10b981" : t.health >= 75 ? "#f59e0b" : "#ef4444" }} />
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
// HEALTH SCORE + INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════════
function SellerHealthScoreCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Trade Health Score Breakdown <span className="text-[9px] text-slate-500 font-normal">(§16.13.8)</span></h3>
      <div className="space-y-2">
        {SELLER_HEALTH_SCORE.components.map((c) => {
          const Icon = c.icon;
          const color = c.score >= 85 ? "#10b981" : c.score >= 70 ? "#f59e0b" : "#ef4444";
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-0.5 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-300">{c.name}</span>
                  <span className="text-[8px] text-slate-500 font-mono">({c.weight}%)</span>
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
      <div className="mt-3 pt-2 border-t border-[rgba(139,92,246,0.08)] flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Composite Total</span>
        <span className="text-lg font-black text-emerald-300">{SELLER_HEALTH_SCORE.total}</span>
      </div>
    </div>
  );
}

function SellerIntegrationsCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">External Integrations Health <span className="text-[9px] text-slate-500 font-normal">(aggregated every 10s)</span></h3>
      <div className="space-y-1.5">
        {SELLER_INTEGRATIONS.map((int) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// LAB SELECTION + QC BOOKING
// ═══════════════════════════════════════════════════════════════════════════════
function LabSelectionCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Laboratory Selection <span className="text-[9px] text-slate-500 font-normal">(§8.6 · ISO 17025 accredited)</span></h3>
      <div className="space-y-1.5">
        {LAB_OPTIONS.map((lab, i) => (
          <div key={lab.gtid} className={`p-2 rounded-lg border ${i === 0 ? "border-emerald-500/20 bg-emerald-500/5" : "border-[rgba(139,92,246,0.08)] bg-[rgba(255,255,255,0.02)]"}`}>
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-[10px] font-semibold text-white">{lab.lab}</p>
                <p className="text-[8px] font-mono text-purple-300">{lab.gtid}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-emerald-300 font-mono">{lab.price}</p>
                <p className="text-[8px] text-slate-500">{lab.turnaround} · {lab.distance}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[8px] text-slate-400 flex-wrap">
              <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-300">{lab.accreditation}</span>
              <span>Trust {lab.trustScore}</span>
              <span>· {lab.tests}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QCBookingCard() {
  const q = QC_BOOKING;
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">QC Booking <span className="text-[9px] text-slate-500 font-normal">(§8.7 · AI-recommended points)</span></h3>
      <div className="space-y-1.5 text-[10px]">
        <div className="flex justify-between"><span className="text-slate-500">Inspection</span><span className="text-slate-200">{q.inspectionType}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">AQL</span><span className="text-slate-200">{q.aqlLevel}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Provider</span><span className="text-purple-300">{q.provider}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Inspector</span><span className="text-slate-200">{q.inspector}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Scheduled</span><span className="text-amber-300 font-mono">{q.scheduledDate}</span></div>
        <div className="mt-2 pt-2 border-t border-[rgba(139,92,246,0.08)]">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider mb-1">AI Recommendation (A2)</p>
          <p className="text-[9px] text-slate-400 leading-relaxed">{q.aiRecommended}</p>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-[9px] text-emerald-300">Coverage validated (2 providers within 50km)</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BARCODE PRINT JOBS
// ═══════════════════════════════════════════════════════════════════════════════
function BarcodePrintCard() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Barcode Print Jobs <span className="text-[9px] text-slate-500 font-normal">(§8.4.3 · SSCC pallet labels · ZPL/PDF)</span></h3>
      <div className="overflow-x-auto rounded-lg border border-[rgba(139,92,246,0.08)]">
        <table className="w-full text-[10px]">
          <thead className="bg-[rgba(2,6,23,0.6)]">
            <tr className="text-left text-slate-400">
              <th className="px-2 py-1.5 font-medium">Job ID</th>
              <th className="px-2 py-1.5 font-medium">USTN</th>
              <th className="px-2 py-1.5 font-medium">Pallets</th>
              <th className="px-2 py-1.5 font-medium">Format</th>
              <th className="px-2 py-1.5 font-medium">Printer</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {BARCODE_JOBS.map((j) => (
              <tr key={j.job} className="border-t border-[rgba(139,92,246,0.06)]">
                <td className="px-2 py-1.5 font-mono text-purple-300">{j.job}</td>
                <td className="px-2 py-1.5 font-mono text-slate-400 text-[9px]">{j.ustn}</td>
                <td className="px-2 py-1.5 text-white font-mono">{j.pallets}</td>
                <td className="px-2 py-1.5 text-slate-300">{j.format}</td>
                <td className="px-2 py-1.5 text-slate-400 text-[9px]">{j.printer}</td>
                <td className="px-2 py-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${j.status === "Ready" ? "bg-amber-500/15 text-amber-300" : j.status === "Printed" ? "bg-emerald-500/15 text-emerald-300" : "bg-blue-500/15 text-blue-300"}`}>{j.status}</span>
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
// ACTIVITY FEED + DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════
function SellerActivityFeed() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Activity <span className="text-[9px] text-slate-500 font-normal">(real-time via NATS)</span></h3>
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {SELLER_RECENT_ACTIVITY.map((e, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${activityColor(e.type)}`} />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-slate-300 leading-relaxed">
                <span className="font-semibold text-white">{e.actor}</span> {e.action} <span className="font-mono text-purple-300 text-[9px]">{e.target}</span>
              </p>
              <p className="text-[8px] text-slate-500">{e.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SellerDecisionsPanel() {
  return (
    <div className="p-3.5 rounded-xl border border-[rgba(139,92,246,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-[11px] font-semibold text-slate-200 mb-3">Recent Governor Decisions <span className="text-[9px] text-slate-500 font-normal">(plain-language §3.5.8)</span></h3>
      <div className="space-y-2">
        {SELLER_RECENT_DECISIONS.map((d, i) => (
          <div key={i} className="p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(139,92,246,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-300">{d.gate}</span>
                <span className="text-[10px] text-slate-200">{d.type}</span>
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${verdictColor(d.verdict)}`}>{d.verdict}</span>
            </div>
            <p className="text-[9px] text-purple-300 font-mono mb-1">{d.ustn}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{d.reason}</p>
            <p className="text-[8px] text-slate-500 mt-1">{d.timestamp}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
