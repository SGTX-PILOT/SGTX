"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useMemo } from "react";
import {
  ShieldCheck,
  Hash,
  Lock,
  Landmark,
  Cpu,
  Eye,
  FileCheck,
  ShoppingBag,
  Tags,
  Truck,
  Ship,
  FlaskConical,
  ClipboardCheck,
  FileText,
  Banknote,
  Briefcase,
  Building2,
  Settings,
  Plug,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Sparkles,
  Hexagon,
  type LucideIcon,
} from "lucide-react";
import { SgtxLogo, SgtxFullLogoImage } from "./SgtxLogo";
import { useAppStore } from "@/store/app-store";

/* ------------------------------------------------------------------ */
/*  Content                                                            */
/* ------------------------------------------------------------------ */

type AccentKey = "gold" | "silver" | "emerald" | "amber";

/* Accent palette tuned for the professional light theme — colors are
   darkened relative to the legacy dark-theme accents so they remain visible
   and readable on a warm off-white canvas. Brand gold is preserved. */
const ACCENT: Record<AccentKey, { ring: string; glow: string; text: string; chip: string }> = {
  gold: {
    ring: "oklch(0.62 0.13 75 / 0.55)",
    glow: "0 0 26px -8px oklch(0.62 0.13 75 / 0.45)",
    text: "oklch(0.50 0.12 70)",
    chip: "oklch(0.62 0.13 75 / 0.12)",
  },
  silver: {
    ring: "oklch(0.45 0.015 250 / 0.45)",
    glow: "0 0 26px -8px oklch(0.45 0.015 250 / 0.40)",
    text: "oklch(0.38 0.016 250)",
    chip: "oklch(0.45 0.015 250 / 0.10)",
  },
  emerald: {
    ring: "oklch(0.50 0.13 160 / 0.50)",
    glow: "0 0 26px -8px oklch(0.50 0.13 160 / 0.45)",
    text: "oklch(0.40 0.12 160)",
    chip: "oklch(0.50 0.13 160 / 0.12)",
  },
  amber: {
    ring: "oklch(0.55 0.14 65 / 0.55)",
    glow: "0 0 26px -8px oklch(0.55 0.14 65 / 0.50)",
    text: "oklch(0.45 0.13 55)",
    chip: "oklch(0.55 0.14 65 / 0.12)",
  },
};

interface Pillar {
  id: string;
  title: string;
  desc: string;
  icon: LucideIcon;
}

const PILLARS: Pillar[] = [
  { id: "G1", title: "Sovereign Execution", desc: "Every trade gated by the Governor — OPA + WasmEdge + Loom hash chain.", icon: ShieldCheck },
  { id: "G2", title: "Universal Trade Number", desc: "One USTN links buyer, seller, financier, lab, customs and government.", icon: Hash },
  { id: "G3", title: "Non-Custodial Settlement", desc: "FeeLock split via PSP. SGTX never holds your funds. Ever.", icon: Lock },
  { id: "G4", title: "Universal Trade Finance", desc: "RFQ broadcast, encrypted bidding, co-financing, DeFi risk oracle.", icon: Landmark },
  { id: "G5", title: "AI-Governed Operations", desc: "A1 advisory, A2 constraining, A3 autonomous — full authority ladder.", icon: Cpu },
  { id: "G6", title: "Sovereign Visibility", desc: "Government sees real-time trade flow, customs assessment, FX settlement.", icon: Eye },
  { id: "G7", title: "Open Compliance", desc: "Nafeza · CargoX · ETA · CBE. Sovereign rails, native integration.", icon: FileCheck },
];

interface PortalDef {
  id: string; // store portal id (or null for admin/marketplace)
  code: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  accent: AccentKey;
}

interface PortalGroup {
  label: string;
  tagline: string;
  portals: PortalDef[];
}

