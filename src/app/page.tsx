"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// / route — SGTX Sovereign Global Trade Exchange — REAL HTML/CSS UI
// ═══════════════════════════════════════════════════════════════════════════════
//
// COMPLETE UI RESTORATION — replaces the image-map approach with a real
// layered HTML/CSS interface that looks like an enterprise trade-execution
// platform, not "a page with a large picture."
//
// LAYER SYSTEM:
//   LAYER 1: Background (subtle gradient + atmospheric image, NOT dominant)
//   LAYER 2: Readability overlay (dark gradient for text contrast)
//   LAYER 3: Navigation header (SGTX logo + nav links + controls)
//   LAYER 4: Content panels (hero, metrics, status, feature cards)
//   LAYER 5: Interactive states (modals, toasts)
//
// The background image is a SUPPORTING element. If removed, the interface
// still looks complete, premium, and unmistakably like SGTX.

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Inbox, TrendingUp, Users, BarChart3, Scale,
  Brain, BookOpen, Globe2, Bell, Palette, Languages,
  Play, ArrowRight, CheckCircle2, Activity, Cpu,
  Building2, Package, DollarSign, FileText, Zap, Lock,
} from "lucide-react";

// ── Navigation items — wired to REAL routes ──────────────────────────────
const NAV_ITEMS = [
  { label: "Home", route: "/login?next=/home", icon: TrendingUp },
  { label: "Smart Inbox", route: "/login?next=/home", icon: Inbox },
  { label: "Trade Execution", route: "/login?next=/trades", icon: ArrowRight },
  { label: "Network", route: "/login?next=/network", icon: Users },
  { label: "Analytics", route: "/login?next=/home", icon: BarChart3 },
  { label: "Compliance", route: "/login?next=/trust", icon: Scale },
  { label: "AI Intelligence", route: "/login?next=/home", icon: Brain },
  { label: "Resources", route: "/login?next=/network", icon: BookOpen },
];

// ── Feature cards — wired to REAL portal routes ──────────────────────────
const FEATURE_CARDS = [
  { title: "Trade Execution", desc: "Create, manage and execute seamless global trades with Governor-governed workflows.", icon: ArrowRight, route: "/login?next=/trades", color: "from-blue-600/20 to-cyan-600/10" },
  { title: "Compliance Assurance", desc: "AI-powered jurisdiction, sanctions and regulatory intelligence across all trade corridors.", icon: Shield, route: "/login?next=/trust", color: "from-purple-600/20 to-indigo-600/10" },
  { title: "Network & Intelligence", desc: "Your relationships. Your data. Your sovereign control over trade counterparties.", icon: Users, route: "/login?next=/network", color: "from-green-600/20 to-emerald-600/10" },
  { title: "Logistics & Tracking", desc: "Multi-modal visibility from origin to final destination with milestone-gated payments.", icon: Package, route: "/login?next=/operations", color: "from-orange-600/20 to-amber-600/10" },
  { title: "Financing Hub", desc: "Connect with banks, private financiers and capital providers through non-custodial CFR.", icon: DollarSign, route: "/login?next=/money", color: "from-blue-600/20 to-violet-600/10" },
  { title: "Documents & Contracts", desc: "Smart contracts, e-sign, e-seal and immutable audit trail via the Loom hash chain.", icon: FileText, route: "/login?next=/trades", color: "from-cyan-600/20 to-blue-600/10" },
];

// ── System status components ─────────────────────────────────────────────
const SYSTEM_COMPONENTS = [
  { name: "Governor Decision Engine", status: "Operational", color: "text-green-400" },
  { name: "Sanctions & Jurisdiction Monitor", status: "Operational", color: "text-green-400" },
  { name: "AI Compliance Intelligence", status: "Operational", color: "text-green-400" },
  { name: "Trade Execution Layer", status: "Operational", color: "text-green-400" },
  { name: "Security & Identity (ZTA/DEL)", status: "Operational", color: "text-green-400" },
];

const COVERAGE_METRICS = [
  { value: "212", label: "Countries", icon: Globe2 },
  { value: "185K+", label: "Verified Entities", icon: Users },
  { value: "98.7%", label: "Sanctions Clear", icon: CheckCircle2 },
  { value: "24/7", label: "Governed", icon: Activity },
];

// ── Constitutional decisions (sample) ───────────────────────────────────
const DECISIONS = [
  { type: "Contract Lock", gtid: "SGTX-VN-TRD-0002199-F53A", verdict: "ALLOW", color: "text-green-400", dot: "bg-green-500" },
  { type: "Financing Request", gtid: "SGTX-KE-FIN-001223-981C", verdict: "CONDITIONAL", color: "text-yellow-400", dot: "bg-yellow-500" },
  { type: "Trade Request", gtid: "SGTX-EG-TRD-002456-6A7D", verdict: "DENY", color: "text-red-400", dot: "bg-red-500" },
];

