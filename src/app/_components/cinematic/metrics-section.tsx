"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useEffect, type ReactNode } from "react";

interface Metric {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  label: string;
  sub: string;
  accent: string;
}

const METRICS: Metric[] = [
  { value: 24, prefix: "$", suffix: "B", decimals: 0, label: "Trade value routed", sub: "Through Governor-gated workflows", accent: "#34d399" },
  { value: 212, suffix: "", label: "Countries covered", sub: "Strictest applicable rule always wins", accent: "#60a5fa" },
  { value: 12, suffix: "", label: "Purpose-built portals", sub: "One workspace per operating role", accent: "#a78bfa" },
  { value: 0, suffix: "", label: "Funds held in custody", sub: "Non-custodial by structure", accent: "#22d3ee" },
  { value: 38, suffix: "", label: "Constitutional points", sub: "Layer 0 · 3-of-5 multisig · 30-day notice", accent: "#fbbf24" },
  { value: 99.97, suffix: "%", decimals: 2, label: "System uptime", sub: "30-day rolling · 0 breaches", accent: "#f87171" },
];

function Counter({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    if (inView) {
      const controls = animate(count, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
      return () => controls.stop();
    }
  }, [inView, value, count]);

  return <motion.span ref={ref}>{rounded}</motion.span>;
}

export function MetricsSection() {
  return (
    <section id="scale" className="relative py-28 lg:py-40 px-5 lg:px-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-10"
        >
          <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-[0.3em]">§ 06 · Scale & Sovereignty</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white mb-14 max-w-3xl"
        >
          The numbers that define
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#34d399,#22d3ee)" }}> constitutional infrastructure.</span>
        </motion.h2>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {METRICS.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="relative p-6 lg:p-7 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden group hover:border-white/[0.14] transition-all"
            >
              {/* Hover glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: `radial-gradient(circle at 50% 0%, ${m.accent}1f 0%, transparent 60%)` }} />
              <div className="relative">
                <div className="text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-none tracking-tight mb-3" style={{ color: m.accent }}>
                  <Counter value={m.value} decimals={m.decimals} prefix={m.prefix} suffix={m.suffix} />
                </div>
                <h3 className="text-[14px] font-semibold text-white mb-1">{m.label}</h3>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">{m.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
