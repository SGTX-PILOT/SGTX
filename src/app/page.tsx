"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Sovereign Governed Trade Execution — CINEMATIC 2.5D LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
//
// HYBRID ARCHITECTURE:
//   Rule 1 (Performance Isolation): All text, buttons, nav = HTML/DOM (NOT in WebGL)
//   Rule 2 (2.5D Illusion): Layered parallax background with fixed z-indexes
//   Rule 3 (Localized Shader): R3F WebGL canvas ONLY for bottom reflection pool
//
// v18 FULL SPEC COVERAGE — Sections composed from §2 through §24:
//   §2  Foundation (Pillars, Capabilities, Execution Components, Sequence)
//   §3  Constitution (Governor Principles, 38 Points, AI Ladder, Enforcement Stack)
//   §4  Identity (GTID, KYB Tiers)
//   §5  USTN (Canonical Namespace, Statuses, Closure Conditions)
//   §6  Buyer Workflow (13 sections)
//   §8  Seller Workflow (8 steps)
//   §15 Governor Gate Matrix (42 gates across 7 groups)
//   §16 Portals (12 portals, Mobile Apps, Unified Nav)
//   §19 Transaction State (8 clocks)
//   §20 Jurisdiction Fabric (8 dimensions)
//   §21 Security (Attack Surfaces, Toolchain)
//   §22 Add-Ons (28 modules)
//   §23 Network Effects (Trust Flywheel, Moat, Corridors, Threat Matrix)
//   §24 Roadmap (6 phases)
//
// TECH: Next.js 16 + TypeScript + Tailwind v4 + GSAP ScrollTrigger +
//       Framer Motion + Three.js via React Three Fiber + Drei

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Shield, ArrowRight, Users, BarChart3, Scale,
  Brain, BookOpen, Globe2, Bell, Palette, Languages,
  Play, CheckCircle2, Activity, Cpu, Lock,
  Package, DollarSign, FileText, Zap,
} from "lucide-react";
import { LANDING_NAV } from "@/lib/sgtx/canonical-navigation-registry";
import {
  PILLARS, EXECUTION_SEQUENCE, SYSTEM_COMPONENTS, LIVE_DECISIONS,
  GLOBAL_COVERAGE,
} from "@/lib/sgtx/landing/landing-catalog";

// Phase section components
import {
  PillarsSection, CapabilitiesSection, ExecutionComponentsSection,
  ExecutionSequenceSection,
} from "./_components/landing/sections-foundation";
import {
  GovernorPrinciplesSection, ConstitutionSection, AILadderSection,
  EnforcementStackSection,
} from "./_components/landing/sections-constitution";
import {
  PortalsSection, MobileAppsSection, PortalNavigationSection,
} from "./_components/landing/sections-portals";
import { BuyerPortalDashboard } from "./_components/landing/portal-dashboard-buyer";
import { BuyerPortalWorkflow } from "./_components/landing/portal-workflow-buyer";
import { SellerPortalDashboard } from "./_components/landing/portal-dashboard-seller";
import { SellerPortalWorkflow } from "./_components/landing/portal-workflow-seller";
import { LspPortalDashboard } from "./_components/landing/portal-dashboard-lsp";
import { LspPortalWorkflow } from "./_components/landing/portal-workflow-lsp";
import { ShipPortalDashboard } from "./_components/landing/portal-dashboard-ship";
import { ShipPortalWorkflow } from "./_components/landing/portal-workflow-ship";
import { LabPortalDashboard } from "./_components/landing/portal-dashboard-lab";
import { LabPortalWorkflow } from "./_components/landing/portal-workflow-lab";
import { QcPortalDashboard } from "./_components/landing/portal-dashboard-qc";
import { AddOnsSection } from "./_components/landing/sections-addons";
import {
  TrustFlywheelSection, MoatLayersSection, EconomicMoatSection,
  ThreatMatrixSection, CorridorsSection,
} from "./_components/landing/sections-network";
import {
  SecurityArchitectureSection, SecurityToolchainSection,
} from "./_components/landing/sections-security";
import {
  BuyerWorkflowSection, SellerWorkflowSection, GovernorGatesSection,
  TransactionClocksSection, ShipmentsVaultSection,
} from "./_components/landing/sections-workflow";
import {
  GTIDSection, KYBTiersSection, USTNSection, JurisdictionFabricSection,
} from "./_components/landing/sections-identity";
import { RoadmapSection, PlatformStatsSection } from "./_components/landing/sections-roadmap";

