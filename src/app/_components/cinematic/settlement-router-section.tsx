"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Zap, Building2, Bitcoin, Banknote, AlertTriangle,
  Check, X, Clock, TrendingUp, ShieldCheck, ArrowLeftRight, Loader2,
} from "lucide-react";
import {
  COUNTRY_PAYMENT_PROFILES, getCountryProfile, type CountryPaymentProfile,
} from "@/lib/sgtx/payments/country-payment-profiles";
import {
  solveSettlementRoute, formatAmount, type SettlementOption, type SettlementRoute,
} from "@/lib/sgtx/payments/settlement-router";
import { CATEGORY_META, SEVERITY_META } from "@/lib/sgtx/payments/finance-approval-matrix";

// ═══════════════════════════════════════════════════════════════════════════════
// §19 — CINEMATIC SETTLEMENT ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
// Interactive tool: pick source + destination + amount → see the optimal
// settlement path (bank rails, open banking, crypto, SWIFT) ranked by speed
// + cost + regulatory fit. Includes the merged finance-approval checklist.
// ═══════════════════════════════════════════════════════════════════════════════

const METHOD_META: Record<string, { label: string; icon: any; color: string }> = {
  BANK_RAIL:    { label: "Bank Rail",      icon: Banknote,         color: "#60a5fa" },
  OPEN_BANKING: { label: "Open Banking",   icon: Building2,        color: "#22d3ee" },
  CRYPTO:       { label: "Crypto",         icon: Bitcoin,          color: "#34d399" },
  SWIFT:        { label: "SWIFT",          icon: ArrowLeftRight,   color: "#a78bfa" },
};

const TIER_META: Record<string, { label: string; color: string }> = {
  OPTIMAL:     { label: "Optimal",     color: "#34d399" },
  RECOMMENDED: { label: "Recommended", color: "#60a5fa" },
  FALLBACK:    { label: "Fallback",    color: "#94a3b8" },
  BLOCKED:     { label: "Blocked",     color: "#f87171" },
};

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "EGP", "SGD", "INR", "CNY", "BRL"];

