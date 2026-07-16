"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import {
  ArrowLeft, ArrowRight, Fingerprint, Mail, KeyRound, ShieldCheck,
  Loader2, AlertCircle, Languages, ChevronDown, Eye, EyeOff,
  Package, Banknote, Globe2, Cpu, Settings,
} from "lucide-react";
import { SgtxLogo } from "./SgtxLogo";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n";

type Method = "zitadel" | "passkey" | "email" | "gtid";
const PORTAL_DEFAULT_TENANT: Record<string, string> = {
  "trader-buyer": "SGTX-DE-TRD-001234-5B6C", "trader-seller": "SGTX-EG-TRD-002139-7F3A",
  lsp: "SGTX-EG-LSP-000120-4C7D", ship: "SGTX-EG-SHP-000031-9E8F", lab: "SGTX-EG-LAB-000014-6F4D",
  qc: "SGTX-EG-QC-000022-8A1C", cbr: "SGTX-EG-CBR-000009-5E7B", bank: "SGTX-EG-BNK-000007-1F8D",
  pfi: "SGTX-EG-PFI-000011-3C2E", gov: "SGTX-EG-GOV-000001-9A0B", admin: "SGTX-ZZ-ADM-000001-A1B2",
  "marketplace-partner": "SGTX-ZZ-MKT-000001-C3D4",
};
const DEMO_PORTALS: { portalId: string; name: string; tenant: string; icon: any; color: string }[] = [
  { portalId: "trader-buyer", name: "Trader · Buyer", tenant: "European Importer GmbH", icon: ShieldCheck, color: "emerald" },
  { portalId: "trader-seller", name: "Trader · Seller", tenant: "Strawberry Export Co.", icon: ShieldCheck, color: "emerald" },
  { portalId: "lsp", name: "Logistics Provider", tenant: "Delta Freight", icon: Package, color: "amber" },
  { portalId: "ship", name: "Shipping Line", tenant: "Maersk Levant", icon: Package, color: "amber" },
  { portalId: "lab", name: "Laboratory", tenant: "Cairo Analytical", icon: Package, color: "amber" },
  { portalId: "qc", name: "Quality Control", tenant: "Nile Quality", icon: Package, color: "amber" },
  { portalId: "cbr", name: "Customs Broker", tenant: "Pyramid Customs", icon: Package, color: "amber" },
  { portalId: "bank", name: "Financier · Bank", tenant: "Commercial International Bank", icon: Banknote, color: "emerald" },
  { portalId: "pfi", name: "Financier · Private", tenant: "Sovereign Capital", icon: Banknote, color: "emerald" },
  { portalId: "gov", name: "Government", tenant: "Egyptian Customs Authority", icon: ShieldCheck, color: "emerald" },
  { portalId: "admin", name: "Platform Admin", tenant: "Platform Admin", icon: ShieldCheck, color: "emerald" },
  { portalId: "marketplace-partner", name: "Marketplace Partner", tenant: "Marketplace Partner", icon: ShieldCheck, color: "emerald" },
];