// ── Dynamic import R3F pool with ssr: false (browser-only) ──────────────
const ReflectionPool = dynamic(() => import("./_components/reflection-pool"), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-gradient-to-b from-[rgba(15,23,42,0.4)] to-[rgba(2,6,23,0.6)] flex items-center justify-center">
      <div className="text-xs text-slate-600 animate-pulse">Loading reflection pool…</div>
    </div>
  ),
});

// ── Navigation items from centralized registry ──────────────────────────
const NAV_ITEMS = LANDING_NAV.map(item => ({
  label: item.label,
  route: item.route,
  icon: item.icon,
}));

const FEATURE_CARDS = [
  { title: "Trade Execution", desc: "Governor-governed workflows from intent to closure.", icon: ArrowRight, route: "/login?next=/trades" },
  { title: "Compliance Assurance", desc: "AI-powered sanctions, jurisdiction & regulatory intelligence.", icon: Shield, route: "/login?next=/trust" },
  { title: "Network & Intelligence", desc: "Your relationships. Your data. Sovereign control.", icon: Users, route: "/login?next=/network" },
  { title: "Logistics & Tracking", desc: "Multi-modal visibility with milestone-gated payments.", icon: Package, route: "/login?next=/operations" },
  { title: "Financing Hub", desc: "Non-custodial CFR connecting banks and capital providers.", icon: DollarSign, route: "/login?next=/money" },
  { title: "Documents & Contracts", desc: "QES-signed contracts on the immutable Loom hash chain.", icon: FileText, route: "/login?next=/trades" },
];

