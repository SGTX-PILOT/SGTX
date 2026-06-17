"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// Precompute tick-mark coordinates ONCE at module load so SSR and CSR produce
// identical SVG attribute strings (avoids hydration mismatch from FP drift in
// Math.cos/Math.sin between Node and the browser).
const TICKS = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2;
  const r1 = 90;
  const r2 = i % 6 === 0 ? 82 : 86;
  return {
    x1: (100 + Math.cos(a) * r1).toFixed(3),
    y1: (100 + Math.sin(a) * r1).toFixed(3),
    x2: (100 + Math.cos(a) * r2).toFixed(3),
    y2: (100 + Math.sin(a) * r2).toFixed(3),
    major: i % 6 === 0,
  };
});

interface SgtxLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  glow?: boolean;
}

/**
 * SGTX Sovereign Emblem — hexagonal geometric mark with interlocking "S" motif.
 * Metallic gold gradient with a rotating outer sovereign ring.
 */
export function SgtxLogo({ size = 96, animated = true, className, glow = true }: SgtxLogoProps) {
  const gid = "sgtx-gold";
  const sid = "sgtx-silver";
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-60"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.14 84 / 0.55), transparent 70%)" }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative"
      >
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.94 0.09 92)" />
            <stop offset="35%" stopColor="oklch(0.82 0.15 82)" />
            <stop offset="65%" stopColor="oklch(0.66 0.13 72)" />
            <stop offset="100%" stopColor="oklch(0.88 0.10 90)" />
          </linearGradient>
          <linearGradient id={sid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.95 0.004 250)" />
            <stop offset="50%" stopColor="oklch(0.78 0.012 250)" />
            <stop offset="100%" stopColor="oklch(0.92 0.006 250)" />
          </linearGradient>
          <linearGradient id="sgtx-gold-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.90 0.10 90)" />
            <stop offset="100%" stopColor="oklch(0.62 0.13 70)" />
          </linearGradient>
          <filter id="sgtx-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer sovereign ring with tick marks */}
        {animated && (
          <motion.g
            style={{ transformOrigin: "100px 100px" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
          >
            <circle cx="100" cy="100" r="92" stroke={`url(#${gid})`} strokeWidth="0.6" strokeDasharray="1 3" opacity="0.55" fill="none" />
            <circle cx="100" cy="100" r="86" stroke={`url(#${gid})`} strokeWidth="0.4" opacity="0.3" fill="none" />
            {TICKS.map((t, i) => (
              <line
                key={i}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={`url(#${gid})`}
                strokeWidth={t.major ? 1.1 : 0.5}
                opacity={t.major ? 0.85 : 0.4}
              />
            ))}
          </motion.g>
        )}

        {/* Hexagon frame (two layers) */}
        <motion.path
          d="M100 18 L168 57 L168 143 L100 182 L32 143 L32 57 Z"
          stroke={`url(#sgtx-gold-stroke)`}
          strokeWidth="2.2"
          fill="oklch(0.13 0.008 240 / 0.5)"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={animated ? { pathLength: 1, opacity: 1 } : {}}
          transition={{ duration: 1.6, ease: "easeInOut" }}
        />
        <path
          d="M100 30 L157 63 L157 137 L100 170 L43 137 L43 63 Z"
          stroke={`url(#${gid})`}
          strokeWidth="0.8"
          opacity="0.5"
          fill="none"
        />

        {/* Interlocking S motif — two stacked chevrons forming an S/G fusion */}
        <motion.g
          initial={animated ? { opacity: 0, scale: 0.6 } : false}
          animate={animated ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 1, delay: 0.7, ease: "easeOut" }}
          filter="url(#sgtx-glow)"
        >
          {/* Upper chevron */}
          <path
            d="M70 74 L100 58 L130 74 L130 92 L100 108 L70 92 Z"
            fill={`url(#${gid})`}
            opacity="0.95"
          />
          {/* Lower chevron (mirrored, forms the S) */}
          <path
            d="M70 108 L100 124 L130 108 L130 126 L100 142 L70 126 Z"
            fill={`url(#${gid})`}
            opacity="0.95"
          />
          {/* Central connector bar */}
          <rect x="96" y="92" width="8" height="16" fill={`url(#${gid})`} opacity="0.9" />
          {/* Inner highlight */}
          <path
            d="M100 62 L124 74 L124 84 L100 96 L76 84 L76 74 Z"
            fill="oklch(0.96 0.05 92)"
            opacity="0.55"
          />
        </motion.g>

        {/* Corner nodes */}
        {[
          [100, 18], [168, 57], [168, 143], [100, 182], [32, 143], [32, 57],
        ].map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r="2.4"
            fill={`url(#${gid})`}
            initial={animated ? { scale: 0 } : false}
            animate={animated ? { scale: 1 } : {}}
            transition={{ duration: 0.4, delay: 1.4 + i * 0.08 }}
          />
        ))}

        {/* Center pulse */}
        {animated && (
          <motion.circle
            cx="100"
            cy="100"
            r="3"
            fill="oklch(0.96 0.06 90)"
            style={{ transformOrigin: "100px 100px" }}
            animate={{ scale: [1, 1.6, 1], opacity: [0.9, 0.3, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </svg>
    </div>
  );
}

export function SgtxWordmark({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("flex items-baseline", className)}>
      <span className="font-display font-extrabold tracking-tight text-silver-gradient" style={{ fontSize: size }}>
        SG<span className="text-gold-gradient">T</span>X
      </span>
    </div>
  );
}

export function SgtxFullLogo({ size = 64, animated = true, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SgtxLogo size={size} animated={animated} />
      <div className="flex flex-col leading-none">
        <SgtxWordmark size={size * 0.42} />
        <span className="text-[0.55em] tracking-[0.32em] text-muted-foreground font-medium mt-1 uppercase">
          Sovereign Trade OS
        </span>
      </div>
    </div>
  );
}
