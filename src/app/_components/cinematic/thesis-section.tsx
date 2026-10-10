"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Lock, Users, Banknote, ShieldCheck } from "lucide-react";

const DENIALS = [
  "Not a marketplace",
  "Not a broker",
  "Not a custodian",
  "Not a carrier",
  "Not a bank",
  "Not a marketplace",
];

const PILLARS = [
  { icon: Lock, title: "Non-Custodial by Structure", body: "No funds table exists. FeeLock is an instruction, never a holding. Settlement is direct bank-to-bank.", accent: "#34d399" },
  { icon: Users, title: "Non-Marketplace by Design", body: "We never suggest an unknown counterparty or rank providers. All relationships originate from explicit invitations.", accent: "#60a5fa" },
  { icon: Banknote, title: "Direct Bank Settlement", body: "ISO 20022 native. SGTX never intermediates funds. The mandate, not the money, flows through us.", accent: "#a78bfa" },
  { icon: ShieldCheck, title: "Constitutionally Bound", body: "38 immutable points. 3-of-5 multisig. 30-day public notice. The Authority is bound by its own rules.", accent: "#22d3ee" },
];

export function ThesisSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);

  return (
    <section id="thesis" ref={ref} className="relative py-24 lg:py-32 px-5 lg:px-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Section label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-10"
        >
          <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-[0.3em]">§ 01 · The Thesis</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Denial marquee (the dramatic line) */}
        <motion.div style={{ y }} className="overflow-hidden mb-12">
          <div className="flex items-center gap-x-6 flex-wrap text-[clamp(1.5rem,4vw,3.25rem)] font-bold leading-[1.1] tracking-tight">
            {DENIALS.slice(0, 5).map((d, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
                className="inline-flex items-center gap-6"
              >
                <span className={i % 2 === 0 ? "text-slate-700 line-through decoration-rose-500/40 decoration-2" : "text-white"}>{d}</span>
                <span className="text-slate-700">·</span>
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.45 }}
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(120deg, #60a5fa, #a78bfa 50%, #22d3ee)" }}
            >
              We are infrastructure.
            </motion.span>
          </div>
        </motion.div>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="max-w-[44rem] text-[15px] lg:text-base text-slate-400 leading-relaxed mb-16"
        >
          SGTX transforms commercial intent into a structured, machine-readable, regulation-aware
          execution graph. Every trade moves through the canonical 12-phase sequence with
          Governor-governed transitions. The platform is air-gap capable, open-source, and
          self-hostable. Your relationships. Your data. Sovereign control.
        </motion.p>

        {/* 4 pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.08 }}
                className="group relative p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden hover:border-white/[0.12] transition-all"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${p.accent}18 0%, transparent 60%)` }} />
                <div className="relative">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ background: `${p.accent}1a`, border: `1px solid ${p.accent}30` }}>
                    <Icon className="w-5 h-5" style={{ color: p.accent }} />
                  </div>
                  <h3 className="text-[15px] font-semibold text-white mb-2 leading-snug">{p.title}</h3>
                  <p className="text-[12.5px] text-slate-400 leading-relaxed">{p.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
