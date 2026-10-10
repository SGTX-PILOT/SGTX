"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { EXECUTION_SEQUENCE } from "@/lib/sgtx/landing/landing-catalog";

const phaseColor = (i: number) => {
  const colors = ["#60a5fa", "#22d3ee", "#2dd4bf", "#34d399", "#fbbf24", "#fb923c", "#f87171", "#e879f9", "#c084fc", "#a78bfa", "#818cf8", "#22d3ee", "#34d399"];
  return colors[i % colors.length];
};

export function TradeFlowSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Horizontal translate — moves the 12-phase timeline left as user scrolls
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-78%"]);

  return (
    <section id="flow" ref={ref} className="relative h-[280vh]">
      {/* Sticky inner panel — pins during scroll */}
      <div className="sticky top-0 h-[100svh] overflow-hidden flex flex-col">
        {/* Heading */}
        <div className="px-5 lg:px-8 pt-24 lg:pt-28 pb-6">
          <div className="max-w-[1400px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-5"
            >
              <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-[0.3em]">§ 04 · One Trade · Twelve Phases</span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </motion.div>
            <h2 className="text-[clamp(1.75rem,4.5vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white max-w-3xl">
              From intent to{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#34d399,#22d3ee)" }}>
                earned closure.
              </span>
            </h2>
          </div>
        </div>

        {/* Horizontal scroll track */}
        <div className="flex-1 flex items-center overflow-hidden">
          <motion.div style={{ x }} className="flex items-stretch gap-5 px-5 lg:px-8 will-change-transform">
            {EXECUTION_SEQUENCE.map((phase, i) => {
              const color = phaseColor(i);
              return (
                <motion.div
                  key={phase.order}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5 }}
                  className="relative flex-shrink-0 w-[260px] sm:w-[300px] lg:w-[340px] p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm overflow-hidden hover:border-white/[0.15] transition-colors"
                  style={{ minHeight: "360px" }}
                >
                  {/* Phase glow */}
                  <div className="absolute -top-px left-6 right-6 h-px" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />
                  <div className="absolute inset-0 pointer-events-none opacity-40" style={{ background: `radial-gradient(circle at 50% 0%, ${color}1f 0%, transparent 60%)` }} />

                  <div className="relative h-full flex flex-col">
                    {/* Order + gate */}
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-[44px] font-bold leading-none" style={{ color, opacity: 0.18 }}>{String(phase.order).padStart(2, "0")}</span>
                      <span className="text-[10px] font-mono px-2 py-1 rounded-full border" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>{phase.governorGate}</span>
                    </div>

                    {/* Name */}
                    <h3 className="text-[17px] font-semibold text-white mb-1">{phase.name}</h3>
                    <span className="text-[10px] font-mono text-slate-500 mb-3">{phase.specSection}</span>
                    <p className="text-[12.5px] text-slate-400 leading-relaxed flex-1">{phase.description}</p>

                    {/* Connector arrow */}
                    {i < EXECUTION_SEQUENCE.length - 1 && (
                      <div className="absolute -right-5 top-1/2 -translate-y-1/2 text-slate-700 hidden lg:block">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M4 10h12M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {/* End cap */}
            <div className="flex-shrink-0 w-[200px] lg:w-[300px] flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center mx-auto mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-white">Closure Earned</p>
                <p className="text-[10px] text-slate-500 mt-1">26-category evidence sealed</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <div className="px-5 lg:px-8 pb-8 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="text-[10px] uppercase tracking-[0.3em] text-slate-600"
          >
            Scroll to advance the trade →
          </motion.p>
        </div>
      </div>
    </section>
  );
}
