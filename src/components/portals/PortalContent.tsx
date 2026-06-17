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
import { OrgGraphScreen, LifecycleScreen, RoleJourneyScreen, TrustPassportScreen } from "@/components/sgtx/identity-screens";
import { UstnMasterScreen } from "@/components/sgtx/ustn-screens";
import { fmtUsd, fmtDate, fmtKg, statusColor, healthComponents, PHASE_LABELS } from "@/lib/sgtx/format";
import type { PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingBag, Store, Ship, FileText, Banknote, ShieldCheck, AlertTriangle, TrendingUp,
  Users, Container, FlaskConical, MapPin, Building2, Plus, Send, Gavel, Landmark,
  Activity, DollarSign, Package, CheckCircle2, Clock, Sparkles, Cpu, Globe2, Lock, Loader2,
} from "lucide-react";
import { useState, useEffect } from "react";

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
// ============ NEW TRADE REQUEST (Buyer) — Full Phase 1 Implementation ============
const INCOTERM_REFERENCE: Record<string, { sellerLogisticsTo: string; sellerFreight: boolean; sellerDestCharges: boolean; sellerDuties: boolean; mandatoryServices: string[] }> = {
  EXW: { sellerLogisticsTo: "Seller's premises", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: [] },
  FCA: { sellerLogisticsTo: "Named place (carrier)", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: [] },
  FOB: { sellerLogisticsTo: "Loading on vessel", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Export clearance"] },
  CFR: { sellerLogisticsTo: "Destination port", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Ocean freight", "Export clearance"] },
  CIF: { sellerLogisticsTo: "Destination port + insurance", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Ocean freight", "Insurance", "Export clearance"] },
  CPT: { sellerLogisticsTo: "Named place", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Main carriage", "Export clearance"] },
  CIP: { sellerLogisticsTo: "Named place + insurance", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Main carriage", "Insurance", "Export clearance"] },
  DAP: { sellerLogisticsTo: "Named place", sellerFreight: true, sellerDestCharges: true, sellerDuties: false, mandatoryServices: ["Main carriage", "Destination charges", "Export clearance"] },
  DPU: { sellerLogisticsTo: "Terminal", sellerFreight: true, sellerDestCharges: true, sellerDuties: false, mandatoryServices: ["Main carriage", "Terminal charges", "Export clearance"] },
  DDP: { sellerLogisticsTo: "Named place (duties paid)", sellerFreight: true, sellerDestCharges: true, sellerDuties: true, mandatoryServices: ["Main carriage", "Destination charges", "Import duties", "Export clearance"] },
};

const COMMODITY_TYPES = ["Fresh Fruits", "Fresh Vegetables", "Frozen Fruits", "Frozen Vegetables", "Grains", "Dairy", "Meat", "Seafood", "Other"];
const PRODUCTS_BY_TYPE: Record<string, { name: string; hs: string }[]> = {
  "Fresh Fruits": [{ name: "Valencia Oranges", hs: "0805.10" }, { name: "Navel Oranges", hs: "0805.10" }, { name: "Eureka Lemons", hs: "0805.50" }, { name: "Strawberries (Fresh)", hs: "0810.10" }],
  "Frozen Fruits": [{ name: "Frozen Strawberries (IQF)", hs: "0811.10" }, { name: "Frozen Raspberries", hs: "0811.20" }, { name: "Frozen Mangoes", hs: "0811.90" }],
  "Fresh Vegetables": [{ name: "Fresh Onions", hs: "0703.10" }, { name: "Fresh Tomatoes", hs: "0702.00" }, { name: "Fresh Potatoes", hs: "0701.90" }],
  "Frozen Vegetables": [{ name: "Frozen Peas", hs: "0710.21" }, { name: "Frozen Spinach", hs: "0710.30" }],
  "Grains": [{ name: "Rice", hs: "1006.30" }, { name: "Wheat", hs: "1001.99" }],
  "Dairy": [{ name: "Cheese", hs: "0406.90" }, { name: "Butter", hs: "0405.10" }],
  "Meat": [{ name: "Frozen Beef", hs: "0202.30" }, { name: "Frozen Chicken", hs: "0207.14" }],
  "Seafood": [{ name: "Frozen Shrimp", hs: "0306.17" }, { name: "Fresh Salmon", hs: "0302.12" }],
  "Other": [],
};

export function NewTradeRequestScreen() {
  const [step, setStep] = useState(1);
  const [prescreen, setPrescreen] = useState<{ verdict: string; conditions: string[]; content: string } | null>(null);
  const [prescreenLoading, setPrescreenLoading] = useState(false);
  const [prescreenProvider, setPrescreenProvider] = useState<string | null>(null);

  // 3B.2.2 Incoterm autoconfiguration
  const [incoterm, setIncoterm] = useState("CIF");
  const [incotermSummary, setIncotermSummary] = useState<string | null>(null);
  const [incotermLoading, setIncotermLoading] = useState(false);

  // 3B.2.3.2 Two-way product/HS code
  const [commodityType, setCommodityType] = useState("Frozen Fruits");
  const [productName, setProductName] = useState("Frozen Strawberries (IQF)");
  const [hsCode, setHsCode] = useState("0811.10");

  // 3B.2.3.3 AI Product Form Agent
  const [productForm, setProductForm] = useState<any>(null);
  const [productFormLoading, setProductFormLoading] = useState(false);

  // 3B.2.3.1 Per-container fields
  const [containers, setContainers] = useState([{ id: 1, originCountry: "EG", destCountry: "DE", port: "Hamburg (DEHAM)", palletized: true, palletSize: "EUR", pallets: 20, notes: "" }]);

  // 3B.2.4 MultiShipment schedule
  const [multiShipment, setMultiShipment] = useState(false);
  const [shipments, setShipments] = useState([{ id: 1, deliveryDate: "", port: "Hamburg (DEHAM)", containers: 1 }]);

  // 3B.2.5 AI Container Advisor
  const [containerAdvice, setContainerAdvice] = useState<any>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  // 3B.2.6 Marketplace attribution
  const [attribution, setAttribution] = useState<{ partner: string; date: string; revenueShare: number } | null>({ partner: "TradeBridge", date: "2025-08-15", revenueShare: 0.5 });

  // 3B.2.8 Draft autosave
  const [draftSaved, setDraftSaved] = useState<string | null>(null);

  const incotermConfig = INCOTERM_REFERENCE[incoterm] || INCOTERM_REFERENCE.CIF;

  // Incoterm summary
  const loadIncotermSummary = async () => {
    if (incotermLoading || incotermSummary) return;
    setIncotermLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/incoterm-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incoterm, buyerCountry: "DE", sellerCountry: "EG" }) });
      const d = await res.json(); setIncotermSummary(d.content);
    } catch { setIncotermSummary("Unable to generate summary."); }
    finally { setIncotermLoading(false); }
  };

  // Two-way product/HS code sync
  const onProductSelect = (name: string) => {
    setProductName(name);
    const product = (PRODUCTS_BY_TYPE[commodityType] || []).find(p => p.name === name);
    if (product) setHsCode(product.hs);
    loadProductForm(commodityType, name, product?.hs || hsCode);
  };
  const onHsCodeInput = (hs: string) => {
    setHsCode(hs);
    const product = Object.values(PRODUCTS_BY_TYPE).flat().find(p => p.hs === hs);
    if (product) setProductName(product.name);
    loadProductForm(commodityType, product?.name || productName, hs);
  };

  // AI Product Form Agent
  const loadProductForm = async (ct: string, pn: string, hs: string) => {
    if (productFormLoading) return;
    setProductFormLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/product-form", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodityType: ct, productName: pn, hsCode: hs }) });
      const d = await res.json();
      try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setProductForm(JSON.parse(m[0])); } catch {}
    } catch {} finally { setProductFormLoading(false); }
  };

  // Container Advisor
  const loadContainerAdvice = async () => {
    const totalPallets = containers.reduce((s, c) => s + (c.pallets || 0), 0);
    if (adviceLoading || !totalPallets) return;
    setAdviceLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/container-advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ palletCount: totalPallets, palletType: containers[0]?.palletSize || "EUR" }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setContainerAdvice(JSON.parse(m[0])); } catch {}
    } catch {} finally { setAdviceLoading(false); }
  };

  const runPrescreen = async () => {
    if (prescreenLoading) return;
    setPrescreenLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/governor-prescreen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: productName, hsCode, buyerCountry: "DE", sellerCountry: "EG", value: 100000 }) });
      const d = await res.json(); setPrescreen({ verdict: d.verdict, conditions: d.conditions || [], content: d.content }); setPrescreenProvider(d.provider);
    } catch { setPrescreen({ verdict: "ALLOW", conditions: [], content: "Pre-screen unavailable." }); }
    finally { setPrescreenLoading(false); }
  };

  // Draft autosave (every 30s)
  useEffect(() => {
    const interval = setInterval(() => { setDraftSaved(new Date().toLocaleTimeString()); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const cloneContainer = () => setContainers(c => [...c, { ...c[c.length - 1], id: c.length + 1, notes: "" }]);
  const addShipment = () => setShipments(s => [...s, { id: s.length + 1, deliveryDate: "", port: "Hamburg (DEHAM)", containers: 1 }]);
  const removeShipment = (id: number) => setShipments(s => s.filter(x => x.id !== id));

  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="New Trade Request" subtitle="Phase 1 — Dynamic Product Form · AI-driven · incoterm autoconfiguration · multishipment · container advisor" />
      {/* Draft autosave indicator */}
      {draftSaved && <div className="text-[0.6rem] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Draft auto-saved at {draftSaved}</div>}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-5">
          {["Counterparty", "Commodity", "Containers", "Review & Submit"].map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step > i + 1 ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : step === i + 1 ? "bg-gold/20 border-gold text-gold" : "border-border text-muted-foreground"}`}>{step > i + 1 ? "✓" : i + 1}</div>
              <span className={`text-xs ${step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < 3 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* STEP 1: Seller Selection + Incoterm */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground/80">3B.2.1: Select from saved contacts or enter GTID directly. SGTX never recommends counterparties — you must already know them.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Seller GTID (autocomplete from contacts)</Label><Input defaultValue="SGTX-EG-TRD-002139-7F3A" className="font-mono text-sm" /></div>
              <div><Label className="text-xs">Seller Legal Name</Label><Input defaultValue="Strawberry Export Co." className="text-sm" /></div>
              <div><Label className="text-xs">Trust Score</Label><div className="flex items-center gap-2 mt-1"><HealthBadge score={92} /><span className="text-xs text-muted-foreground">KYB Tier 2 · ✓ Sanctions cleared</span></div></div>
              {/* 3B.2.2 Incoterm with autoconfiguration */}
              <div>
                <Label className="text-xs">Incoterm (Incoterms 2020) — auto-configures seller services</Label>
                <Select value={incoterm} onValueChange={(v) => { setIncoterm(v); setIncotermSummary(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(INCOTERM_REFERENCE).map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select>
              </div>
            </div>
            {/* Incoterm reference table */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Incoterm Reference: {incoterm}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Seller logistics to:</span><p className="font-medium">{incotermConfig.sellerLogisticsTo}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Ocean/air freight:</span><p className={incotermConfig.sellerFreight ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerFreight ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Destination charges:</span><p className={incotermConfig.sellerDestCharges ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerDestCharges ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Duties:</span><p className={incotermConfig.sellerDuties ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerDuties ? "✓ Seller" : "✗ Buyer"}</p></div>
              </div>
              {/* Seller mandatory services */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-[0.6rem] text-muted-foreground">Seller's mandatory logistics services (Phase 2):</span>
                {incotermConfig.mandatoryServices.map(s => <Badge key={s} variant="outline" className="text-[0.55rem] text-gold border-gold/30">{s}</Badge>)}
              </div>
              {/* AI plain-language summary */}
              <div className="mt-2 flex items-center gap-2">
                {!incotermSummary && !incotermLoading && <button onClick={loadIncotermSummary} className="text-[0.65rem] text-gold hover:underline">🧠 Generate AI responsibility summary</button>}
                {incotermLoading && <span className="text-[0.65rem] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</span>}
                {incotermSummary && <p className="text-xs text-foreground/80 flex items-center gap-1"><Sparkles className="w-3 h-3 text-gold" /> {incotermSummary}</p>}
              </div>
            </div>
            <div className="flex justify-end"><Button onClick={() => setStep(2)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}

        {/* STEP 2: Commodity + Dynamic Product Form */}
        {step === 2 && (
          <div className="space-y-4">
            {/* 3B.2.3.2 Two-way product/HS code */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Commodity Type (filters products)</Label>
                <Select value={commodityType} onValueChange={(v) => { setCommodityType(v); setProductName(""); setHsCode(""); setProductForm(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMMODITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </div>
              <div>
                <Label className="text-xs">Product (dropdown — syncs HS code)</Label>
                <Select value={productName} onValueChange={onProductSelect}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  {(PRODUCTS_BY_TYPE[commodityType] || []).map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent></Select>
              </div>
              <div>
                <Label className="text-xs">HS Code (type — syncs product name)</Label>
                <Input value={hsCode} onChange={(e) => onHsCodeInput(e.target.value)} className="font-mono text-sm" placeholder="0811.10" />
              </div>
            </div>
            {/* 3B.2.3.3 AI Product Form Agent */}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Product Form Agent (A2)</p>
                {productForm && <span className="text-[0.55rem] text-muted-foreground">via z-ai</span>}
              </div>
              {productFormLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Generating dynamic specs…</div>
              ) : productForm ? (
                <div className="space-y-2">
                  {productForm.dynamic_fields && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {productForm.dynamic_fields.map((f: any, i: number) => (
                        <div key={i}><Label className="text-[0.6rem]">{f.name}{f.mandatory ? " *" : ""}</Label>
                          {f.type === "dropdown" ? <Select defaultValue={f.default}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(f.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
                          : <Input type={f.type === "number" ? "number" : "text"} defaultValue={f.default} className="h-8 text-xs" />}</div>
                      ))}
                    </div>
                  )}
                  {productForm.required_documents && <div className="flex items-center gap-2 flex-wrap">{productForm.required_documents.map((d: any, i: number) => <Badge key={i} variant="outline" className="text-[0.55rem] text-amber-400 border-amber-500/30">{d.type}{d.mandatory ? " *" : ""}</Badge>)}</div>}
                  {productForm.special_conditions && productForm.special_conditions.map((c: string, i: number) => <p key={i} className="text-[0.65rem] text-amber-400">⚠ {c}</p>)}
                </div>
              ) : (
                <p className="text-[0.65rem] text-muted-foreground">Select a product or enter HS code to trigger the AI Product Form Agent (generates variety, brix, packing defaults, required docs, treatment details).</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Net Weight (kg)</Label><Input defaultValue="20000" type="number" /></div>
              <div><Label className="text-xs">Cold Chain</Label><Select defaultValue="yes"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Required (−18°C)</SelectItem><SelectItem value="no">Not required</SelectItem></SelectContent></Select></div>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>← Back</Button><Button onClick={() => setStep(3)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}

        {/* STEP 3: Containers + Multishipment + Container Advisor */}
        {step === 3 && (
          <div className="space-y-4">
            {/* 3B.2.3.1 Per-container fields */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Containers ({containers.length})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={cloneContainer} className="h-7 text-xs">Clone Container</Button>
                <Button size="sm" variant="outline" onClick={() => setContainers(c => [...c, { id: c.length + 1, originCountry: "EG", destCountry: "DE", port: "Hamburg (DEHAM)", palletized: true, palletSize: "EUR", pallets: 10, notes: "" }])} className="h-7 text-xs">+ Add Container</Button>
              </div>
            </div>
            {containers.map((c, i) => (
              <div key={c.id} className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold">Container {i + 1}</span>{containers.length > 1 && <button onClick={() => setContainers(cs => cs.filter(x => x.id !== c.id))} className="text-[0.6rem] text-red-400 hover:underline">Remove</button>}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><Label className="text-[0.6rem]">Origin Country</Label><Select value={c.originCountry} onValueChange={v => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, originCountry: v } : x))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["EG","VN","DE","US","CN"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Destination Country</Label><Select value={c.destCountry} onValueChange={v => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, destCountry: v } : x))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["DE","EG","US","CN","VN"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Port of Discharge</Label><Input value={c.port} onChange={e => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, port: e.target.value } : x))} className="h-8 text-xs" /></div>
                  <div><Label className="text-[0.6rem]">Pallets</Label><Input type="number" value={c.pallets} onChange={e => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, pallets: Number(e.target.value) } : x))} className="h-8 text-xs" /></div>
                  <div><Label className="text-[0.6rem]">Palletized?</Label><Select value={c.palletized ? "yes" : "no"} onValueChange={v => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, palletized: v === "yes" } : x))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
                  {c.palletized ? (
                    <div><Label className="text-[0.6rem]">Pallet Size</Label><Select value={c.palletSize} onValueChange={v => setContainers(cs => cs.map(x => x.id === c.id ? { ...x, palletSize: v } : x))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR">EUR (800x1200mm)</SelectItem><SelectItem value="ISO">ISO (1000x1200mm)</SelectItem></SelectContent></Select></div>
                  ) : null}
                </div>
              </div>
            ))}

            {/* 3B.2.5 AI Container Advisor */}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
              <div className="flex items-center justify-between mb-1"><p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">🧠 AI Container Advisor (A1 · advisory)</p>{!containerAdvice && !adviceLoading && <button onClick={loadContainerAdvice} className="text-[0.65rem] text-gold hover:underline">Get advice</button>}</div>
              {adviceLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing pallet configuration…</div>
              : containerAdvice ? <div className="flex items-center gap-2"><p className="text-xs text-foreground/90 flex-1">{containerAdvice.suggestion} — {containerAdvice.reason}</p>{containerAdvice.adjust_needed && <Button size="sm" className="h-6 text-[0.6rem] bg-gold-gradient text-sovereign">Adjust</Button>}<button className="text-[0.6rem] text-muted-foreground hover:underline">Ignore</button></div>
              : <p className="text-[0.65rem] text-muted-foreground">Click "Get advice" for a container configuration suggestion based on your pallet count and type.</p>}
            </div>

            {/* 3B.2.4 MultiShipment schedule builder */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs flex items-center gap-2"><input type="checkbox" checked={multiShipment} onChange={e => setMultiShipment(e.target.checked)} className="rounded" /> Request multi-shipment contract</Label>
                {multiShipment && <Button size="sm" variant="outline" onClick={addShipment} className="h-7 text-xs">+ Add Shipment</Button>}
              </div>
              {multiShipment && shipments.map((s, i) => (
                <div key={s.id} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-2 rounded-lg bg-background/40">
                  <div><Label className="text-[0.6rem]">Shipment #{i + 1}</Label></div>
                  <div><Label className="text-[0.6rem]">Delivery Date</Label><Input type="date" value={s.deliveryDate} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, deliveryDate: e.target.value } : x))} className="h-8 text-xs" /></div>
                  <div><Label className="text-[0.6rem]">Port</Label><Input value={s.port} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, port: e.target.value } : x))} className="h-8 text-xs" /></div>
                  <div className="flex items-end gap-1"><div className="flex-1"><Label className="text-[0.6rem]">Containers</Label><Input type="number" value={s.containers} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, containers: Number(e.target.value) } : x))} className="h-8 text-xs" /></div>{shipments.length > 1 && <button onClick={() => removeShipment(s.id)} className="text-[0.6rem] text-red-400 pb-1">✕</button>}</div>
                </div>
              ))}
            </div>

            {/* 3B.2.6 Marketplace attribution */}
            {attribution && (
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-[0.6rem] tracking-widest text-blue-400 uppercase font-semibold mb-1">Marketplace Attribution</p>
                <p className="text-xs text-foreground/80">This trade will be attributed to <span className="font-semibold">{attribution.partner}</span> because you first connected through them on {attribution.date}. Revenue share: {attribution.revenueShare}%. You have 72 hours to dispute.</p>
                <div className="flex gap-2 mt-2"><Button size="sm" variant="outline" className="h-7 text-xs">Continue</Button><Button size="sm" variant="ghost" className="h-7 text-xs text-amber-400">Dispute Attribution</Button></div>
              </div>
            )}

            {/* Governor Pre-Screen */}
            <div className="p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Governor Pre-Screen (A2 · constraining)</p>
                {!prescreen && !prescreenLoading && <button onClick={runPrescreen} className="text-[0.65rem] text-gold hover:underline">Run AI pre-screen</button>}
                {prescreenProvider && <span className="text-[0.55rem] text-muted-foreground">via {prescreenProvider}</span>}
              </div>
              {prescreenLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Running compliance pre-screen…</div>
              : prescreen ? <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">{prescreen.verdict === "ALLOW" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}<span className="font-semibold" style={{ color: prescreen.verdict === "ALLOW" ? "#10b981" : "#fbbf24" }}>Verdict: {prescreen.verdict}</span></div>
                  {prescreen.conditions?.map((c: string, i: number) => <div key={i} className="ml-5 text-amber-400">⚠ {c}</div>)}
                </div>
              : <p className="text-xs text-muted-foreground">Run the 7-step Governor pre-screen (permissions, jurisdiction, dual-use, commodity mixing, treatment data, packing consistency, GNN).</p>}
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>← Back</Button><Button onClick={() => setStep(4)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}

        {/* STEP 4: Review & Submit */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/30 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span>European Importer GmbH</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span>Strawberry Export Co.</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span>{productName} ({hsCode})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Incoterm</span><span className="font-semibold">{incoterm} — seller handles: {incotermConfig.mandatoryServices.join(", ")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Containers</span><span>{containers.length} × containers, {containers.reduce((s, c) => s + c.pallets, 0)} pallets total</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Multi-shipment</span><span>{multiShipment ? `${shipments.length} shipments` : "Single shipment"}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Estimated SGTX Fee (1.5%)</span><span className="text-gold font-semibold">On quote</span></div>
            </div>
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/30 flex items-start gap-2"><Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" /><p className="text-xs">On submit: trade request sent to seller (priority 75 Smart Inbox). USTN generated at contract lock — not now. No data re-entry across phases. Draft auto-saved every 30s.</p></div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(3)}>← Back</Button><Button className="bg-gold-gradient text-sovereign"><Send className="w-3.5 h-3.5 mr-1.5" />Submit Trade Request</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ QUOTE BUILDER (Seller) — Full Phase 2 Implementation ============
const LOGISTICS_SERVICES_BY_INCOTERM: Record<string, { service: string; mandatory: boolean }[]> = {
  EXW: [{ service: "Trucking (origin to port)", mandatory: false }, { service: "Export customs", mandatory: false }, { service: "Ocean freight", mandatory: false }],
  FOB: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: false }],
  CFR: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: true }],
  CIF: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: true }, { service: "Insurance", mandatory: true }],
  CPT: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }],
  CIP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Insurance", mandatory: true }],
  DAP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Destination charges", mandatory: true }],
  DPU: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Terminal charges", mandatory: true }],
  DDP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Destination charges", mandatory: true }, { service: "Import duties", mandatory: true }],
  FCA: [{ service: "Trucking (origin to carrier)", mandatory: true }, { service: "Export customs", mandatory: true }],
};

export function QuoteBuilderScreen() {
  // 3B.3.2 Loading Origin
  const [loadingCountry, setLoadingCountry] = useState("EG");
  const [loadingPort, setLoadingPort] = useState("Alexandria (EGALX)");

  // 3B.3.3 EXW Price Lock
  const [exwPrice, setExwPrice] = useState("5.00");
  const [priceUnit, setPriceUnit] = useState("kg"); // kg | ton | unit
  const [weightUnit, setWeightUnit] = useState("metric"); // metric | imperial
  const [band, setBand] = useState<{ low?: number; mid?: number; high?: number; rationale?: string } | null>(null);
  const [bandLoading, setBandLoading] = useState(false);
  const [bandProvider, setBandProvider] = useState<string | null>(null);
  const [deviation, setDeviation] = useState<any>(null);
  const [deviationLoading, setDeviationLoading] = useState(false);
  const [justification, setJustification] = useState("");

  // 3B.3.4 Packing
  const [layers, setLayers] = useState([{ id: 1, cartonsPerLayer: 80, numLayers: 10, layerHeight: 15, orientation: "standard" }, { id: 2, cartonsPerLayer: 40, numLayers: 1, layerHeight: 15, orientation: "rotated" }]);
  const [packingLocked, setPackingLocked] = useState(false);
  const [ecoResult, setEcoResult] = useState<any>(null);
  const [ecoLoading, setEcoLoading] = useState(false);
  const [carbonFootprint, setCarbonFootprint] = useState({ scope1: 120, scope2: 45, scope3: 380, total: 545, cbamApplicable: true });

  // 3B.3.5 Logistics Modes
  const [incoterm, setIncoterm] = useState("CIF");
  const [modeA, setModeA] = useState<Record<string, string>>({ "Trucking (origin to port)": "900", "Export customs": "600", "THC (origin port)": "300", "Ocean freight": "4200", Insurance: "450" });
  const [shipQuotes, setShipQuotes] = useState<any[]>([]);
  const [shipQuoteLoading, setShipQuoteLoading] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, any>>({});
  const [rfqSent, setRfqSent] = useState(false);

  // 3B.3.6 Alternative Ports
  const [altPorts, setAltPorts] = useState<any[]>([]);
  const [altPortLoading, setAltPortLoading] = useState(false);

  // 3B.3.7 MultiShipment response
  const [multiShipResponse, setMultiShipResponse] = useState<"accept" | "modify" | "reject" | null>(null);

  // 3B.3.8 SGTX Fee
  const exwTotal = parseFloat(exwPrice) * 20000; // 20,000 kg
  const logisticsTotal = Object.values(modeA).reduce((s, v) => s + (parseFloat(v) || 0), 0) + Object.values(selectedQuotes).reduce((s: number, q: any) => s + (q?.totalFee || 0), 0);
  const tradeValue = exwTotal + logisticsTotal;
  const sgtxFee = tradeValue * 0.015;
  const finalPrice = tradeValue + sgtxFee;

  const incotermServices = LOGISTICS_SERVICES_BY_INCOTERM[incoterm] || LOGISTICS_SERVICES_BY_INCOTERM.CIF;
  const missingMandatory = incotermServices.filter(s => s.mandatory && !modeA[s.service] && !selectedQuotes[s.service]);

  // AI price band
  const loadBand = async () => {
    if (bandLoading) return;
    setBandLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/price-band", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries IQF", hsCode: "0811.10.00", originCountry: "EG", destCountry: "DE" }) });
      const d = await res.json(); setBandProvider(d.provider);
      try { const m = d.content.match(/\{[\s\S]*\}/); if (m) { const p = JSON.parse(m[0]); setBand({ low: p.low, mid: p.mid, high: p.high, rationale: p.rationale }); checkDeviation(parseFloat(exwPrice), p.low, p.high); } } catch {}
    } catch {} finally { setBandLoading(false); }
  };

  // Price deviation check
  const checkDeviation = async (price: number, low: number, high: number) => {
    if (!low || !high) return;
    setDeviationLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/price-deviation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries", enteredPrice: price, aiBandLow: low, aiBandHigh: high }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setDeviation(JSON.parse(m[0])); } catch {}
    } catch {} finally { setDeviationLoading(false); }
  };

  const onPriceChange = (v: string) => { setExwPrice(v); if (band) checkDeviation(parseFloat(v) || 0, band.low!, band.high!); };

  // Unit conversion
  const convertPrice = (price: number, from: string, to: string) => {
    if (from === to) return price;
    if (from === "kg" && to === "ton") return price * 1000;
    if (from === "ton" && to === "kg") return price / 1000;
    if (from === "kg" && to === "unit") return price * 12.5; // 12.5 kg per carton
    if (from === "unit" && to === "kg") return price / 12.5;
    if (from === "ton" && to === "unit") return price * 80; // 80 cartons per ton
    if (from === "unit" && to === "ton") return price / 80;
    return price;
  };

  // Ecological packaging
  const loadEco = async () => {
    if (ecoLoading) return;
    setEcoLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/eco-packaging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries IQF", currentPackaging: "Corrugated cartons + plastic strapping", containerCount: 2 }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setEcoResult(JSON.parse(m[0])); } catch {}
    } catch {} finally { setEcoLoading(false); }
  };

  // Mode C: Send to shipping lines
  const sendToShipLines = async () => {
    setShipQuoteLoading(true);
    try {
      const res = await fetch("/api/sgtx/ship-quote/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerGtid: "SGTX-EG-TRD-002139-7F3A", baseServiceType: "OCEAN_FREIGHT", originPort: loadingPort, destinationPort: "Hamburg (DEHAM)", containerDetails: { type: "40ft Reefer", count: 2 }, addOnServices: ["TRUCKING", "CUSTOMS_BROKER"], targetLines: ["SGTX-EG-SHP-000031-9E8F", "SGTX-DE-SHP-000058-2B3C"] }) });
      const d = await res.json(); setShipQuotes(d.quotes || []);
    } catch {} finally { setShipQuoteLoading(false); }
  };

  const selectQuote = async (quoteId: string, service: string) => {
    await fetch("/api/sgtx/ship-quote/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId }) });
    const quote = shipQuotes.find(q => q.id === quoteId);
    if (quote) setSelectedQuotes(s => ({ ...s, [service]: quote }));
  };

  // Alternative ports
  const loadAltPorts = async () => {
    if (altPortLoading) return;
    setAltPortLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/alt-ports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destCountry: "DE", commodity: "Frozen Strawberries", currentPort: "Hamburg (DEHAM)" }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setAltPorts(JSON.parse(m[0]).suggestions || []); } catch {}
    } catch {} finally { setAltPortLoading(false); }
  };

  // Packing calculations
  const totalCartons = layers.reduce((s, l) => s + l.cartonsPerLayer * l.numLayers, 0);
  const netWeight = totalCartons * 12.5;
  const grossWeight = netWeight + totalCartons * 0.5;

  const exw = parseFloat(exwPrice) || 0;
  const withinBand = band && exw >= band.low! && exw <= band.high!;
  const bandPos = band ? Math.max(0, Math.min(100, ((exw - band.low!) / (band.high! - band.low!)) * 100)) : 50;

  return (
    <div className="space-y-4 max-w-6xl">
      <SectionHeader title="Quote, Packing & Logistics Orchestration" subtitle="Phase 2 — EXW lock · non-uniform packing · 3 logistics modes (A/B/C) · alternative ports · SGTX fee · one-click submit" />

      {/* 3B.3.2 Loading Origin */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.3.2 Loading Origin</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div><Label className="text-xs">Country of Loading</Label><Select value={loadingCountry} onValueChange={setLoadingCountry}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["EG","VN","DE","US","CN"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Port of Loading</Label><Select value={loadingPort} onValueChange={setLoadingPort}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["Alexandria (EGALX)","Damietta (EGDAM)","Cairo (EGCAI)"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Distance to port (auto)</Label><Input defaultValue="215 km (OSRM)" disabled className="h-8 text-xs" /></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 3B.3.3 EXW Price Lock */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.3 EXW Price Lock</h3>
            <div className="flex gap-1">
              <button onClick={() => setPriceUnit("kg")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "kg" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per kg</button>
              <button onClick={() => setPriceUnit("ton")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "ton" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per ton</button>
              <button onClick={() => setPriceUnit("unit")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "unit" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per unit</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">EXW Price (USD/{priceUnit})</Label><Input value={exwPrice} onChange={(e) => onPriceChange(e.target.value)} type="number" className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Weight Unit</Label><div className="flex gap-1 mt-1"><button onClick={() => setWeightUnit("metric")} className={`px-2 py-0.5 rounded text-[0.6rem] ${weightUnit === "metric" ? "bg-gold text-sovereign" : "bg-muted"}`}>Metric (kg/t)</button><button onClick={() => setWeightUnit("imperial")} className={`px-2 py-0.5 rounded text-[0.6rem] ${weightUnit === "imperial" ? "bg-gold text-sovereign" : "bg-muted"}`}>Imperial (lb)</button></div></div>
          </div>
          {/* Equivalent prices */}
          <div className="flex gap-2 text-[0.65rem] text-muted-foreground">
            <span>= ${convertPrice(exw, priceUnit, "kg").toFixed(2)}/kg</span>
            <span>= ${convertPrice(exw, priceUnit, "ton").toFixed(0)}/ton</span>
            <span>= ${convertPrice(exw, priceUnit, "unit").toFixed(2)}/unit</span>
          </div>
          {/* AI Price Band */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">🧠 AI Market Intelligence (A1)</p>
              {!band && !bandLoading && <button onClick={loadBand} className="text-[0.65rem] text-gold hover:underline">Get market band</button>}
              {bandProvider && <span className="text-[0.55rem] text-muted-foreground">via {bandProvider}</span>}
            </div>
            {bandLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing market…</div>
            : band ? <>
                <div className="flex items-center justify-between text-xs"><span className="text-red-400">${band.low?.toFixed(2)}</span><div className="flex-1 mx-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/40 via-emerald-500/40 to-red-500/40 relative"><div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold border-2 border-background" style={{ left: `calc(${bandPos}% - 6px)` }} /></div><span className="text-red-400">${band.high?.toFixed(2)}</span></div>
                <div className="flex items-center gap-2 mt-1"><p className="text-[0.65rem] text-muted-foreground flex-1">${exw.toFixed(2)}/kg is <span className={withinBand ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>{withinBand ? "within" : "outside"} band</span>. {band.rationale}</p>{band && <button onClick={() => { setExwPrice(String(band.mid)); onPriceChange(String(band.mid)); }} className="text-[0.6rem] bg-gold/15 text-gold px-2 py-0.5 rounded hover:bg-gold/25">Use fair price</button>}</div>
              </>
            : <p className="text-[0.65rem] text-muted-foreground">30-day market chart + AI fair price band (FAO, USDA, World Bank feeds).</p>}
          </div>
          {/* Price deviation */}
          {deviation && deviation.requires_justification && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-[0.6rem] text-amber-400 font-semibold uppercase mb-1">⚠ Price Deviation: {deviation.deviation_pct}% from band — Justification Required</p>
              <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Enter justification (min 20 chars)…" className="h-8 text-xs" />
              {justification.length < 20 && <p className="text-[0.55rem] text-amber-400 mt-1">{justification.length}/20 chars</p>}
            </div>
          )}
          {deviation && !deviation.requires_justification && deviation.advisory && <p className="text-[0.65rem] text-amber-400">⚠ {deviation.advisory}</p>}
          {/* Total EXW */}
          <div className="p-2 rounded-lg bg-muted/20 flex justify-between text-xs"><span className="text-muted-foreground">Total EXW Value:</span><span className="font-bold text-gold">${exwTotal.toLocaleString()}</span></div>
        </Card>

        {/* 3B.3.4 Packing Module */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.4 Packing (Non-Uniform Layers)</h3><Badge variant="outline" className="text-[0.55rem]">{packingLocked ? "🔒 LOCKED" : "Draft"}</Badge></div>
          {/* Weight calc */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Total Cartons</p><p className="font-bold">{totalCartons}</p></div>
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Net Weight</p><p className="font-bold">{netWeight.toLocaleString()} kg</p></div>
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Gross Weight</p><p className="font-bold">{grossWeight.toLocaleString()} kg</p></div>
          </div>
          {/* Layer patterns */}
          <div className="space-y-1.5">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Layer Patterns (Non-Uniform Stacking)</p>
            {layers.map((l, i) => (
              <div key={l.id} className="grid grid-cols-5 gap-1 items-center p-1.5 rounded bg-muted/20">
                <span className="text-[0.6rem] text-muted-foreground">Pattern {i + 1}</span>
                <Input type="number" value={l.cartonsPerLayer} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, cartonsPerLayer: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Cartons/layer" />
                <Input type="number" value={l.numLayers} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, numLayers: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Layers" />
                <Input type="number" value={l.layerHeight} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, layerHeight: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Height (cm)" />
                <button onClick={() => setLayers(ls => ls.filter(x => x.id !== l.id))} className="text-[0.6rem] text-red-400">✕</button>
              </div>
            ))}
            <button onClick={() => setLayers(ls => [...ls, { id: Date.now(), cartonsPerLayer: 40, numLayers: 1, layerHeight: 15, orientation: "standard" }])} className="text-[0.6rem] text-gold hover:underline">+ Add Layer Pattern</button>
          </div>
          {/* Ecological advisor */}
          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1"><p className="text-[0.6rem] text-emerald-400 font-semibold uppercase">🌱 Ecological Advisor (A1)</p>{!ecoResult && !ecoLoading && <button onClick={loadEco} className="text-[0.6rem] text-emerald-400 hover:underline">Get suggestions</button>}</div>
            {ecoLoading ? <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing…</div>
            : ecoResult?.alternatives ? <div className="space-y-1">{ecoResult.alternatives.map((a: any, i: number) => <div key={i} className="flex items-center gap-2 text-[0.65rem]"><span className="flex-1">{a.material}: {a.description}</span><Badge variant="outline" className="text-[0.5rem] text-emerald-400">-{a.carbon_saving_kg}kg CO2</Badge><button className="text-emerald-400 hover:underline">Apply</button></div>)}</div>
            : <p className="text-[0.6rem] text-muted-foreground">Suggests sustainable packaging alternatives with carbon savings.</p>}
          </div>
          {/* Carbon footprint */}
          <div className="p-2 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1">Carbon Footprint (ISO 14067)</p>
            <div className="grid grid-cols-4 gap-1 text-[0.65rem]">
              <div><span className="text-muted-foreground">Scope 1:</span> {carbonFootprint.scope1} kg</div>
              <div><span className="text-muted-foreground">Scope 2:</span> {carbonFootprint.scope2} kg</div>
              <div><span className="text-muted-foreground">Scope 3:</span> {carbonFootprint.scope3} kg</div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{carbonFootprint.total} kg CO2</span></div>
            </div>
            {carbonFootprint.cbamApplicable && <p className="text-[0.6rem] text-amber-400 mt-1">⚠ CBAM report required for EU-bound shipment</p>}
          </div>
          {/* Lock packing */}
          {!packingLocked ? <Button onClick={() => setPackingLocked(true)} size="sm" className="w-full bg-gold-gradient text-sovereign h-8"><Lock className="w-3 h-3 mr-1.5" /> Lock Packing Plan</Button>
          : <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-3 h-3" /> Packing plan locked · SSCC18 barcodes generated · Loom hash recorded</div>}
        </Card>
      </div>

      {/* 3B.3.5 Logistics Cost Entry — Three Modes */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.5 Logistics Costs — Three Modes (A/B/C)</h3>
          <div className="flex items-center gap-2"><Label className="text-xs">Incoterm:</Label><Select value={incoterm} onValueChange={setIncoterm}><SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(LOGISTICS_SERVICES_BY_INCOTERM).map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {/* Service table with incoterm filtering */}
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase"><th className="text-left px-2 py-1.5">Service</th><th className="text-left px-2 py-1.5">Mandatory?</th><th className="text-left px-2 py-1.5">Mode A (Manual)</th><th className="text-left px-2 py-1.5">Mode B (RFQ)</th><th className="text-left px-2 py-1.5">Mode C (Ship Line)</th><th className="text-left px-2 py-1.5">Selected</th></tr></thead>
            <tbody>
              {incotermServices.map(s => (
                <tr key={s.service} className="border-b border-border/40">
                  <td className="px-2 py-2 font-medium">{s.service}</td>
                  <td className="px-2 py-2">{s.mandatory ? <Badge variant="outline" className="text-[0.5rem] text-red-400 border-red-500/30">MANDATORY</Badge> : <span className="text-[0.6rem] text-muted-foreground">Optional</span>}</td>
                  <td className="px-2 py-2"><Input value={modeA[s.service] || ""} onChange={e => setModeA(m => ({ ...m, [s.service]: e.target.value }))} className="h-7 text-xs w-24" placeholder="$ amount" /></td>
                  <td className="px-2 py-2">{rfqSent ? <span className="text-[0.6rem] text-emerald-400">✓ RFQ sent</span> : <button onClick={() => setRfqSent(true)} className="text-[0.6rem] text-gold hover:underline">Send RFQ</button>}</td>
                  <td className="px-2 py-2">{shipQuotes.length > 0 ? <span className="text-[0.6rem] text-emerald-400">{shipQuotes.length} quotes</span> : <button onClick={sendToShipLines} disabled={shipQuoteLoading} className="text-[0.6rem] text-gold hover:underline disabled:opacity-50">{shipQuoteLoading ? "…" : "Send to lines"}</button>}</td>
                  <td className="px-2 py-2">{selectedQuotes[s.service] ? <Badge variant="outline" className="text-[0.5rem] text-emerald-400">${selectedQuotes[s.service].totalFee}</Badge> : modeA[s.service] ? <Badge variant="outline" className="text-[0.5rem]">${modeA[s.service]}</Badge> : <span className="text-[0.6rem] text-red-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mode C quotes */}
        {shipQuotes.length > 0 && (
          <div className="p-2 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Mode C: Shipping Line Quotes (Compare & Select)</p>
            <div className="space-y-1">
              {shipQuotes.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <span className="font-mono text-[0.6rem] text-muted-foreground">{q.shipperLineGtid.slice(0, 18)}…</span>
                  <span className="flex-1">Base: ${q.baseFee} · Add-ons: {q.addOnFees ? JSON.parse(q.addOnFees).TRUCKING || 0 : 0} + {q.addOnFees ? JSON.parse(q.addOnFees).CUSTOMS_BROKER || 0 : 0}</span>
                  <span className="font-bold text-gold">${q.totalFee}</span>
                  <button onClick={() => selectQuote(q.id, "Ocean freight")} className="text-[0.6rem] text-emerald-400 hover:underline">Select</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {missingMandatory.length > 0 && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> Missing mandatory services: {missingMandatory.map(s => s.service).join(", ")}</div>}
      </Card>

      {/* 3B.3.6 Alternative Ports */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.6 Alternative Delivery Ports</h3>{!altPorts.length && !altPortLoading && <button onClick={loadAltPorts} className="text-[0.65rem] text-gold hover:underline">🧠 Get AI suggestions</button>}</div>
        {altPortLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing ports…</div>
        : altPorts.length > 0 ? <div className="space-y-1">{altPorts.map((p, i) => <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs"><span className="font-medium flex-1">{p.port} ({p.un_locode})</span><span className="text-muted-foreground">{p.transit_time_days}d transit</span><span className={p.cost_delta_usd >= 0 ? "text-red-400" : "text-emerald-400"}>${p.cost_delta_usd > 0 ? "+" : ""}{p.cost_delta_usd}</span><Badge variant="outline" className="text-[0.5rem]">{p.congestion_level}</Badge></div>)}</div>
        : <p className="text-[0.65rem] text-muted-foreground">AI suggests alternative ports based on historical cost savings, transit time, congestion.</p>}
      </Card>

      {/* 3B.3.7 MultiShipment Response */}
      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm">3B.3.7 MultiShipment Schedule Response</h3>
        <p className="text-xs text-muted-foreground">Buyer requested 2-shipment schedule. Seller can accept, modify, or reject.</p>
        <div className="flex gap-2">
          <button onClick={() => setMultiShipResponse("accept")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "accept" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-muted/50 text-muted-foreground"}`}>Accept as proposed</button>
          <button onClick={() => setMultiShipResponse("modify")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "modify" ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-muted/50 text-muted-foreground"}`}>Propose modifications</button>
          <button onClick={() => setMultiShipResponse("reject")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "reject" ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-muted/50 text-muted-foreground"}`}>Reject (single shipment)</button>
        </div>
      </Card>

      {/* 3B.3.8 SGTX Fee Calculation */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.3.8 SGTX Fee Calculation (Automatic)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">EXW Total</p><p className="font-bold">${exwTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Logistics Total</p><p className="font-bold">${logisticsTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-gold/10 border border-gold/20"><p className="text-[0.6rem] text-gold">SGTX Fee (1.5%)</p><p className="font-bold text-gold">${sgtxFee.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><p className="text-[0.6rem] text-emerald-400">Final Price</p><p className="font-bold text-emerald-400">${finalPrice.toLocaleString()}</p></div>
        </div>
      </Card>

      {/* 3B.3.9 Submit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">3B.3.9 Submit Quote</h3>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">Governor validates: mandatory fields, packing locked, mandatory services selected, fee calculated.</p>
            {!packingLocked && <p className="text-[0.65rem] text-amber-400 mt-1">⚠ Packing plan must be locked first</p>}
            {missingMandatory.length > 0 && <p className="text-[0.65rem] text-red-400 mt-1">⚠ Missing {missingMandatory.length} mandatory services</p>}
          </div>
          <Button className="bg-gold-gradient text-sovereign" disabled={!packingLocked || missingMandatory.length > 0}><Send className="w-3.5 h-3.5 mr-1.5" />Submit Quote</Button>
        </div>
      </Card>
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
  if (tab === "lifecycle") return <LifecycleScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "org-graph") return <OrgGraphScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "passport") return <TrustPassportScreen tenantGtid={portal.defaultTenantGtid} />;

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
    if (tab === "ustn") return <UstnMasterScreen />;
    if (tab === "journey") return <RoleJourneyScreen />;
  }

  // Fallback
  return <CommandCenter portal={portal} data={data} />;
}
