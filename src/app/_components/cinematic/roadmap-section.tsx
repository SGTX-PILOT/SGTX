"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ROADMAP_PHASES } from "@/lib/sgtx/landing/landing-catalog";

// ═══════════════════════════════════════════════════════════════════════════════
// §24 — CINEMATIC ROADMAP SECTION
// ═══════════════════════════════════════════════════════════════════════════════
// 6-phase implementation roadmap with animated vertical timeline.
// ═══════════════════════════════════════════════════════════════════════════════

const PHASE_COLORS = ["#60a5fa", "#22d3ee", "#34d399", "#fbbf24", "#a78bfa", "#e879f9"];

export function RoadmapSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const lineScale = useTransform(scrollYProgress, [0.15, 0.85], [0, 1]);

  return (
    <section id="roadmap" className="relative py-28 lg:py-36 px-5 lg:px-8">
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(96,165,250,0.06) 0%, transparent 70%)" }} />

      <div className="max-w-[1100px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-blue-400 uppercase tracking-[0.3em]">§ 12 · Implementation Roadmap</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
          className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl mb-4"
        >
          Six phases from
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#60a5fa,#34d399)" }}> constitutional core to network effects.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-14"
        >
          A staged rollout from the immutable constitutional core through trade
          initiation, financing, physical execution, post-trade add-ons, and
          the compounding network effects that form the moat.
        </motion.p>

        {/* Vertical timeline */}
        <div ref={ref} className="relative">
          {/* Central animated line */}
          <div className="absolute left-[23px] lg:left-[31px] top-2 bottom-2 w-0.5 bg-white/[0.08] overflow-hidden rounded-full">
            <motion.div className="origin-top w-full h-full"
              style={{ scaleY: lineScale, background: "linear-gradient(to bottom, #60a5fa, #22d3ee, #34d399, #fbbf24, #a78bfa, #e879f9)" }} />
          </div>

          <div className="space-y-3">
            {ROADMAP_PHASES.map((p, i) => {
              const color = PHASE_COLORS[i % PHASE_COLORS.length];
              return (
                <motion.div key={p.phase}
                  initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: i * 0.06 }}
                  className="relative flex items-start gap-4 lg:gap-5 group"
                >
                  {/* Phase node */}
                  <div className="relative flex-shrink-0 w-12 h-12 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center border bg-[#050816] backdrop-blur-md z-10 transition-all group-hover:scale-105"
                    style={{ borderColor: `${color}40`, boxShadow: `0 0 20px -5px ${color}40` }}>
                    <span className="text-[14px] lg:text-[16px] font-bold" style={{ color }}>{p.phase.replace("Phase ", "P")}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 pt-1.5 pb-4">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <h3 className="text-[15px] font-semibold text-white">{p.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>{p.timeline}</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">{p.scope}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Closing note */}
        <motion.p
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }} transition={{ delay: 0.4 }}
          className="mt-10 text-center text-[11px] font-mono text-slate-500"
        >
          <span className="text-emerald-400">●</span> Each phase is air-gap capable · open-source · self-hostable · Loom-audited
        </motion.p>
      </div>
    </section>
  );
}
