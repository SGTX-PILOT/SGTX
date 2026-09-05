"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import {
  ShieldCheck, Hash, Lock, Landmark, Cpu, Eye, FileCheck,
  ArrowRight, Sparkles, Search, Globe2, Users, Banknote, Zap, Scale, Brain,
  Languages, ChevronDown, CheckCircle2, TrendingUp, Activity,
  MapPin, Calendar, Package, ArrowUp,
  ShoppingBag, Store, Truck, Ship, FlaskConical, Settings,
} from "lucide-react";
import { SgtxLogo, SgtxWordmark } from "./SgtxLogo";
// useAppStore no longer needed — navigation uses Next.js router (useRouter)
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Landing — Sovereign Governed Trade Execution
//
// UI-REDESIGN (pilot feedback): the previous landing page had duplications
// ("Non-Custodial by Structure" + "Non-Custodial" as separate pillars) and
// too many sections. Pilot users called the platform "rocket-launching
// page" — too much information, no clear hierarchy.
//
// Redesign principles (government-grade, multi-billion-dollar project):
//   1. ONE hero, ONE value proposition, THREE primary actions.
//   2. FOUR pillars (no duplicates) — Cryptographic Certainty, Non-Custodial
//      by Design, AI Governance, Sovereign Jurisdiction.
//   3. ONE proof section (verifiable GTID + USTN lookups, no marketing fluff).
//   4. ONE clean footer with the legal/jurisdictional scope.
//
// Removed from the previous version:
//   * Duplicate "Non-Custodial" pillar (was both #2 and #5).
//   * "One-Second Trade Execution" pillar (marketing language, not a
//     constitutional principle).
//   * "Trusted by leading financiers" trust signal (unverified claim).
//   * Footer "Social" column (LinkedIn/Twitter/etc. — not appropriate for
//     a sovereign-grade platform).
//   * "Built on principles" + "Trusted by" sections (overlapping with
//     pillars).
// ═══════════════════════════════════════════════════════════════════════════════

interface GtidPublicProfile {
  found?: boolean;
  gtid: string; legal_name: string; type: string; jurisdiction: string;
  kyb_tier: number; kyb_status: string; sanctions_cleared: boolean;
  trust_score: number; lifecycle_state: string; is_saved_contact: null;
  message?: string;
}
interface UstnPublicTracking {
  ustn: string; status: string; commodity: any; exporter: any; importer: any;
  current_location: string; eta: string; last_updated: string; milestones: any[];
}

// UI-REDESIGN: 4 non-duplicate pillars (was 6 with 2 duplicates).
const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Cryptographic Certainty",
    desc: "Every trade is signed with Ed25519, anchored in the Loom immutable hash chain, and court-ready as evidence.",
    emoji: "🔐",
  },
  {
    icon: Lock,
    title: "Non-Custodial by Design",
    desc: "SGTX never holds funds. FeeLock is a payment instruction, not an escrow. PSPs and your banks handle all funds.",
    emoji: "🏦",
  },
  {
    icon: Brain,
    title: "AI Governance, Never Override",
    desc: "AI advises, flags, and escalates — but never autonomously executes an irreversible action. Humans stay in command.",
    emoji: "🧠",
  },
  {
    icon: Scale,
    title: "Sovereign Jurisdiction Supremacy",
    desc: "The strictest applicable law always applies. No trade can circumvent the jurisdiction of any participating country.",
    emoji: "⚖️",
  },
] as const;

// UI-REDESIGN: 3 proof points (was 6 trust signals with overlap).
const PROOF_POINTS = [
  {
    icon: Globe2,
    title: "Cross-Border by Construction",
    desc: "12 institution types — traders, logistics, shipping, labs, customs, banks, financiers, government — connected through one canonical protocol.",
  },
  {
    icon: Hash,
    title: "Verifiable Identity & Provenance",
    desc: "Every tenant has a Global Tenant ID (GTID). Every trade has a Universal Sovereign Trade Number (USTN). Both are publicly verifiable.",
  },
  {
    icon: FileCheck,
    title: "Audit-Ready by Default",
    desc: "Constitutional gates, OPA policies, and a tamper-evident Loom hash chain produce court-ready evidence on every trade.",
  },
] as const;

// UI-REDESIGN: 4 footer columns (was 5 including "Social"). Removed
// "Social" column — a sovereign-grade government platform does not
// promote social media in its primary footer.
const FOOTER_COLUMNS = [
  { title: "Platform", links: ["How It Works", "Use Cases", "Security Model", "Documentation", "API Reference"] },
  { title: "Institutions", links: ["For Traders", "For Logistics", "For Government", "For Financiers", "For Marketplaces"] },
  { title: "Legal", links: ["Terms of Service", "Privacy Policy", "Cookies", "GDPR", "PDPL (Egypt)"] },
  { title: "Support", links: ["Help Center", "Status Page", "Compliance Inquiries", "Contact Support"] },
] as const;

