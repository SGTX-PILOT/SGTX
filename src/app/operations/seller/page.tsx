"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Seller Workflow — Seller Quote Builder & Response Screen
// ═════════════════════════════════════════════════════════════════════════════════
//
// Implements the seller workflow:
//   1. Receive Buyer Request (zero re-entry)
//   2. Understand the Request (Seller Request Brief)
//   3. Seller Feasibility Check (10 dimensions)
//   4. Accept / Clarify / Propose Changes / Decline
//   5. Cost & Margin Construction (transparent cost waterfall)
//   6. Seller Quote Review (commitment brief)
//   7. Submit Quote

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { fmtMoney, fmtDate, statusLabel } from "@/lib/cockpit/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Package, CheckCircle2, AlertTriangle, Loader2, ChevronRight,
  FileText, Sparkles, ShieldCheck, X, Info,
  Gauge, Receipt, Calculator, ChevronDown, HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SellerPriceFeatures } from "@/components/sgtx/SellerPriceFeatures";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string };
  tradesAsSeller?: any[];
}

export default function SellerWorkflowPage() {
  const { payload, ready } = useSession();
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error("Failed to load dashboard");
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  if (!payload) return null;

  const sellerTrades = (data?.tradesAsSeller || []).filter((t: any) =>
    ["PENDING_SELLER_RESPONSE", "CLARIFICATION_REQUESTED", "SELLER_ACCEPTED", "SELLER_PROPOSED_CHANGES", "QUOTE_RECEIVED"].includes(t.status)
  );

  return (
    <CockpitShell roleLabel={payload.role} tenantName={data?.tenant?.legalName} showAdmin={shouldShowAdmin(data?.tenant?.type)}>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Seller Workflow</h1>
          <p className="text-sm text-muted-foreground mt-1">Review buyer requests, check feasibility, and submit quotes.</p>
        </header>

        {selectedTradeId ? (
          <SellerQuoteBuilder tradeId={selectedTradeId} onBack={() => setSelectedTradeId(null)} />
        ) : (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pending Requests ({sellerTrades.length})
            </h2>
            {isLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : sellerTrades.length === 0 ? (
              <Card className="p-8 text-center">
                <Package className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pending buyer requests. New requests will appear here.</p>
              </Card>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
                {sellerTrades.map((t: any) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedTradeId(t.id)}
                      className="w-full flex items-center justify-between gap-3 p-3.5 hover:bg-muted/40 transition group text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{t.commodity || "Untitled request"}</span>
                          <Badge variant="outline" className="text-[0.6rem]">{statusLabel(t.status)}</Badge>
                          <span className="text-xs text-muted-foreground">{t.buyer?.legalName || "Buyer"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {t.originCountry || "—"} → {t.destCountry || "—"}
                          <span className="mx-1.5 text-muted-foreground/40">·</span>
                          {fmtDate(t.createdAt)}
                        </div>
                      </div>
                      {t.status === "PENDING_SELLER_RESPONSE" && (
                        <Badge variant="outline" className="text-[0.6rem] text-amber-700 dark:text-amber-300 border-amber-500/40">
                          Action needed
                        </Badge>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </CockpitShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Seller Quote Builder
// ═══════════════════════════════════════════════════════════════════════════════

function SellerQuoteBuilder({ tradeId, onBack }: { tradeId: string; onBack: () => void }) {
  const { payload } = useSession();
  const [phase, setPhase] = useState<"brief" | "feasibility" | "decision" | "quote" | "review">("brief");
  const [feasibilityResult, setFeasibilityResult] = useState<any>(null);
  const [quoteData, setQuoteData] = useState({
    exwPrice: "", packingCost: "", originHandling: "", inlandTransport: "",
    exportClearance: "", freight: "", insurance: "", otherLogistics: "", marginPct: "10",
  });

  // Incoterm-engine enhancement — fetch mandatory services + fee breakdown when
  // the trade's incoterm becomes available. Used to:
  //   • show the seller which services they MUST price (G2U18)
  //   • show the cost waterfall (EXW + mandatory logistics = Total Trade Value → SGTX fee)
  const [incotermServices, setIncotermServices] = useState<any>(null);
  const [feePreview, setFeePreview] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);

  const { data: trade, isLoading } = useQuery({
    queryKey: ["seller-trade", tradeId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      return [...(d.tradesAsBuyer || []), ...(d.tradesAsSeller || [])].find((t: any) => t.id === tradeId);
    },
  });

  // Fetch mandatory services per incoterm (SELLER perspective) + fee breakdown.
  useEffect(() => {
    if (!trade?.incoterm) return;
    let cancelled = false;
    (async () => {
      try {
        // Mandatory services for Mode A from the seller's perspective.
        const url = `/api/sgtx/incoterm-engine/modes?incoterm=${encodeURIComponent(trade.incoterm)}&perspective=SELLER`;
        const res = await fetch(url);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setIncotermServices(data);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [trade?.incoterm]);

  // Compute the live cost waterfall (EXW + mandatory logistics = Total Trade Value → SGTX fee)
  // using the supplied fee inputs. We map the seller's quote fields to
  // LogisticsCost entries the incoterm-engine fee-calculator can ingest.
  useEffect(() => {
    if (!trade?.incoterm) return;
    const exw = parseFloat(quoteData.exwPrice) || 0;
    if (exw <= 0) return;
    // Map quoteData → LogisticsCost entries (only the seller-paid mandatory ones count
    // toward Total Trade Value per the incoterm matrix).
    const logisticsCosts = [
      { serviceType: "TRUCKING", amountUsd: parseFloat(quoteData.inlandTransport) || 0, payer: "SELLER" as const },
      { serviceType: "OCEAN_FREIGHT", amountUsd: parseFloat(quoteData.freight) || 0, payer: "SELLER" as const },
      { serviceType: "CUSTOMS_BROKERAGE_EXPORT", amountUsd: parseFloat(quoteData.exportClearance) || 0, payer: "SELLER" as const },
      { serviceType: "THC", amountUsd: parseFloat(quoteData.originHandling) || 0, payer: "SELLER" as const },
      { serviceType: "INSURANCE", amountUsd: parseFloat(quoteData.insurance) || 0, payer: "SELLER" as const },
    ];
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/sgtx/incoterm-engine/fees?incoterm=${encodeURIComponent(trade.incoterm)}&trade_value=${encodeURIComponent(String(exw))}&logistics_costs=${encodeURIComponent(JSON.stringify(logisticsCosts))}`;
        const res = await fetch(url);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFeePreview(data);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [trade?.incoterm, quoteData.exwPrice, quoteData.inlandTransport, quoteData.freight, quoteData.exportClearance, quoteData.originHandling, quoteData.insurance]);

  // Run G2U18-style validation before quote submission — verify all mandatory
  // services (per the incoterm matrix) have been priced by the seller.
  function runMandatoryServicesValidation(): { valid: boolean; missing: string[]; warnings: string[] } {
    if (!trade?.incoterm || !incotermServices?.mandatory_services_per_mode) {
      return { valid: true, missing: [], warnings: ["Incoterm services not yet loaded — skipping mandatory-services check."] };
    }
    const sellerMandatory = (incotermServices.mandatory_services_per_mode.A?.mandatoryServices || [])
      .filter((s: any) => s.payer === "SELLER")
      .map((s: any) => s.service);
    // Map quoteData field names to service tags.
    const pricedMap: Record<string, number> = {
      TRUCKING: parseFloat(quoteData.inlandTransport) || 0,
      OCEAN_FREIGHT: parseFloat(quoteData.freight) || 0,
      CUSTOMS_BROKERAGE_EXPORT: parseFloat(quoteData.exportClearance) || 0,
      THC: parseFloat(quoteData.originHandling) || 0,
      INSURANCE: parseFloat(quoteData.insurance) || 0,
      CUSTOMS_BROKERAGE_IMPORT: 0, // DDP-only — seller-prices via a separate field (not yet in the form)
      DESTINATION_HANDLING: 0, // DDP/DPU/DAP — seller-prices via a separate field
      WAREHOUSING: 0,
    };
    const missing = sellerMandatory.filter((s: string) => !pricedMap[s] || pricedMap[s] <= 0);
    return { valid: missing.length === 0, missing, warnings: [] };
  }

  const feasibilityMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/seller/feasibility", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeRequestId: tradeId }),
      });
      return res.json();
    },
    onSuccess: (data) => { setFeasibilityResult(data); setPhase("decision"); toast.info("Feasibility check complete", { description: data.result }); },
    onError: () => toast.error("Feasibility check failed"),
  });

  const decisionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await fetchWithAuth("/api/sgtx/seller/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeRequestId: tradeId, sellerGtid: payload?.tenantGtid, action }),
      });
      return res.json();
    },
    onSuccess: (_data, action) => {
      if (action === "ACCEPT") { setPhase("quote"); toast.success("Request accepted — proceed to quote"); }
      else if (action === "DECLINE") { toast.info("Request declined"); onBack(); }
    },
  });

  const submitQuoteMutation = useMutation({
    mutationFn: async () => {
      // G2U18 — verify all mandatory services are priced before submission.
      const validation = runMandatoryServicesValidation();
      setValidationResult(validation);
      if (!validation.valid) {
        throw new Error(`G2U18 — Mandatory services not priced: ${validation.missing.join(", ")}. Price every mandatory service before submitting.`);
      }
      const total = calculateTotal(quoteData);
      const res = await fetchWithAuth("/api/sgtx/seller/quote/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeRequestId: tradeId, sellerGtid: payload?.tenantGtid, quoteData: { totalCost: total, currency: trade?.currency || "USD" } }),
      });
      return res.json();
    },
    onSuccess: () => { toast.success("Quote submitted to buyer"); onBack(); },
    onError: (err: any) => toast.error(err?.message || "Quote submission failed"),
  });

  function calculateTotal(q: typeof quoteData): number {
    const costs = [q.exwPrice, q.packingCost, q.originHandling, q.inlandTransport, q.exportClearance, q.freight, q.insurance, q.otherLogistics].map(v => parseFloat(v) || 0);
    const costBasis = costs.reduce((s, c) => s + c, 0);
    return costBasis + costBasis * (parseFloat(q.marginPct) || 0) / 100;
  }

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10"><Loader2 className="w-4 h-4 animate-spin" /> Loading request…</div>;
  if (!trade) return <p className="text-sm text-muted-foreground">Trade not found.</p>;

  // Compute the seller's mandatory-services checklist for the quote phase.
  const sellerMandatory = (incotermServices?.mandatory_services_per_mode?.A?.mandatoryServices || [])
    .filter((s: any) => s.payer === "SELLER");

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">← Back to requests</button>

      {phase === "brief" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Request Brief</h2>
          <Card className="p-4 space-y-3">
            <BriefRow label="Buyer" value={trade.buyer?.legalName} />
            <BriefRow label="Product" value={trade.commodity} />
            <BriefRow label="Quantity" value={`${trade.grossWeightKg || "—"} kg`} />
            <BriefRow label="Destination" value={trade.destCountry} />
            <BriefRow label="Incoterm" value={trade.incoterm} />
            <BriefRow label="Delivery target" value={fmtDate(trade.preferredDeliveryDate)} />
            <BriefRow label="Transport mode" value={trade.transportMode} />
            <BriefRow label="Trade value" value={fmtMoney(trade.tradeValueUsd, trade.currency)} />
          </Card>
          {trade.coldChain && <div className="p-2.5 rounded-md bg-amber-50/30 dark:bg-amber-950/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">⚠ Cold chain required</div>}
          <Button onClick={() => { setPhase("feasibility"); feasibilityMutation.mutate(); }} disabled={feasibilityMutation.isPending}>
            {feasibilityMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Run Feasibility Check
          </Button>
        </div>
      )}

      {phase === "feasibility" && feasibilityResult && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Feasibility Check</h2>
          <div className={cn("p-4 rounded-md border", feasibilityResult.result === "READY_TO_QUOTE" ? "bg-emerald-50/30 border-emerald-500/30" : feasibilityResult.result === "READY_WITH_CONDITIONS" ? "bg-amber-50/30 border-amber-500/30" : "bg-red-50/30 border-red-500/30")}>
            <div className="flex items-center gap-2">
              {feasibilityResult.result === "READY_TO_QUOTE" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : feasibilityResult.result === "READY_WITH_CONDITIONS" ? <AlertTriangle className="w-5 h-5 text-amber-600" /> : <X className="w-5 h-5 text-red-600" />}
              <p className="text-sm font-medium">{feasibilityResult.result === "READY_TO_QUOTE" ? "Ready to quote" : feasibilityResult.result === "READY_WITH_CONDITIONS" ? "Ready with conditions" : "Currently not feasible"}</p>
            </div>
          </div>
          <div className="space-y-2">
            {feasibilityResult.checks?.map((check: any, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded border border-border">
                {check.status === "pass" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5" /> : check.status === "warning" ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5" /> : <X className="w-3.5 h-3.5 text-red-500 mt-0.5" />}
                <div><p className="text-sm font-medium">{check.dimension}</p><p className="text-xs text-muted-foreground">{check.message}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === "decision" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Decision</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => decisionMutation.mutate("ACCEPT")} disabled={decisionMutation.isPending} className="p-4 rounded-md border border-emerald-500/30 bg-emerald-50/30 hover:bg-emerald-50/50 text-left transition">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-2" /><p className="text-sm font-medium">Accept & Quote</p><p className="text-xs text-muted-foreground mt-1">Proceed to quote construction</p>
            </button>
            <button onClick={() => toast.info("Clarification workflow — use the Trade Command Center messages tab")} className="p-4 rounded-md border border-blue-500/30 bg-blue-50/30 hover:bg-blue-50/50 text-left transition">
              <FileText className="w-5 h-5 text-blue-600 mb-2" /><p className="text-sm font-medium">Need Clarification</p><p className="text-xs text-muted-foreground mt-1">Ask the buyer a question</p>
            </button>
            <button onClick={() => toast.info("Propose changes — use the negotiation API")} className="p-4 rounded-md border border-amber-500/30 bg-amber-50/30 hover:bg-amber-50/50 text-left transition">
              <Sparkles className="w-5 h-5 text-amber-600 mb-2" /><p className="text-sm font-medium">Propose Changes</p><p className="text-xs text-muted-foreground mt-1">Suggest modifications</p>
            </button>
            <button onClick={() => decisionMutation.mutate("DECLINE")} disabled={decisionMutation.isPending} className="p-4 rounded-md border border-red-500/30 bg-red-50/30 hover:bg-red-50/50 text-left transition">
              <X className="w-5 h-5 text-red-600 mb-2" /><p className="text-sm font-medium">Decline</p><p className="text-xs text-muted-foreground mt-1">Decline with reason</p>
            </button>
          </div>
        </div>
      )}

      {phase === "quote" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Build Your Quote</h2>

          {/* Mandatory services checklist (G2U18) — per-incoterm responsibilities */}
          {sellerMandatory && sellerMandatory.length > 0 && (
            <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Mandatory services — Incoterm {trade.incoterm}
              </p>
              <p className="text-xs text-muted-foreground mb-2.5">
                Per Incoterms 2020, the seller MUST price these services for {trade.incoterm}. SGTX Gate G2U18
                validates that every mandatory service is priced before quote submission.
              </p>
              <ul className="space-y-1.5">
                {sellerMandatory.map((s: any) => {
                  const pricedMap: Record<string, number> = {
                    TRUCKING: parseFloat(quoteData.inlandTransport) || 0,
                    OCEAN_FREIGHT: parseFloat(quoteData.freight) || 0,
                    CUSTOMS_BROKERAGE_EXPORT: parseFloat(quoteData.exportClearance) || 0,
                    THC: parseFloat(quoteData.originHandling) || 0,
                    INSURANCE: parseFloat(quoteData.insurance) || 0,
                    CUSTOMS_BROKERAGE_IMPORT: 0,
                    DESTINATION_HANDLING: 0,
                    WAREHOUSING: 0,
                  };
                  const priced = pricedMap[s.service] > 0;
                  return (
                    <li key={s.service} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5">
                        {priced
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        <span className="font-medium">{s.label}</span>
                      </span>
                      <Badge variant="outline" className={cn("text-[0.6rem]", priced ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-amber-500/40 text-amber-700 dark:text-amber-300")}>
                        {priced ? "Priced" : "Not yet priced"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost Breakdown</p>
            <CostInput label="Goods Cost (EXW)" value={quoteData.exwPrice} onChange={(v) => setQuoteData({ ...quoteData, exwPrice: v })} />
            <CostInput label="Packing Cost" value={quoteData.packingCost} onChange={(v) => setQuoteData({ ...quoteData, packingCost: v })} />
            <CostInput label="Origin Handling" value={quoteData.originHandling} onChange={(v) => setQuoteData({ ...quoteData, originHandling: v })} />
            <CostInput label="Inland Transport" value={quoteData.inlandTransport} onChange={(v) => setQuoteData({ ...quoteData, inlandTransport: v })} />
            <CostInput label="Export Clearance" value={quoteData.exportClearance} onChange={(v) => setQuoteData({ ...quoteData, exportClearance: v })} />
            <CostInput label="Freight" value={quoteData.freight} onChange={(v) => setQuoteData({ ...quoteData, freight: v })} />
            <CostInput label="Insurance (if seller-responsible)" value={quoteData.insurance} onChange={(v) => setQuoteData({ ...quoteData, insurance: v })} />
            <CostInput label="Other Seller Logistics" value={quoteData.otherLogistics} onChange={(v) => setQuoteData({ ...quoteData, otherLogistics: v })} />
            <div className="pt-2 border-t border-border flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Seller Cost Basis</span>
              <span className="font-medium">{fmtMoney([quoteData.exwPrice, quoteData.packingCost, quoteData.originHandling, quoteData.inlandTransport, quoteData.exportClearance, quoteData.freight, quoteData.insurance, quoteData.otherLogistics].reduce((s, v) => s + (parseFloat(v) || 0), 0), trade.currency || "USD")}</span>
            </div>

            {/* Cost waterfall (EXW + mandatory logistics = Total Trade Value → SGTX fee) */}
            {feePreview && feePreview.ok && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cost Waterfall</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">EXW value (goods)</span>
                    <span className="font-medium">{fmtMoney(feePreview.exw_value_usd, trade.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">+ Mandatory logistics (per {trade.incoterm})</span>
                    <span className="font-medium">{fmtMoney(feePreview.mandatory_logistics_usd, trade.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground font-medium">= Total Trade Value</span>
                    <span className="font-semibold">{fmtMoney(feePreview.total_trade_value_usd, trade.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-muted-foreground">SGTX fee (1.5%)</span>
                    <span className="font-medium text-primary">{fmtMoney(feePreview.sgtx_fee_usd, trade.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">→ Buyer pays</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">{fmtMoney(feePreview.buyer_pays_usd, trade.currency || "USD")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">→ Seller pays (your share)</span>
                    <span className="font-medium text-amber-700 dark:text-amber-300">{fmtMoney(feePreview.seller_pays_usd, trade.currency || "USD")}</span>
                  </div>
                </div>
                <p className="text-[0.65rem] text-muted-foreground mt-2">
                  SGTX fee is 1.5% of Total Trade Value (per SGTX §9 / §1.5), split 50/50 between buyer and seller
                  when both parties are on the SGTX platform. The buyer only sees the total quote value, never
                  your internal cost breakdown.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Margin %</Label><Input type="number" value={quoteData.marginPct} onChange={(e) => setQuoteData({ ...quoteData, marginPct: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">Margin Amount</Label><p className="text-sm font-medium mt-2.5">{fmtMoney(([quoteData.exwPrice, quoteData.packingCost, quoteData.originHandling, quoteData.inlandTransport, quoteData.exportClearance, quoteData.freight, quoteData.insurance, quoteData.otherLogistics].reduce((s, v) => s + (parseFloat(v) || 0), 0)) * (parseFloat(quoteData.marginPct) || 0) / 100, trade.currency || "USD")}</p></div>
            </div>
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-sm font-semibold">Quoted Commercial Value</span>
              <span className="text-lg font-bold">{fmtMoney(calculateTotal(quoteData), trade.currency || "USD")}</span>
            </div>
          </Card>

          {/* Validation error — surfaced when G2U18 fails */}
          {validationResult && !validationResult.valid && (
            <div className="p-3 rounded-md bg-red-50/30 dark:bg-red-950/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>G2U18 — Missing mandatory services:</strong> {validationResult.missing.join(", ")}.
                Price every mandatory service for Incoterm {trade.incoterm} before submitting.
              </span>
            </div>
          )}

          {/* v18 — Fee Estimate Preview (Dynamic Fee Engine, advisory) */}
          <FeeEstimatePreview
            exwValue={parseFloat(quoteData.exwPrice) || 0}
            incoterm={trade.incoterm || "EXW"}
            currency={trade.currency || "USD"}
          />

          {/* v18 — Provider Quotations Status (lists quotes from logistics/insurance/etc. providers) */}
          <ProviderQuotationsStatus ustn={trade.ustn} />

          {/* GAP-1 — Seller Price Features (v18 §16.10.3) */}
          {/* 4 features: AI Fair Price Chart, Price Deviation Justification,
              Post-Lock Price Watch, Mode B+C Comparison Panel. Surgical add
              — reuses the existing seller-quotations query key (cache hit). */}
          <SellerPriceFeatures
            trade={trade}
            exwPrice={parseFloat(quoteData.exwPrice) || 0}
            ustn={trade.ustn}
          />

          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPhase("decision")}>Back</Button>
            <Button onClick={() => setPhase("review")}>Review Quote</Button>
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Seller Commitment Brief</h2>
          <Card className="p-4 space-y-2">
            <p className="text-sm"><strong>{trade.commodity}</strong> — {trade.grossWeightKg || "—"} kg<br />To: <strong>{trade.buyer?.legalName || "—"}</strong><br />Incoterm: <strong>{trade.incoterm || "—"}</strong><br />Delivery: <strong>{fmtDate(trade.preferredDeliveryDate)}</strong></p>
            <div className="pt-2 border-t border-border grid grid-cols-2 gap-2 text-xs">
              <span className="text-muted-foreground">Cost Basis</span><span className="text-right">{fmtMoney([quoteData.exwPrice, quoteData.packingCost, quoteData.originHandling, quoteData.inlandTransport, quoteData.exportClearance, quoteData.freight, quoteData.insurance, quoteData.otherLogistics].reduce((s, v) => s + (parseFloat(v) || 0), 0), trade.currency || "USD")}</span>
              <span className="text-muted-foreground">Margin ({quoteData.marginPct}%)</span><span className="text-right">{fmtMoney(([quoteData.exwPrice, quoteData.packingCost, quoteData.originHandling, quoteData.inlandTransport, quoteData.exportClearance, quoteData.freight, quoteData.insurance, quoteData.otherLogistics].reduce((s, v) => s + (parseFloat(v) || 0), 0)) * (parseFloat(quoteData.marginPct) || 0) / 100, trade.currency || "USD")}</span>
              <span className="font-semibold pt-2 border-t border-border">Total Quote</span><span className="text-right font-bold pt-2 border-t border-border">{fmtMoney(calculateTotal(quoteData), trade.currency || "USD")}</span>
            </div>
          </Card>
          <div className="p-3 rounded-md bg-amber-50/30 dark:bg-amber-950/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300">
            <p className="flex items-start gap-2"><ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />By submitting, you commit to this quote. Your internal costs and margin are confidential — the buyer only sees the total quote value.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => setPhase("quote")}>Back</Button>
            <Button onClick={() => submitQuoteMutation.mutate()} disabled={submitQuoteMutation.isPending}>
              {submitQuoteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Submit Quote
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-2"><span className="text-muted-foreground text-sm">{label}</span><span className="text-sm font-medium text-right">{value || "—"}</span></div>;
}

function CostInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="flex items-center justify-between gap-3"><Label className="text-xs flex-1">{label}</Label><Input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" className="w-32 h-8 text-sm" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 — Fee Estimate Preview (Dynamic Fee Engine — 7-layer)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls POST /api/sgtx/fees/estimate (advisory-only — replaces the legacy 1.5%
// flat fee shown in the cost waterfall above). The v18 estimate is a 7-layer
// dynamic engine: CFB → economic classification → 4 fairness scores → fair
// rate → fee range [low, mid, high]. The actual fee is finalized at contract
// lock via /api/sgtx/fees/calculate, not here.
//
// This card is ADVISORY ONLY — the seller sees what fee the engine would
// likely apply so they can adjust margin or refuse the request before
// committing. The estimate never locks anything.

function FeeEstimatePreview({
  exwValue,
  incoterm,
  currency,
}: {
  exwValue: number;
  incoterm: string;
  currency: string;
}) {
  const { payload } = useSession();
  const [whyOpen, setWhyOpen] = useState(false);

  // POST request via useQuery — queryKey changes when exw/incoterm change so
  // the estimate re-runs live as the seller edits the quote.
  const estimateQ = useQuery({
    queryKey: ["seller-fee-estimate", exwValue, incoterm],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/fees/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: "(draft)",
          exw_value: exwValue,
          logistics_costs: [],
          incoterm: incoterm || "EXW",
        }),
      });
      if (!res.ok) throw new Error(`fee-estimate ${res.status}`);
      return res.json() as Promise<any>;
    },
    enabled: exwValue > 0,
    retry: false,
  });

  // Empty state — EXW not entered yet
  if (exwValue <= 0) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <Calculator className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Fee Estimate (v18 Dynamic Fee Engine)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter a Goods Cost (EXW) above to preview the dynamic fee the engine would apply. Advisory only — the actual fee is locked at contract.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (estimateQ.isLoading) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Computing dynamic fee estimate…
        </div>
      </Card>
    );
  }

  if (estimateQ.isError || !estimateQ.data) {
    return (
      <Card className="p-4 border-dashed border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Fee estimate unavailable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The v18 Dynamic Fee Engine endpoint returned an error. You can still submit a quote — the actual fee is computed at contract lock.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const d = estimateQ.data;
  const cfb: number | undefined = d.estimated_cfb;
  const fairRate: number | undefined = d.estimated_fair_rate;
  const feeRange = d.estimated_fee_range || {};
  const fairnessScore: number | undefined = d.fairness_score;
  const layerScores = d.layer_scores || {};
  const primaryClass: string | undefined = d.primary_class;
  const economicClasses: string[] = d.economic_classes || [];

  // Fairness bar — color shifts green→amber→red as fairness drops.
  const fairnessPct = typeof fairnessScore === "number" ? Math.max(0, Math.min(100, fairnessScore)) : 0;
  const fairnessBarClass =
    fairnessPct >= 70 ? "[&>[data-slot=progress-indicator]]:bg-emerald-500"
    : fairnessPct >= 40 ? "[&>[data-slot=progress-indicator]]:bg-amber-500"
    : "[&>[data-slot=progress-indicator]]:bg-red-500";

  return (
    <Card className="p-4 space-y-3 border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Calculator className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Fee Estimate (v18 Dynamic Fee Engine)</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              Advisory only — actual fee locked at contract. CFB incoterm: {d.incoterm || incoterm}. Formula v{d.formula_version || "—"} / policy v{d.policy_version || "—"}.
            </p>
          </div>
        </div>
        {primaryClass && (
          <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
            {primaryClass}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <FeeStat label="Estimated CFB" value={cfb !== undefined ? fmtMoney(cfb, currency) : "—"} />
        <FeeStat label="Fair rate" value={fairRate !== undefined ? `${(fairRate * 100).toFixed(3)}%` : "—"} />
        <FeeStat label="Fee (mid)" value={feeRange.mid !== undefined ? fmtMoney(feeRange.mid, "USD") : "—"} accent />
        <FeeStat
          label="Fee range"
          value={feeRange.low !== undefined && feeRange.high !== undefined ? `${fmtMoney(feeRange.low, "USD")} – ${fmtMoney(feeRange.high, "USD")}` : "—"}
        />
      </div>

      {/* Fairness score */}
      {fairnessScore !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Gauge className="w-3 h-3" /> Fairness score
            </span>
            <span className="font-medium">{fairnessScore.toFixed(2)} / 100</span>
          </div>
          <Progress value={fairnessPct} className={fairnessBarClass} />
          <p className="text-[0.6rem] text-muted-foreground/80">
            Composite of cost-to-serve, risk, value delivered, and efficiency. Higher = fairer fee.
          </p>
        </div>
      )}

      {/* Layer breakdown */}
      {layerScores && Object.keys(layerScores).length > 0 && (
        <div className="grid grid-cols-4 gap-2 text-[0.65rem] pt-2 border-t border-border">
          <FeeStat label="Cost-to-serve" value={layerScores.cts?.toString() ?? "—"} />
          <FeeStat label="Risk" value={layerScores.risk?.toString() ?? "—"} />
          <FeeStat label="Value" value={layerScores.value?.toString() ?? "—"} />
          <FeeStat label="Efficiency" value={layerScores.efficiency?.toString() ?? "—"} />
        </div>
      )}

      {/* Economic classes */}
      {economicClasses.length > 0 && (
        <div className="text-[0.65rem] text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>Economic classes:</span>
          {economicClasses.map((c, i) => (
            <Badge key={i} variant="outline" className="text-[0.55rem]">{c}</Badge>
          ))}
        </div>
      )}

      {/* "Why this fee?" — Collapsible 7-layer explanation */}
      <Collapsible open={whyOpen} onOpenChange={setWhyOpen}>
        <CollapsibleTrigger className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1">
          <ChevronDown className={cn("w-3 h-3 transition-transform", whyOpen && "rotate-180")} />
          {whyOpen ? "Hide explanation" : "Why this fee? (7-layer Dynamic Fee Engine)"}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 mt-2 border-t border-border text-xs text-muted-foreground space-y-1.5 leading-relaxed">
          <p><strong className="text-foreground">Layer 1 — CFB (Cost-Fairness Base):</strong> EXW value + eligible seller-paid logistics per the incoterm matrix. Non-eligible lines (e.g. buyer-paid freight on FOB) are excluded.</p>
          <p><strong className="text-foreground">Layer 2 — Economic classification:</strong> {economicClasses.length > 0 ? economicClasses.join(", ") : "(commodity / margin / geography)"} → selects the rate band.</p>
          <p><strong className="text-foreground">Layer 3 — Cost-to-serve score:</strong> multi-shipment, transport mode, integration depth ({layerScores.cts ?? "—"}/100).</p>
          <p><strong className="text-foreground">Layer 4 — Risk score:</strong> sanctions proximity, jurisdiction, commodity, perishability, value-at-risk ({layerScores.risk ?? "—"}/100).</p>
          <p><strong className="text-foreground">Layer 5 — Value-delivered score:</strong> time saved, document automation, financing access, compliance coverage ({layerScores.value ?? "—"}/100).</p>
          <p><strong className="text-foreground">Layer 6 — Efficiency score:</strong> API integration depth, automation level, STP rate ({layerScores.efficiency ?? "—"}/100).</p>
          <p><strong className="text-foreground">Layer 7 — Fairness composite → fair rate:</strong> the four scores are weighted into a fairness composite ({fairnessScore ?? "—"}/100), which maps to a fair rate bounded by the floor ({(d.estimated_fair_rate ? (d.estimated_fair_rate * 100).toFixed(3) : "—")}%) and ceiling. The fee range is CFB × [floor, fair rate, ceiling].</p>
          <p className="italic text-[0.65rem] pt-1">
            This estimate uses heuristic defaults for layers 3–6 (your trade isn&apos;t in the DB yet). At contract lock, /api/sgtx/fees/calculate runs against the real trade row and produces the Fee Decision Object — which FeeLock then commits to NATS KV.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function FeeStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-medium truncate", accent && "text-emerald-700 dark:text-emerald-300")}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// v18 — Provider Quotations Status (lists quotes for this trade)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Calls GET /api/sgtx/quotations?ustn=X to list every ServiceQuotation row for
// the trade (logistics providers, insurers, customs brokers, etc.). Each quote
// carries: provider_gtid, provider_name, service_type, fee { amount, currency,
// terms, condition }, status (PENDING | ACCEPTED | REJECTED), loom_hash.
//
// The seller can accept a pending quote (POST /api/sgtx/quotations/[id]/accept),
// which the lib translates into a milestone→payment leg (per v18 §8.7 — no leg
// without a quote). Accepting a quote is the trigger that creates the payment
// manifest leg, so this card is the seller&apos;s window into the trade&apos;s
// payment shape before they submit their own quote.

function ProviderQuotationsStatus({ ustn }: { ustn?: string }) {
  const { payload } = useSession();
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const quotesQ = useQuery({
    queryKey: ["seller-quotations", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/quotations?ustn=${encodeURIComponent(ustn!)}`);
      if (!res.ok) throw new Error(`quotations ${res.status}`);
      return res.json() as Promise<{ quotations: any[]; count: number }>;
    },
    enabled: !!ustn,
    retry: false,
  });

  async function handleAccept(quotationId: string) {
    if (!payload?.tenantGtid) {
      setAcceptError("Missing tenant identity — sign in again.");
      return;
    }
    setAcceptingId(quotationId);
    setAcceptError(null);
    setAcceptedId(null);
    try {
      const res = await fetchWithAuth(`/api/sgtx/quotations/${encodeURIComponent(quotationId)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptorGtid: payload.tenantGtid }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAcceptError(json?.error || `Accept failed (${res.status})`);
        return;
      }
      setAcceptedId(quotationId);
      quotesQ.refetch();
      toast.success("Quote accepted", { description: `Quote ${quotationId} accepted — a payment leg will be created.` });
    } catch (e: any) {
      setAcceptError(e?.message || "Network error");
    } finally {
      setAcceptingId(null);
    }
  }

  // No USTN yet — the trade is still in PENDING_SELLER_RESPONSE state.
  if (!ustn) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <Receipt className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Provider Quotations (v18)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No USTN yet — provider quotations appear here once the contract is locked and a USTN is issued.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (quotesQ.isLoading) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading provider quotations…
        </div>
      </Card>
    );
  }

  if (quotesQ.isError) {
    return (
      <Card className="p-4 border-dashed border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Provider quotations unavailable</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The v18 quotations endpoint returned an error for USTN <code className="font-mono">{ustn}</code>.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const quotations = quotesQ.data?.quotations || [];

  if (quotations.length === 0) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <Receipt className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Provider Quotations (v18)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No provider quotations on file for this USTN yet. Quotes from logistics providers, insurers, and customs brokers appear here as they are submitted (POST /api/sgtx/quotations).
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <Receipt className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Provider Quotations (v18)</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              {quotations.length} quote{quotations.length === 1 ? "" : "s"} for USTN <code className="font-mono">{ustn}</code>. Accepting a quote creates a payment leg (v18 §8.7 — no leg without a quote).
            </p>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-border border border-border rounded-md bg-card/40 max-h-96 overflow-y-auto custom-scroll">
        {quotations.map((q: any, i: number) => {
          const qid = q.quotation_id || q.quotationId || q.id || `q-${i}`;
          const providerName = q.provider_name || q.providerName || q.provider_gtid || "—";
          const providerType = q.provider_type || q.providerType || "";
          const serviceType = q.service_type || q.serviceType || "—";
          const fee = q.fee || {};
          const status = q.status || "PENDING";
          const isPending = status === "PENDING";
          const isAccepted = status === "ACCEPTED";
          const isRejected = status === "REJECTED";
          const isAccepting = acceptingId === qid;
          const isJustAccepted = acceptedId === qid;
          return (
            <li key={qid} className="p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {providerName}
                    {providerType && <span className="ml-1.5 text-[0.6rem] text-muted-foreground">({providerType})</span>}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground font-mono truncate">{qid}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    "text-[0.55rem] flex-shrink-0 " +
                    (isAccepted ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                      : isRejected ? "border-red-500/40 text-red-700 dark:text-red-300"
                      : "border-amber-500/40 text-amber-700 dark:text-amber-300")
                  }
                >
                  {statusLabel(status)}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground truncate">
                  <span className="font-medium">{serviceType}</span>
                  {fee.terms && <> · {fee.terms}</>}
                  {fee.condition && <> · {fee.condition}</>}
                </span>
                <span className="font-medium">
                  {fee.amount !== undefined && fee.currency ? fmtMoney(fee.amount, fee.currency) : "—"}
                </span>
              </div>
              {isPending && (
                <div className="flex items-center gap-2 pt-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleAccept(qid)}
                    disabled={isAccepting}
                    className="h-7 text-xs"
                  >
                    {isAccepting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <HandCoins className="w-3 h-3 mr-1" />}
                    {isAccepting ? "Accepting…" : "Accept quote"}
                  </Button>
                  {isJustAccepted && (
                    <span className="text-[0.65rem] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Accepted — payment leg created
                    </span>
                  )}
                </div>
              )}
              {q.loom_hash && (
                <p className="text-[0.55rem] text-muted-foreground/70 font-mono truncate">
                  loom {q.loom_hash.slice(0, 28)}…
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {acceptError && (
        <p className="text-xs text-red-500 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{acceptError}</span>
        </p>
      )}
    </Card>
  );
}
