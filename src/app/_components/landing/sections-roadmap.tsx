"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 24 — Implementation Roadmap & Platform Stats
// ═══════════════════════════════════════════════════════════════════════════════

import { motion } from "framer-motion";
import { Map as MapIcon } from "lucide-react";
import { ROADMAP_PHASES, PLATFORM_STATS } from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

export function RoadmapSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§24 · Delivery Plan"
          title="Implementation Roadmap"
          subtitle="Six phases over 18+ months. Constitutional core first; network effects last."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {ROADMAP_PHASES.map((p, i) => {
            const colorCycle = [
              "from-blue-500/15 border-blue-500/25",
              "from-purple-500/15 border-purple-500/25",
              "from-emerald-500/15 border-emerald-500/25",
              "from-amber-500/15 border-amber-500/25",
              "from-rose-500/15 border-rose-500/25",
              "from-cyan-500/15 border-cyan-500/25",
            ];
            const textCycle = ["text-blue-300", "text-purple-300", "text-emerald-300", "text-amber-300", "text-rose-300", "text-cyan-300"];
            return (
              <motion.div
                key={p.phase}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`p-5 rounded-2xl border bg-gradient-to-b ${colorCycle[i]} to-[rgba(2,6,23,0.5)] backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[10px] font-mono font-bold ${textCycle[i]}`}>{p.phase}</span>
                  <span className="text-[9px] text-slate-500 font-mono">{p.timeline}</span>
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{p.name}</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">{p.scope}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PlatformStatsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§15 · §16 · §22 · §5 · §3 — Platform Scale"
          title="Platform At A Glance"
          subtitle="Canonical counts that define the platform's surface area."
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {PLATFORM_STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-gradient-to-b from-[rgba(15,23,42,0.5)] to-[rgba(2,6,23,0.3)] backdrop-blur-sm text-center"
            >
              <div className="text-2xl lg:text-3xl font-black text-white mb-1">{stat.value}</div>
              <div className="text-[11px] text-slate-300 font-semibold">{stat.label}</div>
              <div className="text-[9px] text-slate-500 mt-1 leading-tight">{stat.detail}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