// ── Three Pillars (v18 §2.2) ─────────────────────────────────────────────
const PILLARS = [
  { roman: "I", title: "Non-Custodial by Structure", desc: "No funds table exists. FeeLock is an instruction, never a holding.", icon: Lock },
  { roman: "II", title: "AI May Block, Never Force", desc: "A1–A3 advises and constrains. A4 is deterministic. A5 is constitutionally forbidden.", icon: Brain },
  { roman: "III", title: "Sovereign Jurisdiction Supremacy", desc: "The strictest rule among buyer, seller, logistics, financier, and governing-law jurisdictions always applies.", icon: Scale },
];

// ── Canonical execution sequence (v18 §2.3) ─────────────────────────────
const EXECUTION_SEQUENCE = [
  "Trade Intent", "Feasibility", "Financing Pre-Clearance", "Quote",
  "Negotiation", "Contract", "Fee & Lock", "USTN Generation",
  "Execution", "Settlement", "Reconciliation", "Closure",
];

export default function LandingPage() {
  const router = useRouter();
  const [showDemo, setShowDemo] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const navigate = useCallback((route: string) => { router.push(route); }, [router]);

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      {/* ════ LAYER 1: Background (subtle, supportive, NOT dominant) ════ */}
      <div
        className="fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.12) 0%, transparent 45%),
            radial-gradient(circle at 90% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 45%),
            #020617
          `,
        }}
        aria-hidden="true"
      />

      {/* ════ LAYER 2: Atmospheric image (optional, very subtle) ════ */}
      <div
        className="fixed inset-0 z-0 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage: 'url(/sgtx-landing.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />

      {/* ════ LAYER 3: Navigation Header ════ */}
      <header className="relative z-20 flex items-center justify-between px-4 lg:px-6 h-16 border-b border-[rgba(56,189,248,0.15)] bg-[rgba(2,6,23,0.85)] backdrop-blur-md">
        {/* Logo */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5 group" aria-label="SGTX Home">
          <div
            className="w-9 h-9 flex items-center justify-center font-bold text-white text-sm rounded-lg"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
              boxShadow: '0 0 18px -2px rgba(59, 130, 246, 0.5)',
            }}
          >
            S
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight text-white">SGTX</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wider">Sovereign Trade</span>
          </div>
        </button>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-0.5" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.route)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[rgba(59,130,246,0.1)] rounded-lg transition-colors"
                aria-label={item.label}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Mobile menu button */}
        <button
          onClick={() => navigate("/login")}
          className="lg:hidden p-2 text-slate-300 hover:text-white"
          aria-label="Menu"
        >
          <BarChart3 className="w-5 h-5" />
        </button>

        {/* Controls */}
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => navigate("/login")} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.1)] transition-colors" aria-label="Change language">
            <Languages className="w-3.5 h-3.5" /> EN
          </button>
          <button onClick={() => navigate("/login")} className="relative p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.1)] transition-colors" aria-label="Notifications">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          <button onClick={() => navigate("/login")} className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-[rgba(59,130,246,0.1)] transition-colors" aria-label="Toggle theme">
            <Palette className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/join")}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/25"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
            aria-label="Request access"
          >
            <Zap className="w-3.5 h-3.5" /> Request Access
          </button>
        </div>
      </header>

      {/* ════ LAYER 4: Main Content ════ */}
      <main className="relative z-10 flex-1 flex flex-col">

        {/* ── Hero Section ── */}
        <section className="px-4 lg:px-6 pt-8 lg:pt-12 pb-6">
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-6">

            {/* Left: Hero Content */}
            <div className="flex flex-col justify-center gap-5">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(56,189,248,0.2)] bg-[rgba(59,130,246,0.08)] text-xs text-blue-300 w-fit">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                v18.0 Production Edition · Direct Bank Settlement (ISO 20022 Native)
              </div>

              {/* Headline */}
              <h1 className="text-3xl lg:text-5xl font-bold leading-tight tracking-tight">
                The <span style={{ background: 'linear-gradient(to right, #60a5fa, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Sovereign</span> Operating System for Global Trade Execution
              </h1>

              {/* Subheadline */}
              <p className="text-xs lg:text-sm font-semibold text-slate-400 uppercase tracking-wide leading-relaxed">
                Not a marketplace. We do not hold funds. We do not take title to goods.<br />
                We do not broker introductions. We provide the infrastructure for your trades.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <button
                  onClick={() => navigate("/login")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
                >
                  <Play className="w-4 h-4" /> See How SGTX Works
                </button>
                <button
                  onClick={() => navigate("/join")}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 rounded-full border border-[rgba(155,190,255,0.2)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Three Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {PILLARS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div key={p.roman} className="p-3 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-4 h-4 text-blue-400" />
                        <span className="text-[10px] font-bold text-blue-300 uppercase">Pillar {p.roman}</span>
                      </div>
                      <h3 className="text-xs font-semibold text-white mb-1">{p.title}</h3>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{p.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Sidebar Panels */}
            <div className="flex flex-col gap-4">

              {/* Global Coverage Widget */}
              <div className="p-4 rounded-2xl border border-[rgba(56,189,248,0.15)] bg-[rgba(15,23,42,0.7)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-blue-400" /> Global Coverage
                  </h3>
                  <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-medium">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Live
                  </span>
                </div>
                {/* Simplified world map dots */}
                <div className="grid grid-cols-4 gap-2 my-3">
                  {COVERAGE_METRICS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <div key={m.label} className="text-center">
                        <Icon className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                        <div className="text-lg font-bold text-white">{m.value}</div>
                        <div className="text-[9px] text-slate-400">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live System Status Widget */}
              <div className="p-4 rounded-2xl border border-[rgba(56,189,248,0.15)] bg-[rgba(15,23,42,0.7)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" /> Live System Status
                  </h3>
                  <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> All Systems Operational
                  </span>
                </div>
                <div className="space-y-2">
                  {SYSTEM_COMPONENTS.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300">{c.name}</span>
                      <span className={`${c.color} font-medium`}>{c.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Latest Constitutional Decisions */}
              <div className="p-4 rounded-2xl border border-[rgba(56,189,248,0.15)] bg-[rgba(15,23,42,0.7)] backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Scale className="w-4 h-4 text-purple-400" /> Constitutional Decisions
                  </h3>
                  <button onClick={() => navigate("/login?next=/admin")} className="text-[10px] text-blue-400 hover:text-blue-300">View All →</button>
                </div>
                <div className="space-y-2">
                  {DECISIONS.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(119,160,235,0.08)]">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${d.dot}`} />
                        <span className="text-slate-300 font-medium">{d.type}</span>
                      </div>
                      <span className={`font-bold ${d.color}`}>{d.verdict}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Canonical Execution Sequence (v18 §2.3) ── */}
        <section className="px-4 lg:px-6 py-6">
          <div className="max-w-[1400px] mx-auto">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" /> Canonical Execution Sequence
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {EXECUTION_SEQUENCE.map((phase, i) => (
                <div key={phase} className="flex items-center gap-1.5">
                  <span className="px-2.5 py-1 text-[10px] font-medium text-slate-300 rounded-md border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
                    {phase}
                  </span>
                  {i < EXECUTION_SEQUENCE.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-slate-600" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature Cards ── */}
        <section className="px-4 lg:px-6 py-6">
          <div className="max-w-[1400px] mx-auto">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Platform Capabilities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {FEATURE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.title}
                    onClick={() => navigate(card.route)}
                    className={`p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-gradient-to-br ${card.color} backdrop-blur-sm text-left hover:border-[rgba(56,189,248,0.3)] hover:bg-[rgba(30,41,59,0.8)] transition-all hover:-translate-y-0.5 group`}
                  >
                    <Icon className="w-5 h-5 text-blue-400 mb-2 group-hover:text-blue-300 transition-colors" />
                    <h3 className="text-xs font-semibold text-white mb-1">{card.title}</h3>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{card.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-auto px-4 lg:px-6 py-4 border-t border-[rgba(56,189,248,0.1)] bg-[rgba(2,6,23,0.8)]">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="font-semibold text-slate-400">SGTX</span>
              · Sovereign Governed Trade Execution Infrastructure
              · v18.0 Production Edition
            </div>
            <div className="flex items-center gap-4 text-[10px] text-slate-500">
              <button onClick={() => navigate("/login")} className="hover:text-slate-300 transition-colors">Sign In</button>
              <button onClick={() => navigate("/join")} className="hover:text-slate-300 transition-colors">Register</button>
              <button onClick={() => navigate("/login?next=/admin")} className="hover:text-slate-300 transition-colors">Admin</button>
            </div>
          </div>
        </footer>
      </main>

      {/* ════ LAYER 5: Interactive States (modals) ════ */}
      {showDemo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md" onClick={() => setShowDemo(false)}>
          <div className="max-w-xl p-6 rounded-2xl border border-[rgba(77,141,255,0.48)] bg-gradient-to-b from-[rgba(9,22,48,0.98)] to-[rgba(3,12,27,0.98)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Play className="w-5 h-5 text-blue-400" /> How SGTX Works
            </h2>
            <p className="text-sm text-slate-300 mb-4">
              SGTX transforms commercial intent into a structured, machine-readable, regulation-aware execution graph. Every trade moves through the canonical 12-phase sequence with Governor-governed transitions.
            </p>
            <button onClick={() => { setShowDemo(false); navigate("/login"); }} className="px-4 py-2 text-sm font-semibold text-white rounded-full" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
              Explore the Platform <ArrowRight className="w-4 h-4 inline ml-1" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
