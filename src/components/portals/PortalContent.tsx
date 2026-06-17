"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutiveCards, ShipmentsVault, ActivityFeed, DocumentsList, InvoicesList, QuickActions, SectionHeader, HealthBadge } from "@/components/sgtx/widgets";
import { LoadingGuideWidget, GovernorDecisionPanel, InferenceLogScreen } from "@/components/sgtx/ai-widgets";
import { GovernorDecisionScreen, LoomVerificationScreen, JurisdictionMatrixScreen, NetworkScreen, ReadinessScreen, SarScreen } from "@/components/sgtx/governance-screens";
import { OpaPolicyScreen, QesScreen, DeviceTrustScreen, EvidencePackageScreen, ComplianceScreeningScreen } from "@/components/sgtx/constitutional-screens";
import { fmtUsd, fmtDate, fmtKg, statusColor, healthComponents, PHASE_LABELS } from "@/lib/sgtx/format";
import type { PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag, Store, Ship, FileText, Banknote, ShieldCheck, AlertTriangle, TrendingUp,
  Users, Container, FlaskConical, MapPin, Building2, Plus, Send, Gavel, Landmark,
  Activity, DollarSign, Package, CheckCircle2, Clock, Sparkles, Cpu, Globe2, Lock, Loader2,
} from "lucide-react";
import { useState } from "react";

type Data = any;

