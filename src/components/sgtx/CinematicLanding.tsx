"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { SgtxLogo } from "./SgtxLogo";
import { ShieldCheck, Zap, Globe2, Lock, ArrowRight, Sparkles } from "lucide-react";
import { useAppStore } from "@/store/app-store";

const PHASES = [
  { delay: 0, label: "Boot" },
  { delay: 1.2, label: "Seal" },
  { delay: 2.4, label: "Reveal" },
  { delay: 3.6, label: "Ready" },
];

export function CinematicLanding() {
  const setView = useAppStore((s) => s.setView);
  const setLandingEntered = useAppStore((s) => s.setLandingEntered);
  const [phase, setPhase] = useState(0);
  const [skip, setSkip] = useState(false);

  useEffect(() => {
    if (skip) {
      const id = setTimeout(() => setPhase(3), 0);
      return () => clearTimeout(id);
    }
    const timers = PHASES.map((p, i) => setTimeout(() => setPhase(i), p.delay * 1000));
    return () => timers.forEach(clearTimeout);
  }, [skip]);

  const enter = () => {
    setLandingEntered(true);
    setView("launcher");
  };

  return (
    <div className="fixed inset-0 bg-background overflow-hidden sovereign-radial">
      {/* Animated grid + particles backdrop */}
      <div className="absolute inset-0 sovereign-grid opacity-40" />
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              background: "oklch(0.82 0.14 84)",
            }}
            animate={{ opacity: [0, 0.7, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 4 + (i % 5), repeat: Infinity, delay: i * 0.3 }}
          />
        ))}
      </div>

      {/* Scanning light beam */}
      <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-50 animate-scan" />

      {/* Skip button */}
      <button
        onClick={() => setSkip(true)}
        className="absolute top-6 right-6 z-50 text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        SKIP INTRO <ArrowRight className="w-3 h-3" />
      </button>

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6">
        {/* Phase 0-1: Logo assembly */}
        <AnimatePresence mode="wait">
          {phase < 2 && (
            <motion.div key="logo-build" exit={{ opacity: 0, scale: 1.1 }} transition={{ duration: 0.6 }} className="relative">
              <SgtxLogo size={220} animated glow />
              {/* Converging rings */}
              {phase === 0 && (
                <>
                  {[0, 1, 2].map((r) => (
                    <motion.div
                      key={r}
                      className="absolute inset-0 m-auto rounded-full border"
                      style={{ borderColor: "oklch(0.78 0.14 84 / 0.4)" }}
                      initial={{ width: 600, height: 600, opacity: 0.8 }}
                      animate={{ width: 220, height: 220, opacity: 0 }}
                      transition={{ duration: 1.2, delay: r * 0.15, ease: "easeIn" }}
                    />
                  ))}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase 2+: Full hero */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div
              key="hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="flex flex-col items-center text-center max-w-5xl"
            >
              <motion.div className="mb-6" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7 }}>
                <SgtxLogo size={120} animated glow />
              </motion.div>

              {/* Wordmark */}
              <motion.h1
                className="font-display font-black tracking-tight text-gold-gradient leading-none"
                style={{ fontSize: "clamp(3.5rem, 11vw, 8rem)" }}
                initial={{ opacity: 0, letterSpacing: "0.4em" }}
                animate={{ opacity: 1, letterSpacing: "-0.02em" }}
                transition={{ duration: 1, delay: 0.2 }}
              >
                SGTX
              </motion.h1>

              {/* Tagline with gold hairlines */}
              <motion.div
                className="flex items-center gap-4 mt-5"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                <span className="h-px w-12 sm:w-24 gold-hairline" />
                <p className="text-[0.7rem] sm:text-xs tracking-[0.42em] text-muted-foreground font-medium uppercase">
                  Sovereign Governed Trade Execution
                </p>
                <span className="h-px w-12 sm:w-24 gold-hairline" />
              </motion.div>

              {/* Mission statement */}
              <motion.p
                className="mt-8 text-base sm:text-lg text-foreground/70 max-w-2xl leading-relaxed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 1 }}
              >
                The non-custodial, AI-governed operating system for global trade.
                One click to ship. One click to import. One click to pay.
                One universal number to rule the entire transaction.
              </motion.p>

              {/* Pillars */}
              <motion.div
                className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 w-full max-w-3xl"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 1.4 }}
              >
                {[
                  { icon: Lock, title: "Non-Custodial", desc: "FeeLock split via PSP" },
                  { icon: Zap, title: "One-Click", desc: "7 clicks, trade to settle" },
                  { icon: Globe2, title: "Sovereign", desc: "USTN-linked visibility" },
                  { icon: ShieldCheck, title: "AI-Governed", desc: "Governor + OPA + WasmEdge" },
                ].map((p, i) => (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 1.5 + i * 0.1 }}
                    className="glass-panel rounded-xl p-4 text-left hover:border-gold transition-colors group"
                  >
                    <p.icon className="w-5 h-5 text-gold mb-2 group-hover:scale-110 transition-transform" style={{ color: "oklch(0.82 0.14 84)" }} />
                    <p className="text-sm font-semibold text-foreground">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* CTA */}
              <motion.div
                className="mt-12 flex flex-col sm:flex-row items-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 2 }}
              >
                <button
                  onClick={enter}
                  className="group relative bg-gold-gradient text-sovereign font-semibold px-10 py-4 rounded-full text-sm tracking-wider uppercase overflow-hidden glow-gold-sm hover:glow-gold transition-all"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Enter the Platform
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <span className="absolute inset-0 bg-gold-sheen animate-shimmer opacity-40" />
                </button>
                <button
                  onClick={enter}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wide"
                >
                  Explore the blueprint →
                </button>
              </motion.div>

              {/* Fee model ticker */}
              <motion.div
                className="mt-16 overflow-hidden w-full max-w-2xl border-y border-border/50 py-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 2.4 }}
              >
                <div className="flex gap-12 animate-marquee whitespace-nowrap text-xs text-muted-foreground tracking-widest uppercase">
                  {Array.from({ length: 2 }).map((_, k) => (
                    <div key={k} className="flex gap-12">
                      <span>1.5% fee per side · non-custodial</span>
                      <span>·</span>
                      <span>GTID SGTX-EG-TRD-002139-7F3A</span>
                      <span>·</span>
                      <span>USTN-linked government visibility</span>
                      <span>·</span>
                      <span>Nafeza · CargoX · ETA · CBE</span>
                      <span>·</span>
                      <span>Zero cloud · zero SaaS · open-source</span>
                      <span>·</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Phase progress dots */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
          {PHASES.map((_, i) => (
            <div
              key={i}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: i === phase ? 32 : 8,
                background: i <= phase ? "oklch(0.82 0.14 84)" : "oklch(1 0 0 / 15%)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
