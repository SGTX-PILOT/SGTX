"use client";

import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { ArrowRight, Play, Shield, Lock, Scale, Activity } from "lucide-react";

interface HeroProps {
  onExplorePortals: () => void;
  onNavigate: (route: string) => void;
}

const LIVE_TICKER = [
  { gtid: "SGTX-EG-26-F3A-0042", action: "Contract Lock", status: "ALLOW", color: "#34d399" },
  { gtid: "SGTX-IT-26-LSP-0117", action: "Milestone Release", status: "ALLOW", color: "#34d399" },
  { gtid: "SGTX-VN-26-FIN-0091", action: "Financing Request", status: "CONDITIONAL", color: "#fbbf24" },
  { gtid: "SGTX-KE-26-TRD-0233", action: "Sanctions Screen", status: "ALLOW", color: "#34d399" },
  { gtid: "SGTX-SA-26-ADM-0007", action: "Constitutional Edit", status: "MULTISIG", color: "#a78bfa" },
  { gtid: "SGTX-EG-26-CBR-0441", action: "Customs Release", status: "ALLOW", color: "#34d399" },
  { gtid: "SGTX-IT-26-LAB-0088", action: "MRL Validation", status: "PASS", color: "#34d399" },
];

const headlineWords = ["Sovereign", "Operating", "System", "for", "Global", "Trade"];

