"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import {
  ShieldCheck, Hash, Lock, Landmark, Cpu, Eye, FileCheck,
  ArrowRight, Sparkles, Search, Globe2, Users, Banknote, Zap, Scale, Brain,
  Languages, ChevronDown, CheckCircle2, TrendingUp, Activity,
  MapPin, Calendar, Package, ArrowUp,
} from "lucide-react";
import { SgtxLogo, SgtxWordmark } from "./SgtxLogo";
import { useAppStore } from "@/store/app-store";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale } from "@/lib/i18n";

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

const VALUE_PROPS = [
  { icon: ShieldCheck, title: "Cryptographic Certainty", desc: "Every trade is signed with Ed25519, anchored in the Loom immutable hash chain, and court-ready.", emoji: "🔐" },
  { icon: Lock, title: "Non-Custodial by Structure", desc: "SGTX never holds funds. FeeLock is an instruction, not an escrow. PSPs handle all funds.", emoji: "🏦" },
  { icon: Brain, title: "AI May Block, Never Force", desc: "AI advises, flags, and escalates — but never autonomously executes an irreversible action.", emoji: "🧠" },
  { icon: Scale, title: "Sovereign Jurisdiction Supremacy", desc: "The strictest applicable law always applies. No trade can circumvent jurisdiction.", emoji: "⚖️" },
  { icon: Banknote, title: "Non-Custodial", desc: "Self-hosted infrastructure. Your data, your keys, your rules. No billing details required.", emoji: "💰" },
  { icon: Zap, title: "One-Second Trade Execution", desc: "From contract lock to USTN generation. Multi-party, multi-document, multi-currency. One click.", emoji: "⚡" },
] as const;

const TRUST_SIGNALS = [
  { icon: ShieldCheck, title: "Cryptographic certainty for every trade", desc: "100% of SGTX trades are signed with Ed25519 and anchored in the Loom immutable hash chain." },
  { icon: Lock, title: "Non-custodial by design", desc: "SGTX never holds funds. FeeLock is an instruction, not an escrow." },
  { icon: Globe2, title: "Global reach", desc: "50+ countries connected. 1,000+ tenants onboarded." },
  { icon: Users, title: "Enterprise-grade governance", desc: "Multisig (3-of-5) governance with constitutional enforcement." },
  { icon: Banknote, title: "Non-custodial", desc: "Self-hosted infrastructure. Your data, your keys, your rules." },
  { icon: Landmark, title: "Trusted by leading financiers", desc: "Banks and private financiers use SGTX for trade finance." },
] as const;

const FOOTER_COLUMNS = [
  { title: "Product", links: ["How It Works", "Use Cases", "Security", "Docs", "API"] },
  { title: "Company", links: ["About", "Team", "Careers", "Blog", "Contact"] },
  { title: "Legal", links: ["Terms of Service", "Privacy Policy", "Cookies", "GDPR", "PDPL (Egypt)"] },
  { title: "Support", links: ["Help Center", "Status Page", "Community", "Support Request", "Contact Support"] },
  { title: "Social", links: ["LinkedIn", "Twitter", "GitHub", "YouTube", "Discord"] },
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
  const setView = useAppStore((s) => s.setView);
  // FIX-12 — i18n cycle button: click cycles en → ar → fr → zh → en.
  // useLocale() also applies dir="rtl" on <html> when locale is Arabic.
  const { t, label: langLabel, cycleLocale } = useLocale();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/85 backdrop-blur-xl border-b border-border/60" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <button onClick={() => setView("landing")} className="flex items-center gap-2.5 group">
          <SgtxLogo size={32} animated animation="pulse" glow={false} />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="font-display font-bold text-base"><span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span></span>
            <span className="text-[0.5rem] tracking-[0.25em] text-muted-foreground uppercase">{t("sovereignTradeOs")}</span>
          </div>
        </button>
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md"><QuickSearchBar /></div>
        <div className="flex items-center gap-1 sm:gap-2">
          <nav className="hidden lg:flex items-center gap-1 text-sm">
            <button onClick={() => setView("auth")} className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">{t("login")}</button>
            <button onClick={() => setView("join")} className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">{t("join")}</button>
            <a href="#how-it-works" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">About</a>
            <a href="#docs" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">Docs</a>
            <a href="#support" className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">Support</a>
          </nav>
          {/* FIX-12 — Language cycle button: shows current language label, click cycles */}
          <button
            onClick={cycleLocale}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title={`Language: ${langLabel} — click to switch`}
            aria-label={`Switch language (current: ${langLabel})`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{langLabel}</span>
          </button>
          <button onClick={() => setView("auth")} className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/60 transition-colors">{t("login")}</button>
          <button onClick={() => setView("join")} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-gold-gradient text-sovereign hover:opacity-90 transition-opacity">
            {t("getStarted")} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </header>
  );
}