const PORTAL_GROUPS: PortalGroup[] = [
  {
    label: "Trade",
    tagline: "Two sides, one USTN.",
    portals: [
      { id: "trader-buyer", code: "TRD/BUY", name: "Trader — Buyer", desc: "Initiate trade requests, review quotes, manage inbound shipments.", icon: ShoppingBag, accent: "silver" },
      { id: "trader-seller", code: "TRD/SELL", name: "Trader — Seller", desc: "Receive trade requests, lock EXW pricing, manage packing & outbound logistics.", icon: Tags, accent: "silver" },
    ],
  },
  {
    label: "Logistics & Quality",
    tagline: "From warehouse to vessel to lab bench.",
    portals: [
      { id: "lsp", code: "LSP", name: "Logistics Provider", desc: "Container pickup, trucking, milestone confirmations.", icon: Truck, accent: "gold" },
      { id: "ship", code: "SHIP", name: "Shipping Line", desc: "Vessel schedules, container loading, B/L issuance.", icon: Ship, accent: "gold" },
      { id: "lab", code: "LAB", name: "Laboratory", desc: "ISO 17025 testing, MRL validation.", icon: FlaskConical, accent: "gold" },
      { id: "qc", code: "QC", name: "Quality Control", desc: "Pre-shipment inspections, defect logging.", icon: ClipboardCheck, accent: "gold" },
      { id: "cbr", code: "CBR", name: "Customs Broker", desc: "Customs declarations, certificates of origin.", icon: FileText, accent: "gold" },
    ],
  },
  {
    label: "Finance",
    tagline: "Capital flows, never custody.",
    portals: [
      { id: "bank", code: "FIN/BANK", name: "Financier — Bank", desc: "Review financing RFQs, submit bids, manage loans.", icon: Banknote, accent: "gold" },
      { id: "pfi", code: "FIN/PFI", name: "Financier — Private", desc: "Private trade finance, bid on RFQs.", icon: Briefcase, accent: "gold" },
    ],
  },
  {
    label: "Government",
    tagline: "Sovereign by design.",
    portals: [
      { id: "gov", code: "GOV", name: "Government", desc: "Real-time trade visibility, customs assessment.", icon: Building2, accent: "emerald" },
    ],
  },
  {
    label: "Platform",
    tagline: "The operators behind the operating system.",
    portals: [
      { id: "admin", code: "ADM", name: "Platform Admin", desc: "Governance, integrations health, add-on management.", icon: Settings, accent: "amber" },
      { id: "marketplace-partner", code: "MP", name: "Marketplace Partner", desc: "External platform integration, revenue attribution.", icon: Plug, accent: "gold" },
    ],
  },
];

const STATS = [
  "1.5% fee per side · non-custodial",
  "GTID SGTX-{COUNTRY}-{TYPE}-{SEQ}-{CHECKSUM}",
  "USTN-linked government visibility",
  "Nafeza · CargoX · ETA · CBE",
  "Zero cloud · zero SaaS · open-source",
  "Governor · OPA · WasmEdge · Loom chain",
];

/* ------------------------------------------------------------------ */
/*  Animation variants                                                */
/* ------------------------------------------------------------------ */

const useStagger = (stagger = 0.08, delay = 0): Variants => {
  const reduce = useReducedMotion();
  return useMemo(
    () => ({
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: reduce ? 0 : stagger, delayChildren: delay },
      },
    }),
    [reduce, stagger, delay],
  );
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.7, ease: "easeOut" } },
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function HexIcon({
  Icon,
  size = 56,
  accent = "gold",
}: {
  Icon: LucideIcon;
  size?: number;
  accent?: AccentKey;
}) {
  const a = ACCENT[accent];
  const hexPath = "M50 4 L88 26 L88 74 L50 96 L12 74 L12 26 Z";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Glow */}
      <div
        className="absolute inset-0 rounded-full blur-xl opacity-50"
        style={{ background: `radial-gradient(circle, ${a.ring}, transparent 70%)` }}
      />
      <svg viewBox="0 0 100 100" className="relative" width={size} height={size} fill="none">
        <defs>
          <linearGradient id={`hex-fill-${accent}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={a.text} stopOpacity="0.16" />
            <stop offset="100%" stopColor={a.text} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <path d={hexPath} fill={`url(#hex-fill-${accent})`} stroke={a.ring} strokeWidth="1.4" />
        <path d={hexPath} fill="none" stroke={a.text} strokeWidth="0.5" opacity="0.4" transform="scale(0.78) translate(14,14)" />
      </svg>
      <Icon className="absolute" style={{ color: a.text, width: size * 0.4, height: size * 0.4 }} />
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeUp}
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gold/40 bg-gold/5 text-[0.62rem] tracking-[0.32em] uppercase text-primary font-semibold"
    >
      <Hexagon className="w-3 h-3" />
      {children}
    </motion.div>
  );
}

