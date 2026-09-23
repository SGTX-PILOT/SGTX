"use client";

// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// GAP-1 — Buyer Negotiation Panel (v18 §16.9.3)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Surgical add to the TCC page (/trades/[ustn]). Implements 7 spec'd features:
//
//   A. Quote Comparison Table (§3.1) — side-by-side comparison of seller quotes.
//      NON-MARKETPLACE: alphabetical by provider GTID, no ranking.
//   B. Negotiation Panel (§3.2) — 3 columns: Offer History | Current Offer | Trade Room.
//      Trade Room is the /api/sgtx/ai/trade-room chat (with /api/sgtx/disputes/mediation
//      as the persisted-message fallback). Grid-cols-3 on md+, stack on mobile.
//   C. Partial Acceptance (§3.3) — dialog where the buyer picks which line items
//      to accept. POSTs { ustn, accepted_items: [...] } to /api/sgtx/quote/accept.
//   D. Counter-Offer with Reason (§3.4) — dialog: new price, modified terms,
//      mandatory reason ≥20 chars (live char counter). POSTs to /api/sgtx/quote/counter.
//   E. Deadline Extension (§3.5) — dialog: duration select (+24h / +48h / +7d) +
//      optional reason. POSTs to /api/sgtx/quote/extension.
//   F. Visual Diff for Amendments (§3.6) — when a counter-offer is created, render
//      a side-by-side JSON diff: left=original, right=proposed. Green = additions,
//      red = removals.
//   G. Mutual Confirmation (§3.7) — "Confirm Agreement" button → dialog with
//      pre-contract snapshot summary. POSTs to /api/sgtx/quote/confirm with
//      { snapshot }. Shows "Mutual Confirmation Recorded" + timestamp on success.
//
// The component reuses the existing /api/sgtx/quotations + /api/sgtx/disputes/mediation
// GET endpoints (already wired in CommandCenterSection / DrawerContent). It calls
// /api/sgtx/ai/trade-room POST for the chat assistant. The /quote/counter,
// /quote/extension, /quote/confirm endpoints may not exist yet — those calls
// return 404 and we handle gracefully (toast error, no crash).

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, History, MessageSquare,
  Scale, Sparkles, Loader2, FileSignature, Calendar, Split, Send, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Quotation {
  quotation_id?: string;
  quotationId?: string;
  id?: string;
  provider_gtid?: string;
  providerGtid?: string;
  provider_name?: string;
  providerName?: string;
  provider_type?: string;
  providerType?: string;
  service_type?: string;
  serviceType?: string;
  service_details?: any;
  serviceDetails?: any;
  fee?: {
    amount?: number;
    currency?: string;
    terms?: string;
    condition?: string;
    breakdown?: { label: string; amount: number; currency?: string }[];
  };
  status?: string;
  valid_until?: string;
  validUntil?: string;
  loom_hash?: string;
  loomHash?: string;
  created_at?: string;
  createdAt?: string;
}

interface MediationMessage {
  id: string;
  senderGtid?: string;
  senderName?: string;
  senderRole?: string;
  messageType?: string;
  messageText?: string;
  message?: string;
  offerAmountUsd?: number;
  offerConditions?: any;
  sentimentScore?: number;
  sentimentFlag?: string;
  createdAt: string;
}

interface TradeRoomReply {
  reply?: string;
  message?: string;
  text?: string;
  error?: string;
}

