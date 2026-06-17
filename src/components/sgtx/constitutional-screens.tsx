"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDateTime, statusColor, healthColor } from "@/lib/sgtx/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Lock, AlertTriangle, CheckCircle2, FileText, Fingerprint, Gavel, Globe2, Cpu, Download, Copy, Hash, Smartphone, Wifi, Activity } from "lucide-react";

// ============ 1.2 OPA Policy Engine ============
export function OpaPolicyScreen() {
  const { data: policies } = useQuery({
    queryKey: ["opa-policies"],
    queryFn: async () => (await fetch("/api/sgtx/opa/policies")).json(),
  });
  const [active, setActive] = useState(0);
  const policy = policies?.[active];

  return (
    <div className="space-y-4">
      <SectionHeader title="OPA Policy Engine" subtitle="Part 1.2 — Rego policies · hot-reloadable (multisig) · 7 categories · opa test in CI" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-3 space-y-1 lg:col-span-1">
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Policy Categories</p>
          {(policies || []).map((p: any, i: number) => (
            <button key={p.name} onClick={() => setActive(i)} className={`w-full text-left p-2.5 rounded-lg transition-colors ${active === i ? "bg-gold/10 border border-gold/30" : "hover:bg-muted/30 border border-transparent"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-medium">{p.name}</span>
                <Badge variant="outline" className="text-[0.55rem] text-emerald-400 border-emerald-500/30">{p.category}</Badge>
              </div>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
            </button>
          ))}
        </Card>
        <Card className="p-4 lg:col-span-2">
          {policy && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-mono font-semibold text-sm">{policy.name}</h3>
                  <p className="text-[0.65rem] text-muted-foreground">{policy.description}</p>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[0.6rem]">ACTIVE</Badge>
              </div>
              <pre className="p-3 rounded-lg bg-sovereign-deep/50 border border-border text-[0.65rem] font-mono text-foreground/80 overflow-x-auto scroll-gold max-h-96 leading-relaxed">{policy.content}</pre>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline" className="text-[0.6rem]">v1.0.0</Badge>
                <Badge variant="outline" className="text-[0.6rem] text-gold border-gold/30">multisig approved</Badge>
                <span className="text-[0.6rem] text-muted-foreground ml-auto">Hot-reloadable after 3/5 multisig</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============ 1.9 QES Layer (Egypt Trust) ============
export function QesScreen() {
  const [signerGtid, setSignerGtid] = useState("SGTX-EG-TRD-002139-7F3A");
  const [signerName, setSignerName] = useState("Mohamed Eltonsy");
  const [tradeValue, setTradeValue] = useState("100000");
  const [docHash, setDocHash] = useState("a1b2c3d4e5f6...");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const sign = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/qes/sign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerGtid, signerName, documentHash: docHash, tradeValueUsd: Number(tradeValue) }),
      });
      const d = await res.json();
      setResult(d);
    } catch {}
    finally { setLoading(false); }
  };

  const hierarchy = [
    { type: "STANDARD", legal: "Binding between parties", provider: "ZITADEL passkey (WebAuthn)", use: "Low-value contracts (<$10k), internal approvals", threshold: "< $10,000", color: "#60a5fa" },
    { type: "AES", legal: "Presumption of integrity", provider: "Ed25519 certificate (SoftHSM)", use: "Standard trade contracts, logistics addenda", threshold: "$10,000 – $100,000", color: "#fbbf24" },
    { type: "QES", legal: "Equivalent to handwritten signature", provider: "Egypt Trust certificate (HSM)", use: "Government filings, Nafeza, high-value (>$100k), finance", threshold: "> $100,000", color: "#10b981" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="QES Layer — Egypt Trust Integration" subtitle="Part 1.9 — Egyptian E-Signature Law No. 15/2004 Art. 13 · QES = handwritten equivalent" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {hierarchy.map((h) => (
          <Card key={h.type} className="p-4" style={{ borderTop: `3px solid ${h.color}` }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm" style={{ color: h.color }}>{h.type}</h3>
              <Badge variant="outline" className="text-[0.55rem] font-mono">{h.threshold}</Badge>
            </div>
            <p className="text-[0.7rem] font-medium text-foreground mb-1">{h.legal}</p>
            <p className="text-[0.65rem] text-muted-foreground mb-2">{h.provider}</p>
            <p className="text-[0.65rem] text-muted-foreground/80">{h.use}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold text-sm">Sign Document (auto-selects type based on trade value)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Signer GTID</Label><Input value={signerGtid} onChange={(e) => setSignerGtid(e.target.value)} className="font-mono text-xs" /></div>
          <div><Label className="text-xs">Signer Name</Label><Input value={signerName} onChange={(e) => setSignerName(e.target.value)} /></div>
          <div><Label className="text-xs">Trade Value (USD) — determines signature type</Label><Input value={tradeValue} onChange={(e) => setTradeValue(e.target.value)} type="number" /></div>
          <div><Label className="text-xs">Document Hash (SHA-256)</Label><Input value={docHash} onChange={(e) => setDocHash(e.target.value)} className="font-mono text-xs" /></div>
        </div>
        <Button onClick={sign} disabled={loading} className="bg-gold-gradient text-sovereign">
          {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />} Sign Document
        </Button>
      </Card>
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${hierarchy.find(h => h.type === result.type)?.color}22` }}>
                <CheckCircle2 className="w-5 h-5" style={{ color: hierarchy.find(h => h.type === result.type)?.color }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: hierarchy.find(h => h.type === result.type)?.color }}>{result.type} Signature Applied</p>
                <p className="text-xs text-muted-foreground">{result.legalEffect}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2 rounded-lg bg-muted/20"><span className="text-muted-foreground">Provider:</span> <span className="font-medium">{result.provider}</span></div>
              <div className="p-2 rounded-lg bg-muted/20"><span className="text-muted-foreground">Signature ID:</span> <span className="font-mono">{result.id}</span></div>
              <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-muted-foreground">Signature value:</span> <span className="font-mono">{result.signatureValue}</span></div>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ============ 1.10 Device Trust & Step-Up Auth ============
export function DeviceTrustScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [deviceName, setDeviceName] = useState("Mohamed's MacBook Pro");
  const [platform, setPlatform] = useState("macOS");
  const [registering, setRegistering] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["devices", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/device/list?tenant=${tenantGtid}`)).json(),
  });

  const register = async () => {
    setRegistering(true);
    try {
      const fp = "fp-" + Math.random().toString(36).slice(2, 12);
      await fetch("/api/sgtx/device/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid, deviceFingerprint: fp, deviceName, platform, lastSeenIp: "197.45.21.88", lastSeenCountry: "EG" }),
      });
      qc.invalidateQueries({ queryKey: ["devices", tenantGtid] });
    } catch {}
    finally { setRegistering(false); }
  };

  const stateColor = (s: string) => ({ NEW: "#60a5fa", TRUSTED: "#10b981", ELEVATED_RISK: "#fbbf24", BLOCKED: "#f87171", REVOKED: "#94a3b8" } as any)[s] || "#94a3b8";

  return (
    <div className="space-y-4">
      <SectionHeader title="Device Trust & Session Security" subtitle="Part 1.10 — device registry · step-up auth chain · A2 session risk engine" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {[
          { step: 1, method: "Passkey (WebAuthn)", factor: "something you have", icon: Fingerprint },
          { step: 2, method: "Biometric verification", factor: "something you are", icon: ShieldCheck },
          { step: 3, method: "Crypto challenge signature", factor: "device-bound key", icon: Lock },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.step} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center"><Icon className="w-4 h-4 text-gold" /></div>
                <span className="text-xs font-semibold">Step {s.step}</span>
              </div>
              <p className="text-sm font-medium">{s.method}</p>
              <p className="text-[0.65rem] text-muted-foreground">{s.factor}</p>
            </Card>
          );
        })}
      </div>
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Register Device</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Device Name</Label><Input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} /></div>
          <div><Label className="text-xs">Platform</Label><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["macOS","Windows","iOS","Android","Linux"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <Button onClick={register} disabled={registering} className="bg-gold-gradient text-sovereign">
          {registering ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5 mr-1.5" />} Register Device
        </Button>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Registered Devices</h3>
        <div className="space-y-2">
          {(data?.devices || []).map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
              <Smartphone className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{d.deviceName} <span className="text-muted-foreground">· {d.platform}</span></p>
                <p className="text-[0.6rem] text-muted-foreground font-mono">{d.deviceFingerprint}</p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color: stateColor(d.state), background: `${stateColor(d.state)}1a` }}>{d.state}</span>
                <p className="text-[0.6rem] text-muted-foreground mt-0.5">risk: {d.riskScore}/100</p>
              </div>
            </div>
          ))}
          {data?.devices?.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No devices registered.</p>}
        </div>
      </Card>
      {data?.events?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-gold" /> Session Risk Events</h3>
          <div className="space-y-1.5">
            {data.events.map((e: any) => (
              <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${e.severity === "critical" ? "bg-red-400" : e.severity === "high" ? "bg-amber-400" : "bg-blue-400"}`} />
                <span className="font-medium">{e.eventType.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground flex-1 truncate">{e.description}</span>
                <span className="text-[0.6rem] text-muted-foreground">{fmtDateTime(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============ 1.11 Court Evidence Package Engine ============
export function EvidencePackageScreen() {
  const qc = useQueryClient();
  const [ustn, setUstn] = useState("SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4");
  const [pkgType, setPkgType] = useState("COURT_BUNDLE");
  const [jurisdiction, setJurisdiction] = useState("EGYPT");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { data: packages } = useQuery({
    queryKey: ["evidence", ustn],
    queryFn: async () => (await fetch(`/api/sgtx/evidence/list?ustn=${ustn}`)).json(),
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/sgtx/evidence/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, packageType: pkgType, jurisdiction }),
      });
      const d = await res.json();
      setResult(d);
      qc.invalidateQueries({ queryKey: ["evidence", ustn] });
    } catch {}
    finally { setGenerating(false); }
  };

  const pkgTypes = [
    { id: "PDF", label: "PDF (single document)", desc: "Standard PDF export" },
    { id: "ZIP", label: "ZIP (raw JSON/XML)", desc: "Raw data archive" },
    { id: "COURT_BUNDLE", label: "Court Bundle (PDF, numbered, indexed)", desc: "UK/Egypt style" },
    { id: "ARBITRATION_BUNDLE", label: "Arbitration Bundle", desc: "ICC, DIFC-LCIA, CRCICA, LCIA" },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Court Evidence Package Engine" subtitle="Part 1.11 — court-ready bundles · Loom-anchored · PDF/ZIP/Court/Arbitration formats" />
      <Card className="p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-3"><Label className="text-xs">Trade USTN</Label><Input value={ustn} onChange={(e) => setUstn(e.target.value)} className="font-mono text-xs" /></div>
          <div>
            <Label className="text-xs">Package Type</Label>
            <Select value={pkgType} onValueChange={setPkgType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{pkgTypes.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent></Select>
          </div>
          <div>
            <Label className="text-xs">Jurisdiction</Label>
            <Select value={jurisdiction} onValueChange={setJurisdiction}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["EGYPT","UK","ICC","DIFC_LCIA","CRCICA","LCIA"].map(j => <SelectItem key={j} value={j}>{j.replace(/_/g,"-")}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <Button onClick={generate} disabled={generating} className="bg-gold-gradient text-sovereign">
          {generating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />} Generate Evidence Package
        </Button>
      </Card>
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <div>
                <p className="font-bold text-sm">Evidence Package Generated</p>
                <p className="text-xs text-muted-foreground">{pkgType} · {jurisdiction} · {(result.fileSizeKb / 1024).toFixed(1)} MB</p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto"><Download className="w-3.5 h-3.5 mr-1.5" /> Download</Button>
            </div>
            <div className="p-2 rounded-lg bg-muted/20 break-all"><span className="text-[0.6rem] text-muted-foreground">Loom Hash:</span> <span className="font-mono text-xs">{result.loomHash}</span></div>
            <div>
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Package Contents ({result.contents.length} items)</p>
              <div className="space-y-1">
                {result.contents.map((c: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs">
                    <span className="font-mono text-[0.6rem] text-muted-foreground w-6">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-foreground">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
      {(packages?.length || 0) > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Generated Packages</h3>
          <div className="space-y-2">
            {packages.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{p.packageType.replace(/_/g, " ")} · {p.jurisdiction}</p>
                  <p className="text-[0.6rem] text-muted-foreground">{(p.fileSizeKb / 1024).toFixed(1)} MB · {fmtDateTime(p.createdAt)}</p>
                </div>
                <Badge variant="outline" className="text-[0.6rem]">{p.status}</Badge>
                <Button size="sm" variant="ghost" className="h-7"><Download className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============ 1.13 Compliance Intelligence Layer ============
export function ComplianceScreeningScreen({ tenantGtid }: { tenantGtid: string }) {
  const qc = useQueryClient();
  const [screening, setScreening] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { data: history } = useQuery({
    queryKey: ["compliance", tenantGtid],
    queryFn: async () => (await fetch(`/api/sgtx/compliance/list?tenant=${tenantGtid}`)).json(),
  });

  const screen = async () => {
    setScreening(true);
    try {
      const res = await fetch("/api/sgtx/compliance/screen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantGtid }),
      });
      const d = await res.json();
      setResult(d);
      qc.invalidateQueries({ queryKey: ["compliance", tenantGtid] });
    } catch {}
    finally { setScreening(false); }
  };

  const verdictColor = (v: string) => v === "CLEAR" ? "#10b981" : v === "ENHANCED_DUE_DILIGENCE" ? "#fbbf24" : "#f87171";
  const dimensions = [
    { id: "SANCTIONS", label: "Sanctions", source: "RIA + GNN", freq: "Real-time", icon: ShieldCheck },
    { id: "PEP", label: "PEP", source: "Global databases", freq: "Daily", icon: Globe2 },
    { id: "RESTRICTED_GOODS", label: "Restricted Goods", source: "Dual-use/CITES", freq: "Daily", icon: AlertTriangle },
    { id: "JURISDICTION_RISK", label: "Jurisdiction", source: "RIA matrix", freq: "6 hours", icon: Globe2 },
    { id: "CUSTOMS_COMPLIANCE", label: "Customs", source: "Nafeza + RIA", freq: "Daily", icon: FileText },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Compliance Intelligence Layer" subtitle="Part 1.13 — unified screening gateway · 5 dimensions · CLEAR / ENHANCED DD / BLOCKED" />
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
        {dimensions.map((d) => {
          const Icon = d.icon;
          return (
            <Card key={d.id} className="p-3 text-center">
              <Icon className="w-5 h-5 mx-auto text-gold mb-1.5" />
              <p className="text-[0.7rem] font-medium">{d.label}</p>
              <p className="text-[0.55rem] text-muted-foreground">{d.source}</p>
              <Badge variant="outline" className="text-[0.5rem] mt-1">{d.freq}</Badge>
            </Card>
          );
        })}
      </div>
      <Card className="p-4">
        <Button onClick={screen} disabled={screening} className="bg-gold-gradient text-sovereign">
          {screening ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />} Run Compliance Screening
        </Button>
      </Card>
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${verdictColor(result.overall)}22` }}>
                {result.overall === "CLEAR" ? <CheckCircle2 className="w-6 h-6" style={{ color: verdictColor(result.overall) }} /> : <AlertTriangle className="w-6 h-6" style={{ color: verdictColor(result.overall) }} />}
              </div>
              <div>
                <p className="font-display text-lg font-bold" style={{ color: verdictColor(result.overall) }}>{result.overall.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">Overall compliance verdict</p>
              </div>
            </div>
            <div className="space-y-2">
              {result.results.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                  <span className="w-2 h-2 rounded-full mt-1.5" style={{ background: verdictColor(r.verdict) }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{r.dimension.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className="text-[0.55rem]" style={{ color: verdictColor(r.verdict), borderColor: `${verdictColor(r.verdict)}55` }}>{r.verdict.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground mt-0.5">{r.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      )}
      {(history?.length || 0) > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Screening History</h3>
          <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
            {history.map((h: any) => (
              <div key={h.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: verdictColor(h.verdict) }} />
                <span className="font-medium">{h.screeningType.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground flex-1 truncate">{h.details?.slice(0, 60)}</span>
                <span className="text-[0.6rem] text-muted-foreground">{fmtDateTime(h.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
