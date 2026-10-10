"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { GOVERNOR_PRINCIPLES } from "@/lib/sgtx/landing/landing-catalog";

export function GovernorSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const lineScale = useTransform(scrollYProgress, [0.1, 0.9], [0, 1]);

  return (
    <section id="governor" ref={ref} className="relative py-28 lg:py-40 px-5 lg:px-8 overflow-hidden">
      {/* Dramatic radial backdrop */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

      <div className="max-w-[1100px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-10"
        >
          <span className="text-[11px] font-mono text-violet-400 uppercase tracking-[0.3em]">§ 03 · The Governor</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Centered dramatic statement */}
        <motion.blockquote
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <p className="text-[clamp(1.5rem,4vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em] text-white max-w-4xl mx-auto">
            Every irreversible action passes through{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#a78bfa,#22d3ee)" }}>
              the Governor.
            </span>
          </p>
          <p className="mt-6 max-w-2xl mx-auto text-[14px] lg:text-[15px] text-slate-400 leading-relaxed">
            A single point of truth. Seven constitutional gates — G1 through G7 — sit between
            intent and execution. Identity, financing, contract, fee, physical movement, settlement,
            and closure. Each gate evaluates against OPA policies in a WASM sandbox. Strictest
            applicable jurisdiction always wins.
          </p>
        </motion.blockquote>

        {/* The 7 gates — vertical progression with animated line */}
        <div className="relative mt-16 lg:mt-20 max-w-2xl mx-auto">
          {/* Central animated vertical line — brighter, more visible */}
          <div className="absolute left-[27px] lg:left-[31px] top-2 bottom-2 w-0.5 bg-white/[0.08] overflow-hidden rounded-full">
            <motion.div className="origin-top w-full h-full"
              style={{ scaleY: lineScale, background: "linear-gradient(to bottom, #a78bfa 0%, #22d3ee 50%, #34d399 100%)" }} />
          </div>

          {/* Pulsing energy dots traveling down the line */}
          <motion.div
            className="absolute left-[27.5px] lg:left-[31.5px] w-1 h-1 rounded-full bg-white shadow-[0_0_8px_2px_rgba(167,139,250,0.8)]"
            animate={{ top: ["2%", "98%"], opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="space-y-2">
            {GOVERNOR_PRINCIPLES.map((g, i) => {
              const Icon = g.icon;
              return (
                <motion.div
                  key={g.gate}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="relative flex items-start gap-4 lg:gap-5 group"
                >
                  {/* Gate node */}
                  <div className="relative flex-shrink-0 w-14 h-14 lg:w-16 lg:h-16 rounded-2xl flex items-center justify-center border border-white/[0.1] bg-[#050816] backdrop-blur-md z-10 transition-all group-hover:border-violet-400/40 group-hover:scale-105">
                    <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-violet-300" />
                    <span className="absolute -top-2 -right-2 text-[9px] font-mono font-bold text-violet-300 bg-violet-500/20 border border-violet-400/30 rounded-full px-1.5 py-0.5">{g.gate}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 pt-1 pb-3">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="text-[15px] font-semibold text-white">{g.name}</h3>
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{g.scope}</span>
                    </div>
                    <p className="text-[12.5px] text-slate-400 leading-relaxed">{g.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Footer line */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 text-center text-[12px] font-mono text-slate-500"
        >
          <span className="text-emerald-400">●</span> Every decision appended to the Loom hash-chained audit log · SHA-256 · externally verifiable
        </motion.p>
      </div>
    </section>
  );
}
