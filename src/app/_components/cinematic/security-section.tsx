"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Lock, Crosshair, Server, Bug, Atom, Eye, Cloud, Zap } from "lucide-react";
import { ATTACK_SURFACES, SECURITY_TOOLCHAIN, PLATFORM_STATS } from "@/lib/sgtx/landing/landing-catalog";

// ═══════════════════════════════════════════════════════════════════════════════
// §21 — CINEMATIC SECURITY SECTION
// ═══════════════════════════════════════════════════════════════════════════════
// 21 attack surfaces + zero-cost security toolchain + ZTA/DEL.
// ═══════════════════════════════════════════════════════════════════════════════

const SECURITY_PILLARS = [
  { icon: Lock, label: "Zero Trust (ZTA)", desc: "Never trust, always verify. Every request authenticated.", color: "#34d399" },
  { icon: Crosshair, label: "Device Evidence Layer", desc: "Hardware-attested device identity on every action.", color: "#22d3ee" },
  { icon: Atom, label: "Post-Quantum Crypto", desc: "Quantum-resistant key exchange + signatures.", color: "#a78bfa" },
  { icon: Bug, label: "Automated Pen-Testing", desc: "Continuous chaos engineering + vuln scanning.", color: "#fbbf24" },
  { icon: Eye, label: "24/7 Anomaly Detection", desc: "eBPF runtime security (Falco) + CrowdSec IDS.", color: "#f87171" },
  { icon: ShieldCheck, label: "0 Breaches", desc: "Air-gap capable. Open-source. Self-hostable.", color: "#34d399" },
];

export function SecuritySection() {
  return (
    <section id="security" className="relative py-28 lg:py-36 px-5 lg:px-8">
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 50%, rgba(239,68,68,0.05) 0%, transparent 70%)" }} />

      <div className="max-w-[1400px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-rose-400 uppercase tracking-[0.3em]">§ 10 · Security Architecture</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Heading */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6 }}
          className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl mb-4"
        >
          21 attack surfaces.
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#34d399,#22d3ee)" }}> Zero breaches.</span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.6, delay: 0.15 }}
          className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-10"
        >
          Zero Trust Architecture + Device Evidence Layer. Post-quantum
          cryptography. 24/7 automated penetration testing. Every surface
          mapped, every threat mitigated, every action audited on the Loom.
        </motion.p>

        {/* Security pillars */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-12">
          {SECURITY_PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div key={i}
                initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.12] transition-all"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2" style={{ background: `${p.color}15`, border: `1px solid ${p.color}30` }}>
                  <Icon className="w-4 h-4" style={{ color: p.color }} />
                </div>
                <h3 className="text-[12px] font-semibold text-white mb-0.5">{p.label}</h3>
                <p className="text-[9.5px] text-slate-400 leading-snug">{p.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Attack surfaces grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }}
        >
          <h3 className="text-[13px] font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-rose-400" /> Attack Surface Inventory (21 surfaces)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {ATTACK_SURFACES.slice(0, 12).map((s, i) => (
              <motion.div key={s.number}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.03 }}
                className="p-3 rounded-lg border border-white/[0.05] bg-white/[0.01] hover:border-white/[0.1] transition-all"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold text-rose-300 w-6">#{s.number}</span>
                  <span className="text-[11px] font-semibold text-white truncate flex-1">{s.surface}</span>
                </div>
                <p className="text-[9.5px] text-slate-500 leading-snug mb-1"><span className="text-slate-600">Exposure:</span> {s.exposure}</p>
                <p className="text-[9.5px] text-slate-400 leading-snug"><span className="text-emerald-400/70">●</span> {s.protection}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Security toolchain */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-10 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
        >
          <h3 className="text-[13px] font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" /> Zero-Cost Security Toolchain
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SECURITY_TOOLCHAIN.map((t, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                <div className="text-[10px] font-medium text-slate-300 mb-0.5">{t.category}</div>
                <div className="text-[9px] font-mono text-cyan-300">{t.tools}</div>
                <div className="text-[8px] text-slate-600 mt-0.5">{t.license}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Platform stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {PLATFORM_STATS.slice(0, 4).map((s, i) => (
            <div key={i} className="p-3 rounded-xl border border-white/[0.06] bg-gradient-to-br from-white/[0.03] to-transparent text-center">
              <div className="text-[22px] font-bold text-white">{s.value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
              <div className="text-[8px] text-slate-600 mt-0.5">{s.detail}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