// ============ UNIVERSAL COMMAND CENTER (Part 12G) ============
export function CommandCenter({ portal, data }: { portal: PortalConfig; data: Data }) {
  const openTcc = useAppStore((s) => s.openTcc);
  const setView = useAppStore((s) => s.setView);
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
  const activeTrades = trades.filter((t) => t.status === "IN_EXECUTION" || t.status === "CONTRACT_SIGNED");
  const totalValue = trades.reduce((s, t) => s + t.tradeValueUsd, 0);
  const pendingInvoices = data.invoices?.filter((i) => i.status === "PENDING") || [];
  const overdueAmount = pendingInvoices.reduce((s, i) => s + i.amountUsd, 0);

  // Role-specific executive cards
  const cards = (() => {
    switch (portal.id) {
      case "trader-buyer":
        return [
          { label: "Open Trades", value: String(activeTrades.length), sub: `${trades.length} total`, icon: ShoppingBag, accent: "#1a6fb0" },
          { label: "Active Shipments", value: String(data.tradesAsBuyer?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Ship, accent: "#0ea5e9" },
          { label: "Pending Approvals", value: String(data.inbox?.length), icon: Clock, accent: "#fbbf24" },
          { label: "Outstanding", value: fmtUsd(overdueAmount), sub: `${pendingInvoices.length} invoices`, icon: Banknote, accent: "#f87171" },
        ];
      case "trader-seller":
        return [
          { label: "Outbound Trades", value: String(data.tradesAsSeller?.length || 0), sub: `${activeTrades.length} active`, icon: Store, accent: "#d4321a" },
          { label: "Containers", value: String(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Container, accent: "#c2410c" },
          { label: "Trade Value", value: fmtUsd(totalValue), icon: DollarSign, accent: "#10b981", trend: "+12%" },
          { label: "SGTX Fees Paid", value: fmtUsd(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.sgtxFeeUsd || 0), 0)), sub: "1.5% per side", icon: ShieldCheck, accent: "#a78bfa" },
        ];
      case "lsp":
        return [
          { label: "Assignments", value: String(data.shipmentsCarrier?.length || 0), sub: "active", icon: Package, accent: "#c2410c" },
          { label: "In Transit", value: String(data.shipmentsCarrier?.filter((s: any) => s.status === "IN_TRANSIT").length || 0), icon: Truck, accent: "#ea580c" },
          { label: "Milestones Due", value: String(data.inbox?.length), icon: Clock, accent: "#fbbf24" },
          { label: "Revenue (mo)", value: fmtUsd(8420), icon: Banknote, accent: "#10b981" },
        ];
      case "ship":
        return [
          { label: "Vessels Active", value: "3", sub: "2 in transit", icon: Ship, accent: "#0d6efd" },
          { label: "Containers", value: String(data.shipmentsCarrier?.length || 0), icon: Container, accent: "#0ea5e9" },
          { label: "Releases Pending", value: String(data.shipmentsCarrier?.filter((s: any) => s.status === "ARRIVED").length || 0), icon: ShieldCheck, accent: "#fbbf24" },
          { label: "B/L Issued", value: String(data.shipmentsCarrier?.length || 0), icon: FileText, accent: "#a78bfa" },
        ];
      case "lab":
        return [
          { label: "Test Requests", value: String(data.labTests?.length || 0), icon: FlaskConical, accent: "#16a34a" },
          { label: "In Testing", value: String(data.labTests?.filter((l: any) => l.status === "TESTING" || l.status === "SAMPLING").length || 0), icon: Cpu, accent: "#fbbf24" },
          { label: "Reports Issued", value: String(data.labTests?.filter((l: any) => l.status === "COMPLETED").length || 0), icon: FileText, accent: "#10b981" },
          { label: "Pass Rate", value: "94%", icon: CheckCircle2, accent: "#a78bfa" },
        ];
      case "qc":
        return [
          { label: "Inspections", value: String(data.qcInspections?.length || 0), icon: ShieldCheck, accent: "#9333ea" },
          { label: "Scheduled", value: String(data.qcInspections?.filter((q: any) => q.status === "SCHEDULED").length || 0), icon: Clock, accent: "#fbbf24" },
          { label: "Pass Rate", value: "97%", sub: "0 defects avg", icon: CheckCircle2, accent: "#10b981" },
          { label: "Field Reports", value: String(data.qcInspections?.filter((q: any) => q.status === "COMPLETED").length || 0), icon: FileText, accent: "#0ea5e9" },
        ];
      case "cbr":
        return [
          { label: "Declarations", value: String(data.customsDecls?.length || 0), icon: Landmark, accent: "#ca8a04" },
          { label: "Cleared", value: String(data.customsDecls?.filter((c: any) => c.status === "CLEARED").length || 0), icon: CheckCircle2, accent: "#10b981" },
          { label: "Pending Nafeza", value: String(data.customsDecls?.filter((c: any) => c.status === "SUBMITTED").length || 0), icon: Clock, accent: "#fbbf24" },
          { label: "Certificates", value: String(data.customsDecls?.length || 0), icon: FileText, accent: "#a78bfa" },
        ];
      case "bank":
      case "pfi":
        return [
          { label: "Open RFQs", value: String(data.openFinancingRequests?.length || 0), icon: Banknote, accent: portal.accent },
          { label: "My Bids", value: String(data.financingBids?.length || 0), icon: TrendingUp, accent: "#10b981" },
          { label: "Exposure", value: fmtUsd(data.financingBids?.reduce((s: number, b: any) => s + b.amountUsd, 0)), icon: DollarSign, accent: "#fbbf24" },
          { label: "Active Loans", value: String(data.financingBids?.filter((b: any) => b.status === "ACCEPTED").length || 0), icon: Activity, accent: "#0ea5e9" },
        ];
      case "gov":
        return [
          { label: "National Trades", value: String(trades.length), sub: "tracked", icon: Globe2, accent: "#b45309" },
          { label: "Cross-border Flow", value: fmtUsd(totalValue), sub: "monitored", icon: DollarSign, accent: "#15803d" },
          { label: "Customs Pending", value: String(data.inbox?.filter((i: any) => i.category === "NEEDS_APPROVAL").length), icon: Landmark, accent: "#ca8a04" },
          { label: "FX Alerts", value: String(data.inbox?.filter((i: any) => i.category === "COMPLIANCE").length), icon: AlertTriangle, accent: "#f87171" },
        ];
      default:
        return [];
    }
  })();

  const quickActions = (() => {
    switch (portal.id) {
      case "trader-buyer": return [{ label: "New Trade Request", icon: Plus }, { label: "Approve Invoice", icon: CheckCircle2 }, { label: "Upload Document", icon: FileText }, { label: "Track Shipment", icon: MapPin }];
      case "trader-seller": return [{ label: "Submit Quote", icon: Store }, { label: "Confirm Pickup", icon: Package }, { label: "Sign Addendum", icon: ShieldCheck }, { label: "File Dispute", icon: Gavel }];
      case "lsp": return [{ label: "Assign Driver", icon: Users }, { label: "Confirm Milestone", icon: CheckCircle2 }, { label: "Upload CMR", icon: FileText }, { label: "Track Fleet", icon: Truck }];
      case "ship": return [{ label: "Issue B/L", icon: FileText }, { label: "Authorise Release", icon: ShieldCheck }, { label: "Update AIS", icon: MapPin }, { label: "Add Vessel", icon: Plus }];
      case "lab": return [{ label: "Start Sampling", icon: FlaskConical }, { label: "Release Report", icon: FileText }, { label: "Schedule Pickup", icon: Package }, { label: "Calibrate", icon: Cpu }];
      case "qc": return [{ label: "Start Inspection", icon: ShieldCheck }, { label: "Log Defect", icon: AlertTriangle }, { label: "Upload Photos", icon: FileText }, { label: "Issue Report", icon: CheckCircle2 }];
      case "cbr": return [{ label: "File Declaration", icon: Landmark }, { label: "Issue EUR.1", icon: FileText }, { label: "Track Nafeza", icon: Globe2 }, { label: "Clear Shipment", icon: CheckCircle2 }];
      case "bank": case "pfi": return [{ label: "Submit Bid", icon: Banknote }, { label: "Review RFQ", icon: FileText }, { label: "Margin Call", icon: AlertTriangle }, { label: "Proof of Reserves", icon: Lock }];
      case "gov": return [{ label: "Assess Declaration", icon: Landmark }, { label: "Reconcile FX", icon: DollarSign }, { label: "Food Safety Alert", icon: AlertTriangle }, { label: "View Trade Map", icon: Globe2 }];
      default: return [];
    }
  })();

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title={`${portal.shortName} Command Center`} subtitle="Universal Command Center · Part 12G · primary landing for all authenticated users" />
        <ExecutiveCards cards={cards} />
      </div>

      <div>
        <SectionHeader title="Quick Actions" subtitle="One-click irreversible actions · voice commands count as zero clicks" />
        <QuickActions actions={quickActions.map((a) => ({ ...a, accent: portal.accent }))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ShipmentsVault trades={trades} role={portal.id.includes("buyer") ? "buyer" : "seller"} title="Open Trades" />
          <ActivityFeed activities={data.activities} />
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-gold" /> AI Operations Summary</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data.inbox?.length > 0 ? (
                <>You have <span className="text-gold font-semibold">{data.inbox.length} pending actions</span>, {data.inbox.filter((i: any) => i.priority >= 80).length} high priority. {activeTrades.length} trades in execution worth {fmtUsd(activeTrades.reduce((s, t) => s + t.tradeValueUsd, 0))}. </>
              ) : "You're all caught up. "}
              {overdueAmount > 0 && <span className="text-red-400">{fmtUsd(overdueAmount)} in outstanding payments.</span>}
              No counterparty recommendations — SGTX is a non-marketplace system.
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Governor & Integrations</h3>
            <IntegrationsMini />
          </Card>
          {portal.dualMode && (
            <Card className="p-4 border-gold/30 bg-gold/5">
              <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">Dual-Mode Active</p>
              <p className="text-xs text-foreground/80">You operate as both Buyer and Seller. Use the toggle in the top bar to switch context. OPA policies enforce mode-appropriate actions.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Truck(props: any) { return <Package {...props} />; }

function IntegrationsMini() {
  const { data: integ } = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/sgtx/integrations")).json() });
  if (!integ) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-1.5">
      {integ.slice(0, 5).map((i: any) => {
        const color = statusColor(i.status);
        return (
          <div key={i.id} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{i.name}</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /><span style={{ color }}>{i.status}</span></span>
          </div>
        );
      })}
    </div>
  );
}

// ============ NEW TRADE REQUEST (Buyer) ============
export function NewTradeRequestScreen() {
  const [step, setStep] = useState(1);
  const [prescreen, setPrescreen] = useState<{ verdict: string; conditions: string[]; content: string } | null>(null);
  const [prescreenLoading, setPrescreenLoading] = useState(false);
  const [prescreenProvider, setPrescreenProvider] = useState<string | null>(null);

  const runPrescreen = async () => {
    if (prescreenLoading) return;
    setPrescreenLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/governor-prescreen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity: "Frozen Strawberries (Senga Sengana, IQF)", hsCode: "0811.10.00", buyerCountry: "DE", sellerCountry: "EG", value: 100000 }),
      });
      const d = await res.json();
      setPrescreen({ verdict: d.verdict, conditions: d.conditions || [], content: d.content });
      setPrescreenProvider(d.provider);
    } catch { setPrescreen({ verdict: "ALLOW", conditions: [], content: "Pre-screen unavailable." }); }
    finally { setPrescreenLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <SectionHeader title="New Trade Request" subtitle="Dynamic Product Form · AI-driven · Phase 1 — Trade Initiation" />
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-5">
          {["Counterparty", "Commodity", "Logistics", "Review & Submit"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step > i + 1 ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : step === i + 1 ? "bg-gold/20 border-gold text-gold" : "border-border text-muted-foreground"}`}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <span className={`text-xs ${step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < 3 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80">AI autocomplete from your saved contacts (Network feature). SGTX never recommends counterparties — you must already know them.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Seller GTID</Label><Input defaultValue="SGTX-EG-TRD-002139-7F3A" className="font-mono text-sm" /></div>
              <div><Label className="text-xs">Seller Legal Name</Label><Input defaultValue="Strawberry Export Co." className="text-sm" /></div>
              <div><Label className="text-xs">Trust Score</Label><div className="flex items-center gap-2 mt-1"><HealthBadge score={92} /><span className="text-xs text-muted-foreground">KYB Tier 2 · Sanctions cleared</span></div></div>
              <div><Label className="text-xs">Incoterm</Label><Select defaultValue="CIF"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["EXW","FCA","FOB","CFR","CIF","DAP","DPU","DDP"].map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="flex justify-end"><Button onClick={() => setStep(2)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Commodity</Label><Input defaultValue="Frozen Strawberries (Senga Sengana, IQF)" /></div>
              <div><Label className="text-xs">HS Code</Label><Input defaultValue="0811.10.00" className="font-mono" /></div>
              <div><Label className="text-xs">Net Weight (kg)</Label><Input defaultValue="20000" type="number" /></div>
              <div><Label className="text-xs">Variety / Grade</Label><Input defaultValue="Senga Sengana · Grade A" /></div>
              <div><Label className="text-xs">Brix (°)</Label><Input defaultValue="9.0" type="number" /></div>
              <div><Label className="text-xs">Cold Chain</Label><Select defaultValue="yes"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Required (−18°C)</SelectItem><SelectItem value="no">Not required</SelectItem></SelectContent></Select></div>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>← Back</Button><Button onClick={() => setStep(3)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Origin Port</Label><Input defaultValue="Alexandria (EGALX)" /></div>
              <div><Label className="text-xs">Destination Port</Label><Input defaultValue="Hamburg (DEHAM)" /></div>
              <div><Label className="text-xs">Container Count</Label><Input defaultValue="2" type="number" /></div>
              <div><Label className="text-xs">Multi-shipment</Label><Select defaultValue="yes"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes (2 shipments)</SelectItem><SelectItem value="no">Single shipment</SelectItem></SelectContent></Select></div>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Governor Pre-Screen (A2 · constraining)</p>
                {!prescreen && !prescreenLoading && <button onClick={runPrescreen} className="text-[0.65rem] text-gold hover:underline">Run AI pre-screen</button>}
                {prescreenProvider && <span className="text-[0.55rem] text-muted-foreground">via {prescreenProvider}</span>}
              </div>
              {prescreenLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Running compliance pre-screen…</div>
              ) : prescreen ? (
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {prescreen.verdict === "ALLOW" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : prescreen.verdict === "CONDITIONAL" ? <AlertTriangle className="w-3 h-3 text-amber-400" /> : <AlertTriangle className="w-3 h-3 text-red-400" />}
                    <span className="font-semibold" style={{ color: prescreen.verdict === "ALLOW" ? "#10b981" : prescreen.verdict === "CONDITIONAL" ? "#fbbf24" : "#f87171" }}>Verdict: {prescreen.verdict}</span>
                  </div>
                  {prescreen.conditions?.map((c: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 ml-5"><span className="text-amber-400">⚠</span> {c}</div>
                  ))}
                  <p className="text-[0.65rem] text-muted-foreground mt-1 ml-5">{prescreen.content.replace(/```json|```/g, "").slice(0, 200)}</p>
                </div>
              ) : (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Click "Run AI pre-screen" to evaluate sanctions, dual-use, jurisdiction, and commodity mixing risks. 🧠 A2 constraining AI.</p>
                </div>
              )}
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>← Back</Button><Button onClick={() => setStep(4)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/30 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span>European Importer GmbH</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span>Strawberry Export Co.</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span>20,000 kg Frozen Strawberries</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Incoterm</span><span>CIF Hamburg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span>Alexandria → Hamburg</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Estimated SGTX Fee (1.5%)</span><span className="text-gold font-semibold">On quote</span></div>
            </div>
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/30 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <p className="text-xs">On submit, the trade request is sent to the seller. USTN is generated at contract lock — not now. No data re-entry across phases.</p>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(3)}>← Back</Button><Button className="bg-gold-gradient text-sovereign"><Send className="w-3.5 h-3.5 mr-1.5" />Submit Trade Request</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ QUOTE BUILDER (Seller) ============
export function QuoteBuilderScreen() {
  const [band, setBand] = useState<{ low?: number; mid?: number; high?: number; rationale?: string } | null>(null);
  const [bandLoading, setBandLoading] = useState(false);
  const [bandText, setBandText] = useState<string | null>(null);
  const [bandProvider, setBandProvider] = useState<string | null>(null);
  const [exwPrice, setExwPrice] = useState("5.00");

  const loadBand = async () => {
    if (bandLoading) return;
    setBandLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/price-band", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity: "Frozen Strawberries IQF", hsCode: "0811.10.00", originCountry: "EG", destCountry: "DE" }),
      });
      const d = await res.json();
      setBandProvider(d.provider);
      setBandText(d.content);
      try {
        const match = d.content.match(/\{[\s\S]*\}/);
        if (match) { const p = JSON.parse(match[0]); setBand({ low: p.low, mid: p.mid, high: p.high, rationale: p.rationale }); }
      } catch {}
    } catch { setBandText("Price band unavailable."); }
    finally { setBandLoading(false); }
  };

  const exw = parseFloat(exwPrice) || 0;
  const withinBand = band && exw >= band.low! && exw <= band.high!;
  const bandPos = band ? Math.max(0, Math.min(100, ((exw - band.low!) / (band.high! - band.low!)) * 100)) : 50;

  return (
    <div className="space-y-4 max-w-4xl">
      <SectionHeader title="Quote & Packing Builder" subtitle="Phase 2 — Seller locks EXW price, packing plan, logistics. AI advisory only." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold text-sm">Pricing</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">EXW Price (USD/kg)</Label><Input value={exwPrice} onChange={(e) => setExwPrice(e.target.value)} type="number" /></div>
            <div><Label className="text-xs">Total EXW</Label><Input defaultValue="100,000" disabled className="font-semibold" /></div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">🧠 AI Price Band (A1 · advisory)</p>
              {!band && !bandLoading && <button onClick={loadBand} className="text-[0.65rem] text-gold hover:underline">Get band</button>}
              {bandProvider && <span className="text-[0.55rem] text-muted-foreground">via {bandProvider}</span>}
            </div>
            {bandLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing market…</div>
            ) : band ? (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400">${band.low?.toFixed(2)}</span>
                  <div className="flex-1 mx-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/40 via-emerald-500/40 to-red-500/40 relative">
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold border-2 border-background" style={{ left: `calc(${bandPos}% - 6px)` }} />
                  </div>
                  <span className="text-red-400">${band.high?.toFixed(2)}</span>
                </div>
                <p className="text-[0.65rem] text-muted-foreground mt-1">Your ${exw.toFixed(2)}/kg is <span className={withinBand ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>{withinBand ? "within" : "outside"} band</span>. {band.rationale}</p>
              </>
            ) : (
              <p className="text-[0.65rem] text-muted-foreground">Click "Get band" for an AI market price advisory (🧠 A1, z-ai). Seller free to override.</p>
            )}
          </div>
          <div><Label className="text-xs">Logistics Mode</Label><Select defaultValue="self"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="self">Self-arranged (Delta Freight + Maersk)</SelectItem><SelectItem value="buyer">Buyer-arranged</SelectItem><SelectItem value="sgtx">SGTX-platform broker license</SelectItem></SelectContent></Select></div>
        </Card>
        <Card className="p-5 space-y-3">
          <h3 className="font-semibold text-sm">Packing Plan (Non-uniform layers)</h3>
          <div className="space-y-2 text-xs">
            {[{ layer: "Pallets", qty: "20", detail: "1,000 kg each · EUR-pallet" }, { layer: "Cartons", qty: "1,600", detail: "12.5 kg · corrugated" }, { layer: "Bags", qty: "—", detail: "IQF loose pack" }].map((l) => (
              <div key={l.layer} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                <span className="font-medium">{l.layer}</span>
                <div className="text-right"><span className="text-foreground">{l.qty}</span><span className="text-muted-foreground ml-2">{l.detail}</span></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div><Label className="text-xs">Net Weight (calc)</Label><Input defaultValue="20,000 kg" disabled /></div>
            <div><Label className="text-xs">Gross Weight (calc)</Label><Input defaultValue="21,500 kg" disabled /></div>
          </div>
          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-3 h-3" /> Packing consistency check passed</div>
        </Card>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline">Save Draft</Button><Button className="bg-gold-gradient text-sovereign"><Send className="w-3.5 h-3.5 mr-1.5" />Submit Quote to Buyer</Button></div>
    </div>
  );
}

// ============ QUOTE REVIEW (Buyer) ============
export function QuoteReviewScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Quote Review & Negotiation" subtitle="Phase 3 — Compare, negotiate, accept. Max 6 clicks to mutual confirmation." />
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div><p className="text-sm font-semibold">Strawberry Export Co.</p><p className="text-[0.65rem] text-muted-foreground font-mono">SGTX-EG-TRD-002139-7F3A · Trust 92</p></div>
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">QUOTE RECEIVED</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-2.5 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">EXW</p><p className="font-semibold">$5.00/kg</p></div>
              <div className="p-2.5 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Logistics</p><p className="font-semibold">$4,200</p></div>
              <div className="p-2.5 rounded-lg bg-gold/10 border border-gold/20"><p className="text-[0.6rem] text-muted-foreground">SGTX Fee</p><p className="font-semibold text-gold">$1,500</p></div>
              <div className="p-2.5 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">CIF Total</p><p className="font-semibold">$105,700</p></div>
            </div>
          </div>
          <div className="space-y-2">
            <Button className="w-full bg-gold-gradient text-sovereign"><CheckCircle2 className="w-4 h-4 mr-1.5" />Accept Quote</Button>
            <Button variant="outline" className="w-full">Counter-offer</Button>
            <Button variant="outline" className="w-full">Request Changes</Button>
            <p className="text-[0.6rem] text-muted-foreground text-center mt-2">Round 2 of negotiation · deadline 14:00 UTC</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============ CONTRACT SIGNING ============
export function ContractSigningScreen() {
  const [clause, setClause] = useState<string | null>(null);
  const [clauseLoading, setClauseLoading] = useState(false);
  const [clauseProvider, setClauseProvider] = useState<string | null>(null);
  const [clauseArticle, setClauseArticle] = useState("Article 4 — SGTX Fee and Non-Custodial Settlement");

  const forge = async () => {
    if (clauseLoading) return;
    setClauseLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/clause-forge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: "SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4", article: clauseArticle }),
      });
      const d = await res.json();
      setClause(d.content);
      setClauseProvider(d.provider);
    } catch { setClause("Clause generation unavailable."); }
    finally { setClauseLoading(false); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <SectionHeader title="Contract Signing" subtitle="Phase 3 — QES via ZITADEL passkey · logistics addenda tracked · Governor validates fee clause" />
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div><p className="font-semibold text-sm">Sales Contract SC-2026-0491</p><p className="text-[0.65rem] text-muted-foreground">Clause Forge (A2) generated · 312 KB · SHA-256 verified</p></div>
          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">READY TO SIGN</Badge>
        </div>
        <div className="space-y-2 text-xs max-h-48 overflow-y-auto scroll-gold p-3 rounded-lg bg-muted/20 border border-border">
          <p><strong>Article 1 — Parties.</strong> Strawberry Export Co. (SGTX-EG-TRD-002139-7F3A) and European Importer GmbH (SGTX-DE-TRD-001234-5B6C)…</p>
          <p className="mt-2"><strong>Article 2 — Commodity.</strong> 20,000 kg Frozen Strawberries (Senga Sengana, IQF), HS 0811.10.00, Brix ≥ 9.0°…</p>
          <p className="mt-2"><strong>Article 3 — Commercial Terms.</strong> CIF Hamburg (Incoterms 2020). Total USD 105,700. Payment via PSP split…</p>
          <p className="mt-2"><strong>Article 4 — SGTX Fee.</strong> 1.5% of invoice value = USD 1,500, collected at contract lock via non-custodial FeeLock…</p>
          <p className="mt-2"><strong>Article 5 — Multi-shipment.</strong> 2 shipments, MSC Amsterdam (16 Apr) and Maersk Levant (22 Apr)…</p>
        </div>
        {/* Clause Forge (A2) */}
        <div className="mt-4 p-3 rounded-lg bg-gold/5 border border-gold/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Clause Forge (A2 · constraining)</p>
            {clauseProvider && <span className="text-[0.55rem] text-muted-foreground">via {clauseProvider}</span>}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <select value={clauseArticle} onChange={(e) => { setClauseArticle(e.target.value); setClause(null); }} className="flex-1 bg-muted/50 rounded-lg px-2 py-1.5 text-xs outline-none border border-border">
              <option>Article 4 — SGTX Fee and Non-Custodial Settlement</option>
              <option>Article 6 — Cold Chain Obligations</option>
              <option>Article 7 — Dispute Resolution</option>
              <option>Article 8 — Force Majeure</option>
            </select>
            {!clause && !clauseLoading && <Button size="sm" onClick={forge} className="h-7 bg-gold-gradient text-sovereign">Draft clause</Button>}
          </div>
          {clauseLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Forging clause…</div>
          ) : clause ? (
            <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap p-2 rounded-lg bg-background/40">{clause}</div>
          ) : (
            <p className="text-[0.65rem] text-muted-foreground">Click "Draft clause" to generate a precise legal clause with the AI Clause Forge (🧠 A2).</p>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/20 border border-border"><p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Buyer Signature</p><p className="text-sm font-semibold text-emerald-400 mt-1">✓ Klaus Bergmann · ZITADEL passkey · QES</p><p className="text-[0.6rem] text-muted-foreground">15 Apr 2026, 11:58 UTC</p></div>
          <div className="p-3 rounded-lg bg-gold/5 border border-gold/30"><p className="text-[0.6rem] text-gold uppercase tracking-wider">Seller Signature</p><p className="text-sm font-semibold mt-1">Awaiting Mohamed Eltonsy…</p><Button size="sm" className="mt-2 bg-gold-gradient text-sovereign h-7"><ShieldCheck className="w-3 h-3 mr-1" />Sign with passkey</Button></div>
        </div>
        <div className="mt-4 p-3 rounded-lg bg-muted/30 flex items-center gap-2 text-xs">
          <Lock className="w-3.5 h-3.5 text-gold" /><span className="text-muted-foreground">On both signatures: USTN <span className="font-mono text-foreground">SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4</span> auto-generated & embedded in all downstream documents.</span>
        </div>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Logistics Addenda</h3>
        <div className="space-y-1.5">
          {[{ name: "Delta Freight — Trucking Addendum", status: "SIGNED" }, { name: "Maersk Levant — Ocean B/L Addendum", status: "SIGNED" }, { name: "Cairo Cold Store — Warehousing", status: "PENDING" }].map((a) => (
            <div key={a.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 text-xs">
              <span>{a.name}</span>
              <Badge variant="outline" className={a.status === "SIGNED" ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}>{a.status}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ DISTRESSED CARGO ============
export function DistressedCargoScreen({ data }: { data: Data }) {
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])].filter((t) => t.status === "DISTRESSED");
  return (
    <div className="space-y-4">
      <SectionHeader title="Distressed Cargo" subtitle="Phase 7 — microUSTN after partial distress · Accelerated Outreach to saved contacts only" />
      {trades.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No distressed cargo in your network. 🔐 SGTX only shows distressed lots from your saved contacts.</p></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trades.map((t) => (
            <Card key={t.id} className="p-4 border-l-4 border-l-orange-500">
              <div className="flex items-center justify-between mb-2">
                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">DISTRESSED · Score 35</Badge>
                <span className="text-[0.6rem] text-muted-foreground font-mono">{t.ustn.slice(0, 22)}…</span>
              </div>
              <p className="text-sm font-semibold">{t.commodity}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.seller.legalName} → {t.buyer.legalName}</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div><p className="text-[0.6rem] text-muted-foreground">Weight</p><p className="font-semibold">{fmtKg(t.netWeightKg)}</p></div>
                <div><p className="text-[0.6rem] text-muted-foreground">Value</p><p className="font-semibold">{fmtUsd(t.tradeValueUsd)}</p></div>
                <div><p className="text-[0.6rem] text-muted-foreground">Shelf life</p><p className="font-semibold text-orange-400">5 days</p></div>
              </div>
              <div className="mt-3 p-2 rounded-lg bg-gold/5 border border-gold/20 text-xs">
                <p className="text-gold font-semibold">Offer received: $4,020</p>
                <p className="text-[0.65rem] text-muted-foreground">from Nile Foods Group (saved contact)</p>
              </div>
              <div className="flex gap-2 mt-3"><Button size="sm" className="bg-gold-gradient text-sovereign h-7">Accept Offer</Button><Button size="sm" variant="outline" className="h-7">Counter</Button></div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ DISPUTES ============
export function DisputesScreen({ data }: { data: Data }) {
  const disputes = data.disputes || [];
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [roots, setRoots] = useState<Record<string, { content: string; provider: string }>>({});

  const analyze = async (disputeId: string) => {
    if (analyzing) return;
    setAnalyzing(disputeId);
    try {
      const res = await fetch("/api/sgtx/ai/dispute-root-cause", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId }),
      });
      const d = await res.json();
      setRoots((r) => ({ ...r, [disputeId]: { content: d.content, provider: d.provider } }));
    } catch { setRoots((r) => ({ ...r, [disputeId]: { content: "Analysis unavailable.", provider: "static" } })); }
    finally { setAnalyzing(null); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Disputes" subtitle="Phase 8 — Evidence compiler · Causal inference (A3) · Mediation → Arbitration · FeeLock frozen" action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>} />
      {disputes.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No open disputes. 🛡 All trades in good standing.</p></Card>
      ) : (
        <div className="space-y-3">
          {disputes.map((d: any) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status), borderColor: `${statusColor(d.status)}55` }}>{d.status}</Badge>
                    <Badge variant="outline" className="text-[0.6rem]">{d.type.replace(/_/g, " ")}</Badge>
                    <span className="text-[0.6rem] text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 22)}…</span>
                  </div>
                  <p className="text-sm text-foreground">{d.description}</p>
                  {(roots[d.id] || d.aiRootCause) && (
                    <div className="mt-2 p-2.5 rounded-lg bg-gold/5 border border-gold/20">
                      <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI Root Cause (A3) {roots[d.id] && <span className="text-muted-foreground normal-case tracking-normal">· via {roots[d.id].provider}</span>}</p>
                      <p className="text-xs text-foreground/90">{roots[d.id]?.content || d.aiRootCause}</p>
                    </div>
                  )}
                  {d.resolution && <p className="text-xs text-emerald-400 mt-2">✓ {d.resolution}</p>}
                  <div className="flex items-center gap-4 mt-2 text-[0.65rem] text-muted-foreground"><span>Claim: {fmtUsd(d.claimAmountUsd)}</span><span>Evidence: {d.evidenceCount} items</span><span>Filed {fmtDate(d.createdAt)}</span></div>
                  {d.status !== "RESOLVED" && !roots[d.id] && !d.aiRootCause && (
                    <button onClick={() => analyze(d.id)} disabled={analyzing === d.id} className="mt-2 text-[0.65rem] text-gold hover:underline disabled:opacity-50 flex items-center gap-1">
                      {analyzing === d.id ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing root cause…</> : <>🧠 Run causal analysis (A3)</>}
                    </button>
                  )}
                </div>
                {d.status !== "RESOLVED" && <Button size="sm" variant="outline" className="h-7">Open Mediation</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ COMPLIANCE ============
export function ComplianceScreen({ data }: { data: Data }) {
  const t = data.tenant;
  return (
    <div className="space-y-4">
      <SectionHeader title="Compliance & KYB" subtitle="Egyptian PDPL (Law 151/2020) · Sanctions · Consent management" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">KYB Status</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span className="font-semibold">{t?.kybTier} / 3</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Lifecycle</span><span className="text-emerald-400">{t?.lifecycleState}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sanctions</span><span className="text-emerald-400">✓ Cleared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GNN proximity</span><span className="text-emerald-400">&gt; 2 hops</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">PQC signatures</span><span className="text-emerald-400">Dilithium3</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Consent (PDPL)</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">GTID resolution</span><span className="text-emerald-400">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Trust score sharing</span><span className="text-emerald-400">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bank details</span><span className="text-muted-foreground">Not shared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cross-border</span><span className="text-emerald-400">EG → DE allowed</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Regulatory Reports</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Nafeza filings</span><span className="font-semibold">12 this month</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ETA invoices</span><span className="font-semibold">18 this month</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">CBE FX reports</span><span className="font-semibold">Auto-linked</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">NFSA certs</span><span className="font-semibold">3 active</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============ AUDIT TRAIL ============
export function AuditScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Trail" subtitle="Loom chain · RLS-filtered · immutable · quantum-safe archival (PQC)" />
      <Card className="p-4">
        <div className="space-y-1">
          {data.activities?.map((a: any, i: number) => (
            <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/20 text-xs">
              <span className="font-mono text-[0.6rem] text-muted-foreground mt-0.5 w-8 text-right">#{String(data.activities.length - i).padStart(4, "0")}</span>
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.type === "SUCCESS" ? "#10b981" : a.type === "WARNING" ? "#fbbf24" : a.type === "CRITICAL" ? "#f87171" : "#60a5fa" }} />
              <div className="flex-1">
                <p className="text-foreground">{a.description}</p>
                <p className="text-[0.6rem] text-muted-foreground">{a.actor?.legalName || "System"} · {fmtDate(a.createdAt)} · hash {a.id.slice(0, 12)}…</p>
              </div>
              <Lock className="w-3 h-3 text-muted-foreground mt-1" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ COMPANY ADMIN ============
export function CompanyAdminScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Company Admin" subtitle="Employees · Roles · Data scopes · Approval chains · Branding · Exit Centre" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Employees</h3>
          <div className="space-y-1.5">
            {data.tenant?.employees?.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: e.avatarColor || "#475569" }}>{e.fullName.charAt(0)}</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{e.fullName}</p><p className="text-[0.6rem] text-muted-foreground truncate">{e.email}</p></div>
                <Badge variant="outline" className="text-[0.6rem]">{e.role}</Badge>
                {e.allowRoleSwitching && <Badge className="text-[0.6rem] bg-gold/15 text-gold">Switch</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Approval Chains</h3>
          <div className="space-y-2 text-xs">
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Contract signing</p><p className="text-[0.65rem] text-muted-foreground">Owner → (auto) Governor</p></div>
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Payment &gt; $50k</p><p className="text-[0.65rem] text-muted-foreground">Operator → Owner → QES</p></div>
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Dispute filing</p><p className="text-[0.65rem] text-muted-foreground">Any role → Owner approval</p></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============ FINANCING (Borrower) ============
export function FinancingBorrowerScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Financing — Borrower" subtitle="Phase 4 — Request pre/post-shipment financing · 0.25% flat fee · DeFi hidden for EG" action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Plus className="w-3.5 h-3.5 mr-1.5" />New Request</Button>} />
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Active Financing Requests</h3>
        <div className="space-y-2">
          {[{ id: "FR-001", amount: 100000, purpose: "PRE_SHIPMENT", status: "BIDDING", bids: 2, apr: "4.8–5.2%" }].map((f) => (
            <div key={f.id} className="p-3 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div><p className="text-sm font-semibold">{f.id} · {fmtUsd(f.amount)}</p><p className="text-[0.65rem] text-muted-foreground">{f.purpose.replace(/_/g, " ")} · {f.bids} bids · APR {f.apr}</p></div>
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">{f.status}</Badge>
              </div>
              <div className="flex gap-2"><Button size="sm" variant="outline" className="h-7">View Bids</Button><Button size="sm" className="bg-gold-gradient text-sovereign h-7">Accept Co-financing</Button></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ FINANCING OPPORTUNITIES (Financier) ============
export function FinancingOpportunitiesScreen({ data }: { data: Data }) {
  const rfqs = data.openFinancingRequests || [];
  return (
    <div className="space-y-4">
      <SectionHeader title="Financing Opportunities" subtitle="Open RFQs · full disclosure · submit bids · non-marketplace (you must know the borrower)" />
      <div className="space-y-3">
        {rfqs.map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">{r.status}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{r.id.slice(0, 8)}</span>
                </div>
                <p className="text-sm font-semibold">{r.borrower?.legalName}</p>
                <p className="text-[0.65rem] text-muted-foreground font-mono">{r.borrower?.gtid}</p>
                <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                  <div><p className="text-[0.6rem] text-muted-foreground">Amount</p><p className="font-semibold">{fmtUsd(r.amountUsd)}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Purpose</p><p className="font-semibold">{r.purpose.replace(/_/g, " ")}</p></div>
                  <div><p className="text-[0.6rem] text-muted-foreground">Bids</p><p className="font-semibold">{r.bids?.length || 0}</p></div>
                </div>
                {r.trade && <p className="text-[0.6rem] text-muted-foreground mt-2">Collateral: USTN {r.trade.ustn?.slice(0, 22)}… · {r.trade.commodity}</p>}
              </div>
              <div className="flex flex-col gap-2 w-44">
                <Input placeholder="Amount USD" className="h-8 text-xs" />
                <Input placeholder="APR %" className="h-8 text-xs" />
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Submit Bid</Button>
              </div>
            </div>
          </Card>
        ))}
        {rfqs.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No open RFQs. You'll see requests from borrowers in your saved network only.</Card>}
      </div>
    </div>
  );
}

// ============ FINANCIER PORTFOLIO ============
export function FinancierPortfolioScreen({ data }: { data: Data }) {
  const bids = data.financingBids || [];
  return (
    <div className="space-y-4">
      <SectionHeader title="My Bids & Active Loans" subtitle="Collateral dashboard · margin calls · ZK proof-of-reserves" />
      <ExecutiveCards cards={[
        { label: "Total Exposure", value: fmtUsd(bids.reduce((s: number, b: any) => s + b.amountUsd, 0)), icon: DollarSign, accent: "#fbbf24" },
        { label: "Active Loans", value: String(bids.filter((b: any) => b.status === "ACCEPTED").length), icon: Banknote, accent: "#10b981" },
        { label: "Pending Bids", value: String(bids.filter((b: any) => b.status === "SUBMITTED").length), icon: Clock, accent: "#60a5fa" },
        { label: "Avg APR", value: "5.0%", icon: TrendingUp, accent: "#a78bfa" },
      ]} />
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Bid History</h3>
        <div className="space-y-2">
          {bids.map((b: any) => (
            <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/20">
              <div className="flex-1">
                <p className="text-xs font-medium">{b.request?.borrower?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">{fmtUsd(b.amountUsd)} @ {b.apr}% APR · {b.isDeFi ? "DeFi" : "Traditional"} · {b.request?.purpose?.replace(/_/g, " ")}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(b.status), borderColor: `${statusColor(b.status)}55` }}>{b.status}</Badge>
            </div>
          ))}
          {bids.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No bids submitted yet.</p>}
        </div>
      </Card>
    </div>
  );
}

// ============ DeFi POOLS (Bank only) ============
export function DefiScreen() {
  return (
    <div className="space-y-4">
      <SectionHeader title="DeFi Pools" subtitle="Aave V3 · protocol comparison · stablecoin health · ZK proof-of-reserves" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { name: "Aave V3 — USDC", apr: 5.2, tvl: 2400000, health: "HEALTHY" },
          { name: "Compound — USDT", apr: 4.8, tvl: 1800000, health: "HEALTHY" },
          { name: "MakerDAO — DAI", apr: 6.1, tvl: 980000, health: "DEGRADED" },
        ].map((p) => (
          <Card key={p.name} className="p-4">
            <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-sm">{p.name}</h3><Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(p.health), borderColor: `${statusColor(p.health)}55` }}>{p.health}</Badge></div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">APR</span><span className="font-semibold text-emerald-400">{p.apr}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">TVL</span><span className="font-semibold">{fmtUsd(p.tvl)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reserve proof</span><span className="text-gold">ZK ✓</span></div>
            </div>
            <Button size="sm" variant="outline" className="w-full mt-3 h-7">Allocate</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ LAB: Test Requests / Queue / Reports ============
export function LabScreens({ data, tab }: { data: Data; tab: string }) {
  const tests = data.labTests || [];
  if (tab === "requests" || tab === "queue") {
    return (
      <div className="space-y-4">
        <SectionHeader title={tab === "requests" ? "Test Requests" : "Sampling Queue"} subtitle="Receive USTN-linked test requests · perform sampling · release reports" />
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="font-semibold text-sm">{tests.length} tests</h3></div>
          <div className="divide-y divide-border/40">
            {tests.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center"><FlaskConical className="w-4 h-4 text-emerald-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t.testType.replace(/_/g, " ")} · {t.sampleRef}</p>
                  <p className="text-[0.6rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 22)}… · {t.trade?.seller?.legalName}</p>
                </div>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(t.status), borderColor: `${statusColor(t.status)}55` }}>{t.status}</Badge>
                {t.status === "COMPLETED" ? <Button size="sm" variant="outline" className="h-7">View Report</Button> : <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Start</Button>}
              </div>
            ))}
            {tests.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tests in queue.</p>}
          </div>
        </Card>
      </div>
    );
  }
  // reports
  return (
    <div className="space-y-4">
      <SectionHeader title="Reports & Results" subtitle="USTN-linked · pass/fail · MRL comparison · PDF/A-3 export" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tests.filter((t: any) => t.status === "COMPLETED").map((t: any) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{t.testType.replace(/_/g, " ")}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 22)}…</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(t.passFail), borderColor: `${statusColor(t.passFail)}55` }}>{t.passFail}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t.result}</p>
            {t.parameters && (
              <div className="mt-2 p-2 rounded-lg bg-muted/20 text-[0.65rem] space-y-0.5">
                {Object.entries(JSON.parse(t.parameters)).map(([k, v]: any) => <div key={k} className="flex justify-between"><span className="text-muted-foreground capitalize">{k}</span><span>{v}</span></div>)}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ QC: Schedule / Field / Reports ============
export function QcScreens({ data, tab }: { data: Data; tab: string }) {
  const insp = data.qcInspections || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "schedule" ? "Inspection Schedule" : tab === "field" ? "Field Inspections" : "QC Reports"} subtitle="Pre-shipment · loading · discharge · conditional pass with action plan" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insp.map((q: any) => (
          <Card key={q.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{q.inspectionType.replace(/_/g, " ")}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{q.trade?.ustn?.slice(0, 22)}… · {q.trade?.seller?.legalName}</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(q.result || q.status), borderColor: `${statusColor(q.result || q.status)}55` }}>{q.result || q.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><p className="text-[0.6rem] text-muted-foreground">Inspector</p><p className="font-medium">{q.inspectorName}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Defects</p><p className="font-medium">{q.defectCount}</p></div>
            </div>
            {q.notes && <p className="text-xs text-muted-foreground mt-2">{q.notes}</p>}
            {q.actionPlan && <p className="text-xs text-amber-400 mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Action plan: {q.actionPlan}</p>}
          </Card>
        ))}
        {insp.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-2">No inspections.</Card>}
      </div>
    </div>
  );
}

// ============ CBR: Declarations / Certificates / Clearance ============
export function CbrScreens({ data, tab }: { data: Data; tab: string }) {
  const decls = data.customsDecls || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "declarations" ? "Customs Declarations (Nafeza)" : tab === "certificates" ? "Certificates of Origin" : "Clearance Status"} subtitle="File SAD via Nafeza · EUR.1 · idempotency keys · mTLS" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {decls.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><Landmark className="w-4 h-4 text-amber-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{d.regime} · {d.declarationNo}</p>
                <p className="text-[0.6rem] text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 22)}… · {d.trade?.seller?.legalName} → {d.trade?.buyer?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">Nafeza: {d.nafezaStatus}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status), borderColor: `${statusColor(d.status)}55` }}>{d.status}</Badge>
            </div>
          ))}
          {decls.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No declarations.</p>}
        </div>
      </Card>
    </div>
  );
}

// ============ SHIP: Vessels / Containers / B/L ============
export function ShipScreens({ data, tab }: { data: Data; tab: string }) {
  const shipments = data.shipmentsCarrier || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "vessels" ? "Vessel Fleet" : tab === "containers" ? "Container Release Authorisation (CRA)" : tab === "bl" ? "Bill of Lading" : "Schedules & AIS"} subtitle="mTLS digital signatures · terminal integration · AIS tracking" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {shipments.map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{s.vesselName || "TBD"} · Shipment {s.sequence}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{s.trade?.ustn?.slice(0, 22)}…</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status), borderColor: `${statusColor(s.status)}55` }}>{s.status.replace(/_/g, " ")}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><p className="text-[0.6rem] text-muted-foreground">Container</p><p className="font-mono">{s.containerNo}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">IMO</p><p className="font-mono">{s.vesselImo}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Position</p><p className="font-mono">{s.lat?.toFixed(2)}, {s.lng?.toFixed(2)}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">ETA</p><p>{fmtDate(s.eta)}</p></div>
            </div>
            {tab === "containers" && s.status === "ARRIVED" && (
              <Button size="sm" className="w-full mt-3 bg-gold-gradient text-sovereign h-7"><ShieldCheck className="w-3 h-3 mr-1" />Authorise Release (CRA)</Button>
            )}
            {tab === "bl" && <Button size="sm" variant="outline" className="w-full mt-3 h-7"><FileText className="w-3 h-3 mr-1" />Issue B/L</Button>}
          </Card>
        ))}
        {shipments.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-2">No shipments assigned.</Card>}
      </div>
    </div>
  );
}

