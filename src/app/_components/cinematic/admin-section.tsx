"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, KeyRound, Scale, Brain, GitBranch, Lock, Gavel, Users } from "lucide-react";
import { PLATFORM_METRICS } from "@/lib/sgtx/admin/control-panel-data";
import { AdminControlPanel } from "./admin-control-panel";

// ═══════════════════════════════════════════════════════════════════════════════
// §16.8.6.11 — CINEMATIC ADMIN SECTION
// ═══════════════════════════════════════════════════════════════════════════════
// The platform owner's command center — a teaser + the full inline control
// panel. 10 tabs covering every aspect of platform control.
// ═══════════════════════════════════════════════════════════════════════════════

export function AdminSection() {
  const [showFullPanel, setShowFullPanel] = useState(false);

  const features = [
    { icon: Scale, label: "38-point Constitution", desc: "Layer 0 immutable. 3-of-5 multisig + 30-day notice.", color: "#a78bfa" },
    { icon: Gavel, label: "Governor G1-G7", desc: "Single point of truth. Every irreversible action gated.", color: "#c4b5fd" },
    { icon: Users, label: "185K+ Tenants", desc: "View, suspend, revoke. KYB tier overrides.", color: "#60a5fa" },
    { icon: GitBranch, label: "Loom Hash Chain", desc: "847K blocks. 0 reorgs. Externally verifiable.", color: "#22d3ee" },
    { icon: Brain, label: "AI Agent Registry", desc: "A0-A5 authority. Fallback chains. A5 forbidden.", color: "#fbbf24" },
    { icon: Lock, label: "Zero Trust + DEL", desc: "0 breaches. Post-quantum. Auto pen-testing.", color: "#34d399" },
  ];

  return (
    <section id="admin" className="relative py-28 lg:py-36 px-5 lg:px-8">
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

      <div className="max-w-[1400px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-[0.3em]">§ 09 · Platform Admin Control Panel</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        {/* Heading */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr,1fr] gap-8 lg:gap-12 items-start mb-10">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white mb-4"
            >
              Sovereign control of
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#c4b5fd,#a78bfa,#7c3aed)" }}> the entire platform.</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed mb-6"
            >
              The platform owner's command center. Ten tabs covering every
              aspect of platform control — from the 38-point immutable
              constitution to live Governor decisions, tenant management,
              AI agent registry, security attack surface, and 3-of-5 multisig
              ceremonies. The Authority is bound by its own rules.
            </motion.p>
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              onClick={() => setShowFullPanel(!showFullPanel)}
              className="inline-flex items-center gap-2 px-5 py-3 text-[13px] font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-purple-500/30"
              style={{ background: "linear-gradient(135deg,#7c3aed,#a78bfa)" }}
            >
              <ShieldCheck className="w-4 h-4" /> {showFullPanel ? "Hide Control Panel" : "Open Control Panel"}
            </motion.button>
          </div>

          {/* Feature grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 gap-3"
          >
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.05 }}
                  className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.12] transition-all"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                    <Icon className="w-4 h-4" style={{ color: f.color }} />
                  </div>
                  <h3 className="text-[12px] font-semibold text-white mb-0.5">{f.label}</h3>
                  <p className="text-[10px] text-slate-400 leading-snug">{f.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Platform metrics bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-3 md:grid-cols-6 gap-2 lg:gap-3 mb-6 p-4 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent"
        >
          {[
            { label: "Total tenants", value: "185K+", color: "#60a5fa" },
            { label: "Trades settled", value: "2.8M", color: "#34d399" },
            { label: "Value routed", value: "$24B", color: "#34d399" },
            { label: "Loom blocks", value: "847K", color: "#22d3ee" },
            { label: "AI inferences", value: "4.2M", color: "#fbbf24" },
            { label: "Breaches", value: "0", color: "#34d399" },
          ].map((m, i) => (
            <div key={i} className="text-center">
              <div className="text-[clamp(1.25rem,3vw,1.75rem)] font-bold" style={{ color: m.color }}>{m.value}</div>
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mt-0.5">{m.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Full control panel (toggle) */}
        {showFullPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="overflow-hidden"
          >
            <AdminControlPanel />
          </motion.div>
        )}
      </div>
    </section>
  );
}
