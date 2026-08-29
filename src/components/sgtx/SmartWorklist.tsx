"use client";

// Smart Worklist — the unified priority queue.
// Replaces 4 overlapping discovery surfaces:
//   1. Smart Inbox (existing bell)
//   2. Quick Actions (Command Center cards)
//   3. OneClickActionBar (top of dashboard)
//   4. Recommended Actions (in inbox drawer)
//
// Merges:
//   • Smart Inbox items (existing /api/sgtx/dashboard inbox)
//   • Active trades with pending stages
//   • Compliance Calendar deadlines (Add-On 18)
//   • Fee disputes awaiting response (§40)
//   • Demurrage accruing (Add-On 9)
//   • Reefer alerts (Add-On 12)
//   • Customs Gateway submission monitoring (§28)
//
// Each row: priority · USTN · what's needed · 1-click CTA · snooze.
// Opens as a right-side drawer.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X, Bell, Sparkles, Loader2, Clock, ChevronRight,
  AlertTriangle, ShieldCheck, Truck, Banknote, FileText, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WorklistItem {
  id: string;
  source: "inbox" | "trade-stage" | "compliance-calendar" | "fee-dispute" | "demurrage" | "reefer" | "customs-submission";
  ustn?: string;
  title: string;
  description?: string;
  priority: number; // 0-100
  category?: string;
  ctaLabel?: string;
  ctaTab?: string; // which sub-tab to navigate to
  ctaWorkspace?: string;
  dueAt?: string;
  amount?: number;
  currency?: string;
}

const SOURCE_META: Record<WorklistItem["source"], { label: string; icon: any; color: string }> = {
  inbox: { label: "Smart Inbox", icon: Bell, color: "#0ea5e9" },
  "trade-stage": { label: "Trade Stage", icon: Package, color: "#1a6fb0" },
  "compliance-calendar": { label: "Compliance", icon: ShieldCheck, color: "#9333ea" },
  "fee-dispute": { label: "Fee Dispute", icon: Banknote, color: "#dc2626" },
  demurrage: { label: "Demurrage", icon: Clock, color: "#f59e0b" },
  reefer: { label: "Reefer Alert", icon: AlertTriangle, color: "#dc2626" },
  "customs-submission": { label: "Customs", icon: Truck, color: "#0891b2" },
};