// ── Framer Motion variants ─────────────────────────────────────────────────
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage() {
  const router = useRouter();
  const navigate = useCallback((route: string) => router.push(route), [router]);
  const [showDemo, setShowDemo] = useState(false);
  const parallaxRef = useRef<HTMLDivElement>(null);

  // ── GSAP ScrollTrigger for parallax (client-side only) ───────────────────
  useEffect(() => {
    let ctx: any;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        // Parallax: background layers move at different speeds
        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const speed = parseFloat(el.dataset.parallax || "0.3");
          gsap.to(el, {
            yPercent: -speed * 100,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          });
        });

        // Fade in sections on scroll
        gsap.utils.toArray<HTMLElement>("[data-fade-section]").forEach((el) => {
          gsap.from(el, {
            opacity: 0,
            y: 40,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: {
              trigger: el,
              start: "top 85%",
              toggleActions: "play none none reverse",
            },
          });
        });
      }, parallaxRef);
    })();
    return () => { if (ctx) ctx.revert(); };
  }, []);

  return (
    <div ref={parallaxRef} className="min-h-screen bg-[#020617] text-white overflow-x-hidden flex flex-col"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>

      {/* ════ LAYER 0: Fixed background gradient ════ */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background: `
          radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.10) 0%, transparent 45%),
          radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.07) 0%, transparent 45%),
          #020617
        `,
      }} aria-hidden="true" />

      {/* ════ LAYER 1: Parallax grid (2.5D depth) ════ */}
      <div data-parallax="0.15" className="fixed inset-0 z-[1] opacity-[0.035] pointer-events-none" style={{
        backgroundImage: `linear-gradient(rgba(56, 189, 248, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.4) 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
      }} aria-hidden="true" />

      {/* ════ LAYER 1b: Parallax glow orbs (2.5D depth) ════ */}
      <div data-parallax="0.08" className="fixed top-[10%] left-[5%] w-[400px] h-[400px] z-[1] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)' }} aria-hidden="true" />
      <div data-parallax="0.12" className="fixed bottom-[20%] right-[10%] w-[300px] h-[300px] z-[1] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)' }} aria-hidden="true" />

      {/* ════ LAYER 2: Navigation Header ════ */}
      <header className="relative z-30 flex items-center justify-between px-4 lg:px-6 h-16 border-b border-[rgba(56,189,248,0.12)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl sticky top-0">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5 group" aria-label="SGTX Home">
          <div className="w-9 h-9 flex items-center justify-center font-bold text-white text-sm rounded-lg transition-transform group-hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)', clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)', boxShadow: '0 0 18px -2px rgba(59, 130, 246, 0.5)' }}>
            S
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-white">SGTX</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Sovereign Trade</span>
          </div>
        </button>

        {/* Nav */}
        <nav className="hidden lg:flex items-center gap-0.5" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} onClick={() => navigate(item.route)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[rgba(59,130,246,0.08)] rounded-lg transition-all"
                aria-label={item.label}>
                <Icon className="w-3.5 h-3.5" /> {item.label}
              </button>
            );
          })}
        </nav>

        {/* Controls */}
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => navigate("/login")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.08)] transition-colors" aria-label="Language">
            <Languages className="w-3.5 h-3.5" /> EN
          </button>
          <button onClick={() => navigate("/login")} className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.08)] transition-colors" aria-label="Notifications">
            <Bell className="w-4 h-4" /><span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <button onClick={() => navigate("/login")} className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.08)] transition-colors" aria-label="Theme">
            <Palette className="w-4 h-4" />
          </button>
          <button onClick={() => navigate("/join")}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/20"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
            aria-label="Request access">
            <Zap className="w-3.5 h-3.5" /> Request Access
          </button>
        </div>

        {/* Mobile menu */}
        <button onClick={() => navigate("/login")} className="lg:hidden p-2 text-slate-300 hover:text-white" aria-label="Menu">
          <BarChart3 className="w-5 h-5" />
        </button>
      </header>

      {/* ════ LAYER 3: Hero (HTML/DOM with Framer Motion) ════ */}
      <main className="relative z-10 flex-1 flex flex-col">
        <section className="px-4 lg:px-6 pt-8 lg:pt-12 pb-8">
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">

            {/* Left: Hero */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="flex flex-col justify-center gap-5">

              {/* Badge */}
              <motion.div variants={fadeInUp} custom={0}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(56,189,248,0.2)] bg-[rgba(59,130,246,0.06)] text-xs text-blue-300 w-fit">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                v18.0 Production Edition · Direct Bank Settlement (ISO 20022 Native)
              </motion.div>

              {/* Headline */}
              <motion.h1 variants={fadeInUp} custom={1}
                className="text-3xl lg:text-5xl font-bold leading-tight tracking-tight">
                The <span style={{ background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sovereign</span> Operating System for Global Trade Execution
              </motion.h1>

              {/* Subheadline */}
              <motion.p variants={fadeInUp} custom={2}
                className="text-xs lg:text-sm font-semibold text-slate-400 uppercase tracking-wide leading-relaxed">
                Not a marketplace. We do not hold funds. We do not take title to goods.<br />
                We do not broker introductions. We provide the infrastructure for your trades.
              </motion.p>

              {/* CTAs */}
              <motion.div variants={fadeInUp} custom={3} className="flex flex-wrap items-center gap-3 mt-2">
                <button onClick={() => setShowDemo(true)}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                  <Play className="w-4 h-4" /> See How SGTX Works
                </button>
                <button onClick={() => navigate("/join")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 rounded-full border border-[rgba(155,190,255,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>

              {/* Pillars (compact, in-hero) */}
              <motion.div variants={staggerContainer} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {PILLARS.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <motion.div key={p.roman} variants={fadeInUp} custom={i + 4}
                      className="p-3 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-300 uppercase">Pillar {p.roman}</span>
                      </div>
                      <h3 className="text-xs font-semibold text-white mb-1">{p.title}</h3>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{p.principle}</p>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>

            {/* Right: Sidebar */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="flex flex-col gap-4">

              {/* Global Coverage */}
              <motion.div variants={fadeInUp} custom={5}
                className="p-4 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-blue-400" /> Global Coverage
                  </h3>
                  <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-medium">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {GLOBAL_COVERAGE.map(m => (
                    <div key={m.l} className="text-center p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
                      <div className="text-lg font-bold text-white">{m.v}</div>
                      <div className="text-[9px] text-slate-400">{m.l}</div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* System Status */}
              <motion.div variants={fadeInUp} custom={6}
                className="p-4 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" /> System Status
                  </h3>
                  <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Operational
                  </span>
                </div>
                <div className="space-y-1.5">
                  {SYSTEM_COMPONENTS.map(c => (
                    <div key={c} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">{c}</span>
                      <span className="text-green-400 font-medium">✓</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Constitutional Decisions */}
              <motion.div variants={fadeInUp} custom={7}
                className="p-4 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-purple-400" /> Decisions
                  </h3>
                  <button onClick={() => navigate("/login?next=/admin")} className="text-[10px] text-blue-400 hover:text-blue-300">View All →</button>
                </div>
                <div className="space-y-2">
                  {LIVE_DECISIONS.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(119,160,235,0.06)]">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${d.dot}`} />
                        <span className="text-slate-300 font-medium">{d.type}</span>
                      </div>
                      <span className={`font-bold ${d.color}`}>{d.verdict}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ════ Feature Cards ════ */}
        <section data-fade-section className="px-4 lg:px-6 py-6">
          <div className="max-w-[1400px] mx-auto">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Platform Capabilities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {FEATURE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button key={card.title} onClick={() => navigate(card.route)}
                    className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm text-left hover:border-[rgba(56,189,248,0.25)] hover:bg-[rgba(30,41,59,0.6)] transition-all hover:-translate-y-0.5 group">
                    <Icon className="w-5 h-5 text-blue-400 mb-2 group-hover:text-blue-300 transition-colors" />
                    <h3 className="text-xs font-semibold text-white mb-1">{card.title}</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{card.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ════ "How It Works" Section ════ */}
        <section data-fade-section className="px-4 lg:px-6 py-8">
          <div className="max-w-[1400px] mx-auto">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" /> How SGTX Works
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Buyer creates */}
              <div className="p-5 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300">1</div>
                  <h3 className="text-sm font-semibold text-white">Buyer Creates Request</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">Buyer submits a structured trade request with 13 sections — seller, incoterm, transport, commodity, lab tests, QC, documents, criticality. Governor pre-screens (G1U1-G1U8).</p>
                <button onClick={() => navigate("/login?next=/trades/new")} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  Start a trade <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {/* Step 2: Seller quotes */}
              <div className="p-5 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-300">2</div>
                  <h3 className="text-sm font-semibold text-white">Seller Quotes & Locks</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">Seller locks EXW price, designs packing plan, gets logistics quotes (3 modes), generates contract via Clause Forge, and both parties sign with QES.</p>
                <button onClick={() => navigate("/login?next=/trades")} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  View trades <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {/* Step 3: Execute & settle */}
              <div className="p-5 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-300">3</div>
                  <h3 className="text-sm font-semibold text-white">Execute & Settle</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">USTN generated at lock. Milestone-triggered payments flow through ISO 20022 bank settlement. Reconciliation engine auto-reconciles at ≥95% confidence. Closure is earned.</p>
                <button onClick={() => navigate("/login?next=/money")} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  View money <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            v18 FULL SPEC COVERAGE — All 24 sections
            ═══════════════════════════════════════════════════════════════════════ */}

        {/* Phase A — Foundation & Identity (§2) */}
        <ExecutionSequenceSection />
        <CapabilitiesSection />
        <ExecutionComponentsSection />
        <PillarsSection />

        {/* Phase B — Constitutional Foundation (§3) */}
        <GovernorPrinciplesSection />
        <ConstitutionSection />
        <AILadderSection />
        <EnforcementStackSection />

        {/* Phase G — Phase Workflow Detail (§6-15, §19) */}
        <BuyerWorkflowSection />
        <SellerWorkflowSection />
        <GovernorGatesSection />
        <TransactionClocksSection />
        <ShipmentsVaultSection />

        {/* Phase H — Identity, Tenancy & USTN (§4-5, §20) */}
        <GTIDSection />
        <KYBTiersSection />
        <USTNSection />
        <JurisdictionFabricSection />

        {/* Phase C — Portal Architecture (§16) */}
        <PortalsSection />
        <MobileAppsSection />
        <PortalNavigationSection />

        {/* ════ Portal #1 — Trader Portal (Buyer Mode) Dashboard ════ */}
        <BuyerPortalDashboard />

        {/* ════ Portal #1 — Trader Portal (Buyer Mode) Workflow ════ */}
        <BuyerPortalWorkflow />

        {/* ════ Portal #2 — Trader Portal (Seller Mode) Dashboard ════ */}
        <SellerPortalDashboard />

        {/* ════ Portal #2 — Trader Portal (Seller Mode) Workflow ════ */}
        <SellerPortalWorkflow />

        {/* ════ Portal #3 — LSP (Logistics Service Provider) Dashboard ════ */}
        <LspPortalDashboard />

        {/* ════ Portal #3 — LSP (Logistics Service Provider) Workflow ════ */}
        <LspPortalWorkflow />

        {/* ════ Portal #4 — SHIP (Shipping Line) Dashboard ════ */}
        <ShipPortalDashboard />

        {/* ════ Portal #4 — SHIP (Shipping Line) Workflow ════ */}
        <ShipPortalWorkflow />

        {/* ════ Portal #5 — LAB (Laboratory) Dashboard ════ */}
        <LabPortalDashboard />

        {/* ════ Portal #5 — LAB (Laboratory) Workflow ════ */}
        <LabPortalWorkflow />

        {/* ════ Portal #6 — QC (Quality Control Inspection) Dashboard ════ */}
        <QcPortalDashboard />

        {/* Phase F — Security & Guarantees (§21) */}
        <SecurityArchitectureSection />
        <SecurityToolchainSection />

        {/* Phase D — Platform Add-Ons (§22) */}
        <AddOnsSection />

        {/* Phase E — Network Effects & Moat (§23) */}
        <TrustFlywheelSection />
        <MoatLayersSection />
        <EconomicMoatSection />
        <ThreatMatrixSection />
        <CorridorsSection />

        {/* Phase 24 — Roadmap & Platform Scale */}
        <PlatformStatsSection />
        <RoadmapSection />

        {/* ════ LAYER 5: Reflection Pool (R3F WebGL, BOUNDED) ════ */}
        <section data-fade-section className="relative h-[200px] lg:h-[280px] mt-4" aria-label="Reflection pool">
          <ReflectionPool />
          {/* Text overlay on pool */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Governor-Governed · Constitutionally Enforced · Loom-Audited</p>
              <p className="text-[9px] text-slate-600 mt-1">Every irreversible action passes through the Governor (G1-G7)</p>
            </div>
          </div>
        </section>

        {/* ════ Final CTA ════ */}
        <section data-fade-section className="px-4 lg:px-6 py-10">
          <div className="max-w-[1400px] mx-auto">
            <div className="p-6 lg:p-8 rounded-2xl border border-[rgba(56,189,248,0.2)] bg-gradient-to-br from-blue-950/40 to-purple-950/30 backdrop-blur-md text-center">
              <h2 className="text-lg lg:text-2xl font-bold text-white mb-2">Ready to execute governed trades?</h2>
              <p className="text-[11px] text-slate-400 mb-4 max-w-xl mx-auto">
                The platform is non-custodial, non-marketplace, and constitutionally bound. All relationships originate from explicit invitations between known parties.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button onClick={() => navigate("/join")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                  <Zap className="w-4 h-4" /> Request Access
                </button>
                <button onClick={() => navigate("/login")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 rounded-full border border-[rgba(155,190,255,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
                  Sign In <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ════ Footer (sticky to bottom via mt-auto) ════ */}
        <footer className="mt-auto px-4 lg:px-6 py-4 border-t border-[rgba(56,189,248,0.08)] bg-[rgba(2,6,23,0.85)]">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="font-semibold text-slate-400">SGTX</span>
              · Sovereign Governed Trade Execution Infrastructure · v18.0
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <button onClick={() => navigate("/login")} className="hover:text-slate-300 transition-colors">Sign In</button>
              <button onClick={() => navigate("/join")} className="hover:text-slate-300 transition-colors">Register</button>
              <button onClick={() => navigate("/login?next=/admin")} className="hover:text-slate-300 transition-colors">Admin</button>
            </div>
          </div>
        </footer>
      </main>

      {/* ════ LAYER 6: Modal ════ */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md" onClick={() => setShowDemo(false)}>
          <div className="max-w-xl p-6 rounded-2xl border border-[rgba(77,141,255,0.4)] bg-gradient-to-b from-[rgba(9,22,48,0.98)] to-[rgba(3,12,27,0.98)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-400" /> How SGTX Works
            </h2>
            <p className="text-sm text-slate-300 mb-4">
              SGTX transforms commercial intent into a structured, machine-readable, regulation-aware execution graph. Every trade moves through the canonical 12-phase sequence with Governor-governed transitions.
            </p>
            <button onClick={() => { setShowDemo(false); navigate("/login"); }}
              className="px-4 py-2 text-sm font-semibold text-white rounded-full"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
              Explore the Platform <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
