"use client";

import { motion } from "framer-motion";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — UNIFIED BRAND IDENTITY SYSTEM (pixel-perfect uploaded assets)
// ═══════════════════════════════════════════════════════════════════════════════
// Uses the EXACT uploaded brand imagery (Gemini-generated crystalline hex icon):
//   • /brand/sgtx-icon-dark.png  — 3D crystalline icon on black (dark UI)
//   • /brand/sgtx-icon-light.png — 3D crystalline icon on white (light/print)
//   • /brand/sgtx-logo-full.png  — full horizontal lockup (icon + SGTX + tagline)
//
// Brand language:
//   • Hexagonal crystalline structure = sovereignty (constitutional governance)
//   • Electric blue/cyan glow = trust + execution
//   • Purple/magenta edges = AI + governance
//   • Tagline: "SOVEREIGN GOVERNED TRADING EXECUTION"
// ═══════════════════════════════════════════════════════════════════════════════

type BrandSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<BrandSize, { box: number; text: string; sub: string; gap: string }> = {
  xs: { box: 22, text: "text-[13px]", sub: "text-[7.5px]", gap: "gap-1.5" },
  sm: { box: 32, text: "text-[15px]", sub: "text-[8.5px]",  gap: "gap-2.5" },
  md: { box: 44, text: "text-[18px]", sub: "text-[9.5px]",  gap: "gap-3" },
  lg: { box: 60, text: "text-[24px]", sub: "text-[11px]",  gap: "gap-3.5" },
  xl: { box: 90, text: "text-[36px]", sub: "text-[14px]",  gap: "gap-5" },
};

interface BrandMarkProps {
  size?: BrandSize;
  className?: string;
  variant?: "dark" | "light";
  glow?: boolean;
  rounded?: boolean;
}

/**
 * BrandMark — the SGTX crystalline hex icon (pixel-perfect uploaded image).
 * Uses /brand/sgtx-icon-dark.png on dark backgrounds, /brand/sgtx-icon-light.png on light.
 */
export function BrandMark({ size = "md", className = "", variant = "dark", glow = true, rounded = true }: BrandMarkProps) {
  const dim = SIZE_MAP[size].box;
  const src = variant === "light" ? "/brand/sgtx-icon-light.png" : "/brand/sgtx-icon-dark.png";

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: dim, height: dim }}>
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-lg opacity-50 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.45) 0%, rgba(139,92,246,0.25) 45%, transparent 70%)" }}
          aria-hidden
        />
      )}
      <img
        src={src}
        alt="SGTX"
        width={dim}
        height={dim}
        className={`relative ${rounded ? "rounded-lg" : ""}`}
        style={{ width: dim, height: dim, objectFit: "contain" }}
        draggable={false}
      />
    </div>
  );
}

interface WordmarkProps {
  size?: BrandSize;
  className?: string;
  showTagline?: boolean;
  tagline?: string;
}

/**
 * Wordmark — "SGTX" text with sovereign spectrum gradient + optional tagline.
 */
export function Wordmark({ size = "md", className = "", showTagline = true, tagline = "Sovereign Trade" }: WordmarkProps) {
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
          {tagline}
        </span>
      )}
    </div>
  );
}

interface FullLockupProps {
  className?: string;
  maxWidth?: number;
  glow?: boolean;
}

/**
 * FullLockup — the complete uploaded brand image (icon + SGTX + full tagline).
 * Uses /brand/sgtx-logo-full.png pixel-perfect. Best for hero, footer, CTA.
 */
export function FullLockup({ className = "", maxWidth = 320, glow = true }: FullLockupProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      {glow && (
        <div
          className="absolute inset-0 blur-2xl opacity-40 pointer-events-none rounded-2xl"
          style={{ background: "radial-gradient(ellipse at center, rgba(59,130,246,0.3) 0%, transparent 70%)" }}
          aria-hidden
        />
      )}
      <img
        src="/brand/sgtx-logo-full.png"
        alt="SGTX — Sovereign Governed Trading Execution"
        className="relative"
        style={{ maxWidth, width: "100%", height: "auto" }}
        draggable={false}
      />
    </div>
  );
}

interface SGTXLogoProps {
  size?: BrandSize;
  className?: string;
  showTagline?: boolean;
  glow?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  variant?: "dark" | "light";
}

/**
 * SGTXLogo — the full lockup: BrandMark (uploaded image) + Wordmark (text).
 * Use this everywhere the brand appears: nav, hero, footer, CTA, launcher.
 */
export function SGTXLogo({
  size = "md",
  className = "",
  showTagline = true,
  glow = true,
  onClick,
  ariaLabel = "SGTX — Sovereign Governed Trade Execution",
  variant = "dark",
}: SGTXLogoProps) {
  const s = SIZE_MAP[size];
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      aria-label={onClick ? ariaLabel : undefined}
      className={`inline-flex items-center ${s.gap} group ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      <BrandMark size={size} variant={variant} glow={glow} />
      <Wordmark size={size} showTagline={showTagline} />
    </Comp>
  );
}
