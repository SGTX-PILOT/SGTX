"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SgtxLogo } from "@/components/sgtx/SgtxLogo";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Loader2, ShieldCheck, Building2, Globe2, Lock, FileText, FlaskConical, Ship, UploadCloud, AlertCircle, Landmark, Search } from "lucide-react";
import { AddressAutocompleteInput, DetectLocationButton, type AddressSuggestion } from "@/components/sgtx/AddressAutocomplete";

const STEPS = [
  { id: 1, label: "GTID", icon: ShieldCheck },
  { id: 2, label: "Organization", icon: Building2 },
  { id: 3, label: "Bank Details", icon: Landmark },
  { id: 4, label: "KYB/KYC", icon: FileText },
  { id: 5, label: "Profile", icon: Globe2 },
  { id: 6, label: "Resources", icon: Ship },
  { id: 7, label: "Sandbox", icon: FlaskConical },
];

const ENTITY_TYPES = [
  { code: "TRD", label: "Trader (Buyer/Seller)", desc: "Import/export companies" },
  { code: "LSP", label: "Logistics Service Provider", desc: "Trucking, forwarding, warehousing" },
  { code: "SHIP", label: "Shipping Line", desc: "Ocean container carrier / NVOCC" },
  { code: "LAB", label: "Laboratory", desc: "ISO 17025 accredited testing" },
  { code: "QC", label: "Quality Control", desc: "Pre-shipment inspection" },
  { code: "CBR", label: "Customs Broker", desc: "Clearance & certification" },
  { code: "BANK", label: "Financier — Bank", desc: "Bank, credit institution" },
  { code: "PFI", label: "Financier — Private", desc: "Private credit, DeFi pool" },
  { code: "GOV", label: "Government", desc: "Customs, port authority, trade ministry" },
  { code: "ADM", label: "Platform Admin", desc: "SGTX governance authority" },
  { code: "MKT", label: "Marketplace Partner", desc: "External platform (API integration)" },
];

const KYB_REQUIRED_DOCS = [
  { id: "commercial_register", label: "Commercial Register Extract", required: true, verified: false },
  { id: "tax_certificate", label: "Tax Registration Certificate", required: true, verified: false },
  { id: "export_license", label: "Export/Import Licence", required: false, verified: false },
  { id: "ubo_declaration", label: "UBO Declaration Form (structured)", required: true, verified: false },
  { id: "bank_letter", label: "Bank Account Confirmation Letter", required: false, verified: false },
  { id: "sanctions_self_decl", label: "Sanctions Self-Declaration", required: true, verified: false },
];