// ============ LSP: Assignments / Milestones / Addenda ============
export function LspScreens({ data, tab }: { data: Data; tab: string }) {
  const shipments = data.shipmentsCarrier || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "assignments" ? "Assignments" : tab === "milestones" ? "Milestone Confirmation" : tab === "addenda" ? "Logistics Addenda" : "Fleet & Drivers"} subtitle="Container pickup · trucking · milestone confirmations · offline-capable driver app" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {shipments.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center"><Package className="w-4 h-4 text-orange-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Container {s.containerNo} · {s.vesselName}</p>
                <p className="text-[0.6rem] text-muted-foreground font-mono">{s.trade?.ustn?.slice(0, 22)}… · {s.trade?.seller?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">{s.originPort} → {s.destPort} · ETA {fmtDate(s.eta)}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status), borderColor: `${statusColor(s.status)}55` }}>{s.status.replace(/_/g, " ")}</Badge>
              {tab === "milestones" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Confirm</Button>}
            </div>
          ))}
          {shipments.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No assignments.</p>}
        </div>
      </Card>
      {tab === "assignments" && shipments.length > 0 && (
        <LoadingGuideWidget commodity={shipments[0].trade?.commodity || "Frozen Strawberries"} containerCount={shipments[0].containerCount || 1} coldChain={shipments[0].trade?.coldChain || false} />
      )}
    </div>
  );
}

