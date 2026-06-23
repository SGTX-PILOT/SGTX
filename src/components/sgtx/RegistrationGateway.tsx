"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, Building2, FileText, ShieldCheck, Settings2, Package, Rocket, CheckCircle2, Loader2, AlertCircle, Sparkles, Globe2, Languages, ChevronDown, Mail, MapPin, Search, Cpu } from "lucide-react";
import { SgtxLogo } from "./SgtxLogo";
import { useAppStore } from "@/store/app-store";
import { toast } from "sonner";
import { COUNTRY_REGISTRATION_DATA, getCountryEntityTypes, getCountryRequiredDocuments, type CountryEntityType } from "@/lib/sgtx/onboarding/countries";

type PlatformRole = "TRD" | "LSP" | "SHIP" | "LAB" | "QC" | "FIN" | "GOV" | "MP" | "CBR";
const PLATFORM_ROLES: { code: PlatformRole; label: string; desc: string }[] = [
  { code: "TRD", label: "Trader", desc: "Buy / sell commodities" },
  { code: "LSP", label: "Logistics Provider", desc: "Trucking, freight forwarding" },
  { code: "SHIP", label: "Shipping Line", desc: "Vessel, container loading" },
  { code: "LAB", label: "Laboratory", desc: "ISO 17025 testing, MRL" },
  { code: "QC", label: "Quality Control", desc: "Pre-shipment inspections" },
  { code: "CBR", label: "Customs Broker", desc: "Customs declarations" },
  { code: "FIN", label: "Financier", desc: "Bank / Private finance" },
  { code: "GOV", label: "Government", desc: "Customs, NFSA, CBE" },
  { code: "MP", label: "Marketplace Partner", desc: "Lead attribution, API" },
];

