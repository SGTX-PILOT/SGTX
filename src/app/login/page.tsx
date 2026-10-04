"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// /login route — SGTX Authentication (Cinematic Dark Theme)
// ═════════════════════════════════════════════════════════════════════════════════
//
// Matches the uploaded "SGTX AUTHENTICATION UI" design:
//   - Deep space (#020617) background + grid overlay
//   - Left column: marketing copy + 4 feature items
//   - Right column: glass-panel login card with 3 tabs (Email/GTID, SSO, API Access)
//   - Email/GTID input + Password input with eye toggle + "Sign In" gradient button
//   - "Sign in with Passkey" secondary button (fingerprint icon)
//   - Security banner + footer with trust badges (Ed25519, WasmEdge+OPA, Loom, 24/7)
//
// KEEPS the existing auth flow: setSession, demoLogin function, redirect to ?next
// KEEPS the demo portal buttons (trader-buyer, trader-seller, lsp, ship, etc.) but
// styled as secondary buttons below the form.

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { setSession } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import {
  AlertTriangle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight,
  Fingerprint, ShieldCheck, CheckCircle2, ChevronRight, KeyRound, Code2,
} from "lucide-react";

// Demo portals — used by the demo-login endpoint for non-production pilots.
const DEMO_PORTALS = [
  { id: "trader-buyer", label: "Trader · Buyer", desc: "European Importer GmbH" },
  { id: "trader-seller", label: "Trader · Seller", desc: "Strawberry Export Co." },
  { id: "lsp", label: "Logistics Provider", desc: "Delta Freight" },
  { id: "ship", label: "Shipping Line", desc: "Maersk Levant" },
  { id: "lab", label: "Laboratory", desc: "Cairo Analytical" },
  { id: "qc", label: "Quality Control", desc: "Nile Quality" },
  { id: "cbr", label: "Customs Broker", desc: "Pyramid Customs" },
  { id: "bank", label: "Bank · Financier", desc: "Commercial International Bank" },
  { id: "pfi", label: "Private Financier", desc: "Sovereign Capital" },
  { id: "gov", label: "Government", desc: "Egyptian Customs Authority" },
  { id: "admin", label: "Platform Admin", desc: "Platform Admin" },
  { id: "marketplace-partner", label: "Marketplace Partner", desc: "Marketplace Partner" },
];

// Left-column feature items
const LEFT_FEATURES = [
  { icon: ShieldCheck, label: "Sovereign Governed", desc: "Every action signed with Ed25519, validated by OPA + WasmEdge.", color: "#a78bfa" },
  { icon: Lock,        label: "Non-Custodial by Design", desc: "We never hold funds, documents, or your private keys.", color: "#60a5fa" },
  { icon: KeyRound,    label: "AI-Powered Intelligence", desc: "Multi-provider LLM with zero vendor lock-in.", color: "#34d399" },
  { icon: Code2,       label: "Zero-Cost Stack", desc: "Open standards only — no per-seat or per-API fees.", color: "#fbbf24" },
];

// Footer trust badges
const TRUST_BADGES = [
  { label: "Ed25519",       sub: "Signatures" },
  { label: "WasmEdge + OPA", sub: "Policy Engine" },
  { label: "Loom",           sub: "Audit Ledger" },
  { label: "24/7",           sub: "Governed" },
];

// Tabs
type AuthTab = "email" | "sso" | "api";

