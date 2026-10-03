"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// / route — SGTX Sovereign Operating System for Global Trade Execution
// ═════════════════════════════════════════════════════════════════════════════════
//
// Dark cinematic fintech landing page. Matches the uploaded UI design:
//   - Deep space background (#020617) + subtle grid overlay
//   - Fixed top nav with hexagonal SGTX emblem + Request Access CTA
//   - Hero with gradient "Sovereign" text + 4 feature icons + video play
//   - Right sidebar: Global Coverage stats + Live System Status + Constitutional Decisions
//   - 6-column feature card grid (Trade Execution, Compliance, Network, Logistics, Financing, Documents)
//   - Principles banner: Ed25519, OPA+WasmEdge, AI Zero Vendor Lock, Zero-Cost Stack, etc.
//   - Non-custodial panel: "We do not" + "We provide"
//   - Trust footer with certification badges (ISO 27001, GDPR, FATF, Privacy by Design)
//
// The "Enter the Platform" CTA routes to /login (which redirects to /home if the
// visitor is already authenticated).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Lock, Network, Layers, Globe2, Bell, Languages, ChevronDown,
  Play, ArrowRight, ArrowUpRight, MapPin, Activity, Scale, Brain,
  FileCheck, Boxes, Ship, FileText, Wallet, Cpu, Eye, Sparkles,
  CheckCircle2, Building2, Landmark, Truck, FlaskConical, Banknote, Users,
  Fingerprint, ServerCog, ScrollText,
} from "lucide-react";

// ── Top nav links ───────────────────────────────────────────────────────────
const NAV_LINKS: { label: string; href: string }[] = [
  { label: "Home",             href: "#home" },
  { label: "Smart Inbox",      href: "#inbox" },
  { label: "Trade Execution",  href: "#trade" },
  { label: "Network",          href: "#network" },
  { label: "Analytics",        href: "#analytics" },
  { label: "Compliance",       href: "#compliance" },
  { label: "AI Intelligence", href: "#ai" },
  { label: "Resources",        href: "#resources" },
];

// ── Hero feature icons ──────────────────────────────────────────────────────
const HERO_FEATURES = [
  { icon: ShieldCheck, label: "Sovereign Governed", color: "#a78bfa" },
  { icon: Lock,        label: "Non-Custodial",      color: "#60a5fa" },
  { icon: Brain,       label: "AI-Powered",         color: "#34d399" },
  { icon: Boxes,      label: "Zero-Cost Stack",     color: "#fbbf24" },
];

// ── Global Coverage stats ───────────────────────────────────────────────────
const COVERAGE_STATS = [
  { value: "212",     label: "Countries",         icon: Globe2 },
  { value: "185K+",   label: "Entities",          icon: Building2 },
  { value: "98.7%",   label: "Sanctions Clear",    icon: ShieldCheck },
  { value: "24/7",    label: "Governed",          icon: Activity },
];

// ── Live System Status ──────────────────────────────────────────────────────
const LIVE_SYSTEMS = [
  { name: "Trade Execution Engine",     status: "Operational", uptime: "99.98%" },
  { name: "Compliance Gateway",         status: "Operational", uptime: "99.97%" },
  { name: "Constitutional Governor",    status: "Operational", uptime: "100.00%" },
  { name: "Settlement Network",         status: "Operational", uptime: "99.95%" },
  { name: "Loom Audit Ledger",          status: "Operational", uptime: "99.99%" },
];

// ── Constitutional Decisions ─────────────────────────────────────────────────
const DECISIONS = [
  { id: "DEC-4821", title: "Cross-border shipment Egypt → EU",     decision: "ALLOW",       time: "2m ago" },
  { id: "DEC-4820", title: "Dual-use commodity classification",    decision: "CONDITIONAL", time: "8m ago" },
  { id: "DEC-4819", title: "Sanctioned vessel attempt — blocked",  decision: "DENY",        time: "14m ago" },
];

