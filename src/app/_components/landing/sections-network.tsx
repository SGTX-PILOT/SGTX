"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase E — Network Effects, Trade Corridor Network & Competitive Moat (§23)
// Sections: Trust Flywheel · Moat Layers · Economic Moat · Threat Matrix · Corridors
// ═══════════════════════════════════════════════════════════════════════════════

import { motion } from "framer-motion";
import { RefreshCw, Copy, CopyCheck, ShieldCheck, DollarSign, Ship } from "lucide-react";
import {
  TRUST_FLYWHEEL, MOAT_LAYERS, ECONOMIC_MOAT, COMPETITIVE_THREATS, TRADE_CORRIDORS,
} from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

export function TrustFlywheelSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§23.1.2 · The Compounding Data Advantage"
          title="The Trust Flywheel"
          subtitle="Every trade executed feeds a virtuous cycle that strengthens all participants. New entrants cannot bootstrap this without years of real trade data."
        />
        <div className="mt-8 relative">
          {/* Center hub */}
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-blue-400/30 items-center justify-center z-10">
            <RefreshCw className="w-8 h-8 text-blue-300 animate-spin" style={{ animationDuration: "8s" }} />
          </div>

          {/* Stages */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {TRUST_FLYWHEEL.map((s, i) => {
              const colorCycle = [
                "from-blue-500/15 border-blue-500/30",
                "from-purple-500/15 border-purple-500/30",
                "from-emerald-500/15 border-emerald-500/30",
                "from-amber-500/15 border-amber-500/30",
                "from-rose-500/15 border-rose-500/30",
                "from-cyan-500/15 border-cyan-500/30",
                "from-indigo-500/15 border-indigo-500/30",
              ];
              return (
                <motion.div
                  key={s.stage}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={`p-4 rounded-xl border bg-gradient-to-b ${colorCycle[i % colorCycle.length]} to-[rgba(2,6,23,0.5)] backdrop-blur-sm relative`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white font-mono">
                      {s.stage}
                    </span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wide">{s.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed">{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MoatLayersSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§23.1.3 · What Competitors Can & Cannot Copy"
          title="The Moat Layers"
          subtitle="The UI and workflow forms are commodity. The trust, history, and network density are not — they compound with every trade."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {/* Cannot copy */}
          <div className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Cannot Be Copied</h3>
                <p className="text-[9px] text-emerald-400 uppercase tracking-wider">The True Moat</p>
              </div>
            </div>
            <div className="space-y-2">
              {MOAT_LAYERS.filter(m => !m.copyable).map((m, i) => {
                const Icon = m.icon;
                return (
                  <motion.div
                    key={m.layer}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
                  >
                    <CopyCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-white">{m.layer}</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">{m.why}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Can copy */}
          <div className="p-5 rounded-2xl border border-slate-500/20 bg-slate-950/30 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-slate-500/15 flex items-center justify-center">
                <Copy className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Easily Copied</h3>
                <p className="text-[9px] text-slate-400 uppercase tracking-wider">Commodity Layers</p>
              </div>
            </div>
            <div className="space-y-2">
              {MOAT_LAYERS.filter(m => m.copyable).map((m, i) => {
                const Icon = m.icon;
                return (
                  <motion.div
                    key={m.layer}
                    initial={{ opacity: 0, x: 10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-500/5 border border-slate-500/10"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-semibold text-slate-300">{m.layer}</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{m.why}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-500 italic mt-3 leading-relaxed">
              The platform deliberately keeps these layers thin, standard, and built on open-source components so engineering investment concentrates on the non-copyable layers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EconomicMoatSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§23.1.5 · Cost Advantages"
          title="Economic Moat — Zero-Cost Architecture"
          subtitle="Self-hosted, open-source stack removes per-seat and per-transaction platform costs. A competitor with a cost floor cannot match the value at any price."
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-1 p-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 to-[rgba(2,6,23,0.6)] backdrop-blur-sm text-center"
          >
            <DollarSign className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
            <div className="text-3xl lg:text-4xl font-black text-emerald-300 mb-1">
              {ECONOMIC_MOAT.annualCostAdvantage}
            </div>
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-2">Annual Cost Advantage</p>
            <p className="text-[10px] text-slate-400 leading-relaxed">{ECONOMIC_MOAT.versus}</p>
          </motion.div>

          <div className="lg:col-span-2 p-6 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-white mb-3">Fee Model — One Transparent Fee</h3>
            <p className="text-[11px] text-slate-300 leading-relaxed mb-4">{ECONOMIC_MOAT.feeModel}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-emerald-500/10">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Subscriptions</p>
                <p className="text-xs font-bold text-emerald-400">{ECONOMIC_MOAT.noSubscriptions ? "None" : "Yes"}</p>
              </div>
              <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-emerald-500/10">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Per-seat fees</p>
                <p className="text-xs font-bold text-emerald-400">{ECONOMIC_MOAT.noPerSeatFees ? "None" : "Yes"}</p>
              </div>
              <div className="p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-emerald-500/10">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Infra licensing</p>
                <p className="text-xs font-bold text-emerald-400">{ECONOMIC_MOAT.noInfrastructureLicensing ? "None" : "Yes"}</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-3 pt-3 border-t border-[rgba(56,189,248,0.08)]">
              {ECONOMIC_MOAT.institutionalPricing}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ThreatMatrixSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§23.1.9 · Competitive Threats & Mitigations"
          title="Threat Matrix"
          subtitle="The economic moat is present at launch; data and trust moats compound from the first trade; every quarter of operation extends the lead."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {COMPETITIVE_THREATS.map((t, i) => {
            const Icon = t.icon;
            return (
              <motion.div
                key={t.threat}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="p-4 rounded-xl border border-rose-500/15 bg-rose-950/10 backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-rose-400 shrink-0" />
                  <p className="text-[11px] font-semibold text-rose-200 leading-tight">{t.threat}</p>
                </div>
                <div className="pt-2 border-t border-rose-500/10">
                  <p className="text-[9px] text-emerald-400 uppercase tracking-wider mb-1">Mitigation</p>
                  <p className="text-[10px] text-slate-300 leading-relaxed">{t.mitigation}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CorridorsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§23.2 · Trade Corridor Network (TCN)"
          title="Active Trade Corridors"
          subtitle="Trade lanes, governments, and ports become first-class governed entities. Corridors compound with volume."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {TRADE_CORRIDORS.map((c, i) => {
            const Icon = c.icon;
            const statusColor = c.status === "Production" ? "text-emerald-300 bg-emerald-500/10"
              : c.status === "Active" ? "text-blue-300 bg-blue-500/10"
              : "text-amber-300 bg-amber-500/10";
            const certColor = c.certification === "Certified" ? "text-emerald-400"
              : c.certification === "Strategic" ? "text-blue-400"
              : "text-amber-400";
            return (
              <motion.div
                key={c.corridor}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-blue-300" />
                    <h3 className="text-xs font-semibold text-white">{c.corridor}</h3>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${statusColor}`}>{c.status}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{c.lanes}</p>
                <div className="pt-2 border-t border-[rgba(56,189,248,0.06)] flex items-center justify-between">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Certification</span>
                  <span className={`text-[10px] font-mono ${certColor}`}>{c.certification}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