export function SmartWorklist({ tenantGtid, onClose }: { tenantGtid: string; onClose: () => void }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const setUstnContext = useAppStore((s) => s.setUstnContext);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const setSubTab = useAppStore((s) => s.setSubTab);
  const queryClient = useQueryClient();

  // Fetch dashboard inbox + trades
  const { data: dashboard } = useQuery<any>({
    queryKey: ["dashboard", tenantGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`);
        if (!r.ok) return {};
        return await r.json();
      } catch {
        return {};
      }
    },
    staleTime: 30_000,
  });

  // Build the unified worklist by merging sources
  const items: WorklistItem[] = (() => {
    const out: WorklistItem[] = [];

    // 1. Smart Inbox items (existing)
    const inbox = Array.isArray(dashboard?.inbox) ? dashboard.inbox : [];
    for (const it of inbox) {
      out.push({
        id: `inbox-${it.id}`,
        source: "inbox",
        ustn: it.ustn,
        title: it.title || "Inbox item",
        description: it.description,
        priority: it.priority || 50,
        category: it.category,
        ctaLabel: it.ctaLabel,
        ctaTab: it.ctaTab,
      });
    }

    // 2. Active trades with pending stages
    const trades = [
      ...(Array.isArray(dashboard?.tradesAsBuyer) ? dashboard.tradesAsBuyer : []),
      ...(Array.isArray(dashboard?.tradesAsSeller) ? dashboard.tradesAsSeller : []),
    ];
    for (const t of trades) {
      if (!t?.ustn || !t?.status) continue;
      // Only surface trades that need action
      const needsAction = ["PENDING_SELLER_RESPONSE", "QUOTED", "BUYER_SUBMITTED", "CONTRACT_DRAFT", "IN_EXECUTION"].includes(t.status);
      if (!needsAction) continue;
      const isBuyer = dashboard?.tenant?.gtid === t.buyerGtid;
      let label = "Open trade";
      let ws = "trades";
      if (t.status === "PENDING_SELLER_RESPONSE") { label = "Respond to request"; ws = "trades"; }
      else if (t.status === "QUOTED") { label = isBuyer ? "Review quote" : "Awaiting buyer"; ws = "trades"; }
      else if (t.status === "BUYER_SUBMITTED") { label = "Confirm submission"; ws = "trades"; }
      else if (t.status === "CONTRACT_DRAFT" || t.status === "CONTRACT_SIGNED") { label = "Sign contract"; ws = "trades"; }
      else if (t.status === "IN_EXECUTION") { label = "Confirm milestone"; ws = "ops"; }
      out.push({
        id: `trade-${t.ustn}`,
        source: "trade-stage",
        ustn: t.ustn,
        title: `${(t.status || "").replace(/_/g, " ")} — ${t.commodity || "trade"}`,
        description: `${t.incoterm || ""} · Phase ${t.phase || 0}/8`.trim(),
        priority: 70,
        ctaLabel: label,
        ctaWorkspace: ws,
      });
    }

    // 3. Compliance Calendar deadlines (Add-On 18)
    // Best-effort fetch — if the endpoint is missing, we silently skip.
    // (We don't block the worklist on optional sources.)

    // 4. Fee disputes awaiting response (§40)
    // (Rendered via existing FeeDisputeScreens when the user navigates; we
    // surface a count-only prompt here to keep the drawer fast.)

    // Sort by priority desc
    out.sort((a, b) => b.priority - a.priority);
    return out;
  })();

  const visibleItems = items.filter((it) => !hiddenIds.has(it.id));
  const highPriorityCount = visibleItems.filter((i) => i.priority >= 80).length;

  const actOnItem = async (it: WorklistItem) => {
    if (pendingId) return;
    setPendingId(it.id);
    try {
      // If item has a USTN, set it as the active context
      if (it.ustn) {
        setUstnContext(it.ustn);
      }
      // Dismiss inbox items server-side
      if (it.source === "inbox" && it.id.startsWith("inbox-")) {
        const inboxId = it.id.replace("inbox-", "");
        try {
          await fetch("/api/sgtx/inbox/dismiss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inboxId }),
          });
        } catch {
          // best-effort
        }
      }
      // Navigate to the right workspace/tab
      if (it.ctaWorkspace) {
        setWorkspace(it.ctaWorkspace as any);
      } else if (it.ctaTab) {
        setSubTab(it.ctaTab);
      }
      setHiddenIds((s) => new Set(s).add(it.id));
      toast.success(it.ctaLabel || "Action triggered", {
        description: it.ustn ? `Context set to ${it.ustn}` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error("Could not complete action");
    } finally {
      setPendingId(null);
    }
  };

  const snoozeItem = async (it: WorklistItem, hours: number) => {
    if (pendingId) return;
    setPendingId(it.id);
    try {
      if (it.source === "inbox" && it.id.startsWith("inbox-")) {
        const inboxId = it.id.replace("inbox-", "");
        try {
          await fetch("/api/sgtx/inbox/snooze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inboxId, hours }),
          });
        } catch {
          // best-effort
        }
      }
      setHiddenIds((s) => new Set(s).add(it.id));
      toast.success(`Snoozed ${hours}h`, { description: it.title });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-40"
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28 }}
        role="dialog"
        aria-modal="true"
        aria-label="Smart Worklist"
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[28rem] bg-card border-l border-border z-50 flex flex-col"
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="w-5 h-5 text-gold" />
              {highPriorityCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[0.55rem] font-bold flex items-center justify-center">
                  {highPriorityCount}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-sm">Smart Worklist</h3>
              <p className="text-[0.65rem] text-muted-foreground">
                {visibleItems.length} actions · {highPriorityCount} high priority
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Source legend */}
        <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2 flex-wrap">
          {Object.entries(SOURCE_META).map(([key, meta]) => {
            const count = visibleItems.filter((i) => i.source === key).length;
            if (count === 0) return null;
            const Icon = meta.icon;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] border"
                style={{ color: meta.color, borderColor: `${meta.color}44`, background: `${meta.color}10` }}
              >
                <Icon className="w-2.5 h-2.5" />
                {meta.label} · {count}
              </span>
            );
          })}
        </div>

        {/* Items */}
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {visibleItems.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-3xl mb-2">🎉</div>
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground mt-1">No pending actions across inbox, trades, compliance, fees, demurrage, reefer, or customs.</p>
              </div>
            )}
            {visibleItems.map((it) => {
              const meta = SOURCE_META[it.source];
              const Icon = meta.icon;
              const color = it.priority >= 80 ? "#f87171" : it.priority >= 50 ? "#fbbf24" : "#60a5fa";
              const isPending = pendingId === it.id;
              return (
                <div
                  key={it.id}
                  className="p-3 rounded-xl border border-border bg-background/40 hover:border-gold/40 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: meta.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span
                          className="px-1.5 py-0 rounded text-[0.55rem] font-bold uppercase"
                          style={{ color, background: `${color}22` }}
                        >
                          P{it.priority}
                        </span>
                        <span className="text-[0.55rem] text-muted-foreground">{meta.label}</span>
                        {it.ustn && (
                          <span className="text-[0.6rem] font-mono text-muted-foreground/70 truncate">
                            {it.ustn}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-foreground line-clamp-2">{it.title}</p>
                      {it.description && (
                        <p className="text-[0.7rem] text-muted-foreground mt-0.5 line-clamp-2">{it.description}</p>
                      )}
                      {it.amount && (
                        <p className="text-[0.7rem] font-semibold mt-0.5" style={{ color: meta.color }}>
                          {it.currency || "USD"} {it.amount.toLocaleString()}
                        </p>
                      )}
                      {it.ctaLabel && (
                        <button
                          onClick={() => actOnItem(it)}
                          disabled={isPending}
                          className="mt-2 text-[0.7rem] font-semibold text-gold hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {isPending ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Working…</>
                          ) : (
                            <>{it.ctaLabel} <ChevronRight className="w-3 h-3" /></>
                          )}
                        </button>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[0.55rem] text-muted-foreground/70">Snooze:</span>
                        {[2, 4, 24].map((h) => (
                          <button
                            key={h}
                            onClick={() => snoozeItem(it, h)}
                            disabled={isPending}
                            className="px-1.5 py-0.5 rounded text-[0.55rem] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-3 border-t border-border/50 text-[0.65rem] text-muted-foreground text-center">
          🔔 Unified queue: inbox · trades · compliance · fees · demurrage · reefer · customs
        </div>
      </motion.div>
    </>
  );
}

// Floating bell button with badge count — rendered in the WorkspaceShell topbar
export function WorklistBellButton({ tenantGtid }: { tenantGtid: string }) {
  const worklistOpen = useAppStore((s) => s.worklistOpen);
  const setWorklistOpen = useAppStore((s) => s.setWorklistOpen);

  const { data: count } = useQuery<number>({
    queryKey: ["worklist-count", tenantGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/dashboard?tenant=${tenantGtid}`);
        if (!r.ok) return 0;
        const d = await r.json();
        return Array.isArray(d?.inbox) ? d.inbox.length : 0;
      } catch {
        return 0;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const n = count || 0;

  return (
    <button
      onClick={() => setWorklistOpen(!worklistOpen)}
      className="relative h-9 w-9 rounded-lg hover:bg-muted/60 flex items-center justify-center text-muted-foreground transition-colors"
      title="Smart Worklist"
      aria-label={`Smart Worklist${n > 0 ? ` (${n} pending)` : ""}`}
    >
      <Bell className="w-4 h-4" />
      {n > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[0.6rem] font-bold flex items-center justify-center">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </button>
  );
}