export function RegistrationGateway() {
  const setView = useAppStore(s => s.setView);
  const setLandingEntered = useAppStore(s => s.setLandingEntered);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [platformRole, setPlatformRole] = useState<PlatformRole>("TRD");
  const [country, setCountry] = useState("EG");
  const [legalName, setLegalName] = useState("");
  const [companyType, setCompanyType] = useState<string>("");
  const [contactEmail, setContactEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [orgDetails, setOrgDetails] = useState<Record<string, string>>({});
  const [kybDocsUploaded, setKybDocsUploaded] = useState<Record<string, boolean>>({});
  const [traderMode, setTraderMode] = useState<"BUY" | "SELL" | "DUAL">("DUAL");
  const [preferredLang, setPreferredLang] = useState("English");
  const [consents, setConsents] = useState({ marketing: false, analytics: true });
  const [commodities, setCommodities] = useState("");
  const [ports, setPorts] = useState("");
  const [sandboxStarted, setSandboxStarted] = useState(false);
  const [gtid, setGtid] = useState<string | null>(null);
  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const totalSteps = 6;
  const countryData = COUNTRY_REGISTRATION_DATA.find(c => c.code === country);
  const countryEntityTypes = countryData?.entityTypes || [];
  const countryRequiredDocs = countryData?.requiredDocuments || [];

  const startOnboarding = async () => {
    if (!legalName.trim()) { setError("Legal name required"); return; }
    if (!companyType) { setError("Please select a company type"); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/v1/onboarding/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity_type: platformRole, country, legal_name: legalName, company_type: companyType, company_type_label: countryEntityTypes.find(e => e.code === companyType)?.label }) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Failed to start onboarding"); return; }
      setGtid(data.gtid); setOnboardingToken(data.onboarding_token); setStep(2); toast.success(`GTID issued: ${data.gtid}`);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };
  const saveStep = async (stepNum: number, data: any) => {
    if (!onboardingToken) return false; setLoading(true); setError(null);
    try { const r = await fetch("/api/v1/onboarding/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboarding_token: onboardingToken, step: stepNum, data }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error || "Failed to save step"); return false; } return true;
    } catch (err: any) { setError(err.message); return false; } finally { setLoading(false); }
  };
  const completeOnboarding = async () => {
    if (!onboardingToken) return; setLoading(true); setError(null);
    try { const r = await fetch("/api/v1/onboarding/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboarding_token: onboardingToken }) });
      const data = await r.json(); if (!r.ok) { setError(data.error || "Failed to complete onboarding"); return; }
      toast.success(`Onboarding complete — ${gtid} is now VERIFIED`); setStep(7);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };
  const next = async () => {
    setError(null);
    if (step === 1) { await startOnboarding(); return; }
    if (step === 2) { const ok = await saveStep(2, { ...orgDetails, contactEmail, officeAddress }); if (ok) setStep(3); return; }
    if (step === 3) { const ok = await saveStep(3, { kybDocsUploaded }); if (ok) setStep(4); return; }
    if (step === 4) { const ok = await saveStep(4, { traderMode, preferredLang, consents }); if (ok) setStep(5); return; }
    if (step === 5) { const ok = await saveStep(5, { commodities, ports }); if (ok) setStep(6); return; }
    if (step === 6) { await completeOnboarding(); return; }
  };
  const prev = () => { setError(null); if (step > 1) setStep(step - 1); };
  const allCountries = COUNTRY_REGISTRATION_DATA.map(c => ({ code: c.code, name: c.name }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/40 px-6 py-4 flex items-center justify-between">
        <button onClick={() => setView("landing")} className="flex items-center gap-2.5">
          <SgtxLogo size={32} animated animation="pulse" glow={false} />
          <div className="flex flex-col leading-none"><span className="font-display font-bold text-base"><span className="text-silver-gradient">SGT</span><span className="text-gold-gradient">X</span></span><span className="text-[0.5rem] tracking-[0.25em] text-muted-foreground uppercase">Sovereign Trade OS</span></div>
        </button>
        <nav className="flex items-center gap-3 text-sm">
          <button onClick={() => setView("landing")} className="text-muted-foreground hover:text-foreground">Home</button>
          <button onClick={() => setView("auth")} className="text-muted-foreground hover:text-foreground">Login</button>
          <LanguageSelector />
        </nav>
      </header>
      <main className="flex-1 flex items-start justify-center p-6 sm:p-12">
        <div className="w-full max-w-3xl">
          <button onClick={() => step === 1 ? setView("landing") : prev()} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6"><ArrowLeft className="w-3.5 h-3.5" /> {step === 1 ? "Back to home" : "Previous step"}</button>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h1 className="font-display text-2xl font-bold">{step === 7 ? "Welcome to SGTX" : `Join SGTX — Step ${step} of ${totalSteps}`}</h1>
              {gtid && step > 1 && step < 7 && <span className="text-[0.65rem] font-mono px-2 py-1 rounded-md bg-primary/10 text-primary">{gtid}</span>}
            </div>
            {step < 7 && <div className="h-1.5 bg-muted rounded-full overflow-hidden"><motion.div className="h-full bg-gold-gradient" initial={{ width: 0 }} animate={{ width: `${(step / totalSteps) * 100}%` }} transition={{ duration: 0.4 }} /></div>}
          </div>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <StepCard key="s1" step={1} title="Welcome & GTID Confirmation" icon={Building2} aiHint="A1 — autocomplete">
                <div className="space-y-5">
                  <div><label className="text-xs font-medium mb-2 block">SGTX Platform Role</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{PLATFORM_ROLES.map(t => <button key={t.code} type="button" onClick={() => setPlatformRole(t.code)} className={`p-3 rounded-lg border text-left transition-all ${platformRole === t.code ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}><div className="text-xs font-bold">{t.code}</div><div className="text-xs">{t.label}</div><div className="text-[0.65rem] text-muted-foreground mt-0.5">{t.desc}</div></button>)}</div></div>
                  <CountrySelector value={country} onChange={setCountry} countries={allCountries} />
                  <div><label className="text-xs font-medium mb-2 block">Company Type <span className="text-muted-foreground font-normal">({countryData?.name} legal entity types)</span></label><div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{countryEntityTypes.map(e => <button key={e.code} type="button" onClick={() => setCompanyType(e.code)} className={`p-3 rounded-lg border text-left transition-all ${companyType === e.code ? "border-primary bg-primary/10" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}><div className="text-xs font-bold font-mono">{e.code}</div><div className="text-xs font-medium">{e.label}</div><div className="text-[0.65rem] text-muted-foreground mt-0.5">{e.description}</div></button>)}</div></div>
                  <div><label className="text-xs font-medium mb-1.5 block">Legal Name</label><input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Strawberry Export Co." className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /></div>
                </div>
              </StepCard>
            )}
            {step === 2 && (
              <StepCard key="s2" step={2} title="Organization Details" icon={FileText} aiHint="A2 — HF Donut extraction">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-3">Enter the registration numbers for your company in <strong className="text-foreground">{countryData?.name}</strong>.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 flex items-center justify-between">
                    <div><div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Company Type</div><div className="text-sm font-medium">{countryEntityTypes.find(e => e.code === companyType)?.label || companyType}</div></div>
                    <div className="text-right"><div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">Country</div><div className="text-sm font-medium">{countryData?.name} ({country})</div></div>
                  </div>
                  <div><label className="text-xs font-medium mb-1.5 block">Contact Email <span className="text-destructive">*</span></label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="info@company.com" className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /></div></div>
                  <div><label className="text-xs font-medium mb-1.5 block">Office Address <span className="text-destructive">*</span></label><div className="relative"><MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder="Industrial Zone, Alexandria, Egypt" className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /></div></div>
                  {countryRequiredDocs.map(doc => <div key={doc.key}><label className="text-xs font-medium mb-1.5 block">{doc.label}{doc.mandatory ? " *" : " (optional)"}</label><input value={orgDetails[doc.key] || ""} onChange={e => setOrgDetails({ ...orgDetails, [doc.key]: e.target.value })} placeholder={doc.description} className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /></div>)}
                </div>
              </StepCard>
            )}
            {step === 3 && (
              <StepCard key="s3" step={3} title="KYB / KYC Verification" icon={ShieldCheck} aiHint="A2 — HF Donut + registry cross-check">
                <div className="space-y-3"><p className="text-sm text-muted-foreground mb-3">Upload the following documents required for <strong className="text-foreground">{countryData?.name}</strong>.</p>
                  {countryRequiredDocs.map(doc => { const uploaded = kybDocsUploaded[doc.key] || false; return (
                    <label key={doc.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors">
                      <div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${uploaded ? "bg-emerald-500/20" : "bg-muted"}`}>{uploaded ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <FileText className="w-4 h-4 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><div className="text-sm font-medium flex items-center gap-1.5">{doc.label}{doc.mandatory ? <span className="text-[0.55rem] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">REQUIRED</span> : <span className="text-[0.55rem] px-1.5 py-0.5 rounded bg-muted-foreground/10 text-muted-foreground">OPTIONAL</span>}</div><div className="text-[0.7rem] text-muted-foreground truncate">{doc.description}</div></div></div>
                      <input type="checkbox" checked={uploaded} onChange={e => setKybDocsUploaded({ ...kybDocsUploaded, [doc.key]: e.target.checked })} />
                    </label>
                  ); })}
                </div>
              </StepCard>
            )}
            {step === 4 && (
              <StepCard key="s4" step={4} title="Profile Configuration" icon={Settings2} aiHint="A1 — pre-selects">
                <div className="space-y-4">
                  <div><label className="text-xs font-medium mb-2 block">Trader Mode</label><div className="grid grid-cols-3 gap-2">{(["BUY", "SELL", "DUAL"] as const).map(m => <button key={m} type="button" onClick={() => setTraderMode(m)} className={`py-2 rounded-lg border text-xs font-medium ${traderMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>{m === "BUY" ? "Buyer" : m === "SELL" ? "Seller" : "Dual-Mode"}</button>)}</div></div>
                  <div><label className="text-xs font-medium mb-1.5 block">Preferred Language</label><input value={preferredLang} onChange={e => setPreferredLang(e.target.value)} placeholder="English" className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm" /></div>
                  <div className="space-y-2">{[["marketing", "Marketing communications", "Product updates, announcements"] as const, ["analytics", "Analytics", "Help improve SGTX (anonymous)"] as const].map(([key, title, desc]) => <label key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 cursor-pointer"><div><div className="text-sm font-medium">{title}</div><div className="text-[0.7rem] text-muted-foreground">{desc}</div></div><input type="checkbox" checked={consents[key as keyof typeof consents]} onChange={e => setConsents({ ...consents, [key]: e.target.checked })} /></label>)}</div>
                </div>
              </StepCard>
            )}
            {step === 5 && (
              <StepCard key="s5" step={5} title="Create First Resource (optional)" icon={Package} aiHint="A1 — suggests defaults">
                <div className="space-y-4">
                  <div><label className="text-xs font-medium mb-1.5 block">Commodity List</label><textarea value={commodities} onChange={e => setCommodities(e.target.value)} placeholder="Frozen Strawberries, Fresh Oranges, Mangoes…" rows={3} className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm resize-none" /></div>
                  <div><label className="text-xs font-medium mb-1.5 block">Port List</label><textarea value={ports} onChange={e => setPorts(e.target.value)} placeholder="Alexandria (EGALX), Hamburg (DEHAM)…" rows={3} className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm resize-none" /></div>
                </div>
              </StepCard>
            )}
            {step === 6 && (
              <StepCard key="s6" step={6} title="Enter Sandbox" icon={Rocket} aiHint="A1 — tooltips and walkthrough">
                <div className="space-y-4"><p className="text-sm text-muted-foreground">Practice a trade in an isolated sandbox environment. No real counterparties, no real funds — just a guided walkthrough of the full SGTX workflow.</p>
                  <div className="p-5 rounded-xl bg-primary/5 border border-primary/20"><div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center"><Rocket className="w-5 h-5 text-primary" /></div><div><div className="font-semibold text-sm">Sandbox Practice Trade</div><div className="text-[0.7rem] text-muted-foreground">Guided by A1 AI tooltips</div></div></div>
                    <ul className="text-xs space-y-1.5 text-muted-foreground">{["Issue a trade request", "Submit a quote", "Lock contract (QES)", "Confirm milestones", "Settle payment (FeeLock)"].map((t, i) => <li key={i} className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> {t}</li>)}</ul>
                  </div>
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 cursor-pointer"><input type="checkbox" checked={sandboxStarted} onChange={e => setSandboxStarted(e.target.checked)} /><span className="text-sm">I acknowledge the sandbox is for practice only and want to proceed to Go Live.</span></label>
                </div>
              </StepCard>
            )}
            {step === 7 && (
              <motion.div key="s7" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, delay: 0.2 }} className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 mb-6"><CheckCircle2 className="w-10 h-10 text-emerald-600" /></motion.div>
                <h2 className="font-display text-2xl font-bold mb-2">Onboarding Complete</h2>
                <p className="text-sm text-muted-foreground mb-6">Your tenant is now VERIFIED and ready to trade.</p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 mb-8"><Sparkles className="w-4 h-4 text-primary" /><span className="text-xs font-mono">{gtid}</span></div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={() => { setLandingEntered(true); setView("launcher"); }} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90">Enter Platform <ArrowRight className="w-4 h-4" /></button>
                  <button onClick={() => setView("landing")} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border text-sm font-medium hover:bg-muted/40">Back to Home</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"><AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span></div>}
          {step < 7 && (
            <div className="mt-8 flex items-center justify-between">
              <button onClick={prev} disabled={step === 1 || loading} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Previous</button>
              <button onClick={next} disabled={loading || (step === 1 && !legalName.trim())} className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-gold-gradient text-sovereign font-semibold text-sm hover:opacity-90 disabled:opacity-50">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{step === 6 ? "Go Live" : "Continue"}<ArrowRight className="w-4 h-4" /></>}</button>
            </div>
          )}
          {step < 7 && <p className="mt-6 text-center text-[0.65rem] text-muted-foreground"><Cpu className="w-3 h-3 inline mr-1" />One-click guarantee: each step is a single click. The entire onboarding process is ~6 clicks (excluding data entry). Zero-cost commitment — no billing details ever required.</p>}
        </div>
      </main>
    </div>
  );
}

function StepCard({ step, title, icon: Icon, aiHint, children }: { step: number; title: string; icon: any; aiHint?: string; children: React.ReactNode }) {
  return (<motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.3 }} className="glass-panel rounded-2xl p-6 sm:p-8">
    <div className="flex items-start justify-between mb-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="w-5 h-5 text-primary" /></div><div><div className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">Step {step}</div><h2 className="font-display text-lg font-bold">{title}</h2></div></div>{aiHint && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/5 border border-primary/20 text-[0.6rem] text-primary"><Sparkles className="w-3 h-3" /> {aiHint}</span>}</div>
    {children}
  </motion.div>);
}

function CountrySelector({ value, onChange, countries }: { value: string; onChange: (v: string) => void; countries: { code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = countries.filter(c => c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()));
  const selected = countries.find(c => c.code === value);
  useEffect(() => { if (open) { const t = setTimeout(() => setSearch(""), 0); return () => clearTimeout(t); } }, [open]);
  return (<div><label className="text-xs font-medium mb-1.5 block">Country of Operation <span className="text-muted-foreground font-normal">({countries.length} countries)</span></label>
    <button type="button" onClick={() => setOpen(v => !v)} className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-background border border-border focus:border-primary/50 outline-none text-sm text-left flex items-center justify-between relative">
      <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <span className="flex items-center gap-2"><span className="font-mono text-[0.7rem] text-muted-foreground">{value}</span><span>{selected?.name || "Select country"}</span></span>
      <ChevronDown className="w-4 h-4 text-muted-foreground" />
    </button>
    {open && <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden max-w-md">
      <div className="p-2 border-b border-border/60 relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search countries…" className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/40 rounded-md outline-none border border-transparent focus:border-primary/30" /></div>
      <div className="max-h-64 overflow-y-auto scroll-gold">{filtered.length === 0 ? <div className="p-4 text-center text-xs text-muted-foreground">No countries match "{search}"</div> : filtered.map(c => <button key={c.code} type="button" onClick={() => { onChange(c.code); setOpen(false); }} className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-muted/60 ${c.code === value ? "bg-primary/10 text-primary" : ""}`}><span className="flex items-center gap-2"><span className="font-mono text-[0.65rem] text-muted-foreground w-7">{c.code}</span><span>{c.name}</span></span>{c.code === value && <CheckCircle2 className="w-3.5 h-3.5" />}</button>)}</div>
      <div className="p-2 border-t border-border/60 text-[0.6rem] text-muted-foreground text-center">{filtered.length} of {countries.length} countries</div>
    </div>}</div>);
}

function LanguageSelector() {
  const [open, setOpen] = useState(false); const [lang, setLang] = useState("English");
  const langs = ["English", "العربية", "Deutsch", "Tiếng Việt", "Français"];
  return (<div className="relative"><button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Languages className="w-3.5 h-3.5" /><span className="hidden sm:inline">{lang}</span><ChevronDown className="w-3 h-3" /></button>
    {open && <div className="absolute right-0 top-full mt-1 w-32 bg-card border border-border rounded-md shadow-lg p-1 z-50">{langs.map(l => <button key={l} onClick={() => { setLang(l); setOpen(false); }} className={`w-full text-left px-2 py-1.5 text-xs rounded ${l === lang ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>{l}</button>)}</div>}</div>);
}
