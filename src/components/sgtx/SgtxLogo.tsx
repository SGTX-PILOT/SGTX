"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface SgtxLogoProps {
  size?: number;
  animated?: boolean;
  animation?: string;
  className?: string;
  glow?: boolean;
  variant?: "icon" | "full-light" | "full-dark" | "mixed";
}

/**
 * SGTX Sovereign Emblem — uses the exact attached brand logo images.
 * Variants:
 * - "icon": Gold 3D geometric icon only (for sidebars, favicons, small badges)
 * - "full-light": Full logo (icon + SGTX text + tagline) on light/white background
 * - "full-dark": Full logo on black background (for dark sections)
 * - "mixed": Logo with silver SGT + gold X accent
 */
export function SgtxLogo({ size = 96, animated = true, className, glow = true, variant = "icon" }: SgtxLogoProps) {
  const src = variant === "full-dark"
    ? "/sgtx-logos/sgtx-logo-dark.jpeg"
    : variant === "full-light"
    ? "/sgtx-logos/sgtx-logo-light.png"
    : variant === "mixed"
    ? "/sgtx-logos/sgtx-logo-mixed.png"
    : "/sgtx-logos/sgtx-icon-gold.png";

  // For icon variant, use square dimensions; for full logos, maintain aspect ratio
  const isIcon = variant === "icon";
  const width = isIcon ? size : size * 2.5;
  const height = isIcon ? size : size;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: width, height: height }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-40 pointer-events-none"
          style={{ background: "radial-gradient(circle, oklch(0.82 0.14 84 / 0.35), transparent 70%)" }}
        />
      )}
      <motion.div
        initial={animated ? { opacity: 0, scale: 0.8 } : false}
        animate={animated ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative w-full h-full"
      >
        <Image
          src={src}
          alt="SGTX — Sovereign Governed Trade Execution"
          fill
          className="object-contain"
          priority
          sizes={`${width}px`}
        />
      </motion.div>
    </div>
  );
}

/**
 * SGTX Wordmark — text-only "SGTX" with silver SGT + gold X
 * Matches the exact branding from attached logos.
 */
export function SgtxWordmark({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <div className={cn("flex items-baseline", className)}>
      <span
        className="font-display font-extrabold tracking-tight"
        style={{
          fontSize: size,
          background: "linear-gradient(135deg, oklch(0.72 0.012 250) 0%, oklch(0.82 0.015 250) 50%, oklch(0.65 0.01 250) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        SGT<span style={{ background: "linear-gradient(135deg, oklch(0.94 0.09 92) 0%, oklch(0.82 0.15 82) 50%, oklch(0.62 0.13 72) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>X</span>
      </span>
    </div>
  );
}

/**
 * SGTX Full Logo — icon + wordmark + tagline
 * Uses the exact attached full logo image for the best fidelity.
 */
export function SgtxFullLogo({ size = 64, animated = true, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SgtxLogo size={size} animated={animated} variant="icon" />
      <div className="flex flex-col leading-none">
        <SgtxWordmark size={size * 0.42} />
        <span className="text-[0.55em] tracking-[0.32em] text-muted-foreground font-medium mt-1 uppercase">
          Sovereign Trade OS
        </span>
      </div>
    </div>
  );
}

/**
 * SGTX Full Logo Image — uses the complete attached logo image (icon + text + tagline)
 * Best for headers, landing pages, and splash screens.
 */
export function SgtxFullLogoImage({ width = 240, className, variant = "full-light" }: { width?: number; className?: string; variant?: "full-light" | "full-dark" }) {
  const src = variant === "full-dark" ? "/sgtx-logos/sgtx-logo-dark.jpeg" : "/sgtx-logos/sgtx-logo-light.png";
  const height = Math.round(width * 0.4); // approximate aspect ratio of the full logo
  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      <Image
        src={src}
        alt="SGTX — Sovereign Governed Trade Execution"
        fill
        className="object-contain"
        priority
        sizes={`${width}px`}
      />
    </div>
  );
}
