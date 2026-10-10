"use client";

import { motion } from "framer-motion";
import { AI_AUTHORITY_LADDER } from "@/lib/sgtx/landing/landing-catalog";
import { Ban } from "lucide-react";

export function AILadderSection() {
  return (
    <section id="ai" className="relative py-28 lg:py-40 px-5 lg:px-8 overflow-hidden">
      {/* Background red wash for A5 forbidden zone */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{ background: "radial-gradient(ellipse 50% 40% at 50% 90%, rgba(239,68,68,0.07) 0%, transparent 70%)" }} />

      <div className="max-w-[1100px] mx-auto relative">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-10"
        >
          <span className="text-[11px] font-mono text-orange-400 uppercase tracking-[0.3em]">§ 05 · AI Authority Ladder</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-14"
        >
          <h2 className="text-[clamp(1.75rem,4.5vw,3.25rem)] font-bold leading-[1.1] tracking-[-0.02em] text-white max-w-3xl">
            AI may advise, constrain, escalate, execute.
            <br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#f87171,#fb923c)" }}>
              It may never act alone.
            </span>
          </h2>
          <p className="mt-5 max-w-2xl text-[14px] lg:text-[15px] text-slate-400 leading-relaxed">
            Six rungs define the constitutional authority of every model on the platform.
            A5 — autonomous fund movement, autonomous contract execution, autonomous sanctions
            bypass — is blocked at WASM compile time and structurally impossible.
          </p>
        </motion.div>

        {/* The ladder — vertical dramatic reveal */}
        <div className="space-y-3">
          {AI_AUTHORITY_LADDER.map((level, i) => {
            const isForbidden = level.forbidden;
            const accentColor = isForbidden ? "#f87171" : level.color.replace("text-", "").replace("-400", "") === "slate" ? "#94a3b8" : `#${level.color.replace("text-", "").replace("-400", "") === "blue" ? "60a5fa" : level.color.replace("text-", "").replace("-400", "") === "yellow" ? "facc15" : level.color.replace("text-", "").replace("-400", "") === "orange" ? "fb923c" : level.color.replace("text-", "").replace("-400", "") === "green" ? "34d399" : "94a3b8"}`;
            return (
              <motion.div
                key={level.level}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.08 }}
                className={`relative p-5 lg:p-6 rounded-2xl border overflow-hidden ${
                  isForbidden
                    ? "border-rose-500/30 bg-rose-950/20"
                    : "border-white/[0.07] bg-white/[0.02]"
                }`}
              >
                {/* Left accent bar */}
                <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: isForbidden ? "#ef4444" : accentColor }} />

                <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr,1.5fr] gap-4 lg:gap-6 items-start pl-2">
                  {/* Level */}
                  <div className="flex items-center gap-3">
                    <span className="text-[28px] lg:text-[32px] font-bold font-mono" style={{ color: isForbidden ? "#f87171" : accentColor }}>{level.level}</span>
                    {isForbidden && (
                      <div className="w-10 h-10 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                        <Ban className="w-5 h-5 text-rose-400" />
                      </div>
                    )}
                  </div>

                  {/* Name + meaning */}
                  <div>
                    <h3 className="text-[15px] font-semibold text-white mb-1 flex items-center gap-2">
                      {level.name}
                      {isForbidden && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">FORBIDDEN</span>}
                    </h3>
                    <p className="text-[12.5px] text-slate-400 leading-relaxed">{level.meaning}</p>
                  </div>

                  {/* Examples */}
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">Examples</p>
                    <p className="text-[12px] text-slate-300 leading-relaxed">{level.examples}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Closing note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-10 text-center text-[12px] font-mono text-slate-500"
        >
          <span className="text-rose-400">⊘</span> A5 is structurally impossible — blocked at WASM compile time · OPA + WasmEdge enforcement
        </motion.p>
      </div>
    </section>
  );
}
