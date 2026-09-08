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
import {
  Package, CheckCircle2, AlertTriangle, Loader2, ChevronRight,
  FileText, Sparkles, ShieldCheck, X, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
