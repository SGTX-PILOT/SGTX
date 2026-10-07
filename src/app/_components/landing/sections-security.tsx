"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase F — Platform Guarantees: Security, Availability & Privacy (§21)
// Sections: Attack Surface Inventory · Zero-Cost Security Toolchain
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Eye, Search } from "lucide-react";
import { ATTACK_SURFACES, SECURITY_TOOLCHAIN } from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.02, duration: 0.3 } }),
};

const exposureColor = (e: string) => {
  if (e.includes("Internet")) return "text-red-300 bg-red-500/10 border-red-500/20";
  if (e.includes("Outbound")) return "text-orange-300 bg-orange-500/10 border-orange-500/20";
  if (e.includes("Admin") || e.includes("Terminal") || e.includes("Internal +")) return "text-yellow-300 bg-yellow-500/10 border-yellow-500/20";
  if (e.includes("Internal")) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  return "text-slate-300 bg-slate-500/10 border-slate-500/20";
};

export function SecurityArchitectureSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§21.1 · STRIDE + MITRE ATT&CK"
          title="Security Architecture"
          subtitle="Zero-trust, defence in depth, immutable audit. Every security-relevant event is logged immutably via Loom. All tools open-source and self-hosted."
        />

        {/* Core security principles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 mb-8">
          {[
            { icon: Lock, title: "Zero-Trust Architecture", desc: "No implicit trust. Every request authenticated, authorised, encrypted." },
            { icon: Shield, title: "Defence in Depth", desc: "Network, application, data, constitutional — multiple control layers." },
            { icon: Eye, title: "Immutable Audit", desc: "SHA-256 hash-chained Loom log. Hourly chain verification." },
            { icon: Search, title: "Continuous Verification", desc: "Weekly pentests, daily vulnerability scans, quarterly threat model rescan." },
          ].map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
              >
                <Icon className="w-5 h-5 text-blue-400 mb-2" />
                <h3 className="text-xs font-semibold text-white mb-1">{p.title}</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed">{p.desc}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Attack surface inventory */}
        <AttackSurfaceTable />
      </div>
    </section>
  );
}

function AttackSurfaceTable() {
  const [query, setQuery] = useState("");
  const filtered = ATTACK_SURFACES.filter(
    a => a.surface.toLowerCase().includes(query.toLowerCase())
      || a.protection.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-2">
        <Shield className="w-4 h-4 text-blue-400" />
        §21.1.6 — Attack Surface Inventory (21 surfaces)
      </h3>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search surfaces or protections..."
          className="w-full pl-9 pr-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.12)] rounded-lg focus:outline-none focus:border-blue-400/40 transition-colors"
          aria-label="Search attack surfaces"
        />
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-[rgba(56,189,248,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur z-10">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-2 font-medium w-8">#</th>
              <th className="px-3 py-2 font-medium">Surface</th>
              <th className="px-3 py-2 font-medium">Exposure</th>
              <th className="px-3 py-2 font-medium">Protection</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a, i) => (
              <motion.tr
                key={a.number}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.01 }}
                className="border-t border-[rgba(56,189,248,0.06)] hover:bg-[rgba(59,130,246,0.04)]"
              >
                <td className="px-3 py-2 text-slate-500 font-mono">{a.number}</td>
                <td className="px-3 py-2 text-white font-medium">{a.surface}</td>
                <td className="px-3 py-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${exposureColor(a.exposure)}`}>
                    {a.exposure}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-400 leading-relaxed">{a.protection}</td>
              </motion.tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-500 text-[11px]">
                  No surfaces match "{query}"
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SecurityToolchainSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§21.1.7 · Zero-Cost · Self-Hosted · Air-Gap Capable"
          title="Zero-Cost Security Toolchain"
          subtitle="All security tools are open-source and self-hosted. No billing details required for any security tool. The platform can operate fully air-gapped."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {SECURITY_TOOLCHAIN.map((t, i) => (
            <motion.div
              key={t.category}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
            >
              <p className="text-[10px] text-blue-300 uppercase tracking-wider font-semibold mb-1">{t.category}</p>
              <p className="text-[11px] text-white font-medium mb-1">{t.tools}</p>
              <p className="text-[9px] text-slate-500 font-mono">{t.license}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