export default function LoginPage() {
  const search = useSearchParams();
  const next = search.get("next") || "/home";
  const { t, dir } = useCockpitLocale();

  const [tab, setTab] = useState<AuthTab>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  // If already authenticated, redirect away.
  useEffect(() => {
    const token = document.cookie.match(/sgtx-session=([^;]+)/);
    if (token) {
      window.location.href = next;
    }
  }, [next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      setSession(data.session_token, 60 * 60);
      window.location.href = next;
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin(portalId: string) {
    setDemoLoading(portalId);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_id: portalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Demo login failed.");
        return;
      }
      setSession(data.session_token, 60 * 60);
      window.location.href = next;
    } catch (err: any) {
      setError(err?.message || "Network error.");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div dir={dir} className="relative min-h-screen bg-space text-slate-100 overflow-y-auto">
      {/* Background grid overlay */}
      <div className="fixed inset-0 grid-overlay grid-overlay-fade pointer-events-none" aria-hidden />
      {/* Ambient gradient washes */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-0 left-0 w-[60%] h-[60%]"
          style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.18), transparent 60%)" }}
        />
        <div
          className="absolute bottom-0 right-0 w-[60%] h-[60%]"
          style={{ background: "radial-gradient(ellipse, rgba(168,85,247,0.14), transparent 60%)" }}
        />
      </div>

      <div className="relative min-h-screen flex flex-col z-10">
        {/* Top mini-nav */}
        <header className="px-4 sm:px-6 pt-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <span className="sovereign-emblem" aria-hidden />
              <div className="flex flex-col leading-none">
                <span className="text-base font-bold tracking-tight text-white">SGTX</span>
                <span className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">Sovereign Governed Trading Execution</span>
              </div>
            </Link>
            <Link
              href="/join"
              className="text-[12px] text-slate-300 hover:text-white transition inline-flex items-center gap-1.5"
            >
              New to SGTX? <span className="text-blue-400 font-medium">Create an account</span>
              <ChevronRight className="w-3 h-3" aria-hidden />
            </Link>
          </div>
        </header>

        {/* Main split layout */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
          <div className="w-full max-w-7xl grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* ═══ Left column — marketing copy ═══ */}
            <div className="animate-fade-up max-w-xl">
              <div className="pill-dark mb-5">
                <span className="status-dot" aria-hidden />
                Sovereign Authentication · Ed25519 · Zero Custody
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1] text-white">
                Access the{" "}
                <span className="text-gradient-blue">Sovereign</span>{" "}
                Operating System for Global Trade Execution
              </h1>
              <p className="mt-5 text-sm sm:text-base text-slate-400 leading-relaxed">
                One identity. Twelve institutional roles. Every login signed, every
                session governed, every jurisdiction respected.
              </p>

              <div className="mt-8 grid sm:grid-cols-2 gap-3">
                {LEFT_FEATURES.map((f) => (
                  <div
                    key={f.label}
                    className="glass-card glass-card-hover p-4 flex items-start gap-3"
                  >
                    <div
                      className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: `${f.color}18`, border: `1px solid ${f.color}33` }}
                    >
                      <f.icon className="w-4 h-4" style={{ color: f.color }} aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-white">{f.label}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center gap-3 text-[11px] text-slate-500">
                <Lock className="w-3.5 h-3.5" aria-hidden />
                <span>Non-custodial · We never hold your funds, documents, or keys.</span>
              </div>
            </div>

            {/* ═══ Right column — login card ═══ */}
            <div className="animate-scale-in lg:animate-delay-200">
              <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-md mx-auto">
                {/* Heading */}
                <div className="mb-5">
                  <h2 className="text-2xl font-bold text-white">Welcome Back</h2>
                  <p className="text-[12px] text-slate-400 mt-1">Sign in securely to your sovereign workspace.</p>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/40 border border-slate-800/40 mb-5">
                  <button
                    onClick={() => setTab("email")}
                    className={`auth-tab flex-1 ${tab === "email" ? "active" : ""}`}
                  >
                    Email / GTID
                  </button>
                  <button
                    onClick={() => setTab("sso")}
                    className={`auth-tab flex-1 ${tab === "sso" ? "active" : ""}`}
                  >
                    SSO Login
                  </button>
                  <button
                    onClick={() => setTab("api")}
                    className={`auth-tab flex-1 ${tab === "api" ? "active" : ""}`}
                  >
                    API Access
                  </button>
                </div>

                {/* ── Email / GTID form ── */}
                {tab === "email" && (
                  <form onSubmit={submit} className="space-y-4">
                    <div>
                      <label htmlFor="email" className="block text-[11px] font-medium text-slate-300 mb-1.5">
                        Email or GTID
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
                        <input
                          id="email"
                          type="text"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com or SGTX-EG-TRD-..."
                          autoComplete="email"
                          disabled={loading}
                          className="glass-input w-full h-11 pl-10 pr-3 rounded-lg text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="password" className="block text-[11px] font-medium text-slate-300">
                          Password
                        </label>
                        <Link href="#" className="text-[11px] text-blue-400 hover:text-blue-300 transition">
                          Forgot Password?
                        </Link>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          disabled={loading}
                          className="glass-input w-full h-11 pl-10 pr-10 rounded-lg text-sm outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {error && (
                      <div
                        className="flex items-start gap-2 p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-[12px] text-red-300"
                        role="alert"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" aria-hidden />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="btn-gradient w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      ) : (
                        <>
                          Sign In
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/15">
                            <ArrowRight className="w-3 h-3" aria-hidden />
                          </span>
                        </>
                      )}
                    </button>

                    {/* Divider */}
                    <div className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-slate-800" />
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px bg-slate-800" />
                    </div>

                    {/* Passkey */}
                    <button
                      type="button"
                      className="btn-secondary-dark w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium"
                    >
                      <Fingerprint className="w-4 h-4 text-emerald-400" aria-hidden />
                      Sign in with Passkey
                    </button>

                    <p className="text-center text-[11px] text-slate-400 pt-1">
                      New to SGTX?{" "}
                      <Link href="/join" className="text-blue-400 hover:text-blue-300 font-medium">
                        Create an account
                      </Link>
                    </p>
                  </form>
                )}

                {/* ── SSO tab ── */}
                {tab === "sso" && (
                  <div className="space-y-3">
                    <p className="text-[12px] text-slate-400 mb-2">
                      Federated single sign-on for enterprise tenants.
                    </p>
                    {["Microsoft Entra ID", "Okta Workforce", "Google Workspace", "SAML 2.0 Custom"].map((p) => (
                      <button
                        key={p}
                        className="btn-secondary-dark w-full h-11 inline-flex items-center justify-between gap-2 rounded-lg text-sm font-medium px-4"
                      >
                        <span className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-slate-400" aria-hidden />
                          {p}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" aria-hidden />
                      </button>
                    ))}
                    <p className="text-[11px] text-slate-500 pt-2 text-center">
                      Contact your SGTX administrator to configure SSO.
                    </p>
                  </div>
                )}

                {/* ── API Access tab ── */}
                {tab === "api" && (
                  <div className="space-y-4">
                    <p className="text-[12px] text-slate-400 mb-2">
                      Generate or rotate API keys for headless integrations.
                    </p>
                    <div>
                      <label htmlFor="apikey" className="block text-[11px] font-medium text-slate-300 mb-1.5">
                        API Key
                      </label>
                      <div className="relative">
                        <Code2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
                        <input
                          id="apikey"
                          type="password"
                          placeholder="sk_live_sgtx_..."
                          className="glass-input w-full h-11 pl-10 pr-3 rounded-lg text-sm outline-none font-mono"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-gradient w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold"
                    >
                      Authenticate
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                    </button>
                    <p className="text-[11px] text-slate-500 text-center">
                      Keys are scoped per tenant and signed with Ed25519.
                    </p>
                  </div>
                )}

                {/* Security banner */}
                <div className="mt-6 p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/25 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-emerald-300">Secure. Private. Governed.</div>
                      <div className="text-[10px] text-emerald-500/70 truncate">
                        Every login signed · every session audited
                      </div>
                    </div>
                  </div>
                  <Link href="#" className="text-[11px] text-emerald-400 hover:text-emerald-300 shrink-0">
                    View Details →
                  </Link>
                </div>

                {/* Demo logins toggle */}
                <div className="mt-5 border-t border-slate-800/60 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowDemo((s) => !s)}
                    className="w-full text-[11px] text-slate-400 hover:text-slate-200 transition inline-flex items-center justify-between"
                  >
                    <span className="uppercase tracking-wider font-semibold">
                      Demo Portals {showDemo ? "(hide)" : "(show)"}
                    </span>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${showDemo ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {showDemo && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 animate-fade-in">
                      {DEMO_PORTALS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => demoLogin(p.id)}
                          disabled={!!demoLoading}
                          aria-label={`${p.label} — ${p.desc}`}
                          className="btn-secondary-dark text-start p-2.5 rounded-md disabled:opacity-50 min-h-[44px]"
                        >
                          <div className="text-[12px] font-medium text-white">{p.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {demoLoading && (
                    <p
                      className="mt-3 text-[11px] text-slate-400 flex items-center gap-2"
                      role="status"
                      aria-live="polite"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> Signing in {demoLoading}…
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* ═══ Footer ═══ */}
        <footer className="px-4 sm:px-6 pb-6 pt-4 mt-auto">
          <div className="max-w-7xl mx-auto">
            <div className="hairline-gradient mb-4" />
            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              {TRUST_BADGES.map((b) => (
                <span key={b.label} className="pill-dark text-[10px] py-1.5 px-3">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden />
                  <span className="font-semibold text-slate-200">{b.label}</span>
                  <span className="text-slate-500">· {b.sub}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>SGTX · Sovereign Governed Trade Execution · {t("footer.nonCustodial")}</span>
              <div className="flex items-center gap-3">
                <span className="pill-dark text-[10px] py-1 px-2">ISO 27001</span>
                <span className="pill-dark text-[10px] py-1 px-2">GDPR Ready</span>
                <span className="pill-dark text-[10px] py-1 px-2">FATF Aligned</span>
                <span className="pill-dark text-[10px] py-1 px-2">Privacy by Design</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