export function SettlementRouterSection() {
  const [fromCode, setFromCode] = useState("US");
  const [toCode, setToCode] = useState("EG");
  const [amount, setAmount] = useState("100000");
  const [currency, setCurrency] = useState("USD");
  const [financing, setFinancing] = useState(true);

  const route: SettlementRoute | null = useMemo(
    () => solveSettlementRoute(fromCode, toCode, parseFloat(amount) || 0, currency, financing),
    [fromCode, toCode, amount, currency, financing]
  );

  const swap = () => {
    setFromCode(toCode);
    setToCode(fromCode);
  };

  if (!route) return null;

  return (
    <section id="router" className="relative py-28 lg:py-36 px-5 lg:px-8">
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(167,139,250,0.06) 0%, transparent 70%)" }} />

      <div className="max-w-[1400px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-violet-400 uppercase tracking-[0.3em]">§ 08 · Settlement Router</span>
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
          Solve the optimal
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#a78bfa,#22d3ee)" }}> settlement path.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-10"
        >
          Pick the source + destination jurisdictions and trade amount. The router
          finds the rails available in both, ranks them by speed + cost +
          regulatory fit, and shows the merged finance-approval checklist.
        </motion.p>

        {/* Input bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="p-4 lg:p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm mb-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto,1fr,1fr,auto] gap-3 items-end">
            {/* Source country */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Source (payer)</label>
              <CountrySelect value={fromCode} onChange={setFromCode} />
            </div>

            {/* Swap button */}
            <button onClick={swap} className="hidden lg:flex items-center justify-center w-10 h-10 mt-6 rounded-full border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all" aria-label="Swap source/destination">
              <ArrowLeftRight className="w-4 h-4" />
            </button>

            {/* Destination country */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Destination (payee)</label>
              <CountrySelect value={toCode} onChange={setToCode} />
            </div>

            {/* Amount + currency */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 block">Amount</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 text-[13px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-white focus:outline-none focus:border-white/15 font-mono"
                  placeholder="100,000"
                />
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="px-2 py-2 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 focus:outline-none">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Financing toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFinancing(!financing)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium rounded-lg border transition-all ${
                  financing ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-white/[0.03] text-slate-400 border-white/[0.06]"
                }`}
              >
                <ShieldCheck className="w-3 h-3" /> Finance
              </button>
            </div>
          </div>
        </motion.div>

        {/* Corridor summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center justify-between gap-3 mb-6 p-4 rounded-xl border border-white/[0.06] bg-gradient-to-r from-white/[0.04] to-transparent"
        >
          <div className="flex items-center gap-3">
            <span className="text-[28px]">{route.sourceCountry.flag}</span>
            <div>
              <div className="text-[14px] font-semibold text-white">{route.sourceCountry.name}</div>
              <div className="text-[10px] font-mono text-slate-500">{route.sourceCountry.code} · {route.sourceCountry.currency}</div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 mx-2" />
            <span className="text-[28px]">{route.destinationCountry.flag}</span>
            <div>
              <div className="text-[14px] font-semibold text-white">{route.destinationCountry.name}</div>
              <div className="text-[10px] font-mono text-slate-500">{route.destinationCountry.code} · {route.destinationCountry.currency}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[18px] font-bold text-white font-mono">{formatAmount(parseFloat(amount) || 0, currency)}</div>
            <div className="text-[10px] text-slate-500">{financing ? "financing needed" : "no financing"}</div>
          </div>
        </motion.div>

        {/* Warnings */}
        <AnimatePresence>
          {route.warnings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 space-y-2"
            >
              {route.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/20 bg-amber-950/15 text-[11.5px] text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{w}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Summary stats */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-3 mb-6">
          {[
            { label: "Options", value: route.summary.totalOptions, color: "#60a5fa" },
            { label: "Optimal", value: route.summary.optimal, color: "#34d399" },
            { label: "Recommended", value: route.summary.recommended, color: "#22d3ee" },
            { label: "Instant", value: route.summary.instantPossible ? "✓" : "✗", color: route.summary.instantPossible ? "#34d399" : "#f87171" },
            { label: "Open banking", value: route.summary.openBankingPossible ? "✓" : "✗", color: route.summary.openBankingPossible ? "#22d3ee" : "#f87171" },
            { label: "Crypto", value: route.summary.cryptoPossible ? "✓" : "✗", color: route.summary.cryptoPossible ? "#34d399" : "#f87171" },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
              <div className="text-[18px] font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Result options */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr] gap-4 lg:gap-6">
          {/* Settlement options */}
          <div className="space-y-3">
            <h3 className="text-[13px] font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-400" /> Ranked Settlement Options
            </h3>
            {route.options.length === 0 ? (
              <div className="p-6 rounded-xl border border-rose-500/20 bg-rose-950/15 text-center text-[12px] text-rose-200">
                No settlement options found for this corridor. Try SWIFT fallback or contact treasury.
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {route.options.map((opt, i) => (
                  <OptionCard key={`${fromCode}-${toCode}-${opt.method}-${i}`} option={opt} isTop={i === 0} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Finance approval (if financing needed) */}
          <div>
            <h3 className="text-[13px] font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Finance Approval
            </h3>
            {financing && route.financeChecklistSource ? (
              <FinanceChecklistCard checklist={route.financeChecklistSource} label="Source (payer) requirements" />
            ) : (
              <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-[12px] text-slate-400 text-center">
                Toggle "Finance" to see the approval checklist
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── COUNTRY SELECTOR ──────────────────────────────────────────────────────────
function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-[13px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 focus:outline-none focus:border-white/15"
    >
      {COUNTRY_PAYMENT_PROFILES.map(c => (
        <option key={c.code + c.name} value={c.code}>{c.flag} {c.name} ({c.code})</option>
      ))}
    </select>
  );
}

// ── OPTION CARD ──────────────────────────────────────────────────────────────
function OptionCard({ option: opt, isTop }: { option: SettlementOption; isTop: boolean }) {
  const method = METHOD_META[opt.method];
  const tier = TIER_META[opt.tier];
  const Icon = method.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
      className={`relative p-4 rounded-xl border overflow-hidden ${
        isTop ? "border-emerald-500/30 bg-emerald-950/10" : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      {isTop && (
        <div className="absolute top-0 right-0 px-2.5 py-1 text-[9px] font-mono font-bold text-emerald-300 bg-emerald-500/15 rounded-bl-lg">
          ★ RECOMMENDED
        </div>
      )}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${method.color}15`, border: `1px solid ${method.color}30` }}>
            <Icon className="w-5 h-5" style={{ color: method.color }} />
          </div>
          <div>
            <h4 className="text-[14px] font-semibold text-white">{opt.railName}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${tier.color}15`, color: tier.color }}>{tier.label}</span>
              <span className="text-[10px] text-slate-500">{method.label}</span>
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[12px] font-semibold" style={{ color: opt.speed === "INSTANT" ? "#34d399" : "#60a5fa" }}>{opt.speedLabel}</div>
          <div className="text-[9px] text-slate-500 mt-0.5">{opt.estimatedTime}</div>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{opt.rationale}</p>

      <div className="grid grid-cols-2 gap-3 text-[10px] mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Cost:</span>
          <span className="font-mono text-slate-300">{opt.costEstimate}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">FX:</span>
          <span className="font-mono" style={{ color: opt.fxRequired ? "#fbbf24" : "#34d399" }}>{opt.fxRequired ? "Required" : "None"}</span>
        </div>
      </div>

      {/* Requirements */}
      {opt.requirements.length > 0 && (
        <div className="mb-2">
          <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-1.5">Requirements</p>
          <ul className="space-y-0.5">
            {opt.requirements.map((r, i) => (
              <li key={i} className="text-[10px] text-slate-400 flex items-start gap-1.5">
                <Check className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Blockers */}
      {opt.blockers.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-wider text-amber-500 mb-1.5">Caveats</p>
          <ul className="space-y-0.5">
            {opt.blockers.map((b, i) => (
              <li key={i} className="text-[10px] text-amber-300/80 flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" /> {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// ── FINANCE CHECKLIST CARD ───────────────────────────────────────────────────
function FinanceChecklistCard({ checklist, label }: { checklist: any; label: string }) {
  if (!checklist) return null;

  const byCategory = checklist.requirements.reduce((acc: Record<string, any[]>, r: any) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div className="p-3 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-[11px] font-semibold text-white">{label}</p>
        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
          <div>
            <div className="text-[14px] font-bold text-white">{checklist.kybTierRequired}</div>
            <div className="text-[8px] text-slate-500 uppercase">KYB Tier</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-cyan-300 truncate">{checklist.estimatedTime}</div>
            <div className="text-[8px] text-slate-500 uppercase">Est. time</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-emerald-300 truncate">{checklist.requirements.length}</div>
            <div className="text-[8px] text-slate-500 uppercase">Checks</div>
          </div>
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto portals-scrollbar">
        {Object.entries(byCategory).map(([cat, reqs]) => {
          const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META];
          const mandatory = reqs.filter((r: any) => r.severity === "MANDATORY").length;
          return (
            <div key={cat} className="rounded-lg border border-white/[0.04] bg-white/[0.01] overflow-hidden">
              <div className="px-2.5 py-1.5 flex items-center justify-between" style={{ background: `${meta.color}08` }}>
                <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                <span className="text-[9px] font-mono text-slate-500">{mandatory} mandatory</span>
              </div>
              <div className="px-2.5 py-1.5">
                {reqs.slice(0, 4).map((r: any, i: number) => (
                  <div key={i} className="text-[9.5px] text-slate-400 py-0.5 flex items-start gap-1">
                    <span className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0" style={{ background: meta.color }} />
                    {r.title}
                  </div>
                ))}
                {reqs.length > 4 && <div className="text-[9px] text-slate-600 mt-0.5">+ {reqs.length - 4} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
