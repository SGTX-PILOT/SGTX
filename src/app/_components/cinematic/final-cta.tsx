"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Zap } from "lucide-react";

interface Props {
  onNavigate: (route: string) => void;
  onExplorePortals: () => void;
}

export function FinalCTA({ onNavigate, onExplorePortals }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section ref={ref} className="relative py-28 lg:py-40 px-5 lg:px-8 overflow-hidden">
      {/* Dramatic gradient backdrop */}
      <motion.div style={{ y }} className="absolute inset-0 pointer-events-none" aria-hidden
        animate={{}}
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(59,130,246,0.18) 0%, transparent 70%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%)" }} />
      </motion.div>

      <div className="max-w-[900px] mx-auto relative text-center">
        <motion.span
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[11px] text-slate-300 mb-8"
        >
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Production · Non-custodial · Constitutionally Bound
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-[clamp(2.25rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white"
        >
          Build governed trades.
          <br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#60a5fa,#a78bfa 50%,#22d3ee)" }}>
            Not marketplace listings.
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-6 max-w-xl mx-auto text-[14px] lg:text-[15px] text-slate-400 leading-relaxed"
        >
          Request access to the constitutional operating system for global trade execution.
          Non-custodial. Non-marketplace. Governor-governed. Constitutionally bound.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-3"
        >
          <button onClick={() => onNavigate("/join")}
            className="group inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-semibold text-white rounded-full transition-all hover:shadow-2xl hover:shadow-blue-500/40 hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)" }}>
            <Zap className="w-4 h-4" /> Request Access
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
          <button onClick={onExplorePortals}
            className="inline-flex items-center gap-2 px-7 py-3.5 text-[15px] font-medium text-slate-200 rounded-full border border-white/[0.1] bg-white/[0.03] backdrop-blur-md hover:bg-white/[0.07] hover:border-white/[0.2] transition-all">
              Explore the 12 Portals
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-[11px] text-slate-600 font-mono"
        >
          ◆ Air-gap capable · Open-source · Self-hostable · 3-of-5 multisig governed
        </motion.p>
      </div>
    </section>
  );
}