export function CinematicHero({ onExplorePortals, onNavigate }: HeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.92]);

  // 3D sigil rotation follows pointer (subtle)
  const sigilRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const sx = useSpring(tilt.x, { stiffness: 120, damping: 18 });
  const sy = useSpring(tilt.y, { stiffness: 120, damping: 18 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const cx = (e.clientX / window.innerWidth - 0.5) * 2;
      const cy = (e.clientY / window.innerHeight - 0.5) * 2;
      setTilt({ x: cy * 8, y: -cx * 12 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <section ref={ref} className="relative min-h-[100svh] flex flex-col justify-center px-5 lg:px-8 pt-16 lg:pt-0">
      <motion.div style={{ y, opacity, scale }} className="max-w-[1400px] mx-auto w-full">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] backdrop-blur-md text-[12px] text-slate-300 w-fit mb-7"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          ISO 20022 Native · UNCITRAL Model Law · Direct Bank Settlement
        </motion.div>

        {/* 3D Sigil + Headline grid — equal columns for dramatic split */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-8 lg:gap-6 items-center">
          {/* Left: Headline */}
          <div>
            <motion.h1
              className="text-[clamp(2.5rem,6.5vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em] text-white"
            >
              {headlineWords.map((word, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.7, delay: 0.3 + i * 0.09, ease: [0.16, 1, 0.3, 1] }}
                  className={`inline-block mr-[0.25em] ${i === 0 ? "bg-clip-text text-transparent" : ""}`}
                  style={i === 0 ? { backgroundImage: "linear-gradient(120deg, #60a5fa 0%, #a78bfa 50%, #22d3ee 100%)" } : undefined}
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.95 }}
              className="mt-7 max-w-[44rem] text-[16px] lg:text-[18px] text-slate-300 leading-[1.65]"
            >
              Not a marketplace. Not a broker. SGTX is the constitutional operating system
              that turns commercial intent into a governed, machine-readable, regulation-aware
              execution graph — direct bank-to-bank, zero custody, every action audited on the Loom.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 1.15 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <button onClick={() => onNavigate("/join")}
                className="group inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-semibold text-white rounded-full transition-all hover:shadow-2xl hover:shadow-blue-500/40 hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)" }}>
                Request Access
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button onClick={onExplorePortals}
                className="group inline-flex items-center gap-2 px-6 py-3.5 text-[14px] font-medium text-slate-200 rounded-full border border-white/[0.1] bg-white/[0.03] backdrop-blur-md hover:bg-white/[0.07] hover:border-white/[0.2] transition-all">
                <Play className="w-3.5 h-3.5 fill-current" />
                Explore the 12 Portals
              </button>
            </motion.div>

            {/* Trust pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 1.35 }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-400"
            >
              <span className="inline-flex items-center gap-1.5"><Lock className="w-3 h-3 text-emerald-400" /> Non-custodial by structure</span>
              <span className="inline-flex items-center gap-1.5"><Shield className="w-3 h-3 text-cyan-400" /> Governor-governed (G1–G7)</span>
              <span className="inline-flex items-center gap-1.5"><Scale className="w-3 h-3 text-violet-400" /> Strictest-rule jurisdiction</span>
              <span className="inline-flex items-center gap-1.5"><Activity className="w-3 h-3 text-blue-400" /> 12 portals live</span>
            </motion.div>
          </div>

          {/* Right: Brand icon — the actual uploaded crystalline sigil, pixel-perfect */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:flex relative w-full h-[480px] items-center justify-center flex-shrink-0"
          >
            <motion.div ref={sigilRef} style={{ rotateX: sx, rotateY: sy, transformStyle: "preserve-3d" }}
              className="relative w-[420px] h-[420px]">
              <HeroBrandIcon />
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Live ticker bar at bottom — with fade edges */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] bg-[rgba(3,6,15,0.6)] backdrop-blur-md overflow-hidden">
        <div className="flex items-center h-9">
          <div className="flex-shrink-0 px-3 h-full flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-widest border-r border-white/[0.06] relative z-10 bg-[rgba(3,6,15,0.8)]">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Live
          </div>
          <div className="relative flex-1 overflow-hidden h-full" style={{ maskImage: "linear-gradient(to right, transparent, black 4%, black 96%, transparent)" }}>
            <motion.div className="flex items-center h-full whitespace-nowrap"
              animate={{ x: ["0%", "-50%"] }}
              transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
            >
              {[...LIVE_TICKER, ...LIVE_TICKER].map((t, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-5 text-[11px] font-mono text-slate-300">
                  <span className="text-slate-500">{t.gtid}</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">{t.action}</span>
                  <span className="font-semibold" style={{ color: t.color }}>{t.status}</span>
                  <span className="text-slate-700 ml-2">◆</span>
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 1 }}
        className="absolute bottom-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-20"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-300 font-medium">Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-slate-400/40 to-transparent relative overflow-hidden">
          <motion.div className="absolute top-0 left-0 w-full h-3 bg-white/80"
            animate={{ y: [-12, 40] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </section>
  );
}

/** Hero brand icon — the actual uploaded crystalline sigil image, pixel-perfect, with halo + floating data tags. */
function HeroBrandIcon() {
  return (
    <div className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
      {/* Large ambient halo extending beyond icon */}
      <div className="absolute inset-[-15%] rounded-full blur-3xl opacity-70"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, rgba(139,92,246,0.25) 40%, transparent 70%)" }}
        aria-hidden />
      {/* Secondary cyan halo */}
      <div className="absolute inset-[-10%] rounded-full blur-2xl opacity-40"
        style={{ background: "radial-gradient(circle at 60% 40%, rgba(34,211,238,0.35) 0%, transparent 55%)" }}
        aria-hidden />
      {/* Slow rotation ring (decorative, behind icon) */}
      <motion.svg viewBox="0 0 420 420" className="absolute inset-0 w-full h-full opacity-30" aria-hidden>
        <motion.circle cx="210" cy="210" r="200" fill="none" stroke="#60a5fa" strokeWidth="0.8" strokeDasharray="2 8"
          animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "210px 210px" }} />
        <motion.circle cx="210" cy="210" r="180" fill="none" stroke="#a78bfa" strokeWidth="0.6" strokeDasharray="1 12"
          animate={{ rotate: -360 }} transition={{ duration: 120, repeat: Infinity, ease: "linear" }} style={{ transformOrigin: "210px 210px" }} />
      </motion.svg>
      {/* The actual brand icon — pixel-perfect uploaded image */}
      <img
        src="/brand/sgtx-icon-dark.png"
        alt="SGTX sovereign crystalline sigil"
        className="absolute inset-0 m-auto w-[85%] h-[85%] object-contain rounded-3xl"
        style={{ filter: "drop-shadow(0 0 40px rgba(96,165,250,0.35))" }}
        draggable={false}
      />
      {/* Floating data tags around icon — high-contrast pills */}
      <div className="absolute top-[8%] left-[-6%] px-2.5 py-1.5 rounded-lg border border-cyan-400/30 bg-[#050816]/90 backdrop-blur-md text-[10px] font-mono font-semibold text-cyan-300 shadow-lg" style={{ transform: "translateZ(50px)" }}>G1·G7</div>
      <div className="absolute top-[42%] right-[-10%] px-2.5 py-1.5 rounded-lg border border-violet-400/30 bg-[#050816]/90 backdrop-blur-md text-[10px] font-mono font-semibold text-violet-300 shadow-lg" style={{ transform: "translateZ(40px)" }}>USTN-0042</div>
      <div className="absolute bottom-[14%] left-[-2%] px-2.5 py-1.5 rounded-lg border border-emerald-400/30 bg-[#050816]/90 backdrop-blur-md text-[10px] font-mono font-semibold text-emerald-300 shadow-lg" style={{ transform: "translateZ(60px)" }}>0.144%</div>
    </div>
  );
}
