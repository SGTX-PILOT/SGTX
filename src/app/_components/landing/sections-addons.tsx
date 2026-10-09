"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase D — Platform Add-Ons (§22)
// Sections: 28 Add-Ons Catalogue · Priority Bands · Built-in Add-Ons
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion } from "framer-motion";
import { Package } from "lucide-react";
import { ADD_ONS, type AddOn } from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03, duration: 0.35 } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.03 } } };

const PRIORITY_FILTERS = ["All", "Foundation", "P0", "P1", "P2", "P3"] as const;

const priorityColor = (p: AddOn["priority"]) => {
  switch (p) {
    case "Foundation": return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "P0": return "bg-red-500/15 text-red-300 border-red-500/30";
    case "P1": return "bg-orange-500/15 text-orange-300 border-orange-500/30";
    case "P2": return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    case "P3": return "bg-slate-500/15 text-slate-300 border-slate-500/30";
    default: return "bg-slate-700/30 text-slate-500 border-slate-700";
  }
};

const statusColor = (s: AddOn["status"]) => {
  switch (s) {
    case "Built-in":
    case "Complete": return "text-emerald-400";
    case "Specified": return "text-blue-400";
    case "Optional": return "text-purple-400";
    case "Reserved": return "text-slate-500";
    default: return "text-slate-400";
  }
};

export function AddOnsSection() {
  const [filter, setFilter] = useState<typeof PRIORITY_FILTERS[number]>("All");
  const filtered = filter === "All" ? ADD_ONS : ADD_ONS.filter(a => a.priority === filter);

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§22 · 28-Add-On Catalogue"
          title="Platform Add-Ons & Extended Capabilities"
          subtitle="Discrete extension modules — each with purpose, workflow, data model, API surface, and implementation checklist. None introduce marketplace features."
        />

        {/* Priority legend */}
        <div className="flex flex-wrap items-center gap-1.5 mt-5 mb-4">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider mr-2">Priority:</span>
          {PRIORITY_FILTERS.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${
                filter === p
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {p}
              <span className="ml-1 text-[9px] text-slate-500">
                ({p === "All" ? ADD_ONS.length : ADD_ONS.filter(a => a.priority === p).length})
              </span>
            </button>
          ))}
        </div>

        {/* Add-ons grid */}
        <motion.div
          layout
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
        >
          {filtered.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.number}
                layout
                variants={fadeUp}
                custom={i}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm hover:border-[rgba(56,189,248,0.3)] transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Icon className="w-4 h-4 text-blue-300" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[9px] font-mono text-slate-500">#{a.number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${priorityColor(a.priority)}`}>
                      {a.priority}
                    </span>
                  </div>
                </div>
                <h3 className="text-xs font-semibold text-white leading-tight mb-1.5">{a.name}</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-2 min-h-[40px]">{a.purpose}</p>
                <div className="flex items-center justify-between pt-2 border-t border-[rgba(56,189,248,0.06)]">
                  <span className={`text-[9px] font-mono ${statusColor(a.status)}`}>● {a.status}</span>
                  <span className="text-[9px] font-mono text-purple-300">{a.aiAuthority}</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-6">
          {[
            { label: "Built-in", count: ADD_ONS.filter(a => a.class === "Foundation").length, color: "text-amber-300" },
            { label: "P0 Critical", count: ADD_ONS.filter(a => a.priority === "P0").length, color: "text-red-300" },
            { label: "P1 High-value", count: ADD_ONS.filter(a => a.priority === "P1").length, color: "text-orange-300" },
            { label: "P2 Extended", count: ADD_ONS.filter(a => a.priority === "P2").length, color: "text-blue-300" },
            { label: "P3 Optional", count: ADD_ONS.filter(a => a.priority === "P3").length, color: "text-slate-300" },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-lg border border-[rgba(56,189,248,0.08)] bg-[rgba(15,23,42,0.4)] text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-[9px] text-slate-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
