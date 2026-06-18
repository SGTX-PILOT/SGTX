"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SgtxLogo } from "@/components/sgtx/SgtxLogo";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles, Loader2, ShieldCheck, Building2, Globe2, Lock, FileText, FlaskConical, Ship } from "lucide-react";

const STEPS = [
  { id: 1, label: "GTID", icon: ShieldCheck },
  { id: 2, label: "Organization", icon: Building2 },
  { id: 3, label: "KYB/KYC", icon: FileText },
  { id: 4, label: "Profile", icon: Globe2 },
  { id: 5, label: "Resources", icon: Ship },
  { id: 6, label: "Sandbox", icon: FlaskConical },
];

const ENTITY_TYPES = [
  { code: "TRD", label: "Trader (Buyer/Seller)", desc: "Import/export companies" },
  { code: "LSP", label: "Logistics Service Provider", desc: "Trucking, forwarding, warehousing" },
  { code: "SHIP", label: "Shipping Line", desc: "Ocean container carrier" },
  { code: "LAB", label: "Laboratory", desc: "Food & pesticide testing" },
  { code: "QC", label: "Quality Control", desc: "Pre-shipment inspection" },
  { code: "CBR", label: "Customs Broker", desc: "Clearance & certification" },
  { code: "FIN", label: "Financier", desc: "Bank or private finance" },
  { code: "GOV", label: "Government", desc: "Customs, CBE, NFSA" },
];

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState("EG");
  const [entityType, setEntityType] = useState("TRD");
  const [legalName, setLegalName] = useState("");
  const [gtid, setGtid] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const exitToLauncher = useAppStore((s) => s.exitToLauncher);
  const setView = useAppStore((s) => s.setView);

  const generateGtid = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/sgtx/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country, type: entityType, legalName }),
      });
      const d = await res.json();
      setGtid(d.gtid);
    } catch { setGtid("SGTX-XX-XXX-000001-ERROR"); }
    finally { setGenerating(false); }
  };

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

      {/* Progress indicator */}
      <div className="relative z-10 px-6 sm:px-10 py-6">
        <div className="max-w-4xl mx-auto flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : active ? "bg-gold/20 border-gold text-gold glow-gold-sm" : "border-border text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4.5 h-4.5" />}
                  </div>
                  <span className={`text-[0.6rem] ${active ? "text-gold font-semibold" : "text-muted-foreground"}`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${done ? "bg-emerald-500/50" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 flex-1 px-6 sm:px-10 pb-10 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            {/* STEP 1: GTID Confirmation */}
            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 1 — Welcome & GTID Confirmation</h2>
                    <p className="text-xs text-muted-foreground mt-1">Select your entity type and country. The system generates a provisional GTID (SGTX-CC-TYPE-SEQ-CHECKSUM) with a CRC32 checksum.</p>
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
                          {["EG", "DE", "VN", "US", "AE", "CN", "SA"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                      <p className="text-[0.6rem] text-muted-foreground mt-1">CRC32-ISO-HDLC checksum verified · lifecycle_state = REGISTERED</p>
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
                    <p className="text-xs text-muted-foreground mt-1">Core legal identifiers · AI (A2 HF Donut) extracts from uploaded PDFs · cross-references government registries</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label className="text-xs">Commercial Register Number</Label><Input placeholder="CR-2026-XXXXX" /><p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A2 cross-references government registry</p></div>
                    <div><Label className="text-xs">Tax ID (VAT)</Label><Input placeholder="123-456-789" /><p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A2 validates against ETA (Egypt)</p></div>
                    <div><Label className="text-xs">Export/Import License</Label><Input placeholder="EXP-2026-XX" /></div>
                    <div><Label className="text-xs">Contact Email</Label><Input type="email" placeholder="info@company.com" /></div>
                    <div className="sm:col-span-2"><Label className="text-xs">Office Address</Label><Input placeholder="Street, City" /><p className="text-[0.6rem] text-muted-foreground mt-0.5">🧠 A1 suggests address from partial input (Nominatim geocoding)</p></div>
                  </div>
                  {/* Verified Trade Profile (Part 2.2.2.1) */}
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
                    <Button onClick={() => setStep(3)} className="bg-gold-gradient text-sovereign">Verify & Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 3: KYB/KYC */}
            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 3 — KYB/KYC Verification</h2>
                    <p className="text-xs text-muted-foreground mt-1">AI-driven document extraction · biometric liveness (ZITADEL WebAuthn) · registry cross-reference</p>
                  </div>
                  <div className="space-y-2">
                    {["Commercial register extract", "Tax registration certificate", "Export licence", "UBO declaration form (structured)", "Bank account confirmation (optional)", "Sanctions self-declaration"].map((doc, i) => (
                      <div key={doc} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.6rem] font-bold ${i < 3 ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"}`}>{i < 3 ? "✓" : "!"}</div>
                        <span className="text-xs flex-1">{doc}</span>
                        {i < 3 ? <Badge variant="outline" className="text-[0.6rem] text-emerald-400 border-emerald-500/30">AUTO-VERIFIED</Badge> : <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30">PENDING</Badge>}
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                    <p className="text-xs">🧠 A2 (HF Donut) extracted all fields with ≥90% confidence. Biometric liveness verified via ZITADEL passkey. Documents queued for registry cross-reference — estimated SLA 48 hours.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={() => setStep(4)} className="bg-gold-gradient text-sovereign">Submit Documents <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 4: Profile Configuration */}
            {step === 4 && (
              <motion.div key="s4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 4 — Profile Configuration</h2>
                    <p className="text-xs text-muted-foreground mt-1">Trader mode · preferences · consent toggles</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Trader Mode</Label>
                      <Select defaultValue="DUAL"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="BUY">BUY (Importer only)</SelectItem><SelectItem value="SELL">SELL (Exporter only)</SelectItem><SelectItem value="DUAL">DUAL (Both — default)</SelectItem></SelectContent></Select>
                    </div>
                    <div>
                      <Label className="text-xs">Default Incoterm</Label>
                      <Select defaultValue="CIF"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["EXW","FCA","FOB","CFR","CIF","DAP","DDP"].map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Language</Label>
                      <Select defaultValue="en"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ar">Arabic</SelectItem><SelectItem value="de">German</SelectItem><SelectItem value="vi">Vietnamese</SelectItem></SelectContent></Select>
                    </div>
                    <div>
                      <Label className="text-xs">Preferred Currency</Label>
                      <Select defaultValue="USD"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="EGP">EGP</SelectItem></SelectContent></Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Consent Toggles</p>
                    {[{ label: "Voice stress flag (on-device only)", on: false }, { label: "Offline mobile sync (LSP/QC apps)", on: true }, { label: "Anonymous market intelligence panel", on: false }].map((c) => (
                      <div key={c.label} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                        <div className={`w-8 h-4 rounded-full ${c.on ? "bg-gold" : "bg-muted"} relative`}><div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${c.on ? "left-4" : "left-0.5"}`} /></div>
                        <span className="text-xs text-muted-foreground">{c.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={() => setStep(5)} className="bg-gold-gradient text-sovereign">Save Preferences <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 5: Create First Resource */}
            {step === 5 && (
              <motion.div key="s5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 5 — Create First Resource (Optional)</h2>
                    <p className="text-xs text-muted-foreground mt-1">Pre-configure common data to accelerate future trades · AI suggests defaults from anonymised aggregates</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[{ label: "Saved Commodities", value: "3 added", icon: "📦" }, { label: "Saved Ports", value: "5 added", icon: "🚢" }, { label: "Preferred Shipping Lines", value: "2 added", icon: "⛴️" }, { label: "Laboratory Contacts", value: "1 added", icon: "🧪" }].map((r) => (
                      <div key={r.label} className="p-3 rounded-lg bg-muted/20 flex items-center gap-3">
                        <span className="text-2xl">{r.icon}</span>
                        <div><p className="text-xs font-medium">{r.label}</p><p className="text-[0.65rem] text-muted-foreground">{r.value}</p></div>
                        <button className="ml-auto text-[0.65rem] text-gold hover:underline">Edit</button>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                    <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">🧠 AI Advisory (A1)</p>
                    <p className="text-xs">Typical trucking fee for Alexandria→Cairo corridor: $0.75–$0.95/km (anonymised aggregate). User can accept, modify, or skip.</p>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <Button onClick={() => setStep(6)} className="bg-gold-gradient text-sovereign">Continue <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* STEP 6: Sandbox */}
            {step === 6 && (
              <motion.div key="s6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <Card className="p-6 space-y-5">
                  <div>
                    <h2 className="font-display text-xl font-bold">Step 6 — Enter Sandbox</h2>
                    <p className="text-xs text-muted-foreground mt-1">Isolated replica with synthetic data · guided practice trade · no real money or documents</p>
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
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(5)}><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Button>
                    <div className="flex gap-2">
                      <Button variant="outline">Start Sandbox</Button>
                      <Button onClick={() => { setView("launcher"); }} className="bg-gold-gradient text-sovereign"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Go Live</Button>
                    </div>
                  </div>
                  <p className="text-[0.6rem] text-muted-foreground text-center">On "Go Live": lifecycle_state → VERIFIED · sandbox data wiped · JWT with production permissions issued · redirect to Universal Command Center</p>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
