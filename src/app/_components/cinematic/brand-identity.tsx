"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — UNIFIED BRAND IDENTITY SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════
// The SGTX sovereign sigil: a hexagonal crest formed from six interlocking
// facets, with a negative-space "S" channel cutting through the centre,
// terminating in an execution node (the spark of settlement).
//
// Brand language:
//   • Hexagon   = sovereignty (six constitutional gates, structural integrity)
//   • S-channel = sovereign flow of governed trade
//   • Node      = the execution point — every action settles here
//   • Spectrum  = deep sovereign blue → cyan trust → violet governance
//
// Three exports:
//   <BrandMark/>   — icon only (use in tight spaces: launcher header, favicons)
//   <Wordmark/>    — text only "SGTX" with sovereign spectrum
//   <SGTXLogo/>    — full lockup (mark + wordmark + optional tagline)
// ═══════════════════════════════════════════════════════════════════════════════

type BrandSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<BrandSize, { box: number; text: string; sub: string; gap: string }> = {
  xs: { box: 22, text: "text-[13px]", sub: "text-[7.5px]", gap: "gap-1.5" },
  sm: { box: 28, text: "text-[14px]", sub: "text-[8px]",  gap: "gap-2" },
  md: { box: 36, text: "text-[16px]", sub: "text-[9px]",  gap: "gap-2.5" },
  lg: { box: 48, text: "text-[20px]", sub: "text-[10px]", gap: "gap-3" },
  xl: { box: 72, text: "text-[30px]", sub: "text-[12px]", gap: "gap-4" },
};

interface BrandMarkProps {
  size?: BrandSize;
  className?: string;
  animated?: boolean;
  glow?: boolean;
}

/**
 * BrandMark — the SGTX sovereign sigil icon.
 * Pure SVG. Animated variant rotates the outer ring + pulse on the node.
 */
export function BrandMark({ size = "md", className = "", animated = false, glow = true }: BrandMarkProps) {
  const dim = SIZE_MAP[size].box;
  const id = `sgtx-${size}-${animated ? "a" : "s"}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: dim, height: dim }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-lg opacity-60 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.5) 0%, rgba(139,92,246,0.25) 45%, transparent 70%)" }}
          aria-hidden
        />
      )}
      <svg viewBox="0 0 100 100" width={dim} height={dim} className="relative" aria-hidden>
        <defs>
          <linearGradient id={`${id}-facet`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="45%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e0f2fe" />
          </linearGradient>
          <radialGradient id={`${id}-node`} cx="50%" cy="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </radialGradient>
        </defs>

        {/* Outer hexagon — the sovereign container */}
        {animated ? (
          <motion.polygon
            points="50,4 91,27 91,73 50,96 9,73 9,27"
            fill="none"
            stroke={`url(#${id}-facet)`}
            strokeWidth="2.5"
            strokeLinejoin="round"
            initial={{ rotate: 0 }}
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "50px 50px" }}
            opacity="0.5"
            strokeDasharray="3 4"
          />
        ) : (
          <polygon
            points="50,4 91,27 91,73 50,96 9,73 9,27"
            fill="none"
            stroke={`url(#${id}-facet)`}
            strokeWidth="2.5"
            strokeLinejoin="round"
            opacity="0.55"
            strokeDasharray="3 4"
          />
        )}

        {/* Inner hexagon — the governed core */}
        <polygon
          points="50,18 80,35 80,65 50,82 20,65 20,35"
          fill="rgba(15,23,42,0.4)"
          stroke={`url(#${id}-facet)`}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* The S-channel — sovereign flow */}
        <path
          d="M 62 32 Q 50 28 42 38 Q 38 50 50 50 Q 62 50 58 62 Q 50 72 38 68"
          fill="none"
          stroke={`url(#${id}-s)`}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Execution node — the settlement spark */}
        <circle cx="50" cy="50" r="3.5" fill={`url(#${id}-node)`} />
        {animated && (
          <motion.circle
            cx="50" cy="50" r="3.5"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            style={{ transformOrigin: "50px 50px" }}
          />
        )}

        {/* Six gate nodes around the inner hexagon */}
        {[[50,18],[80,35],[80,65],[50,82],[20,65],[20,35]].map(([cx, cy], i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r="1.6"
            fill="#22d3ee"
            opacity="0.85"
          />
        ))}
      </svg>
    </div>
  );
}

interface WordmarkProps {
  size?: BrandSize;
  className?: string;
  showTagline?: boolean;
}

/**
 * Wordmark — the "SGTX" wordmark with sovereign spectrum + optional tagline.
 */
export function Wordmark({ size = "md", className = "", showTagline = true }: WordmarkProps) {
  const s = SIZE_MAP[size];
  return (
    <div className={`flex flex-col leading-none ${className}`}>
      <span
        className={`${s.text} font-bold tracking-[0.06em]`}
        style={{
          backgroundImage: "linear-gradient(120deg, #ffffff 0%, #cbd5e1 40%, #93c5fd 70%, #c4b5fd 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        SGTX
      </span>
      {showTagline && (
        <span className={`${s.sub} text-slate-400 uppercase tracking-[0.22em] mt-1 font-medium`}>
          Sovereign Trade
        </span>
      )}
    </div>
  );
}

interface SGTXLogoProps {
  size?: BrandSize;
  className?: string;
  animated?: boolean;
  showTagline?: boolean;
  glow?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * SGTXLogo — the full lockup: BrandMark + Wordmark (+ optional tagline).
 * Use this everywhere the brand appears: nav, hero, footer, CTA, launcher.
 */
export function SGTXLogo({
  size = "md",
  className = "",
  animated = false,
  showTagline = true,
  glow = true,
  onClick,
  ariaLabel = "SGTX — Sovereign Governed Trade Execution",
}: SGTXLogoProps) {
  const s = SIZE_MAP[size];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      aria-label={onClick ? ariaLabel : undefined}
      className={`inline-flex items-center ${s.gap} group ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      <BrandMark size={size} animated={animated} glow={glow} />
      <Wordmark size={size} showTagline={showTagline} />
    </Comp>
  );
}