function fmtMoney(value: number | undefined, currency: string | undefined): string {
  if (value === undefined || value === null || isNaN(Number(value))) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${cur} ${Number(value).toLocaleString()}`;
  }
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
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

// ─── Quotation field helpers ─────────────────────────────────────────────────
function qId(q: Quotation): string {
  return q.quotation_id || q.quotationId || q.id || "—";
}
function qProvider(q: Quotation): string {
  return q.provider_name || q.providerName || q.provider_gtid || q.providerGtid || "—";
}
function qProviderGtid(q: Quotation): string {
  return q.provider_gtid || q.providerGtid || q.provider_name || q.providerName || "";
}
function qServiceType(q: Quotation): string {
  return q.service_type || q.serviceType || "—";
}
function qFee(q: Quotation) {
  return q.fee || { amount: undefined, currency: undefined, terms: undefined, condition: undefined };
}
function qAmount(q: Quotation): number | undefined {
  return qFee(q).amount;
}
function qCurrency(q: Quotation): string | undefined {
  return qFee(q).currency;
}
function qTerms(q: Quotation): string | undefined {
  return qFee(q).terms;
}
function qDeadline(q: Quotation): string | undefined {
  return q.valid_until || q.validUntil;
}
function qStatus(q: Quotation): string {
  return (q.status || "PENDING").toUpperCase();
}
function qCreatedAt(q: Quotation): string | undefined {
  return q.created_at || q.createdAt;
}

// ─── Visual Diff helper (§3.6) ───────────────────────────────────────────────
// Renders a side-by-side JSON diff between the original quote and the proposed
// amendment. Green = addition, red = removal, amber = changed.
interface DiffRow {
  field: string;
  left: any;
  right: any;
  op: "equal" | "added" | "removed" | "changed";
}

function buildDiff(original: Record<string, any>, proposed: Record<string, any>): DiffRow[] {
  const keys = Array.from(new Set([...Object.keys(original || {}), ...Object.keys(proposed || {})]));
  keys.sort();
  return keys.map((k) => {
    const l = original?.[k];
    const r = proposed?.[k];
    const lHas = l !== undefined && l !== null && l !== "";
    const rHas = r !== undefined && r !== null && r !== "";
    let op: DiffRow["op"] = "equal";
    if (lHas && !rHas) op = "removed";
    else if (!lHas && rHas) op = "added";
    else if (lHas && rHas && String(l) !== String(r)) op = "changed";
    return { field: k, left: l, right: r, op };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BuyerNegotiationPanel — public entry component
// ═══════════════════════════════════════════════════════════════════════════════

export function BuyerNegotiationPanel({
  ustn, tradeId, trade,
}: {
  ustn: string;
  tradeId: string;
  trade: any;
}) {
  const { payload } = useSession();
  const qc = useQueryClient();

  // Reuse the CommandCenterSection query key for quotations — no duplicate fetch.
  const quotationsQ = useQuery({
    queryKey: ["cmd-quotations", ustn],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/quotations?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) throw new Error(`quotations ${res.status}`);
      return res.json() as Promise<{ quotations: Quotation[]; count: number }>;
    },
    enabled: !!ustn,
    retry: false,
  });

  // Reuse the DrawerContent messages query key for mediation history.
  const mediationQ = useQuery({
    queryKey: ["trade-messages", tradeId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/disputes/mediation?disputeId=${encodeURIComponent(tradeId)}`);
      if (!res.ok) return { messages: [] as MediationMessage[] };
      return res.json() as Promise<{ messages: MediationMessage[] }>;
    },
    enabled: !!tradeId,
    retry: false,
  });

  const quotations = quotationsQ.data?.quotations || [];
  // NON-MARKETPLACE: alphabetical by provider GTID — no ranking/scoring.
  const sortedQuotes = useMemo(() => {
    return [...quotations].sort((a, b) => {
      const aG = qProviderGtid(a);
      const bG = qProviderGtid(b);
      return aG.localeCompare(bG);
    });
  }, [quotations]);

  // The "current offer" is the most recent quotation. We prefer ACCEPTED > PENDING
  // for the active offer; if multiple are pending, pick the newest by created_at.
  const currentOffer = useMemo(() => {
    if (quotations.length === 0) return undefined;
    const accepted = quotations.find((q) => qStatus(q) === "ACCEPTED");
    if (accepted) return accepted;
    const pending = quotations.filter((q) => qStatus(q) === "PENDING" || qStatus(q) === "QUOTED");
    if (pending.length > 0) {
      pending.sort((a, b) => {
        const aT = qCreatedAt(a) ? new Date(qCreatedAt(a)!).getTime() : 0;
        const bT = qCreatedAt(b) ? new Date(qCreatedAt(b)!).getTime() : 0;
        return bT - aT;
      });
      return pending[0];
    }
    return quotations[0];
  }, [quotations]);

  // Local state for the visual diff (§3.6). When a counter-offer is sent, we
  // capture the original + proposed snapshots so the UI shows the diff inline.
  const [amendmentDiff, setAmendmentDiff] = useState<{
    original: Record<string, any>;
    proposed: Record<string, any>;
    timestamp: string;
  } | null>(null);

  // Local state for mutual confirmation (§3.7).
  const [confirmRecord, setConfirmRecord] = useState<{
    timestamp: string;
    snapshot: any;
    confirmationId?: string;
  } | null>(null);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const partialAcceptMut = useMutation({
    mutationFn: async (acceptedItems: string[]) => {
      const res = await fetchWithAuth(`/api/sgtx/quote/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, accepted_items: acceptedItems }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Accept failed (${res.status})`);
      return json;
    },
    onSuccess: (_data, items) => {
      toast.success("Partial acceptance recorded", {
        description: `${items.length} line item${items.length === 1 ? "" : "s"} accepted for ${ustn}.`,
      });
      qc.invalidateQueries({ queryKey: ["cmd-quotations", ustn] });
      qc.invalidateQueries({ queryKey: ["trade-messages", tradeId] });
    },
    onError: (e: any) => toast.error(e?.message || "Partial acceptance failed"),
  });

  const counterMut = useMutation({
    mutationFn: async (payload: { price: number; terms: string; reason: string }) => {
      const res = await fetchWithAuth(`/api/sgtx/quote/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          quotationId: currentOffer ? qId(currentOffer) : undefined,
          price: payload.price,
          terms: payload.terms,
          reason: payload.reason,
          counterPartyGtid: payload?.tenantGtid,
          buyerGtid: payload?.tenantGtid,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Counter-offer failed (${res.status})`);
      return json;
    },
    onSuccess: (data, vars) => {
      // Visual diff (§3.6): capture the original + proposed snapshot.
      const originalSnap: Record<string, any> = currentOffer
        ? {
            amount: qAmount(currentOffer),
            currency: qCurrency(currentOffer),
            terms: qTerms(currentOffer) || "",
            deadline: qDeadline(currentOffer) || "",
            serviceType: qServiceType(currentOffer),
          }
        : {};
      const proposedSnap: Record<string, any> = {
        amount: vars.price,
        currency: qCurrency(currentOffer) || "USD",
        terms: vars.terms,
        deadline: qDeadline(currentOffer) || "",
        serviceType: qServiceType(currentOffer),
      };
      setAmendmentDiff({
        original: originalSnap,
        proposed: proposedSnap,
        timestamp: new Date().toISOString(),
      });
      toast.success("Counter-offer sent", {
        description: "Seller has been notified. Awaiting response.",
      });
      qc.invalidateQueries({ queryKey: ["cmd-quotations", ustn] });
    },
    onError: (e: any) => toast.error(e?.message || "Counter-offer failed"),
  });

  const extensionMut = useMutation({
    mutationFn: async (payload: { duration: string; reason?: string }) => {
      const res = await fetchWithAuth(`/api/sgtx/quote/extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          quotationId: currentOffer ? qId(currentOffer) : undefined,
          duration: payload.duration,
          reason: payload.reason,
          requesterGtid: payload?.tenantGtid,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Extension request failed (${res.status})`);
      return json;
    },
    onSuccess: (_data, vars) => {
      toast.success("Extension requested", {
        description: `Requested +${vars.duration}. Awaiting seller's confirmation.`,
      });
      qc.invalidateQueries({ queryKey: ["cmd-quotations", ustn] });
    },
    onError: (e: any) => toast.error(e?.message || "Extension request failed"),
  });

  const confirmMut = useMutation({
    mutationFn: async (snapshot: any) => {
      const res = await fetchWithAuth(`/api/sgtx/quote/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          quotationId: currentOffer ? qId(currentOffer) : undefined,
          snapshot,
          confirmerGtid: payload?.tenantGtid,
          confirmerRole: "BUYER",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Confirm failed (${res.status})`);
      return json;
    },
    onSuccess: (data, snapshot) => {
      const timestamp = new Date().toISOString();
      setConfirmRecord({
        timestamp,
        snapshot,
        confirmationId: data?.confirmationId || data?.confirmation_id,
      });
      toast.success("Mutual confirmation recorded", {
        description: `Both parties confirmed the agreement at ${fmtDateTime(timestamp)}.`,
      });
      qc.invalidateQueries({ queryKey: ["cmd-quotations", ustn] });
    },
    onError: (e: any) => toast.error(e?.message || "Confirmation failed"),
  });

  // ─── Loading / empty / error states ───────────────────────────────────────
  if (quotationsQ.isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading negotiation panel…
        </div>
      </Card>
    );
  }

  if (quotationsQ.isError) {
    return (
      <Card className="p-4 border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/10">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Negotiation panel unavailable
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Could not load quotations for USTN <code className="font-mono">{ustn}</code>. Try refreshing.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <section aria-labelledby="neg-panel-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="neg-panel-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Buyer Negotiation Panel · v18 §16.9.3
        </h2>
        <span className="text-[0.65rem] text-muted-foreground/70">
          {sortedQuotes.length} quote{sortedQuotes.length === 1 ? "" : "s"} · alphabetical
        </span>
      </div>

      {/* ─── A. Quote Comparison Table (§3.1) ──────────────────────────────── */}
      <QuoteComparisonTable quotations={sortedQuotes} ustn={ustn} />

      {/* ─── B. Negotiation Panel — 3 columns (§3.2) ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Offer History */}
        <Card className="p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            <History className="w-3.5 h-3.5" /> Offer History
          </div>
          <OfferHistoryList
            quotations={sortedQuotes}
            mediation={mediationQ.data?.messages || []}
            isLoading={mediationQ.isLoading}
          />
        </Card>

        {/* Center: Current Offer */}
        <Card className="p-4 flex flex-col border-primary/30">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            <Scale className="w-3.5 h-3.5" /> Current Offer
          </div>
          <CurrentOfferPanel
            offer={currentOffer}
            ustn={ustn}
            currency={trade?.currency || "USD"}
            onPartialAccept={(items) => partialAcceptMut.mutate(items)}
            onCounter={(payload) => counterMut.mutate(payload)}
            onExtension={(payload) => extensionMut.mutate(payload)}
            onConfirm={(snapshot) => confirmMut.mutate(snapshot)}
            isPartialPending={partialAcceptMut.isPending}
            isCounterPending={counterMut.isPending}
            isExtensionPending={extensionMut.isPending}
            isConfirmPending={confirmMut.isPending}
            confirmRecord={confirmRecord}
          />
        </Card>

        {/* Right: Trade Room */}
        <Card className="p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            <MessageSquare className="w-3.5 h-3.5" /> Trade Room
          </div>
          <TradeRoomChat ustn={ustn} mediation={mediationQ.data?.messages || []} />
        </Card>
      </div>

      {/* ─── F. Visual Diff for Amendments (§3.6) ──────────────────────────── */}
      {amendmentDiff && (
        <Card className="p-4 border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              <Split className="w-3.5 h-3.5" /> Amendment Diff · {fmtDateTime(amendmentDiff.timestamp)}
            </div>
            <button
              onClick={() => setAmendmentDiff(null)}
              aria-label="Dismiss diff"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <VisualDiff original={amendmentDiff.original} proposed={amendmentDiff.proposed} />
        </Card>
      )}

      {/* ─── G. Mutual Confirmation Receipt (§3.7) ─────────────────────────── */}
      {confirmRecord && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Mutual Confirmation Recorded
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {confirmRecord.confirmationId ? `Confirmation ID: ${confirmRecord.confirmationId}. ` : ""}
                Recorded at {fmtDateTime(confirmRecord.timestamp)}.
              </p>
              <pre className="mt-2 text-[0.65rem] font-mono bg-emerald-950/10 dark:bg-emerald-950/30 p-2 rounded max-h-32 overflow-y-auto">
                {JSON.stringify(confirmRecord.snapshot, null, 2)}
              </pre>
            </div>
            <button
              onClick={() => setConfirmRecord(null)}
              aria-label="Dismiss confirmation"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Quote Comparison Table (§3.1)
// ═══════════════════════════════════════════════════════════════════════════════

function QuoteComparisonTable({
  quotations, ustn,
}: {
  quotations: Quotation[];
  ustn: string;
}) {
  if (quotations.length === 0) {
    return (
      <Card className="p-4 border-dashed">
        <div className="flex items-start gap-2.5">
          <Scale className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Quote Comparison (v18 §3.1)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No provider quotations on file for USTN{" "}
              <code className="font-mono">{ustn}</code>. Quotes appear here as
              providers submit them.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-0">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-medium">Quote Comparison (v18 §3.1)</p>
        <p className="text-[0.65rem] text-muted-foreground mt-0.5">
          Side-by-side comparison of provider quotations. NON-MARKETPLACE: alphabetical
          by provider GTID — no ranking or scoring.
        </p>
      </div>
      <div className="max-h-96 overflow-y-auto custom-scroll">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Provider</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Service</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider text-right">Amount</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Currency</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Terms</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Deadline</TableHead>
              <TableHead className="text-[0.65rem] uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((q, i) => {
              const status = qStatus(q);
              return (
                <TableRow key={qId(q) || `q-${i}`}>
                  <TableCell className="text-xs">
                    <div className="font-medium">{qProvider(q)}</div>
                    <div className="text-[0.6rem] text-muted-foreground font-mono truncate max-w-[14ch]">
                      {qProviderGtid(q) || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{qServiceType(q)}</TableCell>
                  <TableCell className="text-xs text-right font-medium">
                    {fmtMoney(qAmount(q), qCurrency(q))}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{qCurrency(q) || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[24ch] truncate" title={qTerms(q) || ""}>
                    {qTerms(q) || "—"}
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(qDeadline(q))}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[0.55rem]",
                        status === "ACCEPTED" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                        status === "PENDING" && "border-amber-500/40 text-amber-700 dark:text-amber-300",
                        status === "REJECTED" && "border-red-500/40 text-red-700 dark:text-red-300",
                      )}
                    >
                      {status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// B-left. Offer History List (§3.2)
// ═══════════════════════════════════════════════════════════════════════════════

function OfferHistoryList({
  quotations, mediation, isLoading,
}: {
  quotations: Quotation[];
  mediation: MediationMessage[];
  isLoading: boolean;
}) {
  // Build a merged timeline: mediation messages + quotation status changes.
  type Event = {
    id: string;
    when: number;
    kind: "quote" | "message";
    label: string;
    detail?: string;
    amount?: number;
    currency?: string;
    actor?: string;
    badge?: string;
  };
  const events: Event[] = useMemo(() => {
    const evs: Event[] = [];
    for (const q of quotations) {
      const when = qCreatedAt(q) ? new Date(qCreatedAt(q)!).getTime() : 0;
      evs.push({
        id: qId(q),
        when,
        kind: "quote",
        label: `Quote from ${qProvider(q)}`,
        detail: qServiceType(q),
        amount: qAmount(q),
        currency: qCurrency(q),
        badge: qStatus(q),
      });
    }
    for (const m of mediation) {
      const when = m.createdAt ? new Date(m.createdAt).getTime() : 0;
      evs.push({
        id: m.id,
        when,
        kind: "message",
        label: m.senderName || m.senderRole || "Message",
        detail: m.messageText || m.message || "",
        amount: m.offerAmountUsd,
        badge: m.messageType || "MESSAGE",
      });
    }
    evs.sort((a, b) => b.when - a.when);
    return evs;
  }, [quotations, mediation]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading history…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No offers or counter-offers yet. The history will populate as the
        negotiation progresses.
      </p>
    );
  }

  return (
    <ol className="space-y-2 max-h-80 overflow-y-auto custom-scroll text-xs">
      {events.map((e) => (
        <li key={`${e.kind}-${e.id}`} className="flex items-start gap-2 p-2 rounded border border-border bg-card/40">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
              e.kind === "quote" ? "bg-primary" : "bg-emerald-500",
            )}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <p className="font-medium truncate">{e.label}</p>
              {e.badge && (
                <Badge variant="outline" className="text-[0.5rem] flex-shrink-0">{e.badge}</Badge>
              )}
            </div>
            {e.detail && (
              <p className="text-[0.65rem] text-muted-foreground truncate mt-0.5">{e.detail}</p>
            )}
            <div className="flex items-center justify-between mt-0.5">
              {e.amount !== undefined && (
                <span className="text-[0.65rem] font-medium">
                  {fmtMoney(e.amount, e.currency)}
                </span>
              )}
              <span className="text-[0.6rem] text-muted-foreground">
                {e.when > 0 ? fmtDateTime(new Date(e.when).toISOString()) : "—"}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// B-center. Current Offer Panel (§3.2) — with C/D/E/G action buttons
// ═══════════════════════════════════════════════════════════════════════════════

function CurrentOfferPanel({
  offer, ustn, currency,
  onPartialAccept, onCounter, onExtension, onConfirm,
  isPartialPending, isCounterPending, isExtensionPending, isConfirmPending,
  confirmRecord,
}: {
  offer: Quotation | undefined;
  ustn: string;
  currency: string;
  onPartialAccept: (items: string[]) => void;
  onCounter: (payload: { price: number; terms: string; reason: string }) => void;
  onExtension: (payload: { duration: string; reason?: string }) => void;
  onConfirm: (snapshot: any) => void;
  isPartialPending: boolean;
  isCounterPending: boolean;
  isExtensionPending: boolean;
  isConfirmPending: boolean;
  confirmRecord: { timestamp: string; snapshot: any; confirmationId?: string } | null;
}) {
  const [partialOpen, setPartialOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [extensionOpen, setExtensionOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!offer) {
    return (
      <p className="text-xs text-muted-foreground italic flex-1">
        No active offer yet. Once a seller submits a quote, it will appear here
        with accept / counter / decline actions.
      </p>
    );
  }

  const lineItems = buildLineItems(offer);
  const snapshot = buildSnapshot(offer, currency);

  return (
    <div className="flex-1 flex flex-col gap-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{qProvider(offer)}</p>
          <Badge variant="outline" className="text-[0.55rem]">{qStatus(offer)}</Badge>
        </div>
        <p className="text-[0.65rem] text-muted-foreground font-mono truncate">
          {qId(offer)}
        </p>
        <p className="text-xs text-muted-foreground">
          {qServiceType(offer)}
          {qTerms(offer) && <> · {qTerms(offer)}</>}
        </p>
        <p className="text-lg font-bold mt-1">
          {fmtMoney(qAmount(offer), qCurrency(offer) || currency)}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          Deadline: {fmtDate(qDeadline(offer))}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        {/* C. Partial Acceptance (§3.3) */}
        <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Split className="w-3 h-3 mr-1" /> Partial Accept
            </Button>
          </DialogTrigger>
          <PartialAcceptDialog
            lineItems={lineItems}
            currency={qCurrency(offer) || currency}
            isPending={isPartialPending}
            onConfirm={(items) => {
              onPartialAccept(items);
              setPartialOpen(false);
            }}
          />
        </Dialog>

        {/* D. Counter-Offer (§3.4) */}
        <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <ArrowRight className="w-3 h-3 mr-1" /> Send Counter
            </Button>
          </DialogTrigger>
          <CounterOfferDialog
            offer={offer}
            currency={qCurrency(offer) || currency}
            isPending={isCounterPending}
            onConfirm={(payload) => {
              onCounter(payload);
              setCounterOpen(false);
            }}
          />
        </Dialog>

        {/* E. Deadline Extension (§3.5) */}
        <Dialog open={extensionOpen} onOpenChange={setExtensionOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Calendar className="w-3 h-3 mr-1" /> Request Extension
            </Button>
          </DialogTrigger>
          <ExtensionDialog
            isPending={isExtensionPending}
            onConfirm={(payload) => {
              onExtension(payload);
              setExtensionOpen(false);
            }}
          />
        </Dialog>

        {/* G. Mutual Confirmation (§3.7) */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogTrigger asChild>
            <Button variant="default" size="sm" className="h-8 text-xs">
              <FileSignature className="w-3 h-3 mr-1" /> Confirm Agreement
            </Button>
          </DialogTrigger>
          <ConfirmDialog
            offer={offer}
            snapshot={snapshot}
            isPending={isConfirmPending}
            alreadyConfirmed={!!confirmRecord}
            onConfirm={() => {
              onConfirm(snapshot);
              setConfirmOpen(false);
            }}
          />
        </Dialog>
      </div>

      {confirmRecord && (
        <div className="p-2 rounded border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-[0.65rem] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" /> Mutual confirmation recorded at{" "}
          {fmtDateTime(confirmRecord.timestamp)}
        </div>
      )}
    </div>
  );
}

// Synthesise line items from the quotation — prefer fee.breakdown, fall back to
// top-level fields. Used by Partial Acceptance dialog.
function buildLineItems(q: Quotation): { id: string; label: string; amount: number; currency?: string }[] {
  const fee = qFee(q);
  if (Array.isArray(fee.breakdown) && fee.breakdown.length > 0) {
    return fee.breakdown.map((b, i) => ({
      id: `item-${i}`,
      label: b.label || `Line ${i + 1}`,
      amount: Number(b.amount) || 0,
      currency: b.currency || fee.currency,
    }));
  }
  // Fallback: synthesise a single line item from the top-level amount.
  return [
    {
      id: "total",
      label: qServiceType(q) || "Total quote",
      amount: Number(fee.amount) || 0,
      currency: fee.currency,
    },
  ];
}

// Build the pre-contract snapshot for the Mutual Confirmation (§3.7).
function buildSnapshot(q: Quotation, defaultCurrency: string): Record<string, any> {
  return {
    quotationId: qId(q),
    providerGtid: qProviderGtid(q),
    providerName: qProvider(q),
    serviceType: qServiceType(q),
    amount: qAmount(q),
    currency: qCurrency(q) || defaultCurrency,
    terms: qTerms(q) || "",
    deadline: qDeadline(q) || "",
    status: qStatus(q),
    capturedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// C. Partial Acceptance Dialog (§3.3)
// ═══════════════════════════════════════════════════════════════════════════════

function PartialAcceptDialog({
  lineItems, currency, isPending, onConfirm,
}: {
  lineItems: { id: string; label: string; amount: number; currency?: string }[];
  currency: string;
  isPending: boolean;
  onConfirm: (items: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalAccepted = lineItems
    .filter((li) => selected.has(li.id))
    .reduce((s, li) => s + (Number(li.amount) || 0), 0);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          <Split className="w-4 h-4" /> Partial Acceptance
        </DialogTitle>
        <DialogDescription>
          Select which line items to accept from this quote. The seller will be
          notified of the partial acceptance and can re-quote the remaining items.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 max-h-72 overflow-y-auto custom-scroll">
        {lineItems.map((li) => {
          const checked = selected.has(li.id);
          return (
            <label
              key={li.id}
              className={cn(
                "flex items-start gap-2.5 p-2.5 rounded border cursor-pointer transition",
                checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(li.id)}
                className="mt-0.5"
                aria-label={`Accept ${li.label}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{li.label}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtMoney(li.amount, li.currency || currency)}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs pt-2 border-t border-border">
        <span className="text-muted-foreground">
          {selected.size} of {lineItems.length} item{lineItems.length === 1 ? "" : "s"} selected
        </span>
        <span className="font-medium">
          Partial total: {fmtMoney(totalAccepted, currency)}
        </span>
      </div>

      <DialogFooter>
        <Button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0 || isPending}
          className="min-h-[36px]"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          {isPending ? "Recording…" : `Accept ${selected.size} item${selected.size === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// D. Counter-Offer Dialog (§3.4) — with mandatory reason ≥20 chars
// ═══════════════════════════════════════════════════════════════════════════════

function CounterOfferDialog({
  offer, currency, isPending, onConfirm,
}: {
  offer: Quotation;
  currency: string;
  isPending: boolean;
  onConfirm: (payload: { price: number; terms: string; reason: string }) => void;
}) {
  const originalAmount = qAmount(offer) || 0;
  const [price, setPrice] = useState<string>(String(originalAmount || ""));
  const [terms, setTerms] = useState<string>(qTerms(offer) || "");
  const [reason, setReason] = useState<string>("");

  const reasonValid = reason.trim().length >= 20;
  const priceNum = parseFloat(price);
  const priceValid = !isNaN(priceNum) && priceNum > 0;
  const canSubmit = reasonValid && priceValid && !isPending;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          <ArrowRight className="w-4 h-4" /> Send Counter-Offer
        </DialogTitle>
        <DialogDescription>
          Propose a new price and/or modified terms. A reason is mandatory (≥ 20
          characters) — it is sent to the seller along with the counter-offer.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Original price</Label>
          <p className="text-sm font-medium mt-1">{fmtMoney(originalAmount, currency)}</p>
        </div>
        <div>
          <Label htmlFor="counter-price" className="text-xs">New price *</Label>
          <Input
            id="counter-price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={String(originalAmount || "0")}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="counter-terms" className="text-xs">Modified terms</Label>
          <Input
            id="counter-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="e.g. FOB Alexandria, 30% advance / 70% on B/L"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="counter-reason" className="text-xs">
            Reason * <span className="text-muted-foreground">(≥ 20 chars)</span>
          </Label>
          <Textarea
            id="counter-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are counter-offering (market price, quality, lead time, etc.)"
            rows={3}
            className="mt-1 text-sm"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[0.65rem] text-muted-foreground">
              {reason.trim().length < 20
                ? `${20 - reason.trim().length} more characters required`
                : "Reason meets minimum length"}
            </span>
            <span className={cn(
              "text-[0.65rem] font-mono",
              reasonValid ? "text-emerald-600" : "text-muted-foreground",
            )}>
              {reason.trim().length} / 20 min
            </span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={() => onConfirm({ price: priceNum, terms, reason: reason.trim() })}
          disabled={!canSubmit}
          className="min-h-[36px]"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Send Counter-Offer
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// E. Deadline Extension Dialog (§3.5)
// ═══════════════════════════════════════════════════════════════════════════════

function ExtensionDialog({
  isPending, onConfirm,
}: {
  isPending: boolean;
  onConfirm: (payload: { duration: string; reason?: string }) => void;
}) {
  const [duration, setDuration] = useState<string>("24h");
  const [reason, setReason] = useState<string>("");

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" /> Request Deadline Extension
        </DialogTitle>
        <DialogDescription>
          Ask the seller to extend the quote deadline. The seller can accept or
          decline the extension.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">Extension duration *</Label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">+ 24 hours</SelectItem>
              <SelectItem value="48h">+ 48 hours</SelectItem>
              <SelectItem value="7d">+ 7 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="ext-reason" className="text-xs">
            Reason <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="ext-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Awaiting LC issuance from the bank"
            rows={2}
            className="mt-1 text-sm"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={() => onConfirm({ duration, reason: reason.trim() || undefined })}
          disabled={isPending}
          className="min-h-[36px]"
        >
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Request +{duration}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// G. Mutual Confirmation Dialog (§3.7)
// ═══════════════════════════════════════════════════════════════════════════════

function ConfirmDialog({
  offer, snapshot, isPending, alreadyConfirmed, onConfirm,
}: {
  offer: Quotation;
  snapshot: Record<string, any>;
  isPending: boolean;
  alreadyConfirmed: boolean;
  onConfirm: () => void;
}) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-1.5">
          <FileSignature className="w-4 h-4" /> Confirm Agreement
        </DialogTitle>
        <DialogDescription>
          Both parties must click <strong>Confirm Agreement</strong> to record
          mutual confirmation. A pre-contract snapshot is captured below and
          will be sent to the seller for their confirmation.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Pre-contract snapshot
        </p>
        <div className="rounded border border-border bg-card/40 p-3 text-xs space-y-1.5 max-h-56 overflow-y-auto custom-scroll">
          <SnapshotRow label="Quotation ID" value={snapshot.quotationId} mono />
          <SnapshotRow label="Provider" value={snapshot.providerName} />
          <SnapshotRow label="Provider GTID" value={snapshot.providerGtid} mono />
          <SnapshotRow label="Service" value={snapshot.serviceType} />
          <SnapshotRow
            label="Amount"
            value={fmtMoney(snapshot.amount, snapshot.currency)}
          />
          <SnapshotRow label="Currency" value={snapshot.currency} mono />
          <SnapshotRow label="Terms" value={snapshot.terms || "—"} />
          <SnapshotRow label="Deadline" value={fmtDate(snapshot.deadline)} />
          <SnapshotRow label="Status" value={snapshot.status} />
          <SnapshotRow label="Captured at" value={fmtDateTime(snapshot.capturedAt)} />
        </div>
      </div>

      {alreadyConfirmed && (
        <div className="p-2 rounded border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 text-[0.65rem] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" /> You have already confirmed. Both
          parties must confirm for the agreement to be recorded.
        </div>
      )}

      <DialogFooter>
        <Button onClick={onConfirm} disabled={isPending} className="min-h-[36px]">
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          <FileSignature className="w-3.5 h-3.5 mr-1.5" />
          Confirm Agreement
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SnapshotRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className={cn("text-right break-all", mono && "font-mono")}>{value || "—"}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// B-right. Trade Room Chat (§3.2) — /api/sgtx/ai/trade-room
// ═══════════════════════════════════════════════════════════════════════════════

interface TradeRoomMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

function TradeRoomChat({ ustn, mediation }: { ustn: string; mediation: MediationMessage[] }) {
  const [messages, setMessages] = useState<TradeRoomMessage[]>([]);
  const [input, setInput] = useState("");

  const askMut = useMutation({
    mutationFn: async (question: string) => {
      const res = await fetchWithAuth(`/api/sgtx/ai/trade-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, question }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Trade Room AI failed (${res.status})`);
      return json as TradeRoomReply;
    },
    onSuccess: (data, question) => {
      const reply = data.reply || data.message || data.text || "No reply from assistant.";
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    onError: (e: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "system",
          content: `⚠ ${e?.message || "Trade Room AI unavailable. Try again later."}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
  });

  function send() {
    const q = input.trim();
    if (!q) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: q,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");
    askMut.mutate(q);
  }

  // Seed the conversation with the latest mediation messages so the buyer sees
  // context from the persisted dispute thread.
  const seededMediation = mediation.slice(-3).map((m) => ({
    id: `m-${m.id}`,
    role: m.senderRole === "BUYER" ? "user" : ("assistant" as const),
    content: m.messageText || m.message || "",
    createdAt: m.createdAt,
  }));

  const allMessages = [...seededMediation, ...messages];

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-[280px]">
      <div className="flex-1 space-y-1.5 max-h-72 overflow-y-auto custom-scroll text-xs pr-1">
        {allMessages.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Ask the SGTX AI assistant anything about this trade — pricing, terms,
            compliance, logistics, or negotiation strategy.
          </p>
        )}
        {allMessages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "p-2 rounded-md border max-w-[90%]",
              m.role === "user" && "ml-auto bg-primary/10 border-primary/30 text-right",
              m.role === "assistant" && "mr-auto bg-muted/40 border-border",
              m.role === "system" && "mr-auto bg-amber-50/40 dark:bg-amber-950/10 border-amber-500/30 text-amber-700 dark:text-amber-300",
            )}
          >
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            <p className="text-[0.55rem] text-muted-foreground mt-1">
              {fmtDateTime(m.createdAt)}
            </p>
          </div>
        ))}
        {askMut.isPending && (
          <div className="mr-auto p-2 rounded-md border border-border bg-muted/40 text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Assistant is typing…
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-2 border-t border-border">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask the trade room…"
          className="h-8 text-xs"
          aria-label="Trade room input"
        />
        <Button
          size="sm"
          onClick={send}
          disabled={askMut.isPending || !input.trim()}
          className="h-8 px-2"
          aria-label="Send message"
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// F. Visual Diff (§3.6)
// ═══════════════════════════════════════════════════════════════════════════════

function VisualDiff({
  original, proposed,
}: {
  original: Record<string, any>;
  proposed: Record<string, any>;
}) {
  const rows = buildDiff(original, proposed);
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">No fields to compare.</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-[0.65rem] uppercase tracking-wider w-[28%]">Field</TableHead>
          <TableHead className="text-[0.65rem] uppercase tracking-wider w-[36%]">Original</TableHead>
          <TableHead className="text-[0.65rem] uppercase tracking-wider w-[36%]">Proposed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.field}>
            <TableCell className="text-xs font-mono align-top">{r.field}</TableCell>
            <TableCell
              className={cn(
                "text-xs align-top font-mono break-all",
                r.op === "removed" && "bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300 line-through",
                r.op === "changed" && "bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
                r.op === "added" && "text-muted-foreground/40",
              )}
            >
              {r.left === undefined || r.left === null || r.left === "" ? "—" : String(r.left)}
            </TableCell>
            <TableCell
              className={cn(
                "text-xs align-top font-mono break-all",
                r.op === "added" && "bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300",
                r.op === "changed" && "bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
                r.op === "removed" && "text-muted-foreground/40",
              )}
            >
              {r.right === undefined || r.right === null || r.right === "" ? "—" : String(r.right)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