// ── 6-Column Feature Card Grid ──────────────────────────────────────────────
const FEATURE_CARDS = [
  {
    icon: Boxes,
    title: "Trade Execution",
    desc: "End-to-end trade lifecycle — quote, contract, shipment, customs, settlement — governed by one click.",
    accent: "#60a5fa",
  },
  {
    icon: ShieldCheck,
    title: "Compliance Assurance",
    desc: "AI pre-screen against 212 jurisdictions, OFAC/EU/UN sanctions, SPS, TBT, FTA rules — before signature.",
    accent: "#a78bfa",
  },
  {
    icon: Network,
    title: "Network & Intelligence",
    desc: "185K+ sovereign entities. Vessel tracking, container telemetry, lane analytics, competitor benchmarks.",
    accent: "#34d399",
  },
  {
    icon: Ship,
    title: "Logistics & Tracking",
    desc: "DCSA-compliant Bill of Lading, reefer telemetry, RoRo dispatch, multimodal corridor planning.",
    accent: "#fbbf24",
  },
  {
    icon: Wallet,
    title: "Financing Hub",
    desc: "Non-custodial FeeLock, milestone escrow, deferred payment orchestration, PSP routing, bank reconciliation.",
    accent: "#fb7185",
  },
  {
    icon: FileText,
    title: "Documents & Contracts",
    desc: "QES digital signatures (Ed25519), PDF/A-3 evidence packages, AI clause forge, immutable Loom audit trail.",
    accent: "#22d3ee",
  },
];

// ── Principles banner ────────────────────────────────────────────────────────
const PRINCIPLES = [
  { icon: Lock,       label: "Ed25519 Signatures",     sub: "Cryptographic certainty" },
  { icon: ServerCog,  label: "OPA + WasmEdge",          sub: "Policy-as-code" },
  { icon: Brain,      label: "AI · Zero Vendor Lock",   sub: "Multi-provider LLM" },
  { icon: Boxes,     label: "Zero-Cost Stack",         sub: "Open standards only" },
  { icon: Scale,     label: "Jurisdiction Supremacy", sub: "Local law prevails" },
  { icon: ScrollText,label: "Immutable Audit Loom",    sub: "Tamper-evident chain" },
];

// ── Trust footer logos ───────────────────────────────────────────────────────
const TRUST_AUDIENCES = [
  { icon: Landmark,  label: "Customs Authorities" },
  { icon: Building2, label: "Global Traders" },
  { icon: Banknote,  label: "Financial Institutions" },
  { icon: Truck,     label: "Logistics Providers" },
  { icon: FlaskConical, label: "Inspection Agencies" },
  { icon: Users,     label: "Marketplace Partners" },
];

const TRUST_CERTS = ["ISO 27001", "GDPR Ready", "FATF Aligned", "Privacy by Design"];

