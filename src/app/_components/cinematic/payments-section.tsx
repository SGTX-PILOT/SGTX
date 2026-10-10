"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote, Bitcoin, Building2, Globe2, Zap, ShieldCheck, ShieldOff,
  ShieldAlert, ArrowLeftRight, Check, X, AlertCircle, Clock, FileCheck,
  Landmark, Wallet, Search,
} from "lucide-react";
import {
  COUNTRY_PAYMENT_PROFILES, PAYMENT_SUMMARY, getCountryProfile,
  CRYPTO_STATUS_META, OPEN_BANKING_STATUS_META,
  type CountryPaymentProfile,
} from "@/lib/sgtx/payments/country-payment-profiles";
import { buildFinanceApprovalChecklist, CATEGORY_META, SEVERITY_META } from "@/lib/sgtx/payments/finance-approval-matrix";

// ═══════════════════════════════════════════════════════════════════════════════
// §19 + §20 — CINEMATIC PAYMENTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════
// Visualises the global payment landscape: 32 jurisdictions with their
// payment rails, open-banking frameworks, crypto legal status, and the
// finance-approval checklist that banks + PFIs query.
//
// Interactive: select any country → see its rails + open banking + crypto +
// the finance-approval matrix (KYB tier, sanctions, collateral, docs,
// regulatory, FX controls, licences, deferred payment).
// ═══════════════════════════════════════════════════════════════════════════════

const ICON_BY_RAIL_TYPE = {
  INSTANT: Zap,
  DOMESTIC: Banknote,
  CROSS_BORDER: ArrowLeftRight,
  CARD: Wallet,
  WALLET: Wallet,
  CRYPTO: Bitcoin,
} as const;

const SPEED_COLOR: Record<string, string> = {
  INSTANT: "#34d399",
  SAME_DAY: "#60a5fa",
  T_PLUS_1: "#22d3ee",
  T_PLUS_2: "#a78bfa",
  MULTI_DAY: "#94a3b8",
};

