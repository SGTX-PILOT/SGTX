"use client";

// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-1 — Seller Price Features (v18 §16.10.3)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Surgical add to the seller page (/operations/seller). Implements 4 spec'd
// features:
//
//   A. AI Fair Price Chart (§3.2) — fetches /api/sgtx/ai/price-band POST with
//      { commodity, hsCode, originCountry, destCountry }. Renders a visual
//      band (low/mid/high) with the seller's entered EXW price positioned on
//      the same scale. Within-band = green badge "Within AI Fair Price Band".
//      Outside-band = amber badge "Price Deviation Detected".
//   B. Price Deviation Justification (§3.5) — when price is outside band,
//      shows a mandatory justification textarea (≥ 20 chars, live counter).
//      Calls /api/sgtx/ai/price-deviation POST for an A2 narrative
//      explanation of the deviation.
//   C. Post-Lock Price Watch (§3.6) — when the trade is past EXW lock
//      (phase ≥ 3 OR status ∈ CONTRACT_SIGNED, IN_EXECUTION, etc.), shows
//      a "Price Watch Active" badge and polls /api/sgtx/smart-inbox every
//      60s for any price-change alerts.
//   D. Mode B+C Comparison Panel (§5.4) — aggregates Mode B (LSP) and
//      Mode C (SHIP) quotations from /api/sgtx/quotations side-by-side.
//      "Combined Total" row shows the sum of selected quotes.
//
// All fetches use TanStack Query with `retry: false`. 404/500 errors are
// handled gracefully with empty states.

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle, Activity, BadgeCheck, BarChart3, Calculator, CheckCircle2,
  ChevronDown, ChevronUp, Info, Loader2, ShieldCheck, Sparkles, TrendingDown,
  TrendingUp, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(value: number | undefined, currency: string | undefined): string {
  if (value === undefined || value === null || isNaN(Number(value))) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${cur} ${Number(value).toLocaleString()}`;
  }
}

function fmtDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Try to extract a JSON object from the AI's free-form text response.
// The system prompt for price-band asks the model to return JSON:
//   { lowUsd, midUsd, highUsd, currency, rationale, confidence }
// but the model may wrap it in markdown fences or add prose. We try to
// extract and parse the JSON, fall back to a heuristic band if we can't.
function parsePriceBand(content: any, fallbackPrice: number): {
  low: number; mid: number; high: number; currency: string; rationale: string; confidence: string;
} {
  if (!content) {
    // Heuristic: ±10% around the entered price.
    const p = fallbackPrice || 0;
    return {
      low: p * 0.9,
      mid: p,
      high: p * 1.1,
      currency: "USD",
      rationale: "AI band unavailable. Heuristic band of ±10% around your entered price shown for reference.",
      confidence: "low",
    };
  }
  // If content is already an object, use it directly.
  if (typeof content === "object") {
    const o = content;
    return {
      low: Number(o.lowUsd ?? o.low_usd ?? o.low ?? 0),
      mid: Number(o.midUsd ?? o.mid_usd ?? o.mid ?? 0),
      high: Number(o.highUsd ?? o.high_usd ?? o.high ?? 0),
      currency: o.currency || "USD",
      rationale: o.rationale || o.reason || "",
      confidence: String(o.confidence ?? "medium"),
    };
  }
  // Content is a string. Strip markdown fences + try JSON.parse.
  const text = String(content);
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCandidate = fenced ? fenced[1].trim() : text.trim();
  // Try to find the first {...} block in the candidate.
  const braceMatch = jsonCandidate.match(/\{[\s\S]*\}/);
  const candidate = braceMatch ? braceMatch[0] : jsonCandidate;
  try {
    const parsed = JSON.parse(candidate);
    return {
      low: Number(parsed.lowUsd ?? parsed.low_usd ?? parsed.low ?? 0),
      mid: Number(parsed.midUsd ?? parsed.mid_usd ?? parsed.mid ?? 0),
      high: Number(parsed.highUsd ?? parsed.high_usd ?? parsed.high ?? 0),
      currency: parsed.currency || "USD",
      rationale: parsed.rationale || parsed.reason || text,
      confidence: String(parsed.confidence ?? "medium"),
    };
  } catch {
    // Not JSON — treat the whole text as rationale and synthesise a band.
    const p = fallbackPrice || 0;
    return {
      low: p * 0.9,
      mid: p,
      high: p * 1.1,
      currency: "USD",
      rationale: text || "AI band could not be parsed.",
      confidence: "low",
    };
  }
}

// Map a service_type string to Mode B (LSP) or Mode C (SHIP). Heuristic:
// TRUCK / INLAND / CUSTOMS_EXPORT / INSURANCE → Mode B
// OCEAN / FREIGHT / THC / BOOKING / FCL / LCL / SHIP → Mode C
// If the type doesn't match either, default to Mode B (most services are LSP-side).
function modeForServiceType(serviceType: string): "B" | "C" {
  const s = (serviceType || "").toUpperCase();
  if (/OCEAN|FREIGHT|THC|BOOKING|FCL|LCL|SHIP|MARINE|B\/L|VESSEL|PORT/.test(s)) return "C";
  return "B";
}

// ═══════════════════════════════════════════════════════════════════════════════
// SellerPriceFeatures — public entry component
// ═══════════════════════════════════════════════════════════════════════════════

export function SellerPriceFeatures({
  trade, exwPrice, ustn,
}: {
  trade: any;
  exwPrice: number;
  ustn?: string;
}) {
  return (
    <div className="space-y-4">
      {/* A + B: AI Fair Price Chart + Price Deviation Justification */}
      <AiFairPriceChart trade={trade} exwPrice={exwPrice} />
      {/* C: Post-Lock Price Watch */}
      <PostLockPriceWatch ustn={ustn} trade={trade} exwPrice={exwPrice} />
      {/* D: Mode B+C Comparison Panel */}
      <ModeComparisonPanel ustn={ustn} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. AI Fair Price Chart (§3.2) + B. Price Deviation Justification (§3.5)
// ═══════════════════════════════════════════════════════════════════════════════

function AiFairPriceChart({ trade, exwPrice }: { trade: any; exwPrice: number }) {
  const { payload } = useSession();
  const [justification, setJustification] = useState<string>("");
  const [showRationale, setShowRationale] = useState<boolean>(false);

  const commodity = trade?.commodity || "";
  const hsCode = trade?.commodityHs || trade?.hsCode || "";
  const originCountry = trade?.originCountry || trade?.origin_country || "";
  const destCountry = trade?.destCountry || trade?.destinationCountry || trade?.dest_country || "";
  const currency = trade?.currency || "USD";

  // Fetch AI price band. The endpoint is POST; we wrap in useQuery by
  // including the body in the queryKey so changing inputs re-fetches.
  const bandQ = useQuery({
    queryKey: ["seller-price-band", commodity, hsCode, originCountry, destCountry],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/ai/price-band`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity, hsCode, originCountry, destCountry }),
      });
      if (!res.ok) throw new Error(`price-band ${res.status}`);
      return res.json() as Promise<any>;
    },
    enabled: !!commodity,
    retry: false,
  });

  const band = useMemo(() => {
    const raw = bandQ.data;
    // The orchestrator returns { content, provider, model, latency_ms,
    // fallback_used, fallbackUsed, latencyMs, authority }. The actual JSON
    // band is in `content` (a string). parsePriceBand handles both shapes.
    const content = raw?.content ?? raw;
    return parsePriceBand(content, exwPrice);
  }, [bandQ.data, exwPrice]);

  // Determine deviation state.
  const price = exwPrice || 0;
  const hasBand = band.low > 0 && band.high > 0;
  const isWithinBand = hasBand && price >= band.low && price <= band.high;
  const isAboveBand = hasBand && price > band.high;
  const isBelowBand = hasBand && price < band.low;
  const deviationPct = hasBand && price > 0
    ? isAboveBand ? ((price - band.high) / band.high) * 100
    : isBelowBand ? ((band.low - price) / band.low) * 100
    : 0
    : 0;
  const isDeviation = hasBand && !isWithinBand;
  const justificationValid = justification.trim().length >= 20;

  // A2 deviation narrative (only fetched when price is outside the band).
  const deviationQ = useQuery({
    queryKey: ["seller-price-deviation", commodity, price, band.low, band.high],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/ai/price-deviation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity,
          enteredPrice: price,
          aiBandLow: band.low,
          aiBandHigh: band.high,
        }),
      });
      if (!res.ok) throw new Error(`price-deviation ${res.status}`);
      return res.json() as Promise<any>;
    },
    enabled: isDeviation && price > 0,
    retry: false,
  });

  // Visual band chart geometry. The chart is a horizontal bar with 3 segments:
  // [low..mid] [mid..high] [high..] with the seller's price marker on top.
  const chartMin = Math.min(band.low, price) * 0.85;
  const chartMax = Math.max(band.high, price) * 1.15;
  const chartRange = chartMax - chartMin || 1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - chartMin) / chartRange) * 100))}%`;

  // Empty state — no commodity yet.
  if (!commodity) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">AI Fair Price Band (v18 §3.2)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No commodity set on this trade yet. The AI fair-price band will
              appear once a commodity is selected.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Empty state — EXW not entered yet.
  if (price <= 0) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <BarChart3 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">AI Fair Price Band (v18 §3.2)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bandQ.isLoading
                ? "Loading AI fair-price band…"
                : hasBand
                  ? `Band ready: ${fmtMoney(band.low, band.currency)} – ${fmtMoney(band.high, band.currency)}. Enter a Goods Cost (EXW) above to see where your price sits within the band.`
                  : "Enter a Goods Cost (EXW) above to compare against the AI fair-price band."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-4 space-y-3",
      isDeviation
        ? "border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/10"
        : "border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <BarChart3 className={cn(
            "w-4 h-4 mt-0.5 flex-shrink-0",
            isDeviation ? "text-amber-600" : "text-emerald-600",
          )} />
          <div>
            <p className="text-sm font-medium">AI Fair Price Band (v18 §3.2)</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              AI agent <code className="font-mono">price-band</code> · authority A2 ·{" "}
              {bandQ.data?.provider || bandQ.data?.model || "—"}
              {bandQ.data?.fallbackUsed && " (fallback)"}
            </p>
          </div>
        </div>
        {bandQ.isLoading ? (
          <Badge variant="outline" className="text-[0.55rem]">
            <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> Loading
          </Badge>
        ) : isWithinBand ? (
          <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
            <BadgeCheck className="w-2.5 h-2.5 mr-1" /> Within AI Fair Price Band
          </Badge>
        ) : isDeviation ? (
          <Badge variant="outline" className="text-[0.55rem] border-amber-500/40 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-2.5 h-2.5 mr-1" /> Price Deviation Detected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[0.55rem]">
            <Activity className="w-2.5 h-2.5 mr-1" /> Band unavailable
          </Badge>
        )}
      </div>

      {/* Visual band chart */}
      {hasBand && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingDown className="w-3 h-3" /> Low
              <span className="font-medium text-foreground">
                {fmtMoney(band.low, band.currency)}
              </span>
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <Calculator className="w-3 h-3" /> Mid
              <span className="font-medium text-foreground">
                {fmtMoney(band.mid, band.currency)}
              </span>
            </span>
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> High
              <span className="font-medium text-foreground">
                {fmtMoney(band.high, band.currency)}
              </span>
            </span>
          </div>

          {/* Horizontal band bar — low..high range with mid marker */}
          <div className="relative h-8 rounded-md border border-border bg-muted/30 overflow-hidden">
            {/* Band fill (low → high) */}
            <div
              className="absolute top-0 bottom-0 bg-emerald-500/30 dark:bg-emerald-500/20"
              style={{ left: pct(band.low), width: `calc(${pct(band.high)} - ${pct(band.low)})` }}
              aria-hidden="true"
            />
            {/* Mid marker */}
            <div
              className="absolute top-0 bottom-0 w-px bg-emerald-600/60"
              style={{ left: pct(band.mid) }}
              aria-hidden="true"
            />
            {/* Seller price marker */}
            <div
              className={cn(
                "absolute top-0 bottom-0 w-0.5",
                isWithinBand ? "bg-emerald-600" : "bg-amber-600",
              )}
              style={{ left: `calc(${pct(price)} - 1px)` }}
              aria-label="Seller price marker"
            />
            <div
              className={cn(
                "absolute -top-0.5 text-[0.55rem] font-mono px-1 py-0.5 rounded border",
                isWithinBand
                  ? "bg-emerald-100 dark:bg-emerald-950/50 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-100 dark:bg-amber-950/50 border-amber-500/40 text-amber-700 dark:text-amber-300",
              )}
              style={{ left: `calc(${pct(price)} + 4px)` }}
            >
              {fmtMoney(price, currency)}
            </div>
          </div>
          <p className="text-[0.6rem] text-muted-foreground">
            Green band = AI fair price range. The vertical bar is your entered EXW price.
          </p>
        </div>
      )}

      {/* Deviation summary */}
      {isDeviation && (
        <div className="p-2.5 rounded border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">
              {isAboveBand ? "Above band" : "Below band"} by {Math.abs(deviationPct).toFixed(1)}%
            </p>
            <p className="text-[0.65rem] mt-0.5">
              Your price {fmtMoney(price, currency)} is {isAboveBand ? "above" : "below"} the AI
              fair price band of {fmtMoney(band.low, band.currency)} – {fmtMoney(band.high, band.currency)}.
              A justification is required before quote submission.
            </p>
          </div>
        </div>
      )}

      {/* B. Price Deviation Justification (§3.5) */}
      {isDeviation && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <Label htmlFor="deviation-justification" className="text-xs">
            Price deviation justification *{" "}
            <span className="text-muted-foreground">(≥ 20 chars)</span>
          </Label>
          <Textarea
            id="deviation-justification"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Explain why your price deviates from the AI fair-price band (e.g. premium grade, smaller lot, urgent delivery, specialty sourcing)."
            rows={3}
            className="text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] text-muted-foreground">
              {justification.trim().length < 20
                ? `${20 - justification.trim().length} more characters required`
                : "Justification meets minimum length"}
            </span>
            <span className={cn(
              "text-[0.65rem] font-mono",
              justificationValid ? "text-emerald-600" : "text-muted-foreground",
            )}>
              {justification.trim().length} / 20 min
            </span>
          </div>

          {/* A2 narrative from /api/sgtx/ai/price-deviation */}
          <div className="pt-2">
            {deviationQ.isLoading ? (
              <p className="text-[0.65rem] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Requesting A2 deviation analysis…
              </p>
            ) : deviationQ.isError ? (
              <p className="text-[0.65rem] text-muted-foreground italic flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                A2 deviation analysis unavailable. You can still submit with your own justification.
              </p>
            ) : deviationQ.data ? (
              <div className="rounded border border-border bg-card/40 p-2.5 text-[0.65rem] space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  A2 deviation analysis
                  <Badge variant="outline" className="text-[0.5rem] ml-1">
                    {deviationQ.data.provider || deviationQ.data.model || "—"}
                    {deviationQ.data.fallbackUsed && " · fallback"}
                  </Badge>
                </p>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {deviationQ.data.content || deviationQ.data.message || deviationQ.data.text || "No narrative returned."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Show rationale (collapsible) */}
      {band.rationale && (
        <div>
          <button
            onClick={() => setShowRationale((o) => !o)}
            aria-expanded={showRationale}
            aria-controls="price-band-rationale"
            className="text-[0.65rem] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showRationale ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showRationale ? "Hide rationale" : "Show AI rationale"}
          </button>
          {showRationale && (
            <p id="price-band-rationale" className="text-[0.65rem] text-muted-foreground whitespace-pre-wrap mt-1 leading-relaxed border-l-2 border-border pl-2.5">
              {band.rationale}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// C. Post-Lock Price Watch (§3.6)
// ═══════════════════════════════════════════════════════════════════════════════

function PostLockPriceWatch({
  ustn, trade, exwPrice,
}: {
  ustn?: string;
  trade: any;
  exwPrice: number;
}) {
  // EXW lock = the seller has submitted a quote (status ≥ QUOTE_RECEIVED) OR
  // the trade has moved past the QUOTED phase. We consider the price "locked"
  // once the trade phase ≥ 3 (CONTRACT_SIGNED) OR status is one of the
  // post-quote values.
  const phase = trade?.phase ?? 0;
  const status = (trade?.status || "").toUpperCase();
  const postLockStatuses = [
    "QUOTE_RECEIVED", "QUOTE_ACCEPTED", "CONTRACT_SIGNED", "BUYER_SUBMITTED",
    "IN_EXECUTION", "INSPECTION_REQUIRED", "QC_PENDING", "CUSTOMS_PENDING",
    "CUSTOMS_HOLD", "PAYMENT_DUE", "FINANCING_PENDING", "SETTLED",
    "PROVISIONAL_SETTLEMENT", "CLOSED", "COMPLETED",
  ];
  const isLocked = phase >= 3 || postLockStatuses.includes(status);

  // Poll /api/sgtx/smart-inbox every 60s for price-change alerts.
  // The smart-inbox endpoint returns tenant's inbox items; we filter for
  // PRICE-related categories.
  const inboxQ = useQuery({
    queryKey: ["seller-price-watch", ustn],
    queryFn: async () => {
      if (!ustn) return { items: [] as any[] };
      const res = await fetchWithAuth(`/api/sgtx/smart-inbox?category=PRICE&ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) {
        // Fallback: fetch the whole inbox and filter client-side.
        const res2 = await fetchWithAuth(`/api/sgtx/smart-inbox`);
        if (!res2.ok) return { items: [] as any[] };
        const data = await res2.json();
        const items = (data.items || data.inbox || []).filter((i: any) => {
          const cat = (i.category || "").toUpperCase();
          return cat.includes("PRICE") || cat.includes("FEE") || cat.includes("FX");
        });
        return { items };
      }
      return res.json();
    },
    enabled: !!ustn && isLocked,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  // No USTN yet — can't poll.
  if (!ustn) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Post-Lock Price Watch (v18 §3.6)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No USTN issued yet — price watch activates once the contract is
              locked and a USTN is assigned.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Pre-lock state.
  if (!isLocked) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Post-Lock Price Watch (v18 §3.6)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quote not yet locked. The price watch activates automatically once
              the contract is signed (phase 3+). Background A2 monitoring polls
              the smart inbox every 60 seconds for price-change alerts.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const alerts = inboxQ.data?.items || [];
  const priceAlerts = alerts.filter((a: any) => {
    const cat = (a.category || "").toUpperCase();
    return cat.includes("PRICE") || cat.includes("FEE") || cat.includes("FX");
  });

  return (
    <Card className="p-4 space-y-3 border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/10">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Post-Lock Price Watch (v18 §3.6)</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              Background A2 monitoring active · polling smart inbox every 60s for
              USTN <code className="font-mono">{ustn}</code>.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[0.55rem] border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
          <Activity className="w-2.5 h-2.5 mr-1 animate-pulse" /> Price Watch Active
        </Badge>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Price-change alerts ({priceAlerts.length})
        </p>
        {inboxQ.isLoading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading alerts…
          </p>
        ) : priceAlerts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No price-change alerts. The AI background monitor has not detected any
            market shifts that would impact your locked EXW price.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll">
            {priceAlerts.map((a: any, i: number) => (
              <li key={a.id || i} className="p-2 rounded border border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-amber-700 dark:text-amber-300">
                    {a.title || a.description || "Price alert"}
                  </p>
                  <Badge variant="outline" className="text-[0.55rem] flex-shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300">
                    {a.priority ?? "—"}
                  </Badge>
                </div>
                {a.description && a.title && (
                  <p className="text-[0.65rem] text-muted-foreground mt-0.5">{a.description}</p>
                )}
                <p className="text-[0.55rem] text-muted-foreground mt-0.5">
                  {fmtDateTime(a.createdAt || a.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// D. Mode B+C Comparison Panel (§5.4)
// ═══════════════════════════════════════════════════════════════════════════════

function ModeComparisonPanel({ ustn }: { ustn?: string }) {
  // Reuse the seller-quotations query key from ProviderQuotationsStatus —
  // a cache hit returns immediately; no duplicate fetch.
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

  // Partition quotations into Mode B (LSP) vs Mode C (SHIP).
  const { modeB, modeC } = useMemo(() => {
    const quotations = quotesQ.data?.quotations || [];
    const modeB: any[] = [];
    const modeC: any[] = [];
    for (const q of quotations) {
      const st = q.service_type || q.serviceType || "";
      if (modeForServiceType(st) === "B") modeB.push(q);
      else modeC.push(q);
    }
    return { modeB, modeC };
  }, [quotesQ.data]);

  // Track which quotes the seller has selected in each column.
  const [selectedB, setSelectedB] = useState<Set<string>>(new Set());
  const [selectedC, setSelectedC] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  const totalB = modeB
    .filter((q) => selectedB.has(q.id || q.quotation_id || q.quotationId))
    .reduce((s, q) => s + (Number(q.fee?.amount) || 0), 0);
  const totalC = modeC
    .filter((q) => selectedC.has(q.id || q.quotation_id || q.quotationId))
    .reduce((s, q) => s + (Number(q.fee?.amount) || 0), 0);
  const combinedTotal = totalB + totalC;
  const currencyB = modeB[0]?.fee?.currency || "USD";
  const currencyC = modeC[0]?.fee?.currency || "USD";
  const combinedCurrency = currencyB === currencyC ? currencyB : "USD";

  // Empty / loading / error states.
  if (!ustn) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <Calculator className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Mode B + C Comparison (v18 §5.4)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No USTN issued yet. Once the contract is locked and provider
              quotations come in from Mode B (LSP) and Mode C (SHIP), this panel
              aggregates them side-by-side.
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
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Mode B + C comparison…
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
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Mode B + C comparison unavailable
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Could not load provider quotations for USTN{" "}
              <code className="font-mono">{ustn}</code>.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (modeB.length === 0 && modeC.length === 0) {
    return (
      <Card className="p-4 border-dashed border-border bg-card/40">
        <div className="flex items-start gap-2.5">
          <Calculator className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Mode B + C Comparison (v18 §5.4)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No provider quotations on file yet. As LSP (Mode B) and SHIP
              (Mode C) quotes come in, they will be aggregated side-by-side here
              with a combined-total row.
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
          <Calculator className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Mode B + C Comparison (v18 §5.4)</p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              Aggregate quotes from Mode B (LSP) and Mode C (SHIP). Select quotes
              to compute the combined total. The combined total is the sum of the
              selected quotes across both modes.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[0.55rem]">
          B: {modeB.length} · C: {modeC.length}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Mode B column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Mode B · LSP
            </p>
            <Badge variant="outline" className="text-[0.55rem]">{modeB.length} quote{modeB.length === 1 ? "" : "s"}</Badge>
          </div>
          <ModeQuoteList
            quotes={modeB}
            selected={selectedB}
            onToggle={(id) => toggle(selectedB, id, setSelectedB)}
            emptyHint="No LSP quotes yet. Quotes from logistics service providers (truckers, inland transport, customs brokers) appear here as they submit."
          />
          <div className="flex items-center justify-between p-2 rounded border border-border bg-card/40 text-xs">
            <span className="text-muted-foreground">Mode B subtotal</span>
            <span className="font-medium">{fmtMoney(totalB, currencyB)}</span>
          </div>
        </div>

        {/* Mode C column */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Mode C · SHIP
            </p>
            <Badge variant="outline" className="text-[0.55rem]">{modeC.length} quote{modeC.length === 1 ? "" : "s"}</Badge>
          </div>
          <ModeQuoteList
            quotes={modeC}
            selected={selectedC}
            onToggle={(id) => toggle(selectedC, id, setSelectedC)}
            emptyHint="No SHIP quotes yet. Quotes from shipping lines (ocean freight, THC, FCL/LCL bookings) appear here as they submit."
          />
          <div className="flex items-center justify-between p-2 rounded border border-border bg-card/40 text-xs">
            <span className="text-muted-foreground">Mode C subtotal</span>
            <span className="font-medium">{fmtMoney(totalC, currencyC)}</span>
          </div>
        </div>
      </div>

      {/* Combined total row */}
      <div className="flex items-center justify-between p-3 rounded border border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold">Combined Total</span>
          <span className="text-[0.65rem] text-muted-foreground">
            ({selectedB.size + selectedC.size} selected quotes)
          </span>
        </div>
        <span className="text-lg font-bold">{fmtMoney(combinedTotal, combinedCurrency)}</span>
      </div>
    </Card>
  );
}

function ModeQuoteList({
  quotes, selected, onToggle, emptyHint,
}: {
  quotes: any[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyHint: string;
}) {
  if (quotes.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic p-2">{emptyHint}</p>
    );
  }
  return (
    <ul className="space-y-1.5 max-h-64 overflow-y-auto custom-scroll">
      {quotes.map((q, i) => {
        const qid = q.id || q.quotation_id || q.quotationId || `q-${i}`;
        const providerName = q.provider_name || q.providerName || q.provider_gtid || "—";
        const serviceType = q.service_type || q.serviceType || "—";
        const fee = q.fee || {};
        const isSelected = selected.has(qid);
        const status = (q.status || "PENDING").toUpperCase();
        return (
          <li
            key={qid}
            className={cn(
              "p-2 rounded border cursor-pointer transition",
              isSelected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
            )}
            onClick={() => onToggle(qid)}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(qid)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5"
                aria-label={`Select ${providerName} quote`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{providerName}</p>
                <p className="text-[0.6rem] text-muted-foreground truncate font-mono">{qid}</p>
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <span className="text-[0.65rem] text-muted-foreground truncate">{serviceType}</span>
                  <span className="text-xs font-medium">{fmtMoney(fee.amount, fee.currency)}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[0.5rem]",
                      status === "ACCEPTED" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                      status === "PENDING" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                      status === "REJECTED" && "border-red-500/40 text-red-700 dark:text-red-300",
                    )}
                  >
                    {status}
                  </Badge>
                  {fee.terms && (
                    <span className="text-[0.55rem] text-muted-foreground truncate">{fee.terms}</span>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