export function AuthGateway() {
  const setView = useAppStore(s => s.setView);
  const enterPortal = useAppStore(s => s.enterPortal);
  // FIX-12 — i18n for the auth page header
  const { t } = useLocale();
  const [method, setMethod] = useState<Method>("zitadel");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [gtid, setGtid] = useState(""); const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false); const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState(""); const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // FIX-3: Hide demo logins in production unless ?demo=1 is present (developer/QA escape hatch).
  const [showDemoLogins, setShowDemoLogins] = useState(false);
  // FIX-AUTH-COUNTRIES-KYC / Fix 5: SSO availability — checked on mount.
  const [ssoConfigured, setSsoConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    const isDev = process.env.NODE_ENV !== "production";
    const demoParam = new URLSearchParams(window.location.search).get("demo") === "1";
    setShowDemoLogins(isDev || demoParam);
    // Check SSO configuration on mount (best-effort; non-fatal if it fails).
    fetch("/api/v1/auth/sso/status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d.configured === "boolean") setSsoConfigured(d.configured); else setSsoConfigured(false); })
      .catch(() => setSsoConfigured(false));
    // Capture SSO callback tokens from the URL fragment (set by /api/v1/auth/sso/callback).
    if (typeof window !== "undefined" && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const st = params.get("session_token");
      const rt = params.get("refresh_token");
      if (st && rt) {
        // Persist tokens via the app store / enterPortal — minimal version:
        // just clear the fragment and enter the default portal.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        toast.success("SSO login successful");
        enterPortal("trader-buyer", "");
        return;
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (method === "email" && (!email || !password)) { setError("Email and password required"); return; }
    if (method === "gtid" && !gtid) { setError("GTID required"); return; }
    setLoading(true);
    try {
      // FIX-AUTH-COUNTRIES-KYC / Fix 5: real ZITADEL SSO redirect.
      // The /authorize endpoint sets an HttpOnly state cookie + 302-redirects
      // the browser to ZITADEL. We do NOT POST demo creds here anymore.
      if (method === "zitadel") {
        if (ssoConfigured === false) {
          setError("SSO not configured — set ZITADEL_CLIENT_ID and ZITADEL_CLIENT_SECRET, or choose another method.");
          return;
        }
        const returnTo = window.location.pathname || "/";
        window.location.href = `/api/v1/auth/sso/authorize?return_to=${encodeURIComponent(returnTo)}`;
        return; // browser will redirect
      }
      const body: any = method === "email" ? { email, password, device_id: "web-browser" } :
        method === "passkey" ? { credential_id: "demo-passkey", authenticator_data: "demo", client_data_json: "demo", signature: "demo" } :
        method === "gtid" ? { email: `${gtid.toLowerCase()}@sgtx.io`, password: "sgtx-demo", device_id: "web-browser" } :
        { email: "sso@sgtx.io", password: "sgtx-demo", device_id: "web-browser" };
      const r = await fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Login failed"); return; }
      if (data.requires_mfa) { setSessionToken(data.session_token); setMfaRequired(true); toast.info("MFA code required"); }
      else { toast.success(`Welcome back, ${data.employee?.full_name || data.tenant?.legalName || "user"}`); enterPortal("trader-buyer", data.tenant?.gtid || ""); }
    } catch (err: any) { setError(err.message || "Network error"); }
    finally { setLoading(false); }
  };
  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault(); if (!sessionToken || !mfaCode) return; setLoading(true); setError(null);
    try { const r = await fetch("/api/v1/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_token: sessionToken, code: mfaCode }) });
      const data = await r.json(); if (!r.ok) { setError(data.error || "MFA verification failed"); return; }
      toast.success("MFA verified — welcome back"); enterPortal("trader-buyer", data.tenant?.gtid || "");
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };
  const handleRecovery = async () => { if (!email) { toast.error("Enter your email first"); return; } setLoading(true);
    try { const r = await fetch("/api/v1/auth/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (r.ok) toast.success("Recovery instructions sent if account exists"); } finally { setLoading(false); } };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <button onClick={() => setView("landing")} className="flex items-center gap-2.5">
          <SgtxLogo size={32} animated animation="pulse" glow={false} />
          <div className="flex flex-col leading-none"><span className="font-display font-bold text-base"><span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span></span><span className="text-[0.5rem] tracking-[0.25em] text-muted-foreground uppercase">Sovereign Trade OS</span></div>
        </button>
        <nav className="flex items-center gap-3 text-sm">
          <button onClick={() => setView("landing")} className="text-muted-foreground hover:text-foreground">Home</button>
          <a href="#about" className="text-muted-foreground hover:text-foreground hidden sm:inline">About</a>
          <LanguageSelector />
        </nav>
      </header>
      <main className="flex-1 grid lg:grid-cols-2">
        <div className="hidden lg:flex relative items-center justify-center p-12 bg-muted/20 border-r border-border/40 overflow-hidden">
          <div className="absolute inset-0 sovereign-radial opacity-60" /><div className="absolute inset-0 sovereign-grid opacity-20" />
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="relative z-10 max-w-md text-center">
            <SgtxLogo size={120} animated glow variant="icon" animation="shimmer" />
            <h2 className="font-display text-2xl font-bold mt-6 mb-2">Cryptographic certainty for every trade</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-8">Sign in to access your tenant portal, manage trades, track shipments, and execute settlement — all backed by Ed25519 signatures and the Loom hash chain.</p>
            <div className="grid grid-cols-3 gap-3 text-center">{[{ icon: ShieldCheck, label: "Ed25519" }, { icon: Fingerprint, label: "WebAuthn" }, { icon: KeyRound, label: "TOTP MFA" }].map(x => (<div key={x.label} className="glass-panel rounded-xl p-3"><x.icon className="w-5 h-5 mx-auto text-primary mb-1" /><div className="text-[0.65rem] font-medium">{x.label}</div></div>))}</div>
          </motion.div>
        </div>
        <div className="flex items-center justify-center p-6 sm:p-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
            <button onClick={() => setView("landing")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="w-3.5 h-3.5" /> Back to home</button>
            <h1 className="font-display text-2xl font-bold mb-1">{t("signInToSgtx")}</h1>
            <p className="text-sm text-muted-foreground mb-8">Choose your preferred authentication method</p>
            {mfaRequired ? (
              <form onSubmit={handleMfa} className="space-y-4">
                <div><label className="text-xs font-medium text-foreground mb-1.5 block">MFA Code (TOTP)</label><input value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full px-3 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm font-mono tracking-[0.5em] text-center" autoFocus /></div>
                {error && <ErrorBanner message={error} />}
                <button type="submit" disabled={loading || mfaCode.length !== 6} className="w-full py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4" /> Verify & Continue</>}</button>
                <button type="button" onClick={() => { setMfaRequired(false); setMfaCode(""); setSessionToken(null); }} className="w-full text-xs text-muted-foreground hover:text-foreground">← Back to login methods</button>
              </form>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {(["zitadel", "passkey", "email", "gtid"] as Method[]).map(m => (
                    <button key={m} type="button" onClick={() => setMethod(m)} title={m === "zitadel" && ssoConfigured === false ? "SSO not configured — set ZITADEL_CLIENT_ID and ZITADEL_CLIENT_SECRET" : undefined} className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border text-xs font-medium transition-all ${method === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"} ${m === "zitadel" && ssoConfigured === false ? "opacity-50" : ""}`}>
                      {m === "zitadel" && <ShieldCheck className="w-3.5 h-3.5" />}
                      {m === "passkey" && <Fingerprint className="w-3.5 h-3.5" />}
                      {m === "email" && <Mail className="w-3.5 h-3.5" />}
                      {m === "gtid" && <KeyRound className="w-3.5 h-3.5" />}
                      {m === "zitadel" ? "ZITADEL SSO" : m === "passkey" ? "Passkey" : m === "email" ? "Email" : "GTID Login"}
                      {m === "zitadel" && ssoConfigured === false && <span className="text-[0.55rem] text-muted-foreground/70">⚠</span>}
                    </button>
                  ))}
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  {method === "email" && (<><div><label className="text-xs font-medium mb-1.5 block">Email Address</label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="w-full pl-10 pr-3 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" autoFocus /></div></div>
                    <div><div className="flex items-center justify-between mb-1.5"><label className="text-xs font-medium">Password</label><button type="button" onClick={handleRecovery} className="text-[0.65rem] text-primary hover:underline">Forgot?</button></div><div className="relative"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full pl-10 pr-10 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div></div></>)}
                  {method === "gtid" && (<div><label className="text-xs font-medium mb-1.5 block">Your GTID</label><div className="relative"><KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={gtid} onChange={e => setGtid(e.target.value.toUpperCase())} placeholder="SGTX-EG-TRD-002139-7F3A" className="w-full pl-10 pr-3 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm font-mono" autoFocus /></div></div>)}
                  {error && <ErrorBanner message={error} />}
                  <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{method === "zitadel" ? "Continue with ZITADEL" : method === "passkey" ? "Verify Passkey" : method === "email" ? "Sign In" : "Continue with GTID"}<ArrowRight className="w-4 h-4" /></>}</button>
                </form>
                {/* Demo Login — gated behind non-production OR ?demo=1 (FIX-3) */}
                {showDemoLogins && (
                  <div className="mt-6 pt-6 border-t border-border/60">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Demo Login — click any portal</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto scroll-gold">
                      {DEMO_PORTALS.map(p => (
                        <button key={p.portalId} onClick={() => { enterPortal(p.portalId, ""); toast.success(`Demo · entering ${p.name} as ${p.tenant}`); }} className="flex flex-col items-start gap-1 p-2.5 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-all text-left">
                          <span className="text-xs font-bold">{p.name}</span>
                          <span className="text-[0.6rem] text-muted-foreground truncate w-full">{p.tenant}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-6 text-center text-xs text-muted-foreground">Don't have an account? <button onClick={() => setView("join")} className="text-primary font-medium hover:underline">Join SGTX →</button></p>
              </>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (<div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{message}</span></div>);
}

function LanguageSelector() {
  // FIX-12 — Wire the language button to cycle through en → ar → fr → zh → en.
  // Label shows the current language; dir="rtl" applied on <html> for Arabic.
  const { label, cycleLocale } = useLocale();
  return (
    <button
      onClick={cycleLocale}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={`Language: ${label} — click to switch`}
      aria-label={`Switch language (current: ${label})`}
    >
      <Languages className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