function fadeUp(delay = 0) {
  return { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay } } };
}

function HexIcon({ icon: Icon, accent = "gold" }: { icon: any; accent?: "gold" | "silver" }) {
  const stroke = accent === "gold" ? "oklch(0.62 0.13 75)" : "oklch(0.45 0.015 250)";
  return (
    <div className="relative">
      <svg viewBox="0 0 48 48" className="w-12 h-12" aria-hidden>
        <defs>
          <linearGradient id={`hex-${accent}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent === "gold" ? "oklch(0.94 0.09 92)" : "oklch(0.85 0.015 250)"} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accent === "gold" ? "oklch(0.62 0.13 75)" : "oklch(0.55 0.015 250)"} stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <polygon points="24,3 42,13.5 42,34.5 24,45 6,34.5 6,13.5" fill={`url(#hex-${accent})`} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
        <polygon points="24,9 37,16.5 37,31.5 24,39 11,31.5 11,16.5" fill="none" stroke={stroke} strokeWidth="0.6" strokeOpacity="0.4" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="w-5 h-5" style={{ color: stroke }} />
      </div>
    </div>
  );
}

function GlobalHeader() {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [langOpen, setLangOpen] = useState(false);
  const languages = [
    { code: "en", label: "English" }, { code: "ar", label: "العربية" }, { code: "fr", label: "Français" },
    { code: "es", label: "Español" }, { code: "de", label: "Deutsch" }, { code: "zh", label: "中文" },
    { code: "ja", label: "日本語" }, { code: "hi", label: "हिन्दी" }, { code: "ru", label: "Русский" },
    { code: "pt", label: "Português" }, { code: "sw", label: "Kiswahili" },
  ];

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <SgtxLogo className="w-9 h-9" />
          <SgtxWordmark className="h-5" />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition">How It Works</a>
          <a href="#institutions" className="text-muted-foreground hover:text-foreground transition">Institutions</a>
          <a href="#security" className="text-muted-foreground hover:text-foreground transition">Security</a>
          <a href="#verify" className="text-muted-foreground hover:text-foreground transition">Verify</a>
        </nav>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setLangOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 h-9 rounded-md hover:bg-muted text-sm text-muted-foreground"
              aria-label="Switch language"
            >
              <Languages className="w-4 h-4" />
              <span className="hidden sm:inline">{languages.find(l => l.code === locale)?.label || "English"}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {langOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-background shadow-lg py-1 z-50">
                {languages.map(l => (
                  <button key={l.code} onClick={() => { setLocale(l.code as any); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${locale === l.code ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => router.push("/login")} className="px-4 h-9 rounded-md text-sm font-medium hover:bg-muted">Sign in</button>
          <button onClick={() => router.push("/join")} className="px-4 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Get Started</button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const router = useRouter();
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      {/* Subtle background grid + gradient — government-grade, not flashy */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,200,87,0.06),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-20">
        <motion.div
          initial={reduce ? {} : "hidden"} animate="show"
          variants={{ show: { transition: { staggerChildren: 0.12 } } }}
          className="max-w-3xl"
        >
          {/* Eyebrow — institutional positioning, not marketing */}
          <motion.div variants={fadeUp(0)} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-background/60 text-xs text-muted-foreground mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Sovereign-Grade Trade Infrastructure · Cross-Border by Construction
          </motion.div>

          <motion.h1 variants={fadeUp(0.05)} className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
            The governed rails of
            <br />
            <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-700 bg-clip-text text-transparent">international trade.</span>
          </motion.h1>

          <motion.p variants={fadeUp(0.1)} className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">
            SGTX connects the institutions of cross-border trade — traders, logistics,
            shipping lines, laboratories, customs brokers, banks, financiers, and
            government authorities — through one cryptographically-governed protocol.
            Every trade is signed, every step is auditable, every jurisdiction is respected.
          </motion.p>

          {/* Three primary actions — clear hierarchy, no clutter */}
          <motion.div variants={fadeUp(0.15)} className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => router.push("/join")}
              className="inline-flex items-center gap-2 px-6 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
            >
              Begin Onboarding <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push("/login")}
              className="inline-flex items-center gap-2 px-6 h-12 rounded-md border border-border bg-background hover:bg-muted font-medium transition"
            >
              Sign in
            </button>
            <a
              href="#verify"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-md text-muted-foreground hover:text-foreground font-medium transition"
            >
              Verify a Trade <ChevronDown className="w-4 h-4" />
            </a>
          </motion.div>

          {/* Single-row institutional stats — no inflated numbers */}
          <motion.div variants={fadeUp(0.2)} className="mt-12 grid grid-cols-3 gap-4 max-w-xl">
            <div>
              <div className="text-2xl font-semibold">12</div>
              <div className="text-xs text-muted-foreground mt-1">Institution Types</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">396</div>
              <div className="text-xs text-muted-foreground mt-1">Canonical Data Models</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">100%</div>
              <div className="text-xs text-muted-foreground mt-1">Ed25519-Signed Trades</div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function PillarsSection() {
  const reduce = useReducedMotion();
  return (
    <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-semibold text-amber-600 tracking-widest uppercase mb-3">Constitutional Pillars</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Four principles. No exceptions.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg">
          Every transaction on SGTX — from a 50-kilogram sample shipment to a
          multi-vessel charter — is governed by the same four invariants.
        </p>
      </div>
      <motion.div
        initial={reduce ? {} : "hidden"} whileInView="show" viewport={{ once: true, margin: "-100px" }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {PILLARS.map((p) => (
          <motion.div key={p.title} variants={fadeUp()} className="rounded-xl border border-border bg-card/50 p-6">
            <div className="text-2xl mb-4" aria-hidden>{p.emoji}</div>
            <h3 className="text-base font-semibold mb-2">{p.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function InstitutionsSection() {
  const reduce = useReducedMotion();
  // UI-REDESIGN: single clean grid of the 12 institution types.
  // Replaces the previous "Trusted by leading financiers" unverifiable claim.
  const institutions = [
    { label: "Trader · Buyer", icon: ShoppingBag },
    { label: "Trader · Seller", icon: Store },
    { label: "Logistics Provider", icon: Truck },
    { label: "Shipping Line", icon: Ship },
    { label: "Laboratory", icon: FlaskConical },
    { label: "Quality Control", icon: ShieldCheck },
    { label: "Customs Broker", icon: Landmark },
    { label: "Bank · Financier", icon: Banknote },
    { label: "Private Financier", icon: Banknote },
    { label: "Government Authority", icon: Landmark },
    { label: "Platform Admin", icon: Settings },
    { label: "Marketplace Partner", icon: Users },
  ];
  return (
    <section id="institutions" className="max-w-7xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-semibold text-amber-600 tracking-widest uppercase mb-3">The 12 Institutions</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          One protocol. Twelve institutional roles.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg">
          SGTX is not a single-vendor platform. Each institution type operates its
          own governed portal, sees only the data it is authorised to see, and
          signs every action with its own Ed25519 key.
        </p>
      </div>
      <motion.div
        initial={reduce ? {} : "hidden"} whileInView="show" viewport={{ once: true }}
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      >
        {institutions.map((i) => (
          <motion.div key={i.label} variants={fadeUp()}
            className="flex items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3 hover:bg-muted/40 transition">
            <i.icon className="w-4 h-4 text-muted-foreground" aria-hidden />
            <span className="text-sm">{i.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function VerifySection() {
  // UI-REDESIGN: keep the verifiable GTID + USTN lookup — it's the
  // proof point that distinguishes SGTX from marketing-only platforms.
  const [gtidInput, setGtidInput] = useState("SGTX-EG-TRD-002139-7F3A");
  const [ustnInput, setUstnInput] = useState("SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4");

  const gtidQuery = useQuery<GtidPublicProfile>({
    queryKey: ["public-gtid", gtidInput],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/trust-passport/verify?gtid=${encodeURIComponent(gtidInput)}`);
      if (!r.ok) throw new Error("GTID not found");
      return r.json();
    },
    enabled: false,
  });
  const ustnQuery = useQuery<UstnPublicTracking>({
    queryKey: ["public-ustn", ustnInput],
    queryFn: async () => {
      const r = await fetch(`/api/sgtx/ustn/lifecycle?ustn=${encodeURIComponent(ustnInput)}`);
      if (!r.ok) throw new Error("USTN not found");
      return r.json();
    },
    enabled: false,
  });

  return (
    <section id="verify" className="max-w-7xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-semibold text-amber-600 tracking-widest uppercase mb-3">Public Verification</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Verify any tenant. Track any trade.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg">
          Every SGTX identity and every SGTX trade is publicly verifiable.
          No login required. No proprietary API.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* GTID verifier */}
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Hash className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Verify a Tenant by GTID</h3>
          </div>
          <div className="flex gap-2">
            <input
              value={gtidInput}
              onChange={e => setGtidInput(e.target.value)}
              placeholder="SGTX-XX-XXX-######-XXXX"
              className="flex-1 px-3 h-10 rounded-md border border-border bg-background text-sm font-mono"
            />
            <button
              onClick={() => gtidQuery.refetch()}
              disabled={gtidQuery.isFetching}
              className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {gtidQuery.isFetching ? "Verifying…" : "Verify"}
            </button>
          </div>
          {gtidQuery.data && (
            <div className="mt-4 p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1">
              <div><span className="text-muted-foreground">Legal name:</span> <span className="font-medium">{gtidQuery.data.legal_name}</span></div>
              <div><span className="text-muted-foreground">Type:</span> <span className="font-medium">{gtidQuery.data.type}</span></div>
              <div><span className="text-muted-foreground">Jurisdiction:</span> <span className="font-medium">{gtidQuery.data.jurisdiction}</span></div>
              <div><span className="text-muted-foreground">KYB tier:</span> <span className="font-medium">{gtidQuery.data.kyb_tier}</span></div>
              <div><span className="text-muted-foreground">Sanctions:</span> <span className="font-medium">{gtidQuery.data.sanctions_cleared ? "✓ Cleared" : "✗ Hit"}</span></div>
            </div>
          )}
          {gtidQuery.isError && (
            <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300">
              GTID not found or verification failed.
            </div>
          )}
        </div>

        {/* USTN tracker */}
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Track a Shipment by USTN</h3>
          </div>
          <div className="flex gap-2">
            <input
              value={ustnInput}
              onChange={e => setUstnInput(e.target.value)}
              placeholder="SGTX-XXXXXXXX-XXXXXXXX-YYYYMMDDHHMMSS-XXXXXXXX"
              className="flex-1 px-3 h-10 rounded-md border border-border bg-background text-sm font-mono"
            />
            <button
              onClick={() => ustnQuery.refetch()}
              disabled={ustnQuery.isFetching}
              className="px-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {ustnQuery.isFetching ? "Tracking…" : "Track"}
            </button>
          </div>
          {ustnQuery.data && (
            <div className="mt-4 p-3 rounded-md bg-muted/40 border border-border text-xs space-y-1">
              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{ustnQuery.data.status}</span></div>
              <div><span className="text-muted-foreground">Current location:</span> <span className="font-medium">{ustnQuery.data.current_location}</span></div>
              <div><span className="text-muted-foreground">ETA:</span> <span className="font-medium">{ustnQuery.data.eta}</span></div>
              <div><span className="text-muted-foreground">Last updated:</span> <span className="font-medium">{ustnQuery.data.last_updated}</span></div>
            </div>
          )}
          {ustnQuery.isError && (
            <div className="mt-4 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300">
              USTN not found or tracking failed.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProofSection() {
  const reduce = useReducedMotion();
  return (
    <section id="security" className="max-w-7xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="max-w-2xl mb-12">
        <p className="text-xs font-semibold text-amber-600 tracking-widest uppercase mb-3">Why It Holds</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Built for evidence, not promises.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg">
          SGTX is designed for governments, central banks, and the institutions
          that report to them. Every architectural decision serves auditability
          and jurisdictional supremacy.
        </p>
      </div>
      <motion.div
        initial={reduce ? {} : "hidden"} whileInView="show" viewport={{ once: true }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
        className="grid md:grid-cols-3 gap-6"
      >
        {PROOF_POINTS.map(p => (
          <motion.div key={p.title} variants={fadeUp()} className="rounded-xl border border-border bg-card/50 p-6">
            <HexIcon icon={p.icon} />
            <h3 className="text-base font-semibold mt-4 mb-2">{p.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

function CtaSection() {
  const router = useRouter();
  return (
    <section className="max-w-7xl mx-auto px-6 py-20 border-t border-border/40">
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-50/40 to-amber-100/10 dark:from-amber-950/20 dark:to-amber-900/5 p-10 sm:p-14 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl mx-auto">
          Begin a governed trade in minutes.
        </h2>
        <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
          Onboard your institution, complete KYB, and submit your first
          trade request through the 5-step wizard. No lock-in. No funds held.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => router.push("/join")}
            className="inline-flex items-center gap-2 px-6 h-12 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            Begin Onboarding <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 px-6 h-12 rounded-md border border-border bg-background hover:bg-muted font-medium transition"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/40 bg-card/20">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
          {FOOTER_COLUMNS.map(col => (
            <div key={col.title}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map(link => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-8 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SgtxLogo className="w-7 h-7" />
            <span className="text-sm text-muted-foreground">SGTX · Sovereign Governed Trade Execution</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">Non-Custodial</span>
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">AI-Governed</span>
            <span className="px-2 py-1 rounded-full border border-border bg-background/60">Sovereign</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function SgtxLanding() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalHeader />
      <main className="flex-1">
        <Hero />
        <PillarsSection />
        <InstitutionsSection />
        <VerifySection />
        <ProofSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