// ============ GOV: Trade Flow / Customs / FX / Food Safety ============
export function GovScreens({ data, tab }: { data: Data; tab: string }) {
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
  if (tab === "integrations") {
    return (
      <div className="space-y-4">
        <SectionHeader title="External Integrations Health" subtitle="Nafeza · CargoX · ETA · PSPs · CBE · AIS — real-time monitoring" />
        <IntegrationsFull />
        <InferenceLogScreen />
      </div>
    );
  }
  if (tab === "fx") {
    return (
      <div className="space-y-4">
        <SectionHeader title="FX & Settlement (CBE)" subtitle="Cross-border flow monitoring · USTN-linked · reconcile every dollar/pound" />
        <ExecutiveCards cards={[
          { label: "Inbound FX (30d)", value: fmtUsd(482000), icon: DollarSign, accent: "#10b981", trend: "+8%" },
          { label: "Outbound FX (30d)", value: fmtUsd(218000), icon: DollarSign, accent: "#fbbf24" },
          { label: "Pending Reconciliation", value: "3", icon: Clock, accent: "#60a5fa" },
          { label: "AML Flags", value: "0", icon: ShieldCheck, accent: "#10b981" },
        ]} />
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Recent Cross-border Flows</h3>
          <div className="space-y-2">
            {trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs">
                <span className="font-mono text-[0.6rem] text-muted-foreground flex-1 truncate">{t.ustn.slice(0, 24)}…</span>
                <span>{t.originCountry} → {t.destCountry}</span>
                <span className="font-semibold">{fmtUsd(t.tradeValueUsd)}</span>
                <Badge variant="outline" className="text-[0.6rem]">RECONCILED</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  if (tab === "food-safety") {
    return (
      <div className="space-y-4">
        <SectionHeader title="Food Safety (NFSA)" subtitle="Phytosanitary · health certificates · lab report oversight" />
        <Card className="p-4"><h3 className="font-semibold text-sm mb-3">Active Certificates</h3><div className="space-y-2 text-xs">
          {[{ t: "Phytosanitary — Strawberries", s: "ISSUED" }, { t: "Health Certificate HC-118", s: "ISSUED" }, { t: "Cold Treatment Certificate", s: "PENDING" }].map((c) => (
            <div key={c.t} className="flex items-center justify-between p-2 rounded-lg bg-muted/20"><span>{c.t}</span><Badge variant="outline" className="text-[0.6rem]">{c.s}</Badge></div>
          ))}
        </div></Card>
      </div>
    );
  }
  if (tab === "customs") {
    return (
      <div className="space-y-4">
        <SectionHeader title="Customs Assessment" subtitle="Nafeza declarations · assess · clear · hold" />
        <Card className="p-4"><p className="text-xs text-muted-foreground">View and assess all declarations filed via Nafeza. Each is USTN-linked for full traceability.</p></Card>
      </div>
    );
  }
  // trade-flow (default)
  return (
    <div className="space-y-4">
      <SectionHeader title="National Trade Flow" subtitle="Real-time visibility of every cross-border trade moving through SGTX" />
      <ExecutiveCards cards={[
        { label: "Active Trades", value: String(trades.length), icon: Globe2, accent: "#b45309" },
        { label: "Total Value", value: fmtUsd(trades.reduce((s, t) => s + t.tradeValueUsd, 0)), icon: DollarSign, accent: "#15803d" },
        { label: "Customs Cleared", value: String(trades.filter((t) => t.phase >= 5).length), icon: CheckCircle2, accent: "#10b981" },
        { label: "Revenue Collected", value: fmtUsd(trades.reduce((s, t) => s + (t.sgtxFeeUsd || 0), 0)), icon: Landmark, accent: "#ca8a04" },
      ]} />
      <ShipmentsVault trades={trades} role="gov" title="All Tracked Trades" />
    </div>
  );
}

function IntegrationsFull() {
  const { data: integ } = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/sgtx/integrations")).json() });
  if (!integ) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading integrations…</Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {integ.map((i: any) => {
        const color = statusColor(i.status);
        return (
          <Card key={i.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{i.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color, background: `${color}1a` }}>{i.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-[0.6rem] text-muted-foreground">Latency</p><p className="font-semibold">{i.latencyMs}ms</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Error rate</p><p className="font-semibold">{i.errorRate}%</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Uptime 30d</p><p className="font-semibold">{i.uptime30d}%</p></div>
            </div>
            <p className="text-[0.6rem] text-muted-foreground mt-2">{i.lastIncident}</p>
          </Card>
        );
      })}
    </div>
  );
}

// ============ MAIN DISPATCHER ============
export function PortalContent({ portal, data }: { portal: PortalConfig; data: Data }) {
  const tab = data._activeTab || portal.tabs[0].id;
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];

  // Universal screens (shared across portals)
  if (tab === "command") return <CommandCenter portal={portal} data={data} />;
  if (tab === "shipments") return <div className="space-y-4"><SectionHeader title={portal.id.includes("seller") ? "Outbound Shipments" : "Shipments"} subtitle="Shared Shipments Vault · click any USTN to open the Trade Command Center" /><ShipmentsVault trades={trades} role={portal.id.includes("buyer") ? "buyer" : "seller"} /></div>;
  if (tab === "documents") return <div className="space-y-4"><SectionHeader title="Documents" subtitle="USTN-linked · PDF/A-3 · verify · upload · request" /><DocumentsList documents={trades.flatMap((t: any) => t.documents || [])} /></div>;
  if (tab === "invoices") return <div className="space-y-4"><SectionHeader title="Invoices & Payments" subtitle="ETA-compliant XML · PSP split · non-custodial FeeLock" /><InvoicesList invoices={data.invoices || []} perspective={portal.id.includes("seller") ? "payee" : "payer"} /></div>;
  if (tab === "audit") return <AuditScreen data={data} />;
  if (tab === "admin") return <CompanyAdminScreen data={data} />;
  if (tab === "compliance") return <ComplianceScreen data={data} />;
  if (tab === "disputes") return <DisputesScreen data={data} />;
  if (tab === "distressed") return <DistressedCargoScreen data={data} />;
  if (tab === "network") return <NetworkScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "readiness") return <ReadinessScreen tenantGtid={portal.defaultTenantGtid} />;

  // Trader-buyer specific
  if (portal.id === "trader-buyer") {
    if (tab === "new-trade") return <NewTradeRequestScreen />;
    if (tab === "quotes") return <QuoteReviewScreen data={data} />;
    if (tab === "contract") return <ContractSigningScreen />;
    if (tab === "financing") return <FinancingBorrowerScreen data={data} />;
  }

  // Trader-seller specific
  if (portal.id === "trader-seller") {
    if (tab === "requests") return <div className="space-y-4"><SectionHeader title="Pending Requests" subtitle="Inbound trade requests awaiting your quote" /><ShipmentsVault trades={data.tradesAsBuyer || []} role="seller" title="Pending Trade Requests" /></div>;
    if (tab === "quote-builder") return <QuoteBuilderScreen />;
    if (tab === "contract") return <ContractSigningScreen />;
    if (tab === "financing") return <FinancingBorrowerScreen data={data} />;
  }

  // LSP
  if (portal.id === "lsp") {
    if (["assignments", "milestones", "addenda", "fleet"].includes(tab)) return <LspScreens data={data} tab={tab} />;
  }

  // SHIP
  if (portal.id === "ship") {
    if (["vessels", "containers", "bl", "schedules"].includes(tab)) return <ShipScreens data={data} tab={tab} />;
  }

  // LAB
  if (portal.id === "lab") {
    if (["requests", "queue", "reports"].includes(tab)) return <LabScreens data={data} tab={tab} />;
  }

  // QC
  if (portal.id === "qc") {
    if (["schedule", "field", "reports"].includes(tab)) return <QcScreens data={data} tab={tab} />;
  }

  // CBR
  if (portal.id === "cbr") {
    if (["declarations", "certificates", "clearance"].includes(tab)) return <CbrScreens data={data} tab={tab} />;
  }

  // BANK / PFI
  if (portal.id === "bank" || portal.id === "pfi") {
    if (tab === "opportunities") return <FinancingOpportunitiesScreen data={data} />;
    if (tab === "portfolio") return <FinancierPortfolioScreen data={data} />;
    if (tab === "defi") return <DefiScreen />;
    if (tab === "borrowers") return <div className="space-y-4"><SectionHeader title="Financed Companies" subtitle="Historical borrower data · repayment performance · non-marketplace" /><Card className="p-4 text-xs text-muted-foreground">Borrower history available for companies you've previously financed.</Card></div>;
    if (tab === "collateral") return <div className="space-y-4"><SectionHeader title="Collateral & Margin Calls" subtitle="FeeLock-secured · ZK proof-of-reserves" /><Card className="p-4 text-xs text-muted-foreground">All loans are over-collateralised via FeeLock. No margin calls currently active.</Card></div>;
    if (tab === "settlement") return <div className="space-y-4"><SectionHeader title="FX & Settlement" subtitle="CBE integration · PSP split · non-custodial" /><Card className="p-4 text-xs text-muted-foreground">Settlement instructions auto-generated and USTN-linked.</Card></div>;
  }

  // GOV
  if (portal.id === "gov") {
    if (["trade-flow", "customs", "fx", "food-safety", "integrations"].includes(tab)) return <GovScreens data={data} tab={tab} />;
    if (tab === "governor") return <GovernorDecisionScreen />;
    if (tab === "opa") return <OpaPolicyScreen />;
    if (tab === "loom") return <LoomVerificationScreen />;
    if (tab === "jurisdictions") return <JurisdictionMatrixScreen />;
    if (tab === "qes") return <QesScreen />;
    if (tab === "device") return <DeviceTrustScreen tenantGtid={portal.defaultTenantGtid} />;
    if (tab === "evidence") return <EvidencePackageScreen />;
    if (tab === "compliance-screen") return <ComplianceScreeningScreen tenantGtid={portal.defaultTenantGtid} />;
    if (tab === "sar") return <SarScreen />;
  }

  // Fallback
  return <CommandCenter portal={portal} data={data} />;
}
