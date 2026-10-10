"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

/**
 * Cinematic aurora background.
 * Pure CSS + Framer Motion — no WebGL, instant to paint.
 * Layered radial gradients drift slowly to create depth.
 */
export function AuroraBackground() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -180]);
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -90]);

  return (
    <div ref={ref} className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Base near-black with blue tint */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 120% 80% at 50% 0%, #0a1230 0%, #050816 45%, #02040c 100%)" }} />

      {/* Drifting aurora orbs */}
      <motion.div style={{ y: y1, x: "-30%" }} className="absolute top-[-15%] left-1/2 w-[60vw] h-[60vw] rounded-full"
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.7, 0.55] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-full h-full rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(37,99,235,0.45) 0%, rgba(37,99,235,0) 65%)" }} />
      </motion.div>

      <motion.div style={{ y: y2, x: "30%" }} className="absolute top-[20%] left-1/2 w-[45vw] h-[45vw] rounded-full"
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.6, 0.4] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      >
        <div className="w-full h-full rounded-full blur-[90px]" style={{ background: "radial-gradient(circle, rgba(124,58,237,0.5) 0%, rgba(124,58,237,0) 65%)" }} />
      </motion.div>

      <motion.div style={{ y: y3, x: "-20%" }} className="absolute top-[55%] left-1/2 w-[40vw] h-[40vw] rounded-full"
        animate={{ scale: [1, 1.12, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      >
        <div className="w-full h-full rounded-full blur-[80px]" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.42) 0%, rgba(6,182,212,0) 65%)" }} />
      </motion.div>

      {/* Fine grid overlay (very subtle — reduced from 0.025 to 0.012 to avoid blueprint feel) */}
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `linear-gradient(rgba(120,180,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(120,180,255,1) 1px, transparent 1px)`,
        backgroundSize: "96px 96px",
      }} />

      {/* Vignette */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 40%, rgba(2,4,12,0.7) 100%)" }} />

      {/* Top noise gradient for film grain feel */}
      <div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>")`,
      }} />
    </div>
  );
}
