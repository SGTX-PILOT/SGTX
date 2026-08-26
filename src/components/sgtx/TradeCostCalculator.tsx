// @ts-nocheck
"use client";
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v13.1 — Trade Cost Calculator (Recommendation #11, Art 24 True Landed Cost)
// ═══════════════════════════════════════════════════════════════════════════════
// A card component that calculates the True Landed Cost of a trade per
// Art 24 — the FULL 18-component breakdown:
//
//   1. GOODS                  10. TRANSIT
//   2. ORIGIN COST            11. DESTINATION HANDLING
//   3. PACKAGING              12. DUTY
//   4. INLAND                 13. VAT/GST
//   5. EXPORT CLEARANCE       14. EXCISE
//   6. CERTIFICATES           15. BROKER
//   7. INSPECTION             16. LOCAL DELIVERY
//   8. INSURANCE              17. OTHER FEES
//   9. INTERNATIONAL FREIGHT   18. SGTX FEES
//
// Two input modes:
//   • By USTN — fetches the trade's goods value + origin/dest + HS code +
//     incoterm + transport mode from the trade-request API, then submits
//     those to /api/sgtx/trade-cost/landed.
//   • Manual entry — operator enters goods value + trade parameters directly.
//
// On "Calculate", POSTs to /api/sgtx/trade-cost/landed. Renders:
//   • A breakdown table (Component | Amount | % of total)
//   • A CSS-only horizontal bar chart of each component's percentage
//   • The total landed cost in large gold text (sgtx-metric-large)
//   • An "Estimated" badge when components are using fallback values
//
// Designed to be placed on the Buyer portal Command Center, below the
// Executive Summary cards.
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calculator, Loader2, AlertTriangle, CheckCircle2, Coins,
  ChevronDown, ChevronRight, Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface BreakdownRow {
  component: string;
  amount: number;
  percentage: number;
  source: string;
  missing: boolean;
}

interface CalcResponse {
  ok: boolean;
  totalLandedCost: number;
  currency: string;
  breakdown: BreakdownRow[];
  missing: string[];
  source: "ustn" | "manual";
  ustn: string | null;
  componentCount: number;
  inputs: {
    goodsValue: number;
    originCountry: string;
    destinationCountry: string;
    hsCode: string;
    incoterm: string;
    freightMode: string;
    containerCount: number;
    coldChain: boolean;
    weight: number | null;
    currency: string;
    tariffSource: string;
    tariffRate: number;
    vatRate: number;
    sgtxFeeRate: number;
  };
  generatedAt: string;
}

interface TradeOption {
  ustn: string;
  commodity: string;
  tradeValueUsd: number;
  originCountry: string;
  destCountry: string;
  commodityHs: string;
  incoterm: string;
  transportMode: string;
  coldChain: boolean | string;
  status: string;
}

interface TradeCostCalculatorProps {
  /** Buyer's GTID — used to fetch the list of trades for the USTN dropdown. */
  tenantGtid?: string;
  /** Optional initial USTN to pre-select (deep-link from a trade detail view). */
  initialUstn?: string;
}

const FREIGHT_MODES = ["OCEAN", "AIR", "TRUCK", "RAIL", "RO_RO", "MULTIMODAL"];
const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// Max bar width in pixels (for the CSS-only chart). The largest percentage
// fills this width; smaller components scale proportionally.
const MAX_BAR_PX = 240;
const BAR_COLORS = [
  "#d4a017", "#10b981", "#f59e0b", "#f87171", "#94a3b8",
  "#b45309", "#84cc16", "#0ea5e9", "#a78bfa", "#fb923c",
];

export function TradeCostCalculator({ tenantGtid, initialUstn }: TradeCostCalculatorProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"ustn" | "manual">(initialUstn ? "ustn" : "manual");
  const [selectedUstn, setSelectedUstn] = useState<string>(initialUstn || "");
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Manual-entry fields (defaults match the wizard's frozen-strawberries demo).
  const [goodsValue, setGoodsValue] = useState<string>("50000");
  const [originCountry, setOriginCountry] = useState<string>("EG");
  const [destinationCountry, setDestinationCountry] = useState<string>("DE");
  const [hsCode, setHsCode] = useState<string>("0811.10");
  const [incoterm, setIncoterm] = useState<string>("CIF");
  const [freightMode, setFreightMode] = useState<string>("OCEAN");
  const [weight, setWeight] = useState<string>("");
  const [containerCount, setContainerCount] = useState<string>("1");
  const [coldChain, setColdChain] = useState<boolean>(true);

  // Fetch the list of buyer's trades for the USTN dropdown.
  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ["tcc-trade-list", tenantGtid],
    queryFn: async () => {
      if (!tenantGtid) return { trades: [] as TradeOption[] };
      try {
        const r = await fetch(`/api/sgtx/trade-request?buyerGtid=${encodeURIComponent(tenantGtid)}`);
        if (!r.ok) return { trades: [] as TradeOption[] };
        const j = await r.json();
        const raw = Array.isArray(j?.trades) ? j.trades : Array.isArray(j) ? j : [];
        return { trades: raw as TradeOption[] };
      } catch {
        return { trades: [] as TradeOption[] };
      }
    },
    enabled: !!tenantGtid && mode === "ustn",
    staleTime: 30_000,
  });
  const trades: TradeOption[] = tradesData?.trades || [];
  const selectedTrade = useMemo(
    () => trades.find((t) => t.ustn === selectedUstn) || null,
    [trades, selectedUstn],
  );

  // Calculate mutation — POSTs to /api/sgtx/trade-cost/landed.
  const calcMut = useMutation({
    mutationFn: async (): Promise<CalcResponse> => {
      const body = mode === "ustn"
        ? { ustn: selectedUstn }
        : {
            goodsValue: parseFloat(goodsValue) || 0,
            originCountry,
            destinationCountry,
            hsCode,
            incoterm,
            freightMode,
            weight: weight ? parseFloat(weight) : undefined,
            containerCount: parseInt(containerCount, 10) || 1,
            coldChain,
            currency: "USD",
          };
      const r = await fetch("/api/sgtx/trade-cost/landed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        throw new Error(j?.error || `calculation failed (status ${r.status})`);
      }
      return j as CalcResponse;
    },
    onSuccess: (data) => {
      toast.success(`Landed cost: ${fmtUsd(data.totalLandedCost)}`, {
        description: `${data.componentCount} components · source: ${data.source}${data.missing.length > 0 ? ` · ${data.missing.length} estimated` : ""}`,
      });
    },
    onError: (err: any) => {
      toast.error("Cost calculation failed", { description: err?.message || "internal error" });
    },
  });

  const result = calcMut.data;
  const breakdown: BreakdownRow[] = result?.breakdown || [];
  const total = result?.totalLandedCost || 0;
  const hasEstimated = (result?.missing?.length || 0) > 0 || breakdown.some((b) => b.source?.startsWith("default") || b.source === "fallback-5%");

  const maxPct = useMemo(() => {
    if (breakdown.length === 0) return 1;
    return Math.max(...breakdown.map((b) => b.percentage), 1);
  }, [breakdown]);

  const handleCalculate = () => {
    if (mode === "ustn" && !selectedUstn) {
      toast.error("Select a trade first", { description: "Choose a USTN from the dropdown or switch to manual entry." });
      return;
    }
    if (mode === "manual") {
      const gv = parseFloat(goodsValue);
      if (!Number.isFinite(gv) || gv <= 0) {
        toast.error("Enter a valid goods value", { description: "Goods value must be a positive number." });
        return;
      }
    }
    calcMut.mutate();
  };

  return (
    <Card className="p-4 sm:p-5 border-2 border-gold/30 bg-gradient-to-br from-gold/5 via-transparent to-transparent">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 mt-0.5">
          <Coins className="w-5 h-5 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Trade Cost Calculator
            <Badge variant="outline" className="text-[0.55rem] text-muted-foreground font-normal">
              Art 24 · True Landed Cost
            </Badge>
          </h3>
          <p className="text-[0.65rem] text-muted-foreground mt-0.5">
            18-component landed cost breakdown. Works with a saved USTN or manual entry.
          </p>
        </div>
        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/30 text-[0.65rem]">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`px-2 py-1 rounded ${mode === "manual" ? "bg-gold/20 text-gold font-semibold" : "text-muted-foreground"}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("ustn")}
            className={`px-2 py-1 rounded ${mode === "ustn" ? "bg-gold/20 text-gold font-semibold" : "text-muted-foreground"}`}
          >
            By USTN
          </button>
        </div>
      </div>

      {/* Input area */}
      <div className="space-y-3">
        {mode === "ustn" ? (
          <div className="space-y-2">
            <Label className="text-[0.65rem] tracking-widest text-muted-foreground uppercase">
              Select Trade
            </Label>
            {tradesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3 h-3 animate-spin text-gold" />
                Loading trades…
              </div>
            ) : trades.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No trades found for this tenant. Switch to Manual mode to calculate without a saved trade.
              </p>
            ) : (
              <Select value={selectedUstn} onValueChange={setSelectedUstn}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Choose a trade by USTN…" />
                </SelectTrigger>
                <SelectContent>
                  {trades.map((t) => (
                    <SelectItem key={t.ustn} value={t.ustn} className="text-xs">
                      <span className="font-mono">{t.ustn.slice(0, 24)}</span>
                      {" — "}
                      <span className="truncate">{t.commodity || "Unknown commodity"}</span>
                      {" · "}
                      {fmtUsd(t.tradeValueUsd || 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedTrade && (
              <div className="text-[0.65rem] text-muted-foreground p-2 rounded-md bg-muted/20 border border-border/50">
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span>Origin → Dest:</span>
                  <span className="font-mono">{selectedTrade.originCountry} → {selectedTrade.destCountry}</span>
                  <span>HS Code:</span>
                  <span className="font-mono">{selectedTrade.commodityHs || "—"}</span>
                  <span>Incoterm / Mode:</span>
                  <span className="font-mono">{selectedTrade.incoterm || "—"} · {selectedTrade.transportMode || "—"}</span>
                  <span>Goods Value:</span>
                  <span className="font-semibold text-gold">{fmtUsd(selectedTrade.tradeValueUsd || 0)}</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Goods Value (USD)</Label>
              <Input
                type="number"
                value={goodsValue}
                onChange={(e) => setGoodsValue(e.target.value)}
                className="text-xs h-9"
                placeholder="50000"
                min="0"
                step="100"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Origin</Label>
              <Input
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value.toUpperCase().slice(0, 2))}
                className="text-xs h-9 font-mono"
                placeholder="EG"
                maxLength={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Destination</Label>
              <Input
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value.toUpperCase().slice(0, 2))}
                className="text-xs h-9 font-mono"
                placeholder="DE"
                maxLength={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">HS Code</Label>
              <Input
                value={hsCode}
                onChange={(e) => setHsCode(e.target.value)}
                className="text-xs h-9 font-mono"
                placeholder="0811.10"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Incoterm</Label>
              <Select value={incoterm} onValueChange={setIncoterm}>
                <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INCOTERMS.map((i) => (
                    <SelectItem key={i} value={i} className="text-xs font-mono">{i}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Freight Mode</Label>
              <Select value={freightMode} onValueChange={setFreightMode}>
                <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREIGHT_MODES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Containers</Label>
              <Input
                type="number"
                value={containerCount}
                onChange={(e) => setContainerCount(e.target.value)}
                className="text-xs h-9"
                min="1"
                step="1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Weight (kg)</Label>
              <Input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="text-xs h-9"
                placeholder="optional"
                min="0"
              />
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer h-9 select-none">
                <input
                  type="checkbox"
                  checked={coldChain}
                  onChange={(e) => setColdChain(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#d4a017]"
                />
                <span className="text-muted-foreground">Cold chain</span>
              </label>
            </div>
          </div>
        )}

        {/* Calculate button */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleCalculate}
            disabled={calcMut.isPending}
            className="bg-gold-gradient text-sovereign min-h-[40px]"
          >
            {calcMut.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Calculating…</>
            ) : (
              <><Calculator className="w-3.5 h-3.5 mr-1.5" />Calculate True Landed Cost</>
            )}
          </Button>
          {hasEstimated && result && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Estimated
            </Badge>
          )}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="mt-4 space-y-3">
          {/* Total landed cost — large gold metric */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-gold/10 to-transparent border border-gold/30 text-center">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">
              Total True Landed Cost
            </p>
            <p className="sgtx-metric-large text-gold mt-1">
              {fmtUsd(total)}
            </p>
            <p className="text-[0.6rem] text-muted-foreground mt-1">
              {result.componentCount} components · currency: {result.currency} · source: {result.source}
              {result.ustn ? ` · USTN: ${result.ustn.slice(0, 24)}…` : ""}
            </p>
          </div>

          {/* Breakdown toggle */}
          <button
            type="button"
            onClick={() => setShowBreakdown((s) => !s)}
            className="flex items-center gap-1 text-[0.7rem] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showBreakdown ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Component breakdown ({breakdown.length})
          </button>

          {/* Breakdown table + bar chart */}
          {showBreakdown && (
            <div className="space-y-2">
              <div className="rounded-md border border-border/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="text-left font-semibold p-2">Component</th>
                      <th className="text-right font-semibold p-2 w-24">Amount</th>
                      <th className="text-right font-semibold p-2 w-16">% Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((b, i) => {
                      const color = BAR_COLORS[i % BAR_COLORS.length];
                      const barWidth = (b.percentage / maxPct) * MAX_BAR_PX;
                      const isEstimated = b.source?.startsWith("default") || b.source === "fallback-5%" || b.missing;
                      return (
                        <tr key={b.component} className="border-t border-border/40 hover:bg-muted/10">
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-1.5 h-4 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: color }}
                                aria-hidden
                              />
                              <span className="font-medium">{b.component}</span>
                              {isEstimated && (
                                <Badge variant="outline" className="text-[0.5rem] text-amber-500 border-amber-500/30 px-1 py-0">
                                  est
                                </Badge>
                              )}
                            </div>
                            {/* CSS-only horizontal bar */}
                            <div className="mt-1 h-1 rounded-full bg-muted/40 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${barWidth}px`, backgroundColor: color, maxWidth: "100%" }}
                              />
                            </div>
                          </td>
                          <td className="p-2 text-right font-mono tabular-nums">{fmtUsd(b.amount)}</td>
                          <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">
                            {b.percentage.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-gold/30 bg-gold/5">
                      <td className="p-2 font-bold">TOTAL</td>
                      <td className="p-2 text-right font-mono tabular-nums font-bold text-gold">{fmtUsd(total)}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-muted-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Inputs echo + tariff source */}
              <div className="text-[0.6rem] text-muted-foreground flex items-start gap-1.5 p-2 rounded-md bg-muted/20 border border-border/40">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-semibold">Tariff:</span> {result.inputs.tariffSource} ({(result.inputs.tariffRate * 100).toFixed(2)}%)
                  {" · "}
                  <span className="font-semibold">VAT:</span> {(result.inputs.vatRate * 100).toFixed(1)}%
                  {" · "}
                  <span className="font-semibold">SGTX fee:</span> {(result.inputs.sgtxFeeRate * 100).toFixed(2)}%
                  {" · "}
                  <span className="font-semibold">Mode:</span> {result.inputs.freightMode}
                  {" · "}
                  <span className="font-semibold">Containers:</span> {result.inputs.containerCount}
                  {result.inputs.coldChain ? " · cold-chain" : ""}
                  {hasEstimated && (
                    <>
                      {" · "}
                      <span className="text-amber-500 font-semibold">Some components are estimated (defaults or fallbacks used).</span>
                    </>
                  )}
                </div>
              </div>
              {/* Missing list */}
              {result.missing.length > 0 && (
                <div className="flex items-start gap-1.5 text-[0.65rem] text-amber-600 dark:text-amber-400 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>
                    Missing data for: {result.missing.join(", ")}. Defaults applied — re-run with explicit overrides for accuracy.
                  </span>
                </div>
              )}
              {/* Success indicator */}
              <div className="flex items-center gap-1.5 text-[0.65rem] text-success">
                <CheckCircle2 className="w-3 h-3" />
                <span>Calculation complete — {new Date(result.generatedAt).toLocaleString()}.</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