function QuickSearchBar() {
  const [mode, setMode] = useState<"gtid" | "ustn">("gtid");
  const [value, setValue] = useState("");
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    if (mode === "gtid") {
      try {
        const r = await fetch("/api/v1/gtid/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gtid: value.trim() }) });
        const data = await r.json().catch(() => ({}));
        // Not-found is now a soft 200 with { found: false } (FIX-1).
        if (!r.ok || data.found === false) { toast.error(data.message || data.error || "GTID not found"); return; }
        const profile: GtidPublicProfile = data;
        toast.success(`${profile.legal_name} — ${profile.type} · ${profile.jurisdiction} · KYB Tier ${profile.kyb_tier}`);
      } catch { toast.error("Failed to resolve GTID"); }
    } else {
      try {
        const r = await fetch("/api/v1/ustn/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: value.trim() }) });
        if (!r.ok) { const err = await r.json().catch(() => ({})); toast.error(err.error || "USTN not found"); return; }
        const track: UstnPublicTracking = await r.json();
        const commodityDesc = typeof track.commodity === "string" ? track.commodity : (track.commodity?.description || "Shipment");
        toast.success(`${commodityDesc} — ${track.status} · ETA ${track.eta?.slice(0, 10)}`);
      } catch { toast.error("Failed to track USTN"); }
    }
  };
  return (
    <form onSubmit={onSubmit} className="flex items-center w-full bg-muted/40 border border-border/60 rounded-md overflow-hidden focus-within:border-primary/50 transition-colors">
      <div className="flex">
        <button type="button" onClick={() => setMode("gtid")} className={`px-2.5 py-1.5 text-[0.65rem] font-medium ${mode === "gtid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>GTID</button>
        <button type="button" onClick={() => setMode("ustn")} className={`px-2.5 py-1.5 text-[0.65rem] font-medium ${mode === "ustn" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>USTN</button>
      </div>
      <div className="h-4 w-px bg-border/60" />
      <Search className="w-3.5 h-3.5 text-muted-foreground ml-2" />
      <input value={value} onChange={e => setValue(e.target.value)} placeholder={mode === "gtid" ? "SGTX-EG-TRD-002139-7F3A" : "SGTX-1397F3A-..."} className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60" />
      <button type="submit" className="px-2.5 py-1.5 text-[0.65rem] font-medium text-primary hover:bg-primary/10 transition-colors">Resolve</button>
    </form>
  );
}

function useLiveMetrics() {
  return useQuery({
    queryKey: ["landing-metrics"], queryFn: async () => {
      const r = await fetch("/api/sgtx/health"); if (!r.ok) return null; return r.json();
    }, staleTime: 60_000,
    select: (d: any) => ({ activeTrades: d?.counts?.trades ?? 0, tenants: d?.counts?.tenants ?? 0, countries: 4, feeRate: 100 }),
  });
}

function HeroSection() {
  const setView = useAppStore(s => s.setView);
  const reduce = useReducedMotion();
  const metrics = useLiveMetrics();
  // FIX-12 — translate hero CTA buttons (Get Started / Login / Track a Shipment)
  const { t } = useLocale();
  const stats = [
    { label: "Active Trades", value: metrics.data?.activeTrades ?? "—", icon: Activity, live: true },
    { label: "Tenants Onboarded", value: metrics.data?.tenants ?? "—", icon: Users },
    { label: "Countries Connected", value: metrics.data?.countries ?? "—", icon: Globe2 },
    { label: "Fee Collection Rate", value: "100%", icon: TrendingUp },
  ];
  const particles = useMemo(() => {
    const state = { seed: 1337 };
    const rand = () => { state.seed = (state.seed + 0x6D2B79F5) | 0; let t = state.seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return Array.from({ length: 22 }, (_, i) => ({ id: i, x: rand() * 100, y: rand() * 100, size: 1 + rand() * 3, delay: rand() * 4, duration: 8 + rand() * 8, gold: i % 3 === 0 }));
  }, []);
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 sovereign-radial pointer-events-none" />
      <div className="absolute inset-0 sovereign-grid opacity-30 pointer-events-none" />
      {!reduce && <div className="absolute inset-0 pointer-events-none overflow-hidden">{particles.map(p => <motion.div key={p.id} className="absolute rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, background: p.gold ? "oklch(0.82 0.14 84 / 0.55)" : "oklch(0.55 0.012 250 / 0.45)" }} animate={{ y: [0, -30, 0], opacity: [0, 0.7, 0] }} transition={{ duration: p.duration, repeat: Infinity, delay: p.delay, ease: "easeInOut" }} />)}</div>}
      {!reduce && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">{[0,1,2].map(i => <motion.div key={i} className="absolute rounded-full border border-primary/15" style={{ width: 280 + i * 120, height: 280 + i * 120, left: -(140 + i * 60), top: -(140 + i * 60) }} animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }} transition={{ duration: 4, repeat: Infinity, delay: i * 0.8, ease: "easeInOut" }} />)}</div>}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center py-20">
        <motion.div variants={fadeUp(0)} initial="hidden" animate="show" className="flex justify-center mb-8"><SgtxLogo size={120} animated glow variant="icon" animation="shimmer" /></motion.div>
        <motion.div variants={fadeUp(0.1)} initial="hidden" animate="show" className="mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary"><Sparkles className="w-3 h-3" />Sovereign Trade Operating System</span>
        </motion.div>
        <motion.h1 variants={fadeUp(0.15)} initial="hidden" animate="show" className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05] mb-6">
          <span className="text-foreground">Sovereign Governed Trade Execution</span><br />
          <span className="text-gold-gradient">The Invisible Rails of Global Trade</span>
        </motion.h1>
        <motion.p variants={fadeUp(0.25)} initial="hidden" animate="show" className="text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
          One click to ship. One click to import. One click to pay. <span className="text-foreground/80">Cryptographic certainty. Zero counterparty risk. Non-custodial.</span>
        </motion.p>
        <motion.div variants={fadeUp(0.35)} initial="hidden" animate="show" className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <button onClick={() => setView("join")} className="group inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 transition-all shadow-[0_8px_30px_-8px_oklch(0.62_0.13_75/0.5)] hover:-translate-y-0.5">{t("getStarted")} — Join SGTX<ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></button>
          <button onClick={() => setView("auth")} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-border bg-card/60 backdrop-blur text-foreground font-medium text-sm hover:bg-muted/60 transition-colors">{t("login")}</button>
          <button onClick={() => { const el = document.getElementById("ustn-tracking"); el?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-muted-foreground hover:text-foreground font-medium text-sm transition-colors"><Search className="w-4 h-4" />{t("trackShipment")}</button>
        </motion.div>
        <motion.div variants={fadeUp(0.45)} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {stats.map(s => (
            <div key={s.label} className="glass-panel rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1"><s.icon className="w-3.5 h-3.5 text-primary" />{s.live && <span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" /></span>}</div>
              <div className="font-display text-2xl font-bold text-foreground">{s.value}</div>
              <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
      <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground/60"><ChevronDown className="w-5 h-5" /></motion.div>
    </section>
  );
}

function ValuePropsSection() {
  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <motion.div variants={fadeUp()} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary mb-4">Why SGTX</span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">Six pillars of sovereign trade</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Every architectural decision in SGTX serves one of these six principles — together they form a platform where global trade can execute with cryptographic certainty.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {VALUE_PROPS.map((p, i) => (
            <motion.div key={p.title} variants={fadeUp(i * 0.08)} initial="hidden" whileInView="show" viewport={{ once: true }} className="glass-panel rounded-2xl p-6 hover:shadow-[0_8px_30px_-12px_oklch(0.62_0.13_75/0.25)] hover:-translate-y-1 transition-all duration-300 group">
              <div className="flex items-start gap-4"><HexIcon icon={p.icon} /><div className="flex-1"><div className="flex items-center gap-2 mb-1.5"><h3 className="font-display font-bold text-base">{p.title}</h3><span className="text-lg" aria-hidden>{p.emoji}</span></div><p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p></div></div>
              <div className="mt-4 h-px w-0 group-hover:w-full bg-gradient-to-r from-primary/40 to-transparent transition-all duration-500" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, mono, status }: { label: string; value: string; mono?: boolean; status?: "good" | "bad" }) {
  return (<div className="p-2 rounded-md bg-muted/40"><div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">{label}</div><div className={`text-sm font-medium ${mono ? "font-mono" : ""} ${status === "good" ? "text-emerald-700" : status === "bad" ? "text-destructive" : "text-foreground"}`}>{value}</div></div>);
}

function GtidResolutionModule() {
  const [gtid, setGtid] = useState(""); const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null); const [error, setError] = useState<string | null>(null);
  const resolve = async (e: React.FormEvent) => {
    e.preventDefault(); if (!gtid.trim()) return; setLoading(true); setError(null); setProfile(null);
    try { const r = await fetch("/api/v1/gtid/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gtid: gtid.trim() }) });
      const data = await r.json();
      // Not-found is now a soft 200 with { found: false } — no more red network error (FIX-1).
      if (!r.ok) { setError(data.error || data.message || "GTID not found"); return; }
      if (data.found === false) { setError(data.message || "GTID not found"); return; }
      setProfile(data);
    } catch { setError("Failed to resolve GTID"); } finally { setLoading(false); }
  };
  return (
    <section id="gtid-resolution" className="relative py-24 px-4 sm:px-6 lg:px-8 bg-muted/20">
      <div className="max-w-5xl mx-auto">
        <motion.div variants={fadeUp()} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary mb-4"><Hash className="w-3 h-3" /> Global Trade Identity</span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">Verify any tenant by GTID</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">Every SGTX tenant has a permanent Global Trade Identity. Resolve any GTID to view its public profile — no login required.</p>
        </motion.div>
        <motion.div variants={fadeUp(0.1)} initial="hidden" whileInView="show" viewport={{ once: true }} className="glass-panel rounded-2xl p-6 sm:p-8">
          <form onSubmit={resolve} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1"><Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={gtid} onChange={e => setGtid(e.target.value)} placeholder="SGTX-EG-TRD-002139-7F3A" className="w-full pl-10 pr-3 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm font-mono" /></div>
            <button type="submit" disabled={loading || !gtid.trim()} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50">{loading ? "Resolving…" : "Verify GTID"}{!loading && <Search className="w-4 h-4" />}</button>
          </form>
          {error && <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}
          {profile && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-5 rounded-xl bg-background border border-border">
              <div className="flex items-center justify-between mb-4"><div><div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Public Profile</div><div className="font-display text-lg font-bold">{profile.legal_name || profile.legalName}</div></div><div className="flex items-center gap-2"><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono">{profile.type}</span><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium">{profile.lifecycle_state || profile.lifecycleState}</span></div></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <Field label="GTID" value={profile.gtid} mono /><Field label="Jurisdiction" value={profile.jurisdiction || profile.country} /><Field label="KYB Tier" value={`Tier ${profile.kyb_tier ?? profile.kybTier}`} /><Field label="KYB Status" value={profile.kyb_status || profile.kybStatus || "VERIFIED"} />
                <Field label="Sanctions" value={profile.sanctions_cleared ?? profile.sanctionsCleared ? "Cleared ✓" : "Flagged"} status={profile.sanctions_cleared ?? profile.sanctionsCleared ? "good" : "bad"} /><Field label="Trust Score" value={`${profile.trust_score ?? profile.trustScore ?? 0}/100`} /><Field label="Lifecycle" value={profile.lifecycle_state || profile.lifecycleState || "VERIFIED"} />
              </div>
              <div className="mt-4 pt-4 border-t border-border/60 text-[0.65rem] text-muted-foreground">Non-marketplace: Only public information is displayed. No counterparty recommendations.</div>
            </motion.div>
          )}
          {!profile && !error && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Try:</span>{["SGTX-EG-TRD-002139-7F3A", "SGTX-DE-TRD-001234-5B6C"].map(g => <button key={g} onClick={() => setGtid(g)} className="px-2 py-1 rounded-md bg-muted hover:bg-muted/60 font-mono text-[0.65rem]">{g}</button>)}</div>}
        </motion.div>
      </div>
    </section>
  );
}

function UstnTrackingModule() {
  const [ustn, setUstn] = useState(""); const [loading, setLoading] = useState(false);
  const [track, setTrack] = useState<any>(null); const [error, setError] = useState<string | null>(null);
  const track_ = async (e: React.FormEvent) => {
    e.preventDefault(); if (!ustn.trim()) return; setLoading(true); setError(null); setTrack(null);
    try { const r = await fetch("/api/v1/ustn/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: ustn.trim() }) });
      const data = await r.json(); if (!r.ok) { setError(data.error || "USTN not found"); return; } setTrack(data);
    } catch { setError("Failed to track USTN"); } finally { setLoading(false); }
  };
  return (
    <section id="ustn-tracking" className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-5xl mx-auto">
        <motion.div variants={fadeUp()} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary mb-4"><Package className="w-3 h-3" /> Universal Shipment Tracking</span>
          <h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mb-3">Track any shipment by USTN</h2>
        </motion.div>
        <motion.div variants={fadeUp(0.1)} initial="hidden" whileInView="show" viewport={{ once: true }} className="glass-panel rounded-2xl p-6 sm:p-8">
          <form onSubmit={track_} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1"><Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={ustn} onChange={e => setUstn(e.target.value)} placeholder="SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4" className="w-full pl-10 pr-3 py-3 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm font-mono" /></div>
            <button type="submit" disabled={loading || !ustn.trim()} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 disabled:opacity-50">{loading ? "Tracking…" : "Track USTN"}{!loading && <Search className="w-4 h-4" />}</button>
          </form>
          {error && <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}
          {track && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-5 rounded-xl bg-background border border-border">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div><div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Shipment Status</div><div className="font-display text-lg font-bold">{typeof track.commodity === "string" ? track.commodity : (track.commodity?.description || "Shipment")}</div></div>
                <span className="text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold uppercase tracking-wider">{track.status?.replace(/_/g, " ")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-md bg-muted/40"><div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Exporter</div><div className="text-sm font-medium">{typeof track.exporter === "string" ? track.exporter : track.exporter?.legal_name || "—"}</div></div>
                <div className="p-3 rounded-md bg-muted/40"><div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Importer</div><div className="text-sm font-medium">{typeof track.importer === "string" ? track.importer : track.importer?.legal_name || "—"}</div></div>
                <div className="p-3 rounded-md bg-muted/40"><div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Current Location</div><div className="text-sm font-medium">{track.current_location || "—"}</div></div>
                <div className="p-3 rounded-md bg-muted/40"><div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> ETA</div><div className="text-sm font-medium">{track.eta?.replace("T", " ").replace("Z", " UTC") || "—"}</div></div>
              </div>
              {track.milestones?.length > 0 && (
                <div className="pt-4 border-t border-border/60"><div className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Milestone Timeline</div><div className="space-y-2">{track.milestones.map((m: any, i: number) => (<div key={i} className="flex items-center gap-3"><CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /><div className="flex-1 flex items-center justify-between"><span className="text-sm font-medium">{(m.milestone || m.label || m.description || "Milestone").replace(/_/g, " ")}</span><span className="text-xs text-muted-foreground font-mono">{(m.confirmed_at || m.completed_at || "")?.replace("T", " ").replace("Z", " UTC")}</span></div></div>))}</div></div>
              )}
              <div className="mt-4 pt-4 border-t border-border/60 text-[0.65rem] text-muted-foreground">Non-marketplace: No counterparty recommendations. No similar shipments.</div>
            </motion.div>
          )}
          {!track && !error && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">Try:</span>{["SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4"].map(u => <button key={u} onClick={() => setUstn(u)} className="px-2 py-1 rounded-md bg-muted hover:bg-muted/60 font-mono text-[0.65rem]">{u}</button>)}</div>}
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [{ n: 1, title: "Join", desc: "Register your entity — obtain your GTID. Complete KYB/KYC in 6 steps, zero cost.", icon: FileCheck }, { n: 2, title: "Execute", desc: "Initiate a trade — select counterparty, incoterm, commodities. Submit with one click.", icon: Zap }, { n: 3, title: "Track", desc: "Every trade is tracked via USTN. All documents, milestones, payments, and disputes are immutable.", icon: Search }];
  return (
    <section id="how-it-works" className="relative py-24 px-4 sm:px-6 lg:px-8 bg-muted/20">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp()} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-16"><span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary mb-4">How It Works</span><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Three steps to sovereign trade</h2></motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          {steps.map((s, i) => (
            <motion.div key={s.n} variants={fadeUp(i * 0.15)} initial="hidden" whileInView="show" viewport={{ once: true }} className="relative glass-panel rounded-2xl p-6 text-center">
              <div className="relative inline-flex items-center justify-center w-20 h-20 mx-auto mb-4"><div className="absolute inset-0 rounded-full bg-primary/10" /><div className="absolute inset-2 rounded-full bg-primary/5 border border-primary/20" /><s.icon className="relative w-8 h-8 text-primary" /><div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-gold-gradient text-sovereign text-xs font-bold flex items-center justify-center">{s.n}</div></div>
              <h3 className="font-display text-xl font-bold mb-2">{s.title}</h3><p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSignalsSection() {
  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp()} initial="hidden" whileInView="show" viewport={{ once: true }} className="text-center mb-16"><span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.65rem] font-medium tracking-widest uppercase border border-primary/30 bg-primary/5 text-primary mb-4">Trust Signals</span><h2 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">Built on principles, verified in production</h2></motion.div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TRUST_SIGNALS.map((t, i) => (
            <motion.div key={t.title} variants={fadeUp(i * 0.08)} initial="hidden" whileInView="show" viewport={{ once: true }} className="glass-panel rounded-2xl p-5">
              <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><t.icon className="w-5 h-5 text-primary" /></div><div><h3 className="font-semibold text-sm mb-1">{t.title}</h3><p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p></div></div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SgtxFooter() {
  const setView = useAppStore(s => s.setView);
  return (
    <footer className="relative bg-muted/30 border-t border-border/60 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-10">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3"><SgtxLogo size={36} animated animation="float" glow={false} /><div className="flex flex-col leading-none"><span className="font-display font-bold text-base"><span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span></span><span className="text-[0.55rem] tracking-[0.3em] text-muted-foreground uppercase mt-0.5">Sovereign Trade OS</span></div></div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">The Sovereign Trade Operating System. Non-custodial, AI-governed, cryptographically certain.</p>
            <div className="flex items-center gap-2 mt-4"><span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Non-Custodial</span><span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">AI-Governed</span><span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Sovereign</span></div>
          </div>
          {FOOTER_COLUMNS.map(col => (<div key={col.title}><h4 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-3">{col.title}</h4><ul className="space-y-2">{col.links.map(l => <li key={l}><a href="#" className="text-xs text-muted-foreground hover:text-primary transition-colors">{l}</a></li>)}</ul></div>))}
        </div>
        <div className="pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[0.7rem] text-muted-foreground">© 2026 SGTX — Sovereign Governed Trade Execution. All rights reserved.</p>
          <div className="flex items-center gap-3"><button onClick={() => setView("join")} className="text-[0.7rem] text-muted-foreground hover:text-primary">Join</button><button onClick={() => setView("auth")} className="text-[0.7rem] text-muted-foreground hover:text-primary">Login</button><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-primary"><ArrowUp className="w-3 h-3" /> Top</button></div>
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
        <HeroSection />
        <ValuePropsSection />
        <GtidResolutionModule />
        <UstnTrackingModule />
        <HowItWorksSection />
        <TrustSignalsSection />
      </main>
      <SgtxFooter />
    </div>
  );
}