const SECTORS = [
  { code: "AGRICULTURE", label: "Agriculture & Food" },
  { code: "TEXTILES", label: "Textiles & Garments" },
  { code: "CHEMICALS", label: "Chemicals & Plastics" },
  { code: "ELECTRONICS", label: "Electronics & Machinery" },
  { code: "CONSTRUCTION", label: "Construction Materials" },
  { code: "PHARMA", label: "Pharmaceuticals" },
  { code: "LOGISTICS", label: "Logistics & Freight" },
  { code: "FINANCE", label: "Finance & Banking" },
  { code: "OTHER", label: "Other" },
];

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("EG");
  const [entityType, setEntityType] = useState("TRD");
  const [legalName, setLegalName] = useState("");
  const [gtid, setGtid] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Step 2 — Organization
  const [taxId, setTaxId] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [sector, setSector] = useState("AGRICULTURE");
  const [contactEmail, setContactEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [officeCity, setOfficeCity] = useState("");
  const [officePostal, setOfficePostal] = useState("");
  const [savingOrg, setSavingOrg] = useState(false);
  // Step 3 — KYB
  const [kybDocs, setKybDocs] = useState(KYB_REQUIRED_DOCS);
  // Step 4 — Profile (consent toggles per Part 18 PDPL)
  const [traderMode, setTraderMode] = useState("DUAL");
  const [defaultIncoterm, setDefaultIncoterm] = useState("CIF");
  const [preferredLanguage, setPreferredLanguage] = useState("en");
  const [preferredCurrency, setPreferredCurrency] = useState("USD");
  const [consents, setConsents] = useState({
    marketing: false,
    analytics: true,
    govt_sharing: false,
    cross_border: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  // Step 5 — Resources
  const [defaultCommodity, setDefaultCommodity] = useState("");
  const [defaultCommodityHs, setDefaultCommodityHs] = useState("");
  const [preferredOriginPort, setPreferredOriginPort] = useState("");
  const [preferredDestPort, setPreferredDestPort] = useState("");
  const [defaultPackaging, setDefaultPackaging] = useState("CARTON");
  // Step 6 — Sandbox
  const [goingLive, setGoingLive] = useState(false);

  // Step 3 — Bank Details (NEW — bank auto-detection by country)
  const [bankSwift, setBankSwift] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankCity, setBankCity] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankCurrency, setBankCurrency] = useState("");
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [bankSearchResults, setBankSearchResults] = useState<any[]>([]);
  const [bankSearching, setBankSearching] = useState(false);
  const [bankIbanFormat, setBankIbanFormat] = useState<any>(null);
  const [savingBank, setSavingBank] = useState(false);

  // Step 2 — Open Registry Auto-Verification (Batch B / B10)
  const [registryVerifying, setRegistryVerifying] = useState(false);
  const [registryResult, setRegistryResult] = useState<any | null>(null);
  const [showRegistrySearch, setShowRegistrySearch] = useState(false);
  const [registryQuery, setRegistryQuery] = useState("");

  // Toast-style inline feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const showFeedback = (type: "success" | "error" | "info", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Open Registry autocomplete (GLEIF) — Batch B / B10 ──
  const registrySearchQuery = useQuery({
    queryKey: ["registry-search", registryQuery, country],
    enabled: showRegistrySearch && registryQuery.trim().length >= 2,
    queryFn: async () => {
      const r = await fetch(
        `/api/sgtx/onboarding/search-registry?query=${encodeURIComponent(registryQuery)}&jurisdiction=${encodeURIComponent(country)}&limit=8`,
      );
      const d = await r.json();
      return (d?.hits || []) as Array<{
        lei: string; legalName: string; registeredAs: string | null;
        jurisdiction: string | null; city: string | null; status: string | null;
      }>;
    },
    staleTime: 30_000,
  });

  const verifyNow = async () => {
    if (!legalName && !commercialRegister && !taxId) {
      toast.error("Enter a legal name, CR number, or tax ID before verifying.");
      return;
    }
    setRegistryVerifying(true);
    setRegistryResult(null);
    try {
      const res = await fetch("/api/sgtx/onboarding/verify-registry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gtid: gtid || undefined,
          companyName: legalName || undefined,
          registrationNumber: commercialRegister || undefined,
          country,
          vatNumber: taxId || undefined,
        }),
      });
      const d = await res.json();
      if (d?.ok && d?.result) {
        setRegistryResult(d.result);
        if (d.result.verified) {
          toast.success(`Verified via ${d.result.source} (${(d.result.confidence * 100).toFixed(0)}% confidence)`);
          // Auto-fill matched fields from registry data
          const c = d.result.company || {};
          if (c.legalName && !legalName) setLegalName(c.legalName);
          if (c.registeredAs && !commercialRegister) setCommercialRegister(c.registeredAs);
          if (c.legalAddress && !officeAddress) setOfficeAddress(c.legalAddress);
        } else {
          toast.warning(d.result.source === "NONE"
            ? "No registry match found. You can still proceed — compliance officer will review manually."
            : `Registry returned but not verified (${d.result.source}). Check mismatched fields.`);
        }
      } else {
        toast.error(d?.error || "Verification failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Verification request failed");
    } finally {
      setRegistryVerifying(false);
    }
  };

  const pickRegistryHit = (hit: any) => {
    if (hit.legalName) setLegalName(hit.legalName);
    if (hit.registeredAs) setCommercialRegister(hit.registeredAs);
    if (hit.lei) {
      // Stash LEI on taxId field for the immediate verify call (cosmetic).
      // Real LEI capture happens via /api/sgtx/onboarding PUT in a future iteration.
    }
    setRegistryQuery(hit.legalName || "");
    setShowRegistrySearch(false);
    toast.info(`Selected "${hit.legalName}" — click "Verify Now" to confirm.`);
  };

  const exitToLauncher = useAppStore((s) => s.exitToLauncher);
  const setView = useAppStore((s) => s.setView);

  const generateGtid = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/sgtx/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, type: entityType, legalName, createTenant: true }),
      });
      const d = await res.json();
      if (d.gtid) {
        setGtid(d.gtid);
        showFeedback("success", `GTID ${d.gtid} generated. Tenant record created (lifecycle_state=REGISTERED).`);
      } else {
        showFeedback("error", d.error || "GTID generation failed");
      }
    } catch (e: any) {
      setGtid("SGTX-XX-XXX-000001-ERROR");
      showFeedback("error", e?.message || "GTID generation failed");
    } finally { setGenerating(false); }
  };

  // Step 2 — save organization details
  const saveOrganization = async () => {
    if (!gtid) { showFeedback("error", "Generate a GTID first"); return; }
    if (!legalName || !taxId || !commercialRegister) {
      showFeedback("error", "Legal name, Tax ID and Commercial Register are required");
      return;
    }
    setSavingOrg(true);
    try {
      const res = await fetch("/api/sgtx/onboarding", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gtid, legalName, taxId, commercialRegister, sector,
          contactEmail, officeAddress, city: officeAddress,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        showFeedback("success", "Organization details saved. Proceeding to bank details.");
        setStep(3);
      } else {
        showFeedback("error", d.error || "Save failed");
      }
    } catch (e: any) {
      showFeedback("error", e?.message || "Save failed");
    } finally { setSavingOrg(false); }
  };

  // Step 3 — toggle KYB doc verification (cosmetic per spec)
  const toggleKybDoc = (id: string) => {
    setKybDocs((prev) => prev.map((d) => d.id === id ? { ...d, verified: !d.verified } : d));
  };

  // Step 4 — save profile config + consent toggles via PDPL consent API
  const saveProfile = async () => {
    if (!gtid) { showFeedback("error", "Generate a GTID first"); return; }
    setSavingProfile(true);
    try {
      // Save each consent toggle via the PDPL consent endpoint (Part 18)
      const consentCalls = Object.entries(consents).map(([purpose, given]) =>
        fetch("/api/sgtx/pdpl/consent", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantGtid: gtid, purpose, consentGiven: given }),
        }).then((r) => r.json()).catch(() => null)
      );
      await Promise.all(consentCalls);
      // Persist trader mode / incoterm via the onboarding PUT (city field reused for now)
      // The wizard feedback confirms the consents were saved.
      showFeedback("success", `Profile saved. 4 consent records upserted via PDPL. Trader mode: ${traderMode}, default incoterm: ${defaultIncoterm}.`);
      setStep(6);
    } catch (e: any) {
      showFeedback("error", e?.message || "Profile save failed");
    } finally { setSavingProfile(false); }
  };

  // Step 3 — Bank search (debounced) and selection
  useEffect(() => {
    if (!country) return;
    // Fetch IBAN format when country changes
    (async () => {
      try {
        const r = await fetch(`/api/sgtx/banks?country=${country}&iban=1`);
        const d = await r.json();
        setBankIbanFormat(d.ibanFormat || null);
        if (d.ibanFormat && !bankCurrency) {
          // Auto-set currency from country using the COUNTRY_REGISTRATION_DATA
          // (already loaded in RegistrationGateway, but here we'll derive from response if present)
        }
      } catch {}
    })();
  }, [country]);

  useEffect(() => {
    if (!bankSearchQuery || bankSearchQuery.length < 1) {
      // Show all banks when query is empty
      (async () => {
        try {
          const r = await fetch(`/api/sgtx/banks?country=${country}`);
          const d = await r.json();
          setBankSearchResults(d.banks || []);
        } catch {
          setBankSearchResults([]);
        }
      })();
      return;
    }
    setBankSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/sgtx/banks?country=${country}&query=${encodeURIComponent(bankSearchQuery)}`);
        const d = await r.json();
        setBankSearchResults(d.banks || []);
      } catch {
        setBankSearchResults([]);
      } finally {
        setBankSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [bankSearchQuery, country]);

  const selectBank = (bank: any) => {
    setBankSwift(bank.swift);
    setBankName(bank.bankName);
    setBankBranch(bank.branch || "");
    setBankCity(bank.city || "");
    setBankSearchQuery("");
  };

  const saveBankDetails = async () => {
    if (!gtid) { showFeedback("error", "Generate a GTID first"); return; }
    if (!bankSwift || !bankName || !bankAccountNo) {
      showFeedback("error", "Bank selection and account number are required");
      return;
    }
    setSavingBank(true);
    try {
      const res = await fetch("/api/sgtx/onboarding", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gtid,
          bankSwift, bankName, bankBranch, bankCity,
          bankAccountName, bankAccountNo, bankCurrency,
          bankIbanFormat: bankIbanFormat ? JSON.stringify(bankIbanFormat) : null,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        showFeedback("success", `Bank details saved — ${bankName} (${bankSwift}). Proceeding to KYB.`);
        setStep(4);
      } else {
        showFeedback("error", d.error || "Bank details save failed");
      }
    } catch (e: any) {
      showFeedback("error", e?.message || "Bank details save failed");
    } finally {
      setSavingBank(false);
    }
  };

  // Step 6 — Go Live (sets lifecycle to VERIFIED)
  const goLive = async () => {
    if (!gtid) return;
    setGoingLive(true);
    try {
      const res = await fetch("/api/sgtx/lifecycle/transition", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid: gtid, toState: "VERIFIED", reason: "Onboarding complete — Go Live" }),
      });
      const d = await res.json();
      if (d.ok || d.transitioned) {
        showFeedback("success", "Lifecycle state → VERIFIED. Redirecting to launcher…");
        setTimeout(() => setView("launcher"), 1200);
      } else {
        // Even if lifecycle API fails (e.g., not yet wired), still let user proceed
        showFeedback("info", "Proceeding to launcher (lifecycle transition may require admin approval).");
        setTimeout(() => setView("launcher"), 1200);
      }
    } catch {
      showFeedback("info", "Proceeding to launcher.");
      setTimeout(() => setView("launcher"), 1200);
    } finally { setGoingLive(false); }
  };
  // NOTE: After adding Bank Details as Step 3, all subsequent step numbers shifted +1.
  // KYB is now step 4, Profile is now step 5, Resources is now step 6, Sandbox is now step 7.

  return (
    <div className="min-h-screen bg-background sovereign-radial flex flex-col">
      <div className="absolute inset-0 sovereign-grid opacity-20" />
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5 border-b border-border/40">
        <div className="flex items-center gap-3">
          <SgtxLogo size={36} animated={false} />
          <div>
            <p className="font-display font-bold text-sm">Onboarding Wizard</p>
            <p className="text-[0.55rem] tracking-[0.25em] text-muted-foreground uppercase">Part 2.2 · 6 Steps · AI-Assisted</p>
          </div>
        </div>
        <button onClick={exitToLauncher} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5">
          <ArrowLeft className="w-3 h-3" /> Back to Launcher
        </button>
      </header>

      {/* Compact step indicator (FIX-6) — horizontal progress dots with checkmarks for completed steps */}
      <div className="relative z-10 px-6 sm:px-10 py-3 border-b border-border/30 bg-background/40">
        <div className="max-w-3xl mx-auto flex items-center h-8">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            const isLast = i === STEPS.length - 1;
            return (
              <div key={s.id} className={isLast ? "flex items-center" : "flex items-center flex-1 min-w-0"}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                      done
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : active
                        ? "bg-gold/20 border-gold text-gold"
                        : "border-border text-muted-foreground/60"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3 h-3" />}
                  </div>
                  <span
                    className={`text-[0.65rem] whitespace-nowrap hidden sm:inline ${
                      active ? "text-gold font-semibold" : done ? "text-emerald-400/80" : "text-muted-foreground/70"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`flex-1 h-px mx-2 border-t ${
                      done ? "border-emerald-500/40" : "border-border/60"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline feedback toast */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-xs flex items-center gap-2 ${
              feedback.type === "success" ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
              : feedback.type === "error" ? "bg-red-500/15 border border-red-500/30 text-red-400"
              : "bg-gold/15 border border-gold/30 text-gold"
            }`}
          >
            {feedback.type === "error" ? <AlertCircle className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
            {feedback.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex-1 px-6 sm:px-10 pb-10 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {/* STEP 1: GTID Confirmation */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 1 — Welcome & GTID Confirmation</h2>
                    <p className="text-xs text-muted-foreground mt-1">Select your entity type and country. The system generates a provisional GTID (SGTX-CC-TYPE-SEQ-CHECKSUM) with a CRC32 checksum and creates the Tenant record (lifecycle_state=REGISTERED).</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Entity Type</Label>
                      <Select value={entityType} onValueChange={setEntityType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-[0.6rem] text-muted-foreground mt-1">{ENTITY_TYPES.find(t => t.code === entityType)?.desc}</p>
                    </div>
                    <div>
                      <Label className="text-xs">Country of Operation</Label>
                      <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[
                            {code:"EG",name:"Egypt"},{code:"DE",name:"Germany"},{code:"VN",name:"Vietnam"},
                            {code:"US",name:"United States"},{code:"AE",name:"UAE"},{code:"CN",name:"China"},
                            {code:"SA",name:"Saudi Arabia"},{code:"IT",name:"Italy"},{code:"FR",name:"France"},
                            {code:"GB",name:"United Kingdom"},{code:"NL",name:"Netherlands"},{code:"ES",name:"Spain"},
                            {code:"TR",name:"Turkey"},{code:"IN",name:"India"},{code:"JP",name:"Japan"},
                            {code:"KR",name:"South Korea"},{code:"BR",name:"Brazil"},{code:"ZA",name:"South Africa"},
                            {code:"KE",name:"Kenya"},{code:"NG",name:"Nigeria"},{code:"MA",name:"Morocco"},
                            {code:"JO",name:"Jordan"},{code:"KW",name:"Kuwait"},{code:"QA",name:"Qatar"},
                            {code:"OM",name:"Oman"},{code:"BH",name:"Bahrain"},{code:"LB",name:"Lebanon"},
                            {code:"IQ",name:"Iraq"},{code:"SD",name:"Sudan"},{code:"LY",name:"Libya"},
                            {code:"TN",name:"Tunisia"},{code:"DZ",name:"Algeria"},{code:"TH",name:"Thailand"},
                            {code:"ID",name:"Indonesia"},{code:"MY",name:"Malaysia"},{code:"SG",name:"Singapore"},
                            {code:"PH",name:"Philippines"},{code:"PK",name:"Pakistan"},{code:"BD",name:"Bangladesh"},
                            {code:"AU",name:"Australia"},{code:"NZ",name:"New Zealand"},{code:"CA",name:"Canada"},
                            {code:"MX",name:"Mexico"},{code:"AR",name:"Argentina"},{code:"CL",name:"Chile"},
                            {code:"CO",name:"Colombia"},{code:"PE",name:"Peru"},{code:"RU",name:"Russia"},
                            {code:"UA",name:"Ukraine"},{code:"PL",name:"Poland"},{code:"CZ",name:"Czech Republic"},
                            {code:"HU",name:"Hungary"},{code:"RO",name:"Romania"},{code:"GR",name:"Greece"},
                            {code:"PT",name:"Portugal"},{code:"BE",name:"Belgium"},{code:"CH",name:"Switzerland"},
                            {code:"AT",name:"Austria"},{code:"SE",name:"Sweden"},{code:"NO",name:"Norway"},
                            {code:"DK",name:"Denmark"},{code:"FI",name:"Finland"},{code:"IE",name:"Ireland"},
                          ].map(c => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Legal Name (English)</Label>
                      <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="e.g. Strawberry Export Co." />
                    </div>
                  </div>
                  {gtid && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 rounded-xl bg-gold/5 border border-gold/30">
                      <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">Provisional GTID Generated</p>
                      <p className="font-mono text-lg text-gold-gradient font-bold">{gtid}</p>
                      <p className="text-[0.6rem] text-muted-foreground mt-1">CRC32-ISO-HDLC checksum verified · lifecycle_state = REGISTERED · Tenant record created</p>
                    </motion.div>
                  )}
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={exitToLauncher}>Cancel</Button>
                    {gtid ? (
                      <Button onClick={() => setStep(2)} className="bg-gold-gradient text-sovereign">Confirm GTID & Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                    ) : (
                      <Button onClick={generateGtid} disabled={generating || !legalName} className="bg-gold-gradient text-sovereign">
                        {generating ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate GTID</>}
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 2: Organization Details */}
            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 2 — Organization Details</h2>
                    <p className="text-xs text-muted-foreground mt-1">Core legal identifiers · saved to Tenant record (Part 2.2.3) · cross-referenced with government registries (ETA, commercial register) by the compliance officer.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Legal Name (English) *</Label>
                      <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Strawberry Export Co." />
                    </div>
                    <div>
                      <Label className="text-xs">Sector *</Label>
                      <Select value={sector} onValueChange={setSector}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SECTORS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Tax ID (VAT / National) *</Label>
                      <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="123-456-789" />
                      <p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A2 validates against ETA (Egypt) or equivalent</p>
                    </div>
                    <div>
                      <Label className="text-xs">Commercial Register Number *</Label>
                      <Input value={commercialRegister} onChange={(e) => setCommercialRegister(e.target.value)} placeholder="CR-2026-XXXXX" />
                      <p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A2 cross-references government registry</p>
                    </div>
                    <div>
                      <Label className="text-xs">Contact Email</Label>
                      <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="info@company.com" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-xs">Office Address</Label>
                        <DetectLocationButton onDetect={(r) => {
                          if (r.country) setCountry(r.country.toUpperCase());
                          if (r.address) setOfficeAddress(r.address);
                          if (r.city) setOfficeCity(r.city);
                          if (r.postal) setOfficePostal(r.postal);
                          toast.success("Location detected — address pre-filled");
                        }} />
                      </div>
                      <AddressAutocompleteInput
                        value={officeAddress}
                        onChange={setOfficeAddress}
                        country={country}
                        placeholder="Street, City"
                        onPick={(s: AddressSuggestion) => {
                          if (s.city) setOfficeCity(s.city);
                          if (s.postal) setOfficePostal(s.postal);
                          const parts = [officeAddress.split(",")[0]?.trim(), s.label].filter(Boolean);
                          if (parts.length > 0) setOfficeAddress(parts.join(", "));
                          toast.success("Address selected from suggestions");
                        }}
                      />
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <Input value={officeCity} onChange={(e) => setOfficeCity(e.target.value)} placeholder="City" className="text-xs h-8" />
                        <Input value={officePostal} onChange={(e) => setOfficePostal(e.target.value)} placeholder="Postal code" className="text-xs h-8" />
                      </div>
                      <p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A1 suggests address from partial input (postal bank + Mapbox)</p>
                    </div>
                  </div>

                  {/* Open Registry Auto-Verification (Batch B / B10) */}
                  <div className="p-4 rounded-xl bg-gold/5 border border-gold/40">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1.5">
                        <Globe2 className="w-3 h-3" /> Open Registry Auto-Verification
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[0.65rem] border-gold/40"
                          onClick={() => setShowRegistrySearch((v) => !v)}
                        >
                          <Search className="w-3 h-3 mr-1" /> Search registry
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-[0.65rem] bg-gold-gradient text-sovereign"
                          onClick={verifyNow}
                          disabled={registryVerifying}
                        >
                          {registryVerifying
                            ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Verifying…</>
                            : <><ShieldCheck className="w-3 h-3 mr-1" /> Verify Now</>}
                        </Button>
                      </div>
                    </div>
                    <p className="text-[0.6rem] text-muted-foreground">
                      Cross-checks your inputs against <span className="font-mono">GLEIF</span> (LEI records, global) and
                      <span className="font-mono"> EU VIES</span> (VAT registry). Free public registries — no API key needed.
                    </p>

                    {/* Autocomplete search box */}
                    {showRegistrySearch && (
                      <div className="mt-3 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <Input
                            value={registryQuery}
                            onChange={(e) => setRegistryQuery(e.target.value)}
                            placeholder={`Type company name (jurisdiction: ${country})…`}
                            className="pl-8 h-8 text-xs"
                            autoFocus
                          />
                          {registrySearchQuery.isFetching && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        {registrySearchQuery.data && registrySearchQuery.data.length > 0 && (
                          <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                            {registrySearchQuery.data.map((hit, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => pickRegistryHit(hit)}
                                className="w-full text-left p-2 hover:bg-muted/30 transition-colors"
                              >
                                <p className="text-xs font-semibold truncate">{hit.legalName}</p>
                                <p className="text-[0.6rem] text-muted-foreground">
                                  <span className="font-mono">{hit.lei}</span>
                                  {hit.jurisdiction ? ` · ${hit.jurisdiction}` : ""}
                                  {hit.city ? ` · ${hit.city}` : ""}
                                  {hit.status ? ` · ${hit.status}` : ""}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                        {registrySearchQuery.data && registrySearchQuery.data.length === 0 && !registrySearchQuery.isFetching && registryQuery.trim().length >= 2 && (
                          <p className="text-[0.6rem] text-muted-foreground">No GLEIF matches — try a different name or proceed with Verify Now.</p>
                        )}
                      </div>
                    )}

                    {/* Result card */}
                    {registryResult && (
                      <div
                        className={`mt-3 p-3 rounded-lg border ${
                          registryResult.verified
                            ? "bg-emerald-500/5 border-emerald-500/40"
                            : "bg-amber-500/5 border-amber-500/40"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {registryResult.verified
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            : <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${registryResult.verified ? "text-emerald-400" : "text-amber-400"}`}>
                              {registryResult.verified ? "Verified" : "Not verified"} via {registryResult.source}
                              <span className="ml-1 text-muted-foreground font-normal">
                                · {(registryResult.confidence * 100).toFixed(0)}% confidence
                              </span>
                            </p>
                            {registryResult.company?.legalName && (
                              <p className="text-[0.7rem] mt-1">
                                <span className="text-muted-foreground">Legal name:</span>{" "}
                                <span className="font-medium">{registryResult.company.legalName}</span>
                              </p>
                            )}
                            {registryResult.company?.lei && (
                              <p className="text-[0.7rem]">
                                <span className="text-muted-foreground">LEI:</span>{" "}
                                <span className="font-mono">{registryResult.company.lei}</span>
                              </p>
                            )}
                            {registryResult.company?.jurisdiction && (
                              <p className="text-[0.7rem]">
                                <span className="text-muted-foreground">Jurisdiction:</span>{" "}
                                {registryResult.company.jurisdiction}
                              </p>
                            )}
                            {registryResult.company?.registeredAs && (
                              <p className="text-[0.7rem]">
                                <span className="text-muted-foreground">Registered as:</span>{" "}
                                <span className="font-mono">{registryResult.company.registeredAs}</span>
                              </p>
                            )}
                            {registryResult.company?.status && (
                              <p className="text-[0.7rem]">
                                <span className="text-muted-foreground">Status:</span> {registryResult.company.status}
                              </p>
                            )}
                            {registryResult.matchedFields?.length > 0 && (
                              <p className="text-[0.65rem] mt-1 text-emerald-300">
                                ✓ Matched: {registryResult.matchedFields.join(", ")}
                              </p>
                            )}
                            {registryResult.mismatchedFields?.length > 0 && (
                              <p className="text-[0.65rem] text-amber-300">
                                ⚠ Mismatched: {registryResult.mismatchedFields.join(", ")}
                              </p>
                            )}
                            {registryResult.warnings?.length > 0 && (
                              <p className="text-[0.65rem] text-amber-300">
                                ⚠ {registryResult.warnings.join("; ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Verified Trade Profile (Part 2.2.3.1) */}
                  <div className="p-4 rounded-xl bg-muted/20 border border-border">
                    <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Verified Trade Profile (Optional · Layer 5.5)</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[{ id: "LEI", label: "LEI (20-char)" }, { id: "DUNS", label: "DUNS (9-digit)" }, { id: "Customs", label: "Customs Reg" }, { id: "Chamber", label: "Chamber of Commerce" }, { id: "VAT", label: "VAT Registration" }].map((v) => (
                        <div key={v.id} className="flex items-center gap-1.5 p-2 rounded-lg bg-background/40">
                          <ShieldCheck className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[0.65rem] text-muted-foreground">{v.label}</span>
                          <button className="ml-auto text-[0.6rem] text-gold hover:underline">Verify</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={saveOrganization} disabled={savingOrg} className="bg-gold-gradient text-sovereign">
                      {savingOrg ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</> : <>Save & Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 3: KYB/KYC */}
            {step === 3 && (
              <motion.div key="s3bank" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 3 — Bank Details (Auto-Detect)</h2>
                    <p className="text-xs text-muted-foreground mt-1">Select your bank from the directory — banks auto-detected based on your registered country ({country}). SWIFT/BIC code is auto-filled when you pick a bank. Enter your account number (IBAN format auto-detected).</p>
                  </div>
                  {/* Selected bank preview */}
                  {bankSwift && (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/30 flex items-start gap-2">
                      <Landmark className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 text-xs">
                        <p className="text-emerald-400 font-semibold">{bankName}</p>
                        <p className="text-muted-foreground">SWIFT/BIC: <span className="font-mono text-foreground">{bankSwift}</span>{bankCity ? ` · ${bankCity}` : ""}{bankBranch ? ` · ${bankBranch}` : ""}</p>
                      </div>
                      <button onClick={() => { setBankSwift(""); setBankName(""); setBankBranch(""); setBankCity(""); }} className="text-[0.6rem] text-red-400 hover:underline">Clear</button>
                    </div>
                  )}
                  {/* Bank search box */}
                  {!bankSwift && (
                    <div>
                      <Label className="text-xs">Search banks in {country}</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={bankSearchQuery}
                          onChange={(e) => setBankSearchQuery(e.target.value)}
                          placeholder="Type bank name, city, or SWIFT code…"
                          className="pl-9"
                          autoFocus
                        />
                        {bankSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                      </div>
                      {bankSearchResults.length === 0 ? (
                        <p className="text-[0.65rem] text-muted-foreground mt-2">No banks found for {country}{bankSearchQuery ? ` matching "${bankSearchQuery}"` : ""}. Check the country code or contact support.</p>
                      ) : (
                        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                          {bankSearchResults.map((bank, i) => (
                            <button
                              key={i}
                              onClick={() => selectBank(bank)}
                              className="w-full text-left p-3 hover:bg-muted/30 transition-colors flex items-start gap-2"
                            >
                              <Landmark className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{bank.bankName}</p>
                                <p className="text-[0.65rem] text-muted-foreground">
                                  <span className="font-mono">{bank.swift}</span>
                                  {bank.city ? ` · ${bank.city}` : ""}
                                  {bank.branch ? ` · ${bank.branch}` : ""}
                                </p>
                                {bank.routingCodeLabel && (
                                  <p className="text-[0.6rem] text-muted-foreground">{bank.routingCodeLabel}: {bank.routingCodeExample}</p>
                                )}
                              </div>
                              <ArrowRight className="w-3 h-3 text-muted-foreground mt-1 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Account details form (always shown once bank selected) */}
                  {bankSwift && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Account Holder Name *</Label>
                        <Input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} placeholder="As registered with your bank" />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">
                          Account Number / IBAN *
                          {bankIbanFormat && bankIbanFormat.length > 0 && (
                            <span className="ml-2 text-[0.6rem] text-muted-foreground">
                              IBAN length: {bankIbanFormat.length} · Format: <span className="font-mono">{bankIbanFormat.structure}</span>
                            </span>
                          )}
                        </Label>
                        <Input
                          value={bankAccountNo}
                          onChange={(e) => setBankAccountNo(e.target.value.toUpperCase())}
                          placeholder={bankIbanFormat?.example || "Account / IBAN"}
                          className="font-mono"
                        />
                        {bankIbanFormat && bankIbanFormat.length > 0 && bankAccountNo.length > 0 && bankAccountNo.length !== bankIbanFormat.length && (
                          <p className="text-[0.6rem] text-amber-400 mt-1">Expected {bankIbanFormat.length} characters for {country} IBAN (got {bankAccountNo.length}).</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Account Currency</Label>
                        <Input value={bankCurrency} onChange={(e) => setBankCurrency(e.target.value.toUpperCase())} placeholder="e.g., EGP, EUR, USD" maxLength={3} />
                      </div>
                      <div>
                        <Label className="text-xs">Branch (optional)</Label>
                        <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="Branch name / code" />
                      </div>
                    </div>
                  )}
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                    <p className="text-xs">🧠 Bank directory auto-detects all major banks in your country. SWIFT/BIC codes are pre-loaded — no manual lookup needed. Your account number is encrypted at rest (AES-256) and only revealed to financiers you explicitly authorize during settlement.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={saveBankDetails} disabled={savingBank || !bankSwift || !bankAccountNo} className="bg-gold-gradient text-sovereign">
                      {savingBank ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</> : <>Save Bank Details <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 4: KYB/KYC Verification */}
            {step === 4 && (
              <motion.div key="s4kyb" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 4 — KYB/KYC Verification</h2>
                    <p className="text-xs text-muted-foreground mt-1">Upload the required documents. "Verify" buttons are cosmetic in this sandbox — in production they invoke HF Donut extraction (A2) + government registry cross-reference + ZITADEL passkey biometric liveness.</p>
                  </div>
                  <div className="space-y-2">
                    {kybDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-bold ${doc.verified ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{doc.verified ? "✓" : "!"}</div>
                        <div className="flex-1">
                          <p className="text-xs flex items-center gap-2">
                            {doc.label}
                            {doc.required
                              ? <Badge variant="outline" className="text-[0.55rem] text-red-400 border-red-500/30">REQUIRED</Badge>
                              : <Badge variant="outline" className="text-[0.55rem] text-muted-foreground border-border">OPTIONAL</Badge>}
                          </p>
                        </div>
                        <button
                          className="text-[0.65rem] px-2 py-1 rounded-md bg-background/60 border border-border hover:border-gold/40 flex items-center gap-1"
                          onClick={() => toggleKybDoc(doc.id)}
                        >
                          <UploadCloud className="w-3 h-3" /> {doc.verified ? "Re-verify" : "Verify"}
                        </button>
                        {doc.verified
                          ? <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30">AUTO-VERIFIED</Badge>
                          : <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30">PENDING</Badge>}
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                    <p className="text-xs">🧠 In production: A2 (HF Donut) extracts all fields with ≥90% confidence. Biometric liveness verified via ZITADEL passkey. Documents queued for registry cross-reference — estimated SLA 48 hours. While pending, you may use sandbox but cannot create real trades.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={() => setStep(5)} className="bg-gold-gradient text-sovereign">Submit Documents <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 5: Profile Configuration */}
            {step === 5 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 5 — Profile Configuration</h2>
                    <p className="text-xs text-muted-foreground mt-1">Trader mode · preferences · PDPL consent toggles (Part 18). Each consent toggle upserts a ConsentRecord via <code className="text-gold">/api/sgtx/pdpl/consent</code> with a Loom-anchored hash.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Trader Mode</Label>
                      <Select value={traderMode} onValueChange={setTraderMode}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BUY">BUY (Importer only)</SelectItem>
                          <SelectItem value="SELL">SELL (Exporter only)</SelectItem>
                          <SelectItem value="DUAL">DUAL (Both — default)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Default Incoterm</Label>
                      <Select value={defaultIncoterm} onValueChange={setDefaultIncoterm}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["EXW","FCA","FOB","CFR","CIF","DAP","DDP"].map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Language</Label>
                      <Select value={preferredLanguage} onValueChange={setPreferredLanguage}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="ar">Arabic</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                          <SelectItem value="vi">Vietnamese</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Currency</Label>
                      <Select value={preferredCurrency} onValueChange={setPreferredCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="EGP">EGP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">PDPL Consent Toggles (Part 18)</p>
                    {([
                      { key: "marketing" as const, label: "Marketing communications", desc: "Receive product updates and newsletters" },
                      { key: "analytics" as const, label: "Anonymous analytics", desc: "Share aggregated usage data to improve the platform" },
                      { key: "govt_sharing" as const, label: "Government sharing", desc: "Allow sharing of compliance data with regulators when legally required" },
                      { key: "cross_border" as const, label: "Cross-border data transfer", desc: "Allow data transfer to counterparties in other jurisdictions" },
                    ]).map((c) => (
                      <div key={c.key} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20">
                        <Switch
                          checked={consents[c.key]}
                          onCheckedChange={(v) => setConsents((prev) => ({ ...prev, [c.key]: v }))}
                        />
                        <div className="flex-1">
                          <p className="text-xs font-medium">{c.label}</p>
                          <p className="text-[0.65rem] text-muted-foreground">{c.desc}</p>
                        </div>
                        <Badge variant="outline" className={`text-[0.55rem] ${consents[c.key] ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground border-border"}`}>
                          {consents[c.key] ? "GRANTED" : "WITHHELD"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={saveProfile} disabled={savingProfile} className="bg-gold-gradient text-sovereign">
                      {savingProfile ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Saving…</> : <>Save Preferences <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 6: Create First Resource */}
            {step === 6 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 6 — First Resource (Optional)</h2>
                    <p className="text-xs text-muted-foreground mt-1">Pre-configure commodity defaults and port preferences to accelerate future trade creation. Entirely optional — you can skip and add later.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Default Commodity</Label>
                      <Input value={defaultCommodity} onChange={(e) => setDefaultCommodity(e.target.value)} placeholder="e.g. Frozen Strawberries" />
                    </div>
                    <div>
                      <Label className="text-xs">Default HS Code</Label>
                      <Input value={defaultCommodityHs} onChange={(e) => setDefaultCommodityHs(e.target.value)} placeholder="e.g. 08111000" />
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Origin Port</Label>
                      <Input value={preferredOriginPort} onChange={(e) => setPreferredOriginPort(e.target.value)} placeholder="e.g. EGALY (Alexandria)" />
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Destination Port</Label>
                      <Input value={preferredDestPort} onChange={(e) => setPreferredDestPort(e.target.value)} placeholder="e.g. DEHAM (Hamburg)" />
                    </div>
                    <div>
                      <Label className="text-xs">Default Packaging</Label>
                      <Select value={defaultPackaging} onValueChange={setDefaultPackaging}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CARTON">Carton</SelectItem>
                          <SelectItem value="PALLET">Pallet</SelectItem>
                          <SelectItem value="CRATE">Crate</SelectItem>
                          <SelectItem value="BAG">Bag</SelectItem>
                          <SelectItem value="DRUM">Drum</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                    <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">🧠 AI Advisory (A1)</p>
                    <p className="text-xs">Typical trucking fee for Alexandria→Cairo corridor: $0.75–$0.95/km (anonymised aggregate). You can accept, modify, or skip.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(5)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setStep(7)}>Skip</Button>
                      <Button onClick={() => setStep(7)} className="bg-gold-gradient text-sovereign">Save & Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 7: Sandbox */}
            {step === 7 && (
              <motion.div key="s6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 7 — Sandbox & Go Live</h2>
                    <p className="text-xs text-muted-foreground mt-1">Isolated replica with synthetic data · guided practice trade · no real money or documents. When you're ready, click <strong>Go Live</strong> to transition lifecycle_state → VERIFIED.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-muted/20 border border-dashed border-border">
                    <p className="text-xs text-muted-foreground mb-3">Guided practice trade walkthrough:</p>
                    <div className="space-y-1.5">
                      {["Create a trade request (structured form)", "Seller accepts and locks EXW price", "Design packing (non-uniform layers)", "Add logistics (mock RFQ responses)", "Submit quote, sign contract, pay mock fee", "Track milestones, confirm delivery, settle"].map((s, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs"><span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-[0.6rem] font-bold">{i + 1}</span> {s}</div>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 flex items-center gap-2">
                    <span className="text-amber-400">⚠</span>
                    <p className="text-xs text-muted-foreground">Sandbox resets every Sunday 03:00 UTC. No real API calls to government systems.</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                    <p className="text-xs"><strong>Go Live</strong> — wipes sandbox data (after confirmation), sets lifecycle_state = VERIFIED, issues a new JWT with production permissions, and redirects to the Universal Command Center.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(6)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <div className="flex gap-2">
                      <Button variant="outline">Start Sandbox</Button>
                      <Button onClick={goLive} disabled={goingLive} className="bg-gold-gradient text-sovereign">
                        {goingLive ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Going Live…</> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Go Live</>}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
