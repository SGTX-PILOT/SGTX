// @ts-nocheck
"use client";
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v13.1 — 1-Click Close USTN (Recommendation #7)
// ═══════════════════════════════════════════════════════════════════════════════
// A prominent, self-contained component that lets the operator close a USTN
// with a single click. Renders:
//
//   • The current trade's USTN
//   • The 7-condition closure checklist (each condition with ✓ or ✗)
//   • A gold-gradient pulse-glow "Close USTN" button (only enabled when all
//     7 conditions are met — i.e. readyForClosure === true)
//   • A "Cannot close — N blockers" panel listing the failing conditions
//   • After successful closure: a green "USTN CLOSED" banner + a "Download
//     Evidence Package" link to /api/sgtx/evidence-package/[ustn]
//
// Uses useQuery for the closure-readiness check (GET /api/sgtx/ustn-close/[ustn])
// and useMutation for the close action (POST /api/sgtx/ustn-close). All API
// calls are wrapped in try/catch with safe defaults.
//
// Designed to be dropped at the top of the Buyer portal's "Active Trades"
// screen and the Government portal's "Trade Flow" screen.
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Loader2, Lock, Unlock, Download,
  ShieldCheck, AlertTriangle, FileArchive, RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ClosureChecklistItem {
  id: string;
  label: string;
  met: boolean;
  notes: string | null;
}

interface ClosureStatus {
  ustn: string;
  closed: boolean;
  closureState: string; // OPEN | READY_FOR_CLOSURE | USTN_CLOSED | USTN_CLOSED_WITH_OPEN_DISPUTE
  closedAt: string | null;
  closedBy: string | null;
  readyForClosure: boolean;
  allConditionsMet: boolean;
  checklist: ClosureChecklistItem[];
}

interface OneClickCloseUstnProps {
  ustn: string;
  tenantGtid: string;
  /** Compact mode: hides the checklist + only shows button + status (for sidebar). */
  compact?: boolean;
}

async function fetchClosureStatus(ustn: string): Promise<ClosureStatus> {
  const r = await fetch(`/api/sgtx/ustn-close/${encodeURIComponent(ustn)}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`status ${r.status}: ${text.slice(0, 200)}`);
  }
  const j = await r.json();
  // Defensive defaults — the API returns these fields, but be safe.
  return {
    ustn: j.ustn || ustn,
    closed: !!j.closed,
    closureState: j.closureState || "OPEN",
    closedAt: j.closedAt || null,
    closedBy: j.closedBy || null,
    readyForClosure: !!j.readyForClosure,
    allConditionsMet: !!j.allConditionsMet,
    checklist: Array.isArray(j.checklist) ? j.checklist : [],
  };
}

export function OneClickCloseUstn({
  ustn,
  tenantGtid,
  compact = false,
}: OneClickCloseUstnProps) {
  const queryClient = useQueryClient();

  // Closure-readiness check — refetch every 30s so the operator sees the
  // checklist update as downstream milestones complete.
  const { data: status, isLoading, isError, refetch } = useQuery({
    queryKey: ["ustn-close-status", ustn],
    queryFn: () => fetchClosureStatus(ustn),
    enabled: !!ustn,
    staleTime: 30_000,
    retry: false,
  });

  // Close-action mutation — POSTs {ustn, closedBy} to /api/sgtx/ustn-close.
  // On success, invalidates the readiness cache so the UI flips to "CLOSED".
  const closeMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/sgtx/ustn-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, closedBy: tenantGtid }),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(j?.error || `close failed (status ${r.status})`);
      }
      return j;
    },
    onSuccess: (data: any) => {
      const closed = !!data?.closed;
      if (closed) {
        toast.success("USTN CLOSED", {
          description: `Closure state: ${data.closureState}. Closed at: ${data.closedAt || new Date().toISOString()}.`,
        });
      } else {
        const blockers = Array.isArray(data?.blockers) ? data.blockers : [];
        toast.error(`Cannot close — ${blockers.length} blocker(s)`, {
          description: blockers.join(", "),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ustn-close-status", ustn] });
    },
    onError: (err: any) => {
      toast.error("Close USTN failed", { description: err?.message || "internal error" });
    },
  });

  const checklist: ClosureChecklistItem[] = useMemo(() => {
    return status?.checklist || [];
  }, [status]);

  const metCount = checklist.filter((c) => c.met).length;
  const total = checklist.length;
  const blockers = checklist.filter((c) => !c.met);

  const isClosed = !!status?.closed;
  const readyToClose = !!status?.readyForClosure && !isClosed;
  const isPending = closeMut.isPending;

  // Compact mode: button-only (used in sidebars / trade detail headers).
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {isClosed ? (
          <Badge className="bg-success/15 text-success border-success/30">
            <CheckCircle2 className="w-3 h-3 mr-1" /> USTN CLOSED
          </Badge>
        ) : readyToClose ? (
          <Button
            size="sm"
            onClick={() => closeMut.mutate()}
            disabled={isPending}
            className="bg-gold-gradient text-sovereign sgtx-pulse-glow"
          >
            {isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Lock className="w-3 h-3 mr-1" />}
            Close USTN
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="w-3 h-3 mr-1" /> {metCount}/{total} closure conditions met
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 sm:p-5 border-2 border-gold/30 bg-gradient-to-br from-gold/5 via-transparent to-transparent">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-shrink-0 mt-0.5">
          {isClosed ? (
            <ShieldCheck className="w-5 h-5 text-success" />
          ) : readyToClose ? (
            <Unlock className="w-5 h-5 text-gold" />
          ) : (
            <Lock className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">1-Click Close USTN</h3>
            {isClosed && (
              <Badge className="bg-success/15 text-success border-success/30">
                <CheckCircle2 className="w-3 h-3 mr-1" /> USTN CLOSED
              </Badge>
            )}
            {!isClosed && readyToClose && (
              <Badge className="bg-gold/15 text-gold border-gold/30">
                <Unlock className="w-3 h-3 mr-1" /> READY TO CLOSE
              </Badge>
            )}
            {!isClosed && !readyToClose && (
              <Badge variant="outline" className="text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" /> {metCount}/{total} conditions met
              </Badge>
            )}
          </div>
          <p className="text-[0.65rem] text-muted-foreground mt-1 font-mono truncate">
            USTN: {ustn}
            {status?.closureState ? ` · State: ${status.closureState}` : ""}
            {status?.closedAt ? ` · Closed: ${new Date(status.closedAt).toLocaleString()}` : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Refresh closure status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-gold mr-2" />
          Loading closure readiness…
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/5 border border-destructive/20 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Could not load closure status.</p>
            <p className="text-[0.65rem] mt-0.5">
              The /api/sgtx/ustn-close/[ustn] endpoint returned an error. The
              USTN may be malformed or the TradeClosureState table may be
              unavailable. Try refreshing.
            </p>
          </div>
        </div>
      )}

      {/* Closed state — show success banner + evidence download */}
      {isClosed && !isLoading && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-md bg-success/10 border border-success/30">
            <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-success">USTN CLOSED</p>
              <p className="text-[0.7rem] text-foreground/80 mt-0.5">
                The USTN close ceremony has been completed. Closure state:{" "}
                <span className="font-mono">{status?.closureState}</span>. Closed at:{" "}
                <span className="font-mono">{status?.closedAt ? new Date(status.closedAt).toLocaleString() : "—"}</span>
                {" by "}
                <span className="font-mono">{status?.closedBy || tenantGtid}</span>.
              </p>
            </div>
          </div>
          {/* Recommendation #9 — Evidence Package download link */}
          <a
            href={`/api/sgtx/evidence-package/${encodeURIComponent(ustn)}`}
            download={`evidence-${ustn.slice(0, 24)}.json`}
            className="inline-flex items-center gap-2 rounded-md border-2 border-gold/40 bg-background/60 px-3 py-2 text-xs font-bold text-gold hover:bg-gold/10 hover:border-gold/60 transition-all min-h-[40px] sgtx-hover-lift"
          >
            <Download className="w-3.5 h-3.5" />
            Download Evidence Package (JSON)
            <FileArchive className="w-3 h-3 opacity-60" />
          </a>
        </div>
      )}

      {/* Open state — show 7-condition checklist + close button */}
      {!isClosed && !isLoading && !isError && (
        <div className="space-y-3">
          {/* 7-condition checklist */}
          <div>
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">
              7-condition Closure Gate (Art 129)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {checklist.length === 0 ? (
                <p className="text-xs text-muted-foreground italic col-span-full">
                  No checklist data — the TradeClosureState table may be missing.
                </p>
              ) : (
                checklist.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-start gap-2 p-2 rounded-md text-xs border ${
                      c.met
                        ? "bg-success/5 border-success/20 text-success"
                        : "bg-destructive/5 border-destructive/20 text-destructive"
                    }`}
                  >
                    {c.met ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{c.label}</p>
                      {c.notes && (
                        <p className="text-[0.6rem] opacity-70 mt-0.5 line-clamp-2">{c.notes}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Blockers panel */}
          {blockers.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/30 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold text-amber-600 dark:text-amber-400">
                  Cannot close — {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-1 space-y-0.5 text-[0.7rem] text-foreground/80">
                  {blockers.map((b) => (
                    <li key={b.id} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">›</span>
                      <span>
                        <span className="font-mono">{b.id}</span>
                        {b.notes ? ` — ${b.notes}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Close action */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => closeMut.mutate()}
              disabled={isPending || !readyToClose}
              className={`min-h-[44px] ${
                readyToClose
                  ? "bg-gold-gradient text-sovereign sgtx-pulse-glow"
                  : "bg-muted text-muted-foreground"
              }`}
              aria-label="Close USTN"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Closing USTN…
                </>
              ) : readyToClose ? (
                <>
                  <Lock className="w-4 h-4 mr-1.5" />
                  1-Click Close USTN
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-1.5" />
                  Cannot close — {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
            <p className="text-[0.65rem] text-muted-foreground">
              {readyToClose
                ? "All 7 closure conditions met — click to seal the USTN."
                : `Resolve ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} to enable closure.`}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