// ═══════════════════════════════════════════════════════════════════════════════
// Landing Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function LandingPage() {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const enter = () => router.push("/login?next=/home");

  return (
    <div dir="ltr" className="relative min-h-screen bg-space text-slate-100 overflow-x-hidden">
      {/* Decorative grid overlay */}
      <div className="fixed inset-0 grid-overlay grid-overlay-fade pointer-events-none" aria-hidden />
      <div className="fixed inset-0 cinematic-ship-silhouette" aria-hidden />

      {/* ═══ Top Navigation ═══ */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-[#020617]/85 backdrop-blur-xl border-b border-slate-800/60" : "bg-transparent"
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="sovereign-emblem" aria-hidden />
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-white">SGTX</span>
              <span className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">SOVEREIGN GOVERNED TRADING EXECUTION</span>
            </div>
          </Link>

          {/* Nav links */}
          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-3 py-2 text-[13px] text-slate-300 hover:text-white transition rounded-md hover:bg-slate-800/40"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800/40 transition text-[12px]"
              aria-label="Language selector"
            >
              <Languages className="w-4 h-4" aria-hidden />
              <span>EN</span>
              <ChevronDown className="w-3 h-3" aria-hidden />
            </button>
            <button
              className="relative p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-800/40 transition"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" aria-hidden />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            </button>
            <Link
              href="/login?next=/home"
              className="btn-gradient inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium"
            >
              Request Access <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </nav>
      </header>

      {/* ═══ Hero ═══ */}
      <section className="relative pt-28 pb-20 sm:pt-32 sm:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[1.6fr_1fr] gap-8">
          {/* Left — hero copy */}
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <div className="pill-dark animate-fade-in mb-6">
              <span className="status-dot" aria-hidden />
              <span>Sovereign-Grade Trade Infrastructure · Live across 212 jurisdictions</span>
            </div>

            <h1 className="animate-fade-up text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] text-white">
              The{" "}
              <span className="text-gradient-blue">Sovereign</span>{" "}
              Operating System for Global Trade Execution
            </h1>

            <p className="animate-fade-up animate-delay-100 mt-6 text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-2xl">
              One cryptographically-governed protocol connecting traders, logistics, shipping,
              laboratories, customs brokers, banks, financiers and government authorities.
              Every trade is signed. Every step is auditable. Every jurisdiction is respected.
            </p>

            {/* Hero features */}
            <div className="animate-fade-up animate-delay-200 mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl">
              {HERO_FEATURES.map((f) => (
                <div
                  key={f.label}
                  className="glass-card glass-card-hover px-3 py-3 flex flex-col items-start gap-2"
                >
                  <f.icon className="w-5 h-5" style={{ color: f.color }} aria-hidden />
                  <span className="text-[11px] text-slate-300 font-medium leading-tight">{f.label}</span>
                </div>
              ))}
            </div>

            {/* CTAs */}
            <div className="animate-fade-up animate-delay-300 mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={enter}
                className="btn-gradient inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold"
              >
                Enter the Platform
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/15">
                  <ArrowRight className="w-3 h-3" aria-hidden />
                </span>
              </button>
              <Link
                href="/join"
                className="btn-secondary-dark inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium"
              >
                Begin Onboarding
                <ArrowUpRight className="w-4 h-4" aria-hidden />
              </Link>

              {/* Video play */}
              <button
                className="inline-flex items-center gap-2 px-4 py-3 text-slate-300 hover:text-white transition text-sm"
                aria-label="Watch 2-minute product tour"
              >
                <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-600 group">
                  <Play className="w-3.5 h-3.5 fill-current" aria-hidden />
                  <span className="absolute inset-0 rounded-full border border-blue-400/40 animate-ping" aria-hidden />
                </span>
                Watch 2-min demo
              </button>
            </div>
          </div>

          {/* Right — sidebar panel */}
          <aside className="animate-slide-right lg:animate-delay-200">
            <div className="glass-panel rounded-2xl p-5">
              {/* Global Coverage */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Globe2 className="w-4 h-4 text-blue-400" aria-hidden />
                  <h2 className="text-sm font-semibold text-white">Global Coverage</h2>
                </div>
                <span className="pill-dark">
                  <MapPin className="w-3 h-3 text-emerald-400" aria-hidden />
                  Live
                </span>
              </div>

              {/* World map placeholder */}
              <div className="relative h-32 rounded-lg bg-gradient-to-br from-slate-900/80 to-slate-950/80 border border-slate-800/60 mb-4 overflow-hidden">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 30%, rgba(59,130,246,0.4) 0%, transparent 18%), radial-gradient(circle at 70% 35%, rgba(168,85,247,0.4) 0%, transparent 16%), radial-gradient(circle at 50% 60%, rgba(34,197,94,0.3) 0%, transparent 14%), radial-gradient(circle at 80% 70%, rgba(251,191,36,0.3) 0%, transparent 12%)",
                  }}
                  aria-hidden
                />
                <div className="absolute inset-0 grid-overlay opacity-50" aria-hidden />
                {/* Dots overlay */}
                {[
                  [18, 35], [35, 28], [48, 32], [62, 30], [75, 35],
                  [22, 55], [40, 52], [55, 50], [70, 55], [85, 60],
                  [30, 70], [50, 75], [65, 72], [78, 78],
                ].map(([x, y], i) => (
                  <span
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-blue-400 animate-pulse"
                    style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 150}ms` }}
                    aria-hidden
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 mb-5">
                {COVERAGE_STATS.map((s) => (
                  <div key={s.label} className="rounded-md bg-slate-900/40 border border-slate-800/50 px-3 py-2.5">
                    <s.icon className="w-3.5 h-3.5 text-blue-400 mb-1.5" aria-hidden />
                    <div className="text-base font-bold text-white">{s.value}</div>
                    <div className="text-[10px] text-slate-400">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Live System Status */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-300">Live System Status</h3>
                <span className="text-[10px] text-emerald-400">All Systems Operational</span>
              </div>
              <div className="space-y-1.5 mb-5 max-h-44 overflow-y-auto cinematic-scroll pr-1">
                {LIVE_SYSTEMS.map((sys) => (
                  <div
                    key={sys.name}
                    className="flex items-center justify-between text-[11px] py-1.5 px-2 rounded-md bg-slate-900/40 border border-slate-800/40"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden />
                      <span className="text-slate-300">{sys.name}</span>
                    </div>
                    <span className="text-slate-500 tabular-nums">{sys.uptime}</span>
                  </div>
                ))}
              </div>

              {/* Constitutional Decisions */}
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-300">Latest Constitutional Decisions</h3>
                <Link href="#" className="text-[10px] text-blue-400 hover:text-blue-300">View all</Link>
              </div>
              <div className="space-y-1.5">
                {DECISIONS.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-2 text-[11px] py-1.5 px-2 rounded-md bg-slate-900/40 border border-slate-800/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 tabular-nums">{d.id}</span>
                        <span className="text-slate-300 truncate">{d.title}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{d.time}</div>
                    </div>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                        d.decision === "ALLOW"
                          ? "badge-allow"
                          : d.decision === "CONDITIONAL"
                          ? "badge-conditional"
                          : "badge-deny"
                      }`}
                    >
                      {d.decision}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <div className="hairline-gradient max-w-7xl mx-auto" />

      {/* ═══ Feature Card Grid (6 columns) ═══ */}
      <section className="relative py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <span className="pill-dark mb-4 inline-flex">
              <Sparkles className="w-3 h-3 text-blue-400" aria-hidden />
              Six Pillars · One Protocol
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Everything cross-border trade needs.
              <br />
              <span className="text-gradient-blue-cyan">Nothing it doesn&apos;t.</span>
            </h2>
            <p className="mt-4 text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
              Six integrated pillars, each governed by the same Ed25519 signatures, OPA policies, and immutable Loom audit trail.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURE_CARDS.map((c, i) => (
              <article
                key={c.title}
                className={`glass-card glass-card-hover animate-fade-up p-6 group`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* 3D illustration placeholder */}
                <div
                  className="relative h-32 rounded-lg mb-4 overflow-hidden border border-slate-800/60"
                  style={{
                    background: `radial-gradient(ellipse 70% 50% at 50% 50%, ${c.accent}33 0%, transparent 70%), linear-gradient(180deg, rgba(15,23,42,0.6), rgba(2,6,23,0.85))`,
                  }}
                >
                  <div className="absolute inset-0 grid-overlay opacity-40" aria-hidden />
                  <c.icon
                    className="absolute inset-0 m-auto w-12 h-12"
                    style={{ color: c.accent, filter: `drop-shadow(0 0 12px ${c.accent}66)` }}
                    aria-hidden
                  />
                  {/* Animated dot pattern */}
                  <span
                    className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full animate-pulse"
                    style={{ background: c.accent }}
                    aria-hidden
                  />
                </div>

                <h3 className="text-base font-semibold text-white mb-1.5">{c.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">{c.desc}</p>

                <button
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition group-hover:gap-2.5"
                  style={{ transition: "gap 200ms ease, color 200ms ease" }}
                >
                  Explore module
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-blue-400/40">
                    <ArrowUpRight className="w-3 h-3" aria-hidden />
                  </span>
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="hairline-gradient max-w-7xl mx-auto" />

      {/* ═══ Principles Banner ═══ */}
      <section className="relative py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-6">
              <Scale className="w-5 h-5 text-blue-400" aria-hidden />
              <h2 className="text-base font-semibold text-white">Constitutional Principles</h2>
              <span className="ml-auto text-[11px] text-slate-500">Inherited by every transaction</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {PRINCIPLES.map((p) => (
                <div key={p.label} className="flex flex-col items-start gap-2 group">
                  <div className="w-10 h-10 rounded-lg bg-slate-900/60 border border-slate-800/60 flex items-center justify-center group-hover:border-blue-400/40 transition">
                    <p.icon className="w-5 h-5 text-blue-400" aria-hidden />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-white">{p.label}</div>
                    <div className="text-[10px] text-slate-500">{p.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Non-Custodial Panel ═══ */}
      <section className="relative py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="glass-panel rounded-2xl p-6 sm:p-10 grid lg:grid-cols-[1fr_1fr] gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-emerald-400" aria-hidden />
                <span className="pill-dark">
                  <Fingerprint className="w-3 h-3 text-emerald-400" aria-hidden />
                  Non-Custodial by Design
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                We never touch your money, your documents, or your data.
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                SGTX is the operating system, not the custodian. Funds flow directly
                between your bank and your counterparty&apos;s bank via regulated PSPs.
                Documents live in your jurisdiction of record. The platform only
                orchestrates, signs, and audits — it never holds.
              </p>
            </div>

            <div className="grid gap-3">
              {[
                { label: "We do not", text: "hold, custody or move funds on your behalf.", deny: true },
                { label: "We do not", text: "store trade documents outside your jurisdiction.", deny: true },
                { label: "We do not", text: "lock you into proprietary AI or data formats.", deny: true },
                { label: "We provide", text: "the sovereign protocol that orchestrates every counterparty.", deny: false },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-xl border ${
                    item.deny
                      ? "bg-red-950/15 border-red-500/20"
                      : "bg-emerald-950/15 border-emerald-500/25"
                  }`}
                >
                  <span
                    className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full ${
                      item.deny ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                    }`}
                    aria-hidden
                  >
                    {item.deny ? "×" : <CheckCircle2 className="w-3.5 h-3.5" />}
                  </span>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    <span className="font-semibold text-white">{item.label} </span>
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="hairline-gradient max-w-7xl mx-auto" />

      {/* ═══ Trust Footer ═══ */}
      <footer className="relative pt-16 pb-8 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Audience icons */}
          <div className="text-center mb-8">
            <p className="text-[11px] tracking-[0.2em] uppercase text-slate-500 mb-5">Trusted across the trade stack</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
              {TRUST_AUDIENCES.map((a) => (
                <div
                  key={a.label}
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-slate-900/40 transition group"
                >
                  <a.icon className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition" aria-hidden />
                  <span className="text-[10px] text-slate-400 text-center leading-tight">{a.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Certifications */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            {TRUST_CERTS.map((cert) => (
              <span
                key={cert}
                className="pill-dark text-[10px] py-1.5 px-3"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden />
                {cert}
              </span>
            ))}
          </div>

          <div className="hairline-gradient mb-6" />

          {/* Bottom bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <div className="flex items-center gap-2.5">
              <span className="sovereign-emblem" style={{ width: 22, height: 22 }} aria-hidden />
              <span>SGTX · Sovereign Governed Trade Execution</span>
            </div>
            <div className="flex items-center gap-4">
              <span>Non-Custodial</span>
              <span className="text-slate-700">·</span>
              <span>AI-Governed</span>
              <span className="text-slate-700">·</span>
              <span>Sovereign</span>
              <span className="text-slate-700">·</span>
              <span className="text-slate-400">v2026.1</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
