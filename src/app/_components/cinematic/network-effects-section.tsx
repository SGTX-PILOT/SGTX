"use client";

import { motion } from "framer-motion";
import { Network, GitGraph, Database, ShieldCheck, Lock, TrendingUp, ArrowRight, Ship } from "lucide-react";
import { TRUST_FLYWHEEL, MOAT_LAYERS, ECONOMIC_MOAT, COMPETITIVE_THREATS, TRADE_CORRIDORS } from "@/lib/sgtx/landing/landing-catalog";

// ═══════════════════════════════════════════════════════════════════════════════
// §23 — CINEMATIC NETWORK EFFECTS SECTION
// ═══════════════════════════════════════════════════════════════════════════════
// Trust flywheel (7 stages) + moat layers (cannot copy) + economic moat +
// competitive threat matrix + trade corridor network.
// ═══════════════════════════════════════════════════════════════════════════════

export function NetworkEffectsSection() {
  return (
    <section id="network" className="relative py-28 lg:py-36 px-5 lg:px-8">
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(34,211,238,0.05) 0%, transparent 70%)" }} />

      <div className="max-w-[1400px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-[0.3em]">§ 11 · Network Effects & Moat</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
          className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl mb-4"
        >
          The trust flywheel
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#22d3ee,#34d399)" }}> compounds.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-10"
        >
          Every trade strengthens the network. Trade Memory feeds better AI
          risk models, which lower financing risk, which attracts more banks,
          which brings more trade volume. Seven layers cannot be copied.
        </motion.p>

        {/* Trust flywheel — circular 7-stage loop */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h3 className="text-[13px] font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Trust Flywheel (7 stages)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
            {TRUST_FLYWHEEL.map((s, i) => (
              <motion.div key={s.stage}
                initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.06 }}
                className="relative p-3 rounded-xl border border-emerald-500/15 bg-emerald-950/10"
              >
                <div className="text-[20px] font-bold text-emerald-300 mb-1">{s.stage}</div>
                <div className="text-[10px] font-semibold text-white uppercase tracking-wider mb-1">{s.label}</div>
                <p className="text-[9px] text-slate-400 leading-snug">{s.desc}</p>
                {i < TRUST_FLYWHEEL.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-700" />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Moat layers — cannot copy vs can copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-12"
        >
          <h3 className="text-[13px] font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-purple-400" /> Moat Layers — what competitors cannot copy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {MOAT_LAYERS.filter(m => !m.copyable).map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-purple-500/15 bg-purple-950/10"
                >
                  <Icon className="w-4 h-4 text-purple-300 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-white">{m.layer}</div>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{m.why}</p>
                  </div>
                  <Lock className="w-3 h-3 text-purple-400 flex-shrink-0 mt-1" />
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Economic moat + competitive threats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }}
            className="p-5 rounded-2xl border border-emerald-500/15 bg-emerald-950/10"
          >
            <h3 className="text-[13px] font-semibold text-white mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" /> Economic Moat</h3>
            <div className="text-[28px] font-bold text-emerald-300 mb-1">{ECONOMIC_MOAT.annualCostAdvantage}</div>
            <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{ECONOMIC_MOAT.versus}</p>
            <div className="text-[10px] text-slate-300 font-mono">{ECONOMIC_MOAT.feeModel}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["No subscriptions", "No per-seat fees", "No infrastructure licensing"].map(t => (
                <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">{t}</span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.1 }}
            className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
          >
            <h3 className="text-[13px] font-semibold text-white mb-3 flex items-center gap-2"><Network className="w-4 h-4 text-cyan-300" /> Competitive Threat Matrix</h3>
            <div className="space-y-2">
              {COMPETITIVE_THREATS.slice(0, 4).map((t, i) => {
                const Icon = t.icon;
                return (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]">
                    <Icon className="w-3 h-3 text-rose-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-300">{t.threat}</div>
                      <div className="text-[9px] text-emerald-300/80 mt-0.5">→ {t.mitigation}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* Trade corridor network */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }}
        >
          <h3 className="text-[13px] font-semibold text-slate-300 mb-4 flex items-center gap-2"><Ship className="w-4 h-4 text-blue-300" /> Trade Corridor Network (TCN)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {TRADE_CORRIDORS.map((c, i) => {
              const Icon = c.icon;
              const statusColor = c.status === "Production" ? "#34d399" : c.status === "Active" ? "#60a5fa" : "#fbbf24";
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/[0.1] transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: statusColor }} />
                    <span className="text-[12px] font-semibold text-white truncate">{c.corridor}</span>
                    <span className="text-[9px] font-mono ml-auto" style={{ color: statusColor }}>● {c.status}</span>
                  </div>
                  <p className="text-[9.5px] text-slate-400 leading-snug">{c.lanes}</p>
                  <p className="text-[9px] text-slate-600 mt-0.5">{c.certification}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