function ParticleField() {
  const reduce = useReducedMotion();
  const particles = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        id: i,
        left: (i * 37) % 100,
        top: (i * 53) % 100,
        size: 1 + (i % 4),
        delay: (i % 7) * 0.6,
        duration: 6 + (i % 6),
        gold: i % 3 === 0,
      })),
    [],
  );
  if (reduce) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.gold ? "oklch(0.62 0.13 75 / 0.55)" : "oklch(0.55 0.012 250 / 0.45)",
            boxShadow: p.gold ? "0 0 6px oklch(0.62 0.13 75 / 0.45)" : "0 0 4px oklch(0.55 0.012 250 / 0.35)",
          }}
          animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1.3, 0.5], y: [0, -22, 0] }}
          transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

function HeroSection({ onEnter }: { onEnter: () => void }) {
  const reduce = useReducedMotion();
  const scrollToPortals = () => {
    document.getElementById("portals")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      {/* Backgrounds */}
      <div className="absolute inset-0 sovereign-radial" />
      <div className="absolute inset-0 sovereign-grid opacity-30" />
      <ParticleField />
      {/* Converging hex rings around logo */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.1 }}
        >
          {[0, 1, 2].map((r) => (
            <motion.div
              key={r}
              className="absolute rounded-full border"
              style={{ borderColor: "oklch(0.62 0.13 75 / 0.22)" }}
              initial={{ width: 320 + r * 180, height: 320 + r * 180, opacity: 0.5 }}
              animate={{ width: [320 + r * 180, 360 + r * 180, 320 + r * 180], opacity: [0.35, 0.12, 0.35] }}
              transition={{ duration: 8 + r * 2, repeat: Infinity, ease: "easeInOut", delay: r * 0.5 }}
            />
          ))}
        </motion.div>
      )}
      {/* Scanning beam */}
      <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-50 animate-scan" />

      {/* Content */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={useStagger(0.14, 0.05)}
        className="relative z-10 flex flex-col items-center text-center max-w-5xl"
      >
        {/* Logo — exact attached SGTX brand logo */}
        <motion.div variants={fadeUp} className="mb-6">
          <SgtxLogo size={120} animated glow variant="icon" />
        </motion.div>

        {/* Eyebrow */}
        <motion.div variants={fadeUp} className="mb-4">
          <SectionEyebrow>Sovereign Trade Operating System</SectionEyebrow>
        </motion.div>

        {/* Wordmark — SGTX with silver SGT + gold X matching attached logo */}
        <motion.h1
          variants={fadeUp}
          className="font-display font-black tracking-tight leading-none"
          style={{
            fontSize: "clamp(4rem, 13vw, 9rem)",
            background: "linear-gradient(135deg, oklch(0.72 0.012 250) 0%, oklch(0.82 0.015 250) 40%, oklch(0.82 0.015 250) 60%, oklch(0.65 0.01 250) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          SGT<span style={{ background: "linear-gradient(135deg, oklch(0.94 0.09 92) 0%, oklch(0.82 0.15 82) 50%, oklch(0.62 0.13 72) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>X</span>
        </motion.h1>
        <motion.div variants={fadeUp} className="flex items-center gap-4 mt-6">
          <span className="h-px w-16 sm:w-28 gold-hairline" />
          <p className="text-[0.7rem] sm:text-xs tracking-[0.42em] text-muted-foreground font-medium uppercase">
            Sovereign Governed Trade Execution
          </p>
          <span className="h-px w-16 sm:w-28 gold-hairline" />
        </motion.div>

        {/* Mission */}
        <motion.p
          variants={fadeUp}
          className="mt-8 text-base sm:text-lg text-foreground/75 max-w-2xl leading-relaxed"
        >
          The non-custodial, AI-governed operating system for global trade.
          <br className="hidden sm:block" />
          <span className="text-foreground/55"> One click to ship. One click to import. One click to pay.</span>
        </motion.p>

        {/* CTA */}
        <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={onEnter}
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
            onClick={scrollToPortals}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wide flex items-center gap-2"
          >
            Explore the 12 portals
            <ChevronDown className="w-4 h-4 animate-float" />
          </button>
        </motion.div>

        {/* Quick pillars */}
        <motion.div
          variants={fadeUp}
          className="mt-14 flex flex-wrap items-center justify-center gap-3 max-w-2xl"
        >
          {[
            "Non-Custodial",
            "AI-Governed",
            "USTN-Linked",
            "Sovereign Rails",
            "Zero SaaS",
          ].map((tag) => (
            <span
              key={tag}
              className="text-[0.65rem] tracking-[0.18em] uppercase px-3 py-1.5 rounded-full glass-panel text-foreground/70 font-medium"
            >
              {tag}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.button
        onClick={scrollToPortals}
        aria-label="Scroll to portals"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="text-[0.55rem] tracking-[0.32em] uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.button>
    </section>
  );
}

function MarqueeStrip() {
  return (
    <div className="relative border-y border-border/60 bg-muted/60 py-3 overflow-hidden">
      <div className="flex gap-10 animate-marquee whitespace-nowrap text-[0.62rem] tracking-[0.28em] uppercase text-muted-foreground">
        {[...STATS, ...STATS].map((s, i) => (
          <span key={i} className="flex items-center gap-10">
            <span className="text-gold">◆</span>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function PillarsSection() {
  const container = useStagger(0.09);
  return (
    <section id="pillars" className="relative px-6 py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 sovereign-grid opacity-15" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 gold-hairline opacity-60" />

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={container}
        className="relative z-10 max-w-7xl mx-auto"
      >
        {/* Heading */}
        <div className="flex flex-col items-center text-center mb-16">
          <SectionEyebrow>The Constitutional Framework</SectionEyebrow>
          <motion.h2
            variants={fadeUp}
            className="mt-5 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            The <span className="text-gold-gradient">Seven Pillars</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground max-w-2xl text-sm sm:text-base">
            Seven sovereign guarantees enforced on every transaction by the SGTX Governor Service.
          </motion.p>
        </div>

        {/* Grid — 4 + 3 (centered last row) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.id}
              variants={fadeUp}
              className={i >= 4 ? "lg:col-start-[2]" : undefined}
            >
              <PillarCard pillar={p} />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

function PillarCard({ pillar }: { pillar: Pillar }) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className="group relative h-full rounded-2xl glass-panel p-6 overflow-hidden hover:border-gold/60 transition-colors"
    >
      {/* Corner glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
        style={{ background: "radial-gradient(circle, oklch(0.78 0.14 84 / 0.35), transparent 70%)" }}
      />
      {/* G# Badge */}
      <div className="absolute top-5 right-5 font-display text-xs tracking-[0.2em] text-primary/80 font-bold">
        {pillar.id}
      </div>

      <div className="relative">
        <HexIcon Icon={pillar.icon} accent="gold" />
      </div>

      <h3 className="mt-5 font-display text-lg font-semibold text-foreground leading-tight">
        {pillar.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{pillar.desc}</p>

      {/* Bottom gold line grow on hover */}
      <span className="absolute bottom-0 left-0 h-px w-0 bg-gold-gradient transition-all duration-500 group-hover:w-full" />
    </motion.div>
  );
}

function PortalsSection() {
  const enterPortal = useAppStore((s) => s.enterPortal);
  const setLandingEntered = useAppStore((s) => s.setLandingEntered);
  const container = useStagger(0.06);
  const groupStagger = useStagger(0.07);

  const handleEnter = (portalId: string) => {
    setLandingEntered(true);
    enterPortal(portalId, "");
  };

  return (
    <section id="portals" className="relative px-6 py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 sovereign-radial opacity-70" />
      <div className="absolute inset-0 sovereign-grid opacity-15" />

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={container}
        className="relative z-10 max-w-7xl mx-auto"
      >
        {/* Heading */}
        <div className="flex flex-col items-center text-center mb-16">
          <SectionEyebrow>Twelve Gateways · One Truth Layer</SectionEyebrow>
          <motion.h2
            variants={fadeUp}
            className="mt-5 font-display text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Choose Your <span className="text-gold-gradient">Portal</span>
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground max-w-2xl text-sm sm:text-base">
            SGTX is not a marketplace. Each portal is a sovereign console sharing one USTN-linked truth.
          </motion.p>
        </div>

        {/* Groups */}
        <div className="space-y-16">
          {PORTAL_GROUPS.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <motion.div variants={fadeUp} className="flex items-end justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <span className="h-px w-10 gold-hairline" />
                  <h3 className="font-display text-xl sm:text-2xl font-semibold text-foreground">{group.label}</h3>
                  <span className="text-[0.6rem] tracking-[0.28em] uppercase text-primary/80 font-bold">{group.tagline}</span>
                </div>
              </motion.div>

              {/* Cards */}
              <motion.div
                variants={groupStagger}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {group.portals.map((p) => (
                  <PortalCard key={p.id} portal={p} onEnter={() => handleEnter(p.id)} />
                ))}
              </motion.div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          variants={fadeUp}
          className="mt-20 flex flex-col items-center text-center gap-4 p-10 rounded-3xl glass-panel relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-30 sovereign-radial" />
          <div className="relative">
            <HexIcon Icon={Sparkles} size={48} accent="gold" />
            <h3 className="mt-5 font-display text-2xl sm:text-3xl font-bold">
              Prefer the <span className="text-gold-gradient">full launcher</span>?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              Open the Portal Gateway to see every tenant identity, GTID, trust score and onboard a new tenant.
            </p>
            <button
              onClick={() => useAppStore.getState().setView("launcher")}
              className="mt-6 inline-flex items-center gap-2 bg-gold-gradient text-sovereign font-semibold px-7 py-3 rounded-full text-xs tracking-widest uppercase hover:glow-gold-sm transition-all"
            >
              Open Portal Gateway
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

function PortalCard({ portal, onEnter }: { portal: PortalDef; onEnter: () => void }) {
  const a = ACCENT[portal.accent];
  return (
    <motion.button
      variants={fadeUp}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      onClick={onEnter}
      className="group relative text-left h-full w-full rounded-2xl glass-panel p-6 overflow-hidden transition-colors"
      style={{ borderColor: a.ring }}
    >
      {/* Hover glow */}
      <div
        className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl"
        style={{ background: `radial-gradient(circle, ${a.ring}, transparent 70%)` }}
      />
      {/* Top-left vertical accent line */}
      <span
        className="absolute top-0 left-6 w-px h-0 group-hover:h-full transition-all duration-500"
        style={{ background: a.text }}
      />

      <div className="relative flex items-start justify-between">
        <HexIcon Icon={portal.icon} accent={portal.accent} />
        <span
          className="text-[0.55rem] tracking-[0.22em] uppercase font-bold px-2 py-1 rounded-md"
          style={{ background: a.chip, color: a.text }}
        >
          {portal.code}
        </span>
      </div>

      <h3 className="mt-5 font-display text-base font-semibold text-foreground leading-tight">
        {portal.name}
      </h3>
      <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">{portal.desc}</p>

      {/* Enter row */}
      <div
        className="mt-5 flex items-center gap-1.5 text-[0.65rem] tracking-[0.22em] uppercase font-semibold opacity-70 group-hover:opacity-100 transition-opacity"
        style={{ color: a.text }}
      >
        Enter
        <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" style={{ color: a.text }} />
      </div>
    </motion.button>
  );
}

function Footer() {
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  return (
    <footer className="relative px-6 pt-20 pb-12 overflow-hidden border-t border-border/40">
      <div className="absolute inset-0 sovereign-radial opacity-50" />
      <div className="absolute inset-0 sovereign-grid opacity-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="relative z-10 max-w-5xl mx-auto flex flex-col items-center text-center"
      >
        <SgtxLogo size={56} animated={false} glow={false} variant="icon" />
        <p className="mt-4 font-display text-2xl sm:text-3xl font-bold tracking-tight">
          <span style={{ background: "linear-gradient(135deg, oklch(0.72 0.012 250) 0%, oklch(0.82 0.015 250) 50%, oklch(0.65 0.01 250) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>SGT</span><span style={{ background: "linear-gradient(135deg, oklch(0.94 0.09 92) 0%, oklch(0.82 0.15 82) 50%, oklch(0.62 0.13 72) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>X</span>
        </p>
        <p className="mt-2 text-[0.65rem] tracking-[0.4em] uppercase text-muted-foreground">
          The Sovereign Trade Operating System
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-foreground/70">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-primary" /> Non-Custodial
          </span>
          <span className="text-primary/50">·</span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-primary" /> AI-Governed
          </span>
          <span className="text-primary/50">·</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Sovereign
          </span>
        </div>

        <div className="mt-10 w-full max-w-md h-px gold-hairline opacity-50" />

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 w-full text-[0.65rem] tracking-[0.18em] uppercase text-muted-foreground">
          <span>Not a marketplace. An operating system.</span>
          <button
            onClick={scrollTop}
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            Back to top
            <ArrowUp className="w-3 h-3" />
          </button>
        </div>
      </motion.div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export function CinematicLanding() {
  const setView = useAppStore((s) => s.setView);
  const setLandingEntered = useAppStore((s) => s.setLandingEntered);

  const enter = () => {
    setLandingEntered(true);
    setView("launcher");
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <HeroSection onEnter={enter} />
      <MarqueeStrip />
      <PillarsSection />
      <PortalsSection />
      <Footer />
    </div>
  );
}
