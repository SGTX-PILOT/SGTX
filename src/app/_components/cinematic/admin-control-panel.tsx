"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Server, Database, Cpu, ShieldCheck, Users, Globe2,
  Scale, Gavel, GitBranch, KeyRound, Eye, AlertTriangle,
  CheckCircle2, Clock, DollarSign, Settings, Layers, Zap,
  Brain, Lock, FileText, TrendingUp, TrendingDown,
  Search, X, ChevronRight, Bell, Cpu as CpuIcon,
  Building2, Banknote, Atom, CircuitBoard, Cloud, HardDrive,
} from "lucide-react";
import {
  SYSTEM_KPIs, SYSTEM_HEALTH, LIVE_GOVERNOR_FEED, TENANT_REGISTRY,
  CONSTITUTION_STATE, MULTISIG_KEYHOLDERS, MULTISIG_PENDING_CEREMONIES,
  AI_AGENT_REGISTRY, ATTACK_SURFACE, PASSKEY_RECOVERY_QUEUE,
  FEATURE_FLAGS, FEE_BOUNDS, CRON_JOBS, ADDON_ACTIVATIONS,
  PLATFORM_METRICS, ADMIN_TABS, STATUS_COLOR, VERDICT_COLOR,
} from "@/lib/sgtx/admin/control-panel-data";

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM ADMIN CONTROL PANEL
// ═══════════════════════════════════════════════════════════════════════════════
// The platform owner's command center. 10 tabs covering every aspect of
// platform control: system overview, constitution, tenants, governor,
// Loom chain, AI agents, security, multisig, config, diagnostics.
//
// State-of-the-art: dark cinematic theme, real-time-looking metrics, animated
// decision feed, constitutional governance with blast radius, 3-of-5 multisig
// ceremony, AI agent registry with fallback chains, attack surface map,
// feature flags + fee bounds, cron monitor, add-on activation.
// ═══════════════════════════════════════════════════════════════════════════════