export function PaymentsSection() {
  const [selectedCode, setSelectedCode] = useState("US");
  const [search, setSearch] = useState("");
  const [destinationCode, setDestinationCode] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<"rails" | "open-banking" | "crypto" | "finance">("rails");

  const selected = getCountryProfile(selectedCode)!;
  const checklist = useMemo(
    () => buildFinanceApprovalChecklist(selectedCode, destinationCode, "BOTH"),
    [selectedCode, destinationCode]
  );

  const filtered = COUNTRY_PAYMENT_PROFILES.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = useMemo(() => {
    const g: Record<string, CountryPaymentProfile[]> = {};
    for (const c of filtered) (g[c.region] ||= []).push(c);
    return g;
  }, [filtered]);

  return (
    <section id="payments" className="relative py-28 lg:py-36 px-5 lg:px-8">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(34,211,238,0.06) 0%, transparent 70%)" }} />

      <div className="max-w-[1400px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-[0.3em]">§ 07 · Global Payment Landscape</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl mb-4"
        >
          Settlement rails for every
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#22d3ee,#34d399)" }}> jurisdiction.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-10"
        >
          Country-specific payment rails, open-banking frameworks, crypto legal
          status, and the finance-approval matrix — all per-jurisdiction. Banks
          and private financiers query the same registry to verify what's
          needed before approving finance.
        </motion.p>

        {/* Summary stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-12"
        >
          {[
            { label: "Jurisdictions", value: PAYMENT_SUMMARY.totalCountries, icon: Globe2, color: "#60a5fa" },
            { label: "Crypto legal", value: PAYMENT_SUMMARY.cryptoLegal, icon: Bitcoin, color: "#34d399" },
            { label: "Crypto banned", value: PAYMENT_SUMMARY.cryptoBanned, icon: ShieldOff, color: "#f87171" },
            { label: "Open banking mandated", value: PAYMENT_SUMMARY.openBankingMandated, icon: Building2, color: "#22d3ee" },
            { label: "Instant rails", value: PAYMENT_SUMMARY.instantRails, icon: Zap, color: "#fbbf24" },
            { label: "Capital controls", value: PAYMENT_SUMMARY.capitalControls, icon: ShieldAlert, color: "#a78bfa" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
              >
                <Icon className="w-4 h-4 mb-2" style={{ color: s.color }} />
                <div className="text-[22px] font-bold text-white leading-none">{s.value}</div>
                <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{s.label}</div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Main interactive grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4 lg:gap-6">
          {/* Country selector sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm overflow-hidden"
          >
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-400">Countries</span>
                <span className="text-[10px] font-mono text-slate-500">{filtered.length} of {COUNTRY_PAYMENT_PROFILES.length}</span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search country…"
                  className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/15"
                />
              </div>
            </div>
            <div className="max-h-[480px] overflow-y-auto p-2 portals-scrollbar">
              {Object.entries(grouped).map(([region, countries]) => (
                <div key={region} className="mb-3">
                  <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600 px-2 py-1">{region}</div>
                  {countries.map(c => {
                    const cryptoMeta = CRYPTO_STATUS_META[c.crypto.status];
                    return (
                      <button key={c.code + c.name}
                        onClick={() => { setSelectedCode(c.code); }}
                        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all mb-0.5 ${
                          selectedCode === c.code ? "bg-white/[0.06] border border-white/[0.08]" : "border border-transparent hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className="text-[16px] leading-none">{c.flag}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-white truncate">{c.name}</div>
                          <div className="text-[9px] text-slate-500 font-mono truncate">{c.code} · {c.currency}</div>
                        </div>
                        <cryptoMeta.icon className="w-3 h-3 flex-shrink-0" style={{ color: cryptoMeta.color }} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Detail panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm overflow-hidden flex flex-col"
          >
            {/* Header */}
            <header className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-[32px] leading-none">{selected.flag}</span>
                <div>
                  <h3 className="text-[18px] font-bold text-white leading-tight">{selected.name}</h3>
                  <p className="text-[11px] font-mono text-slate-400">{selected.code} · {selected.currency} · {selected.region}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.swiftConnected && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"><Check className="w-2.5 h-2.5" /> SWIFT</span>
                )}
                {selected.iso20022Ready && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20"><Check className="w-2.5 h-2.5" /> ISO 20022</span>
                )}
              </div>
            </header>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-5 py-2.5 border-b border-white/[0.06] overflow-x-auto portals-scrollbar">
              {[
                { id: "rails", label: "Payment Rails", icon: Banknote, count: selected.paymentRails.length },
                { id: "open-banking", label: "Open Banking", icon: Building2 },
                { id: "crypto", label: "Crypto", icon: Bitcoin },
                { id: "finance", label: "Finance Approval", icon: FileCheck, count: checklist?.requirements.length },
              ].map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.id}
                    onClick={() => setTab(t.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap ${
                      tab === t.id ? "bg-white/[0.08] text-white border border-white/[0.08]" : "text-slate-400 hover:text-white border border-transparent"
                    }`}
                  >
                    <Icon className="w-3 h-3" /> {t.label}
                    {t.count !== undefined && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-white/10 text-slate-300">{t.count}</span>}
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto portals-scrollbar" style={{ maxHeight: "560px" }}>
              <AnimatePresence mode="wait">
                <motion.div key={tab + selectedCode}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  {tab === "rails" && <RailsTab profile={selected} />}
                  {tab === "open-banking" && <OpenBankingTab profile={selected} />}
                  {tab === "crypto" && <CryptoTab profile={selected} />}
                  {tab === "finance" && <FinanceTab checklist={checklist} destinationCode={destinationCode} setDestinationCode={setDestinationCode} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────

function RailsTab({ profile }: { profile: CountryPaymentProfile }) {
  return (
    <div className="space-y-3">
      {profile.paymentRails.map((rail, i) => {
        const Icon = ICON_BY_RAIL_TYPE[rail.type] || Banknote;
        const speedColor = SPEED_COLOR[rail.speed] || "#94a3b8";
        return (
          <div key={i} className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-all">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${speedColor}15`, border: `1px solid ${speedColor}30` }}>
                  <Icon className="w-4 h-4" style={{ color: speedColor }} />
                </div>
                <div>
                  <h4 className="text-[14px] font-semibold text-white">{rail.name}</h4>
                  <p className="text-[10px] font-mono text-slate-500">{rail.code} · {rail.settlementSystem}</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${speedColor}15`, color: speedColor }}>
                {rail.speed.replace("_", " ")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500">Currency:</span> <span className="font-mono text-slate-300">{rail.currency}</span>
              </div>
              <div>
                <span className="text-slate-500">Max:</span> <span className="font-mono text-slate-300">{rail.maxAmount || "—"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Type:</span> <span className="font-mono text-slate-300">{rail.type.replace("_", " ")}</span>
              </div>
              {rail.notes && <p className="col-span-2 text-[10px] text-slate-400 mt-1 leading-relaxed">{rail.notes}</p>}
            </div>
          </div>
        );
      })}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[10px] text-slate-500 font-mono">
        FX convertibility: <span style={{ color: FX_COLOR[profile.fx.convertibility] }}>{profile.fx.convertibility.replace("_", " ")}</span>
        {profile.fx.capitalControls && <span className="text-amber-400"> · capital controls active</span>}
      </div>
    </div>
  );
}

const FX_COLOR: Record<string, string> = {
  FREE: "#34d399",
  PARTIALLY_CONVERTIBLE: "#fbbf24",
  CONTROLLED: "#f87171",
};

function OpenBankingTab({ profile }: { profile: CountryPaymentProfile }) {
  const ob = profile.openBanking;
  const meta = OPEN_BANKING_STATUS_META[ob.status];
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5" style={{ color: meta.color }} />
            <h4 className="text-[14px] font-semibold text-white">{ob.framework}</h4>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${meta.color}15`, color: meta.color }}>
            {meta.label}
          </span>
        </div>
        <div className="space-y-2 text-[11px]">
          <Row label="Regulator" value={ob.regulator} />
          <Row label="Live since" value={ob.liveSince || "—"} />
          <Row label="Scope" value={ob.scope.replace("_", " ")} />
        </div>
        {ob.notes && <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">{ob.notes}</p>}
      </div>

      <div>
        <h5 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Available providers</h5>
        <div className="flex flex-wrap gap-2">
          {ob.providers.length === 0 ? (
            <span className="text-[11px] text-slate-600">No providers — open banking not available</span>
          ) : ob.providers.map(p => (
            <span key={p} className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] text-slate-200 border border-white/[0.06]">{p}</span>
          ))}
        </div>
      </div>

      {profile.fx.documentaryRequirements.length > 0 && (
        <div className="p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <h5 className="text-[12px] font-semibold text-amber-200">FX documentary requirements</h5>
          </div>
          <ul className="space-y-1">
            {profile.fx.documentaryRequirements.map((d, i) => (
              <li key={i} className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <span className="w-1 h-1 bg-amber-400 rounded-full" /> {d}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CryptoTab({ profile }: { profile: CountryPaymentProfile }) {
  const c = profile.crypto;
  const meta = CRYPTO_STATUS_META[c.status];
  const Icon = meta.icon;
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]" style={{ borderColor: `${meta.color}25` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}30` }}>
              <Icon className="w-5 h-5" style={{ color: meta.color }} />
            </div>
            <div>
              <h4 className="text-[14px] font-semibold text-white">{meta.label}</h4>
              <p className="text-[10px] font-mono text-slate-500">{c.regulator}</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-[11px]">
          <Row label="On-ramp" value={c.onRampAllowed ? "Allowed ✓" : "Prohibited ✗"} color={c.onRampAllowed ? "#34d399" : "#f87171"} />
          <Row label="Off-ramp" value={c.offRampAllowed ? "Allowed ✓" : "Prohibited ✗"} color={c.offRampAllowed ? "#34d399" : "#f87171"} />
          <Row label="Licence required" value={c.licenseRequired} />
          <Row label="AML/KYC" value={c.amlKyc} />
        </div>
        {c.notes && <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">{c.notes}</p>}
      </div>

      {c.legalAssets.length > 0 && (
        <div>
          <h5 className="text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">Legal assets</h5>
          <div className="flex flex-wrap gap-2">
            {c.legalAssets.map(a => (
              <span key={a} className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">{a}</span>
            ))}
          </div>
        </div>
      )}

      {c.status === "BANNED" && (
        <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-950/15">
          <div className="flex items-center gap-2 mb-1">
            <ShieldOff className="w-4 h-4 text-rose-400" />
            <h5 className="text-[12px] font-semibold text-rose-200">Crypto settlement prohibited</h5>
          </div>
          <p className="text-[11px] text-slate-400">SGTX will refuse any crypto-settled trade in this jurisdiction. Bank rails + ISO 20022 only.</p>
        </div>
      )}
    </div>
  );
}

function FinanceTab({ checklist, destinationCode, setDestinationCode }: { checklist: any; destinationCode?: string; setDestinationCode: (v?: string) => void }) {
  if (!checklist) return <div className="text-slate-500 text-[12px]">No checklist available.</div>;

  const byCategory = checklist.requirements.reduce((acc: Record<string, any[]>, r: any) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="p-4 rounded-xl border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-transparent">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">KYB Tier</div>
            <div className="text-[20px] font-bold text-white">{checklist.kybTierRequired}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Max trade</div>
            <div className="text-[14px] font-bold text-white truncate">{checklist.maxTradeValue}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Est. time</div>
            <div className="text-[12px] font-semibold text-cyan-300 truncate">{checklist.estimatedTime}</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="w-3 h-3" /> {checklist.approvalPath}
        </div>
      </div>

      {/* Destination selector */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
        <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Destination jurisdiction (optional)</label>
        <select
          value={destinationCode || ""}
          onChange={(e) => setDestinationCode(e.target.value || undefined)}
          className="w-full px-3 py-2 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 focus:outline-none focus:border-white/15"
        >
          <option value="">— select destination —</option>
          {COUNTRY_PAYMENT_PROFILES.map(c => (
            <option key={c.code + c.name} value={c.code}>{c.flag} {c.name} ({c.code})</option>
          ))}
        </select>
        {destinationCode && (
          <p className="text-[10px] text-amber-400 mt-1.5">+ destination-specific FX/crypto checks added</p>
        )}
      </div>

      {/* Requirements grouped by category */}
      {Object.entries(byCategory).map(([cat, reqs]) => {
        const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
        return (
          <div key={cat} className="rounded-xl border border-white/[0.05] bg-white/[0.01] overflow-hidden">
            <div className="px-4 py-2 border-b border-white/[0.05] flex items-center justify-between" style={{ background: `${meta.color}08` }}>
              <h5 className="text-[12px] font-semibold" style={{ color: meta.color }}>{meta.label}</h5>
              <span className="text-[10px] font-mono text-slate-500">{reqs.length} checks</span>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {reqs.map((r: any, i: number) => {
                const sev = SEVERITY_META[r.severity as keyof typeof SEVERITY_META];
                return (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full mt-0.5 flex-shrink-0" style={{ background: `${sev.color}15`, color: sev.color }}>
                      {sev.label.slice(0, 4)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-white">{r.title}</div>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">{r.description}</p>
                      {r.jurisdictionNote && <p className="text-[10px] text-slate-500 italic mt-1">⚠ {r.jurisdictionNote}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {checklist.notes && (
        <div className="p-3 rounded-xl bg-amber-950/10 border border-amber-500/15">
          <p className="text-[11px] text-amber-200 leading-relaxed">⚠ {checklist.notes}</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className="font-mono text-right truncate" style={{ color: color || "#cbd5e1" }}>{value}</span>
    </div>
  );
}
