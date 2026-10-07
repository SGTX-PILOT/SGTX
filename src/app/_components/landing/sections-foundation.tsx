"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase A — Foundation & Identity (§2)
// Sections: Three Pillars · 9 Key Capabilities · 4 Execution Components · 12-Phase Sequence
// ═══════════════════════════════════════════════════════════════════════════════

import { motion } from "framer-motion";
import { ArrowRight, Cpu, Layers as LayersIcon } from "lucide-react";
import {
  PILLARS, CAPABILITIES, EXECUTION_COMPONENTS, EXECUTION_SEQUENCE,
} from "@/lib/sgtx/landing/landing-catalog";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };

export function PillarsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§2.2 · Layer 0 — Immutable"
          title="Three Unshakable Pillars"
          subtitle="Every implementation decision must comply. Layer 0 changes require 3-of-5 multisig and 30-day notice."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6"
        >
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.roman}
                variants={fadeUp}
                custom={i}
                className="relative p-5 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-gradient-to-b from-[rgba(15,23,42,0.6)] to-[rgba(2,6,23,0.4)] backdrop-blur-sm overflow-hidden group"
              >
                <div className="absolute top-2 right-3 text-5xl font-black text-[rgba(59,130,246,0.06)] select-none">
                  {p.roman}
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">
                      Pillar {p.roman}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{p.title}</h3>
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-3">{p.principle}</p>
                  <div className="pt-2 border-t border-[rgba(56,189,248,0.08)]">
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">Enforcement</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{p.enforcement}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function CapabilitiesSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§2.4 · Differentiated Architecture"
          title="Nine Key Architectural Capabilities"
          subtitle="Each capability is a non-negotiable structural property — not a feature, not a toggle."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6"
        >
          {CAPABILITIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.name}
                variants={fadeUp}
                custom={i}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm hover:border-[rgba(56,189,248,0.25)] hover:bg-[rgba(30,41,59,0.6)] transition-all"
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-white leading-tight">{c.name}</h3>
                    <p className="text-[9px] text-slate-500 mt-0.5">{c.specRef}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{c.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function ExecutionComponentsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§2.5 · Shared Across Every Portal"
          title="Four Platform-Wide Execution Components"
          subtitle="Specified once. Referenced throughout. Teams must not re-implement local variants."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          {EXECUTION_COMPONENTS.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.key}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                className="p-5 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-blue-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{c.title}</h3>
                    <p className="text-[9px] text-slate-500">{c.specRef}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{c.description}</p>
                <div className="space-y-1.5">
                  {c.properties.map((p) => (
                    <div key={p.label} className="flex items-start gap-2 text-[10px]">
                      <span className="text-blue-400 font-mono shrink-0 w-20">{p.label}</span>
                      <span className="text-slate-400 leading-relaxed">{p.value}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ExecutionSequenceSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§2.3 · Canonical Sequence"
          title="The 12-Phase Execution Sequence"
          subtitle="Every trade moves through this exact sequence. Each arrow is a governed transition."
        />
        <div className="mt-6 space-y-2">
          {EXECUTION_SEQUENCE.map((phase, i) => (
            <motion.div
              key={phase.order}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.03, duration: 0.4 }}
              className="flex items-stretch gap-2"
            >
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {phase.order}
                </div>
                {i < EXECUTION_SEQUENCE.length - 1 && (
                  <div className="w-px flex-1 bg-gradient-to-b from-blue-500/30 to-transparent my-1" />
                )}
              </div>
              <div className="flex-1 p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] mb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-white">{phase.name}</h4>
                    <span className="text-[9px] text-slate-500">{phase.specSection}</span>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 font-mono">
                    {phase.governorGate}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{phase.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Shared section heading
export function SectionHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
    >
      <p className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-1.5">{kicker}</p>
      <h2 className="text-lg lg:text-xl font-bold text-white tracking-tight flex items-center gap-2">
        <LayersIcon className="w-4 h-4 text-blue-400" />
        {title}
      </h2>
      {subtitle && <p className="text-[11px] text-slate-400 mt-1.5 max-w-2xl">{subtitle}</p>}
    </motion.div>
  );
}

export { ArrowRight, Cpu };