export function AdminControlPanel() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="rounded-2xl border border-purple-500/15 bg-[#050816]/95 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Header — platform owner identity */}
      <header className="flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-white/[0.06] bg-gradient-to-r from-purple-950/20 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
            <ShieldCheck className="w-5 h-5 text-purple-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-white truncate">Platform Admin Control Panel</h2>
            <p className="text-[10px] text-slate-500 font-mono truncate">SGTX-EG-26-ADM-0001 · Platform Governance Authority · 3-of-5 multisig</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Sovereign
          </span>
          <button className="relative p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/5">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] overflow-x-auto portals-scrollbar">
        {ADMIN_TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap ${
                active ? "bg-purple-500/15 text-purple-200 border border-purple-500/30" : "text-slate-400 hover:text-white border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="w-3 h-3" /> {tab.label}
              {tab.badge && (
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${active ? "bg-purple-500/20 text-purple-200" : "bg-white/10 text-slate-400"}`}>{tab.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="p-4 lg:p-5 overflow-y-auto portals-scrollbar" style={{ maxHeight: "640px" }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {activeTab === "overview" && <OverviewTab />}
            {activeTab === "constitution" && <ConstitutionTab />}
            {activeTab === "tenants" && <TenantsTab />}
            {activeTab === "governor" && <GovernorTab />}
            {activeTab === "loom" && <LoomTab />}
            {activeTab === "ai" && <AITab />}
            {activeTab === "security" && <SecurityTab />}
            {activeTab === "multisig" && <MultisigTab />}
            {activeTab === "config" && <ConfigTab />}
            {activeTab === "diagnostics" && <DiagnosticsTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="px-4 lg:px-6 py-2.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>{PLATFORM_METRICS.totalTenants.toLocaleString()} tenants · {PLATFORM_METRICS.totalTrades.toLocaleString()} trades · ${PLATFORM_METRICS.totalValueRouted / 1e9}B routed</span>
        <span className="hidden sm:inline">Constitutional: 3-of-5 multisig · 30-day notice · Loom-audited</span>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OverviewTab() {
  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {SYSTEM_KPIs.map((kpi, i) => {
          const Icon = kpi.icon;
          const TrendIcon = kpi.trend === "up" ? TrendingUp : kpi.trend === "down" ? TrendingDown : Activity;
          return (
            <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center justify-between mb-2">
                <Icon className="w-4 h-4" style={{ color: kpi.color }} />
                <span className={`text-[9px] font-mono flex items-center gap-0.5 ${kpi.trend === "up" ? "text-emerald-400" : kpi.trend === "down" ? "text-rose-400" : "text-slate-500"}`}>
                  <TrendIcon className="w-2.5 h-2.5" /> {kpi.delta}
                </span>
              </div>
              <div className="text-[18px] font-bold text-white leading-none">{kpi.value}</div>
              <div className="text-[9px] text-slate-500 mt-1 uppercase tracking-wider">{kpi.label}</div>
            </div>
          );
        })}
      </div>

      {/* Live governor feed */}
      <div>
        <h3 className="text-[12px] font-semibold text-slate-300 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Live Governor Decision Feed
        </h3>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
          {LIVE_GOVERNOR_FEED.map((d, i) => (
            <div key={d.id} className={`flex items-center gap-3 px-3 py-2 text-[11px] ${i !== LIVE_GOVERNOR_FEED.length - 1 ? "border-b border-white/[0.03]" : ""}`}>
              <span className="text-slate-500 font-mono w-16 flex-shrink-0">{d.time}</span>
              <span className="text-slate-400 font-mono truncate flex-1 min-w-0">{d.gtid}</span>
              <span className="text-slate-300 truncate w-32 hidden sm:block">{d.action}</span>
              <span className="text-purple-300 font-mono flex-shrink-0">{d.gate}</span>
              <span className="font-semibold flex-shrink-0" style={{ color: VERDICT_COLOR[d.verdict] }}>{d.verdict}</span>
              <span className="text-slate-600 font-mono flex-shrink-0 hidden md:block">{d.latency}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Platform metrics summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Tenants", value: PLATFORM_METRICS.activeTenants.toLocaleString(), sub: `${PLATFORM_METRICS.pendingTenants} pending` },
          { label: "Trades settled", value: PLATFORM_METRICS.totalTrades.toLocaleString(), sub: "all-time" },
          { label: "Value routed", value: `$${PLATFORM_METRICS.totalValueRouted / 1e9}B`, sub: "all-time" },
          { label: "Loom blocks", value: PLATFORM_METRICS.totalLoomBlocks.toLocaleString(), sub: "0 reorgs" },
        ].map((m, i) => (
          <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent">
            <div className="text-[20px] font-bold text-white">{m.value}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{m.label}</div>
            <div className="text-[9px] text-slate-600 mt-0.5">{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: CONSTITUTION
// ═══════════════════════════════════════════════════════════════════════════════
function ConstitutionTab() {
  return (
    <div className="space-y-4">
      {/* Constitution summary */}
      <div className="p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-purple-300" />
            <h3 className="text-[14px] font-semibold text-white">Layer 0 — Immutable Constitution</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/20">38 points</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          The 38-point transaction constitution is Layer 0 (immutable). Changes require 3-of-5 multisig + 30-day public notice. The Platform Governance Authority is bound by its own rules — no unilateral override.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div><div className="text-[16px] font-bold text-white">{PLATFORM_METRICS.constitutionPoints}</div><div className="text-[9px] text-slate-500">Total points</div></div>
          <div><div className="text-[16px] font-bold text-amber-300">{PLATFORM_METRICS.activeAmendments}</div><div className="text-[9px] text-slate-500">Active amendments</div></div>
          <div><div className="text-[16px] font-bold text-emerald-300">{PLATFORM_METRICS.multisigThreshold}/{PLATFORM_METRICS.multisigKeyholders}</div><div className="text-[9px] text-slate-500">Multisig threshold</div></div>
        </div>
      </div>

      {/* Points list */}
      <div className="space-y-1.5">
        {CONSTITUTION_STATE.map(p => {
          const statusColor = STATUS_COLOR[p.status] || "#94a3b8";
          return (
            <div key={p.number} className="flex items-start gap-3 p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/[0.1] transition-all">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono" style={{ background: "rgba(124,58,237,0.1)", color: "#c4b5fd" }}>
                {p.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/20">{p.layer}</span>
                  <span className="text-[9px] text-slate-500">{p.category}</span>
                  <span className="text-[9px] font-mono ml-auto" style={{ color: statusColor }}>● {p.status.replace("-", " ")}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-snug">{p.principle}</p>
                <p className="text-[9px] text-slate-600 mt-1 font-mono">Last modified: {p.lastModified}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: TENANTS
// ═══════════════════════════════════════════════════════════════════════════════
function TenantsTab() {
  const [search, setSearch] = useState("");
  const filtered = TENANT_REGISTRY.filter(t =>
    !search || t.legalName.toLowerCase().includes(search.toLowerCase()) || t.gtid.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenants (name or GTID)…"
            className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/15" />
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{filtered.length} shown</span>
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-2 px-3 py-2 text-[9px] font-mono uppercase tracking-wider text-slate-500 border-b border-white/[0.06] bg-white/[0.02]">
          <span>Tenant</span><span className="hidden sm:block">Type</span><span>KYB</span><span>Status</span><span className="hidden md:block">Volume</span>
        </div>
        {filtered.map(t => {
          const statusColor = STATUS_COLOR[t.status];
          return (
            <div key={t.gtid} className="grid grid-cols-[1fr,auto,auto,auto,auto] gap-2 px-3 py-2 text-[11px] border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors items-center">
              <div className="min-w-0">
                <div className="text-white font-medium truncate">{t.legalName}</div>
                <div className="text-[9px] text-slate-500 font-mono truncate">{t.gtid} · {t.country}</div>
              </div>
              <span className="hidden sm:block text-slate-400 font-mono text-[10px]">{t.type}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${t.kybTier === 4 ? "bg-emerald-500/10 text-emerald-300" : t.kybTier === 3 ? "bg-blue-500/10 text-blue-300" : "bg-slate-500/10 text-slate-300"}`}>T{t.kybTier}</span>
              <span className="text-[10px] font-medium" style={{ color: statusColor }}>● {t.status}</span>
              <span className="hidden md:block text-slate-400 font-mono text-[10px]">{t.tradeVolume}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <AlertTriangle className="w-3 h-3 text-amber-400" />
        Suspend/Revoke actions require 2-of-5 multisig + logged to Loom chain.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: GOVERNOR
// ═══════════════════════════════════════════════════════════════════════════════
function GovernorTab() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <h3 className="text-[13px] font-semibold text-white mb-3 flex items-center gap-2"><Gavel className="w-4 h-4 text-purple-300" /> Governor Gates G1-G7</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">Single point of truth. Every irreversible action passes through the Governor. Seven constitutional gates sit between intent and execution.</p>
        <div className="grid grid-cols-7 gap-2">
          {["G1","G2","G3","G4","G5","G6","G7"].map(g => (
            <div key={g} className="text-center p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-[11px] font-bold text-emerald-300">{g}</div>
              <div className="text-[8px] text-slate-500 mt-0.5">live</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-[12px] font-semibold text-slate-300 mb-2">Decision Log (last 8)</h3>
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          {LIVE_GOVERNOR_FEED.map((d, i) => (
            <div key={d.id} className={`flex items-center gap-2 px-3 py-2 text-[11px] ${i !== LIVE_GOVERNOR_FEED.length - 1 ? "border-b border-white/[0.03]" : ""}`}>
              <span className="text-slate-500 font-mono w-14 flex-shrink-0">{d.time}</span>
              <span className="text-slate-300 truncate flex-1 min-w-0">{d.action}</span>
              <span className="text-purple-300 font-mono flex-shrink-0">{d.gate}</span>
              <span className="text-slate-500 font-mono flex-shrink-0 hidden md:block">{d.aiAuthority}</span>
              <span className="font-semibold flex-shrink-0" style={{ color: VERDICT_COLOR[d.verdict] }}>{d.verdict}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: LOOM CHAIN
// ═══════════════════════════════════════════════════════════════════════════════
function LoomTab() {
  const fakeBlocks = Array.from({ length: 8 }, (_, i) => ({
    height: 847392 - i,
    hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
    txs: Math.floor(Math.random() * 20) + 5,
    time: `${14}:${String(23 - i).padStart(2, "0")}:${String(47 - i * 7).padStart(2, "0").slice(-2)}`,
  }));
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-cyan-300" />
            <h3 className="text-[14px] font-semibold text-white">Loom Hash Chain</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-500/20">SHA-256</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div><div className="text-[16px] font-bold text-white">847,392</div><div className="text-[9px] text-slate-500">Chain height</div></div>
          <div><div className="text-[16px] font-bold text-emerald-300">0</div><div className="text-[9px] text-slate-500">Reorgs</div></div>
          <div><div className="text-[16px] font-bold text-white">2ms</div><div className="text-[9px] text-slate-500">Verify latency</div></div>
          <div><div className="text-[16px] font-bold text-emerald-300">100%</div><div className="text-[9px] text-slate-500">Uptime</div></div>
        </div>
      </div>
      <div>
        <h3 className="text-[12px] font-semibold text-slate-300 mb-2">Recent blocks</h3>
        <div className="space-y-1">
          {fakeBlocks.map((b, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01] text-[11px] font-mono">
              <span className="text-cyan-300 font-bold w-16 flex-shrink-0">#{b.height}</span>
              <span className="text-slate-500 truncate flex-1">{b.hash}</span>
              <span className="text-slate-400 flex-shrink-0">{b.txs} txs</span>
              <span className="text-slate-600 flex-shrink-0 hidden md:block">{b.time}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[10px] text-slate-500">
        <p className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Externally verifiable via <span className="font-mono text-cyan-300">/api/sgtx/governor/verify-loom</span></p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: AI AGENTS
// ═══════════════════════════════════════════════════════════════════════════════
function AITab() {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border border-amber-500/15 bg-amber-950/10 text-[11px] text-amber-200 flex items-start gap-2">
        <Brain className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>AI may advise (A1), constrain (A2), escalate (A3), execute-within-bounds (A4). <strong>A5 is FORBIDDEN</strong> — blocked at WASM compile time.</span>
      </div>
      {AI_AGENT_REGISTRY.map(a => {
        const statusColor = STATUS_COLOR[a.status];
        return (
          <div key={a.id} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>{a.id}</div>
                <div>
                  <div className="text-[13px] font-semibold text-white">{a.name}</div>
                  <div className="text-[9px] text-slate-500 font-mono">Authority {a.authority}</div>
                </div>
              </div>
              <span className="text-[9px] font-mono" style={{ color: statusColor }}>● {a.status}</span>
            </div>
            <div className="space-y-1 text-[10px] font-mono">
              <div className="flex items-center gap-1.5"><span className="text-slate-500 w-20">Primary:</span><span className="text-emerald-300">{a.primary}</span></div>
              <div className="flex items-center gap-1.5"><span className="text-slate-500 w-20">Fallback 1:</span><span className="text-blue-300">{a.fallback1}</span></div>
              <div className="flex items-center gap-1.5"><span className="text-slate-500 w-20">Fallback 2:</span><span className="text-slate-300">{a.fallback2}</span></div>
              <div className="flex items-center gap-1.5"><span className="text-slate-500 w-20">Terminal:</span><span className="text-rose-300">{a.terminal}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-white/[0.04]">
              <div><div className="text-[11px] font-bold text-white">{a.inferences24h.toLocaleString()}</div><div className="text-[8px] text-slate-500">24h inferences</div></div>
              <div><div className="text-[11px] font-bold text-white">{a.avgLatency}</div><div className="text-[8px] text-slate-500">Avg latency</div></div>
              <div><div className="text-[11px] font-bold text-white">{a.fallbackRate}</div><div className="text-[8px] text-slate-500">Fallback rate</div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 7: SECURITY
// ═══════════════════════════════════════════════════════════════════════════════
function SecurityTab() {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-emerald-300" />
          <h3 className="text-[13px] font-semibold text-white">Zero Trust Architecture + Device Evidence Layer</h3>
        </div>
        <p className="text-[10px] text-slate-400">0 breaches · 24/7 automated pen-testing · post-quantum crypto active</p>
      </div>
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Attack Surface Map</h4>
        <div className="space-y-1.5">
          {ATTACK_SURFACE.map((s, i) => {
            const Icon = s.icon;
            const statusColor = STATUS_COLOR[s.status];
            return (
              <div key={i} className="p-3 rounded-lg border border-white/[0.05] bg-white/[0.01]">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: statusColor }} />
                  <span className="text-[12px] font-semibold text-white flex-1 min-w-0 truncate">{s.surface}</span>
                  <span className="text-[9px] font-mono" style={{ color: statusColor }}>● {s.status}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug mb-1"><span className="text-rose-400">Threat:</span> {s.threat}</p>
                <p className="text-[10px] text-slate-400 leading-snug"><span className="text-emerald-400">Mitigation:</span> {s.mitigation}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Passkey Recovery Queue ({PASSKEY_RECOVERY_QUEUE.length})</h4>
        {PASSKEY_RECOVERY_QUEUE.map(r => (
          <div key={r.id} className="p-3 rounded-lg border border-amber-500/15 bg-amber-950/10 mb-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-white truncate">{r.tenant}</span>
              <span className="text-[9px] font-mono text-slate-500">{r.id}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">{r.stage} · {r.signers}/{r.required} signers · {r.initiated}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 8: MULTISIG
// ═══════════════════════════════════════════════════════════════════════════════
function MultisigTab() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-white flex items-center gap-2"><KeyRound className="w-4 h-4 text-purple-300" /> 3-of-5 Multisig</h3>
          <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/20">{MULTISIG_KEYHOLDERS.filter(k => k.status === "available").length}/5 available</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">Layer 0 (immutable) changes require 3-of-5 multisig + 30-day public notice. The Authority is bound by its own rules.</p>
      </div>
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Keyholders</h4>
        <div className="space-y-1.5">
          {MULTISIG_KEYHOLDERS.map(k => {
            const statusColor = STATUS_COLOR[k.status];
            return (
              <div key={k.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>{k.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white truncate">{k.name}</div>
                  <div className="text-[9px] text-slate-500 font-mono truncate">{k.role} · {k.country}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[9px] font-mono" style={{ color: statusColor }}>● {k.status}</div>
                  <div className="text-[8px] text-slate-600 font-mono">{k.lastSeen}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Pending Ceremonies</h4>
        {MULTISIG_PENDING_CEREMONIES.map(c => {
          const statusColor = STATUS_COLOR[c.status];
          return (
            <div key={c.id} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02] mb-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-semibold text-white truncate flex-1">{c.title}</span>
                <span className="text-[9px] font-mono" style={{ color: statusColor }}>● {c.status.replace("-", " ")}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
                <span>{c.signers}/{c.required} signed</span>
                <span>·</span>
                <span>notice ends {c.noticeEnds}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 9: CONFIG
// ═══════════════════════════════════════════════════════════════════════════════
function ConfigTab() {
  return (
    <div className="space-y-4">
      {/* Fee bounds */}
      <div className="p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
        <h3 className="text-[13px] font-semibold text-white mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-300" /> Dynamic Fee Engine Bounds</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><div className="text-[20px] font-bold text-white">{FEE_BOUNDS.currentMin}% – {FEE_BOUNDS.currentMax}%</div><div className="text-[9px] text-slate-500">Current effective range</div></div>
          <div><div className="text-[14px] font-bold text-amber-300">{FEE_BOUNDS.proposedMin}% – {FEE_BOUNDS.proposedMax}%</div><div className="text-[9px] text-slate-500">Proposed (pending multisig)</div></div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          <div><span className="text-slate-500">Effective:</span> <span className="text-emerald-300">{FEE_BOUNDS.effectiveRate}%</span></div>
          <div><span className="text-slate-500">Average:</span> <span className="text-white">{FEE_BOUNDS.averageRate}%</span></div>
          <div><span className="text-slate-500">Floor:</span> <span className="text-slate-400">{FEE_BOUNDS.floor}%</span></div>
        </div>
      </div>

      {/* Feature flags */}
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Feature Flags ({FEATURE_FLAGS.filter(f => f.enabled).length}/{FEATURE_FLAGS.length} enabled)</h4>
        <div className="space-y-1">
          {FEATURE_FLAGS.map(f => (
            <div key={f.key} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
              <div className={`w-9 h-5 rounded-full flex items-center transition-all ${f.enabled ? "bg-emerald-500/30" : "bg-slate-700"}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-all ${f.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-white truncate">{f.label}</div>
                <div className="text-[9px] text-slate-500 font-mono">{f.category} · {f.lastToggled}{f.requiresMultisig ? " · requires multisig" : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add-ons */}
      <div>
        <h4 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Add-On Activation ({ADDON_ACTIVATIONS.filter(a => a.enabled).length}/{ADDON_ACTIVATIONS.length} active)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {ADDON_ACTIVATIONS.map(a => (
            <div key={a.number} className="flex items-center gap-2 p-2 rounded-lg border border-white/[0.05] bg-white/[0.01]">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${a.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
              <span className="text-[11px] text-white truncate flex-1">#{a.number} {a.name}</span>
              <span className="text-[9px] font-mono text-slate-500 flex-shrink-0">{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 10: DIAGNOSTICS
// ═══════════════════════════════════════════════════════════════════════════════
function DiagnosticsTab() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "DB latency", value: "23ms", icon: Database, color: "#34d399" },
          { label: "AI latency", value: "340ms", icon: Brain, color: "#fbbf24" },
          { label: "API latency", value: "47ms", icon: Server, color: "#60a5fa" },
          { label: "Cache hit", value: "98.7%", icon: HardDrive, color: "#34d399" },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
              <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: m.color }} />
              <div className="text-[14px] font-bold text-white">{m.value}</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{m.label}</div>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="text-[12px] font-semibold text-slate-300 mb-2 flex items-center gap-2"><Server className="w-4 h-4 text-blue-400" /> System Health</h3>
        <div className="space-y-1.5">
          {SYSTEM_HEALTH.map((c, i) => {
            const Icon = c.icon;
            const statusColor = STATUS_COLOR[c.status];
            return (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.01]">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${statusColor}15`, border: `1px solid ${statusColor}30` }}>
                  <Icon className="w-4 h-4" style={{ color: statusColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-white truncate">{c.name}</div>
                  <div className="text-[9px] text-slate-500 truncate">{c.details}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] font-mono" style={{ color: statusColor }}>● {c.status}</div>
                  <div className="text-[9px] text-slate-600 font-mono">{c.latency} · {c.uptime}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cron jobs */}
      <div>
        <h3 className="text-[12px] font-semibold text-slate-300 mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-purple-400" /> Cron / Inngest Jobs</h3>
        <div className="space-y-1">
          {CRON_JOBS.map(j => {
            const statusColor = STATUS_COLOR[j.status];
            return (
              <div key={j.id} className="flex items-center gap-2 p-2 rounded-lg border border-white/[0.04] bg-white/[0.01] text-[11px]">
                <span className="text-slate-500 font-mono w-5 flex-shrink-0">{j.mode === "inngest" ? "📊" : "⏰"}</span>
                <span className="text-slate-300 truncate flex-1 min-w-0">{j.name}</span>
                <span className="text-slate-600 font-mono hidden md:block flex-shrink-0">{j.schedule}</span>
                <span className="font-mono flex-shrink-0" style={{ color: statusColor }}>● {j.status}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
