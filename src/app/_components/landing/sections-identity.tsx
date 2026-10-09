"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase H — Identity, Tenancy & USTN (§4, §5, §20)
// Sections: GTID Format & Entity Types · KYB Tiers · USTN Namespace · Jurisdiction Fabric
// ═══════════════════════════════════════════════════════════════════════════════

import { motion } from "framer-motion";
import { Hash, Fingerprint, Globe2 } from "lucide-react";
import {
  ENTITY_TYPES, GTID_FORMAT, KYB_TIERS, USTN_SPEC, JURISDICTION_FABRIC,
} from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.4 } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };

export function GTIDSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§4.1 · Global Trade Entity ID"
          title="GTID Format & Entity Types"
          subtitle="Every actor is identified by a GTID with a verifiable checksum. KYB tier gates portal access."
        />

        {/* GTID format visual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-6 p-6 rounded-2xl border border-[rgba(56,189,248,0.15)] bg-gradient-to-br from-blue-950/30 to-[rgba(2,6,23,0.6)] backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <Hash className="w-4 h-4 text-blue-400" />
            <p className="text-[10px] text-blue-300 uppercase tracking-wider font-semibold">GTID Pattern</p>
          </div>
          <div className="font-mono text-lg lg:text-2xl text-white mb-2 break-all">
            {GTID_FORMAT.pattern}
          </div>
          <p className="text-[11px] text-slate-400 mb-4">Example: <span className="font-mono text-blue-300">{GTID_FORMAT.example}</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {GTID_FORMAT.components.map((c, i) => (
              <motion.div
                key={c.code}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/15 text-center"
              >
                <p className="text-[11px] font-mono font-bold text-blue-300">{c.code}</p>
                <p className="text-[9px] text-slate-400 mt-1 leading-tight">{c.meaning}</p>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-[rgba(56,189,248,0.08)] flex items-center gap-2">
            <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
            <p className="text-[10px] text-slate-400">
              Checksum: <span className="font-mono text-emerald-300">{GTID_FORMAT.checksum}</span>
            </p>
          </div>
        </motion.div>

        {/* Entity types */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4"
        >
          {ENTITY_TYPES.map((e, i) => {
            const Icon = e.icon;
            return (
              <motion.div
                key={e.code}
                variants={fadeUp}
                custom={i}
                className="p-3 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm text-center"
              >
                <Icon className="w-5 h-5 text-blue-300 mx-auto mb-1.5" />
                <p className="text-[11px] font-mono font-bold text-white">{e.code}</p>
                <p className="text-[9px] text-slate-400 mt-0.5 leading-tight">{e.name}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function KYBTiersSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§4.2 · Know-Your-Business Verification"
          title="Four KYB Tiers"
          subtitle="No tenant may act above their verified tier. Portal access is gated by KYB tier."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {KYB_TIERS.map((t, i) => {
            const colorCycle = [
              "from-slate-500/15 border-slate-500/20",
              "from-blue-500/15 border-blue-500/25",
              "from-purple-500/15 border-purple-500/25",
              "from-emerald-500/15 border-emerald-500/30",
            ];
            const textCycle = ["text-slate-300", "text-blue-300", "text-purple-300", "text-emerald-300"];
            return (
              <motion.div
                key={t.tier}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`p-5 rounded-2xl border bg-gradient-to-b ${colorCycle[i]} to-[rgba(2,6,23,0.5)] backdrop-blur-sm`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-2xl font-black ${textCycle[i]}`}>T{t.tier}</span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Tier</span>
                </div>
                <h3 className="text-xs font-semibold text-white mb-1">{t.name}</h3>
                <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">{t.maxTransactionValue}</p>

                <div className="mb-3">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Portals</p>
                  {t.portals.map(p => (
                    <p key={p} className="text-[10px] text-slate-300">• {p}</p>
                  ))}
                </div>

                <div className="pt-2 border-t border-[rgba(56,189,248,0.08)]">
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Requirements</p>
                  <ul className="space-y-0.5">
                    {t.requirements.map(r => (
                      <li key={r} className="text-[9px] text-slate-400 leading-relaxed">✓ {r}</li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function USTNSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§5 · Canonical Trade Namespace"
          title="USTN — Universal Sovereign Trade Number"
          subtitle="One immutable, globally unique shipment identifier binds every document, payment, milestone, and event of a trade."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          {/* USTN format */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-6 rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-950/20 to-[rgba(2,6,23,0.6)] backdrop-blur-sm"
          >
            <Hash className="w-6 h-6 text-purple-400 mb-3" />
            <p className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold mb-2">USTN Pattern</p>
            <div className="font-mono text-xl lg:text-2xl text-white mb-2 break-all">{USTN_SPEC.pattern}</div>
            <p className="text-[11px] text-slate-400 mb-4">Example: <span className="font-mono text-purple-300">{USTN_SPEC.example}</span></p>

            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Generated at</p>
                <p className="text-[10px] text-white">{USTN_SPEC.generatedAt}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider">Immutability</p>
                <p className="text-[10px] text-emerald-300">{USTN_SPEC.immutable ? "Immutable — never reused or reassigned" : "Mutable"}</p>
              </div>
            </div>
          </motion.div>

          {/* USTN binds */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-6 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
          >
            <p className="text-[10px] text-blue-300 uppercase tracking-wider font-semibold mb-3">A USTN binds:</p>
            <div className="space-y-1.5 mb-4">
              {USTN_SPEC.binds.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-2"
                >
                  <span className="w-1 h-1 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                  <p className="text-[10px] text-slate-300 leading-relaxed">{b}</p>
                </motion.div>
              ))}
            </div>
            <div className="pt-3 border-t border-[rgba(56,189,248,0.08)]">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-2">7 Closure Conditions (§5.10)</p>
              <div className="space-y-1">
                {USTN_SPEC.closureConditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500/15 flex items-center justify-center text-[10px] text-emerald-300 font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-[9px] text-slate-400 leading-relaxed">{c}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* USTN statuses */}
        <div className="mt-4 p-4 rounded-2xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">16 USTN Statuses (state-vector progression)</p>
          <div className="flex flex-wrap gap-1.5">
            {USTN_SPEC.statuses.map((s, i) => (
              <motion.span
                key={s}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.02 }}
                className="px-2 py-1 text-[9px] font-mono font-medium rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/15"
              >
                {s}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function JurisdictionFabricSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§20 · Strictest Rule Applies"
          title="Jurisdiction Fabric — 8 Dimensions"
          subtitle="The strictest rule among buyer, seller, logistics, financier, and governing-law jurisdictions always applies."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6"
        >
          {JURISDICTION_FABRIC.map((j, i) => (
            <motion.div
              key={j.dimension}
              variants={fadeUp}
              custom={i}
              className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <Globe2 className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-semibold text-white">{j.dimension}</h3>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{j.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
