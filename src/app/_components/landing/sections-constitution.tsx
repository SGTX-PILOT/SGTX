"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase B — Constitutional Foundation (§3)
// Sections: 7 Governor Principles · 38 Constitutional Points · AI Authority Ladder · Enforcement Stack
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import {
  GOVERNOR_PRINCIPLES, CONSTITUTIONAL_POINTS, AI_AUTHORITY_LADDER,
  AI_AGENTS, ENFORCEMENT_STACK,
} from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.05, duration: 0.45 },
  }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };

export function GovernorPrinciplesSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§3.1 · Governor Gates G1–G7"
          title="Seven Governor Principles"
          subtitle="Every irreversible action passes through the Governor. There is no path that bypasses the gate sequence."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6"
        >
          {GOVERNOR_PRINCIPLES.map((g, i) => {
            const Icon = g.icon;
            return (
              <motion.div
                key={g.gate}
                variants={fadeUp}
                custom={i}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm hover:border-[rgba(56,189,248,0.3)] transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-emerald-300" />
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                    {g.gate}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-white mb-1">{g.name}</h3>
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">{g.scope}</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">{g.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function ConstitutionSection() {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const categories = ["All", ...Array.from(new Set(CONSTITUTIONAL_POINTS.map(p => p.category)))];
  const filtered = activeCategory === "All"
    ? CONSTITUTIONAL_POINTS
    : CONSTITUTIONAL_POINTS.filter(p => p.category === activeCategory);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§3.2 + §3.2.1 · Layer 0 — Immutable"
          title="The 38-Point Transaction Constitution"
          subtitle="Every point is mandatory. None is an optional suggestion. No team may implement a conflicting local variant."
        />

        <div className="flex flex-wrap gap-1.5 mt-5 mb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${
                activeCategory === cat
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
              {cat !== "All" && (
                <span className="ml-1 text-[9px] text-slate-500">
                  {CONSTITUTIONAL_POINTS.filter(p => p.category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 gap-2"
        >
          {filtered.map((p, i) => (
            <motion.div
              key={p.number}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.02, duration: 0.3 }}
              className="flex items-start gap-3 p-3 rounded-lg border border-[rgba(56,189,248,0.08)] bg-[rgba(15,23,42,0.5)] hover:border-[rgba(56,189,248,0.2)] transition-all"
            >
              <div className="w-7 h-7 rounded-md bg-purple-500/15 flex items-center justify-center text-[11px] font-bold text-purple-300 font-mono shrink-0">
                {p.number}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{p.category}</p>
                <p className="text-[11px] text-slate-300 leading-relaxed">{p.principle}</p>
              </div>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono shrink-0">
                {p.layer}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export function AILadderSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§3.3 · AI Authority Ladder"
          title="Six AI Authority Levels (A0–A5)"
          subtitle="AI may advise, constrain, escalate, or execute within bounds. Autonomous force is constitutionally forbidden."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2 mt-6">
          {AI_AUTHORITY_LADDER.map((a, i) => (
            <motion.div
              key={a.level}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className={`relative p-4 rounded-xl border bg-[rgba(15,23,42,0.6)] backdrop-blur-sm ${
                a.forbidden
                  ? "border-red-500/40 bg-red-950/20"
                  : "border-[rgba(56,189,248,0.12)]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm font-mono font-bold ${a.color}`}>{a.level}</span>
                {a.forbidden && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold animate-pulse">
                    FORBIDDEN
                  </span>
                )}
              </div>
              <h4 className={`text-xs font-semibold mb-1 ${a.color}`}>{a.name}</h4>
              <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{a.meaning}</p>
              <p className="text-[9px] text-slate-500 leading-relaxed pt-2 border-t border-[rgba(56,189,248,0.08)]">
                {a.examples}
              </p>
            </motion.div>
          ))}
        </div>

        {/* AI Agents fallback chain */}
        <div className="mt-8">
          <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-blue-400" />
            §3.4 — AI Agent Registry & 3-Tier Fallback Chain
          </h3>
          <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-[rgba(56,189,248,0.1)]">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
                <tr className="text-left text-slate-400">
                  <th className="px-3 py-2 font-medium">Agent</th>
                  <th className="px-3 py-2 font-medium">Authority</th>
                  <th className="px-3 py-2 font-medium">Primary</th>
                  <th className="px-3 py-2 font-medium">Fallback 1</th>
                  <th className="px-3 py-2 font-medium">Fallback 2</th>
                  <th className="px-3 py-2 font-medium">Terminal</th>
                </tr>
              </thead>
              <tbody>
                {AI_AGENTS.map((a) => (
                  <tr key={a.id} className="border-t border-[rgba(56,189,248,0.06)] hover:bg-[rgba(59,130,246,0.04)]">
                    <td className="px-3 py-2 text-white font-mono">{a.id}</td>
                    <td className="px-3 py-2 text-blue-300 font-mono">{a.authority}</td>
                    <td className="px-3 py-2 text-slate-300">{a.primary}</td>
                    <td className="px-3 py-2 text-slate-400">{a.fallback1}</td>
                    <td className="px-3 py-2 text-slate-500">{a.fallback2}</td>
                    <td className="px-3 py-2 text-slate-500">{a.terminal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EnforcementStackSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§3.5 · Enforcement Pipeline"
          title="Constitutional Enforcement Stack"
          subtitle="Six layers — every action passes through all six in sequence before any irreversible state change."
        />
        <div className="mt-6 space-y-2">
          {ENFORCEMENT_STACK.map((layer, i) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.order}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className="flex items-center gap-3"
              >
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-emerald-500/20 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-blue-300" />
                  </div>
                  {i < ENFORCEMENT_STACK.length - 1 && (
                    <div className="w-px h-6 bg-gradient-to-b from-blue-500/30 to-transparent" />
                  )}
                </div>
                <div className="flex-1 p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[9px] font-mono text-blue-400">LAYER {layer.order}</span>
                    <h4 className="text-xs font-semibold text-white">{layer.name}</h4>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">
                      {layer.technology}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{layer.role}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
