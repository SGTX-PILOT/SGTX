"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase G — Phase Workflow Detail (§6–§15)
// Sections: Buyer 13 sections · Seller 8 steps · Governor Gate Matrix · Transaction Clocks
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Tag } from "lucide-react";
import {
  BUYER_TRADE_REQUEST_SECTIONS, SELLER_WORKFLOW_STEPS, GOVERNOR_GATE_GROUPS,
  TRANSACTION_CLOCKS, SHARED_SHIPMENTS_VAULT,
} from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.35 } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.03 } } };

export function BuyerWorkflowSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§6 · Phase 1 — Trade Initiation"
          title="Buyer Workflow — 13-Section Trade Request"
          subtitle="A structured, machine-readable, regulation-aware execution graph. Every section is mandatory. Governor pre-screens G1U1–G1U8."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mt-6"
        >
          {BUYER_TRADE_REQUEST_SECTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.number}
                variants={fadeUp}
                custom={i}
                className="p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm hover:border-[rgba(56,189,248,0.3)] transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-md bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-blue-300" />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">§{s.number}</span>
                </div>
                <h4 className="text-[11px] font-semibold text-white mb-1 leading-tight">{s.name}</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">{s.description}</p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function SellerWorkflowSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§8 · Phase 2 — Quote, Packing & Logistics"
          title="Seller Workflow — 8 Steps"
          subtitle="Seller locks EXW price, designs packing, gets 3-mode logistics quotes, generates contract via Clause Forge, signs with QES."
        />
        <div className="space-y-2 mt-6">
          {SELLER_WORKFLOW_STEPS.map((s, i) => (
            <motion.div
              key={s.number}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className="flex items-start gap-3"
            >
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {s.number}
                </div>
                {i < SELLER_WORKFLOW_STEPS.length - 1 && (
                  <div className="w-px h-6 bg-gradient-to-b from-purple-500/30 to-transparent" />
                )}
              </div>
              <div className="flex-1 p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] mb-2">
                <h4 className="text-xs font-semibold text-white mb-1">{s.name}</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed">{s.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GovernorGatesSection() {
  const [activeGroup, setActiveGroup] = useState(GOVERNOR_GATE_GROUPS[0].group);
  const active = GOVERNOR_GATE_GROUPS.find(g => g.group === activeGroup)!;

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§15 · Complete Enforcement Matrix"
          title="Governor Gate Matrix — 42 Gates"
          subtitle="Every irreversible action passes through the Governor. There is no path that bypasses the gate sequence."
        />

        {/* Group selector */}
        <div className="flex flex-wrap gap-1.5 mt-5 mb-4">
          {GOVERNOR_GATE_GROUPS.map(g => (
            <button
              key={g.group}
              onClick={() => setActiveGroup(g.group)}
              className={`px-3 py-1.5 text-[10px] font-mono font-semibold rounded-lg border transition-all ${
                activeGroup === g.group
                  ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {g.group} · {g.name}
              <span className="ml-1.5 text-[9px] text-slate-500">({g.count})</span>
            </button>
          ))}
        </div>

        {/* Active group gates */}
        <motion.div
          key={active.group}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="p-5 rounded-2xl border border-emerald-500/15 bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-mono font-bold text-emerald-300">{active.group}</span>
            <span className="text-xs font-semibold text-white">{active.name}</span>
            <span className="text-[10px] text-slate-500">— {active.count} gates</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.gates.map((gate, i) => (
              <motion.div
                key={gate}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[10px] font-mono text-emerald-300 shrink-0 w-14">{gate.split(" ")[0]}</span>
                <span className="text-[11px] text-slate-300">{gate.split(" ").slice(1).join(" ")}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function TransactionClocksSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§19 · Canonical Transaction State"
          title="Eight Transaction Clocks"
          subtitle="A trade is not one clock — it is a state-vector of eight clocks that must converge before closure is earned."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {TRANSACTION_CLOCKS.map((c, i) => (
            <motion.div
              key={c.clock}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-blue-500/15 flex items-center justify-center">
                  <span className="text-[10px] font-mono font-bold text-blue-300">{i + 1}</span>
                </div>
                <h3 className="text-xs font-semibold text-white">{c.clock}</h3>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ShipmentsVaultSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.5 · Role-Filtered Columns"
          title="Shared Shipments Vault"
          subtitle="One USTN click opens the Trade Command Center. Every role sees the same shipments through their own filtered columns."
        />
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-[rgba(56,189,248,0.1)] mt-6">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)] backdrop-blur">
              <tr className="text-left text-slate-400">
                <th className="px-3 py-2 font-medium w-40">Role</th>
                <th className="px-3 py-2 font-medium">Visible Columns</th>
              </tr>
            </thead>
            <tbody>
              {SHARED_SHIPMENTS_VAULT.map((row, i) => (
                <motion.tr
                  key={row.role}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05 }}
                  className="border-t border-[rgba(56,189,248,0.06)] hover:bg-[rgba(59,130,246,0.04)]"
                >
                  <td className="px-3 py-2 text-white font-medium">{row.role}</td>
                  <td className="px-3 py-2 text-slate-300 leading-relaxed font-mono">{row.columns}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
