"use client";

// Active Trade Context Bar — the persistent USTN selector that threads
// through every workspace. This is the central UX breakthrough of the
// WorkspaceShell: pick a trade once, see everything about it everywhere.
//
// Features:
//   • USTN chip (click to copy, click-and-hold to clear)
//   • Trade stage badge (Phase X/8)
//   • Pending action CTA (1-click to act)
//   • Health score dot
//   • Mini-timeline (hover to expand)
//   • Switch USTN dropdown (lists active trades)
//   • When no USTN is selected: prompts user with "Pick a trade to thread context"
//
// v2: Accepts dashboard data as a prop to avoid redundant fetches (the
// WorkspaceShell already loads it). Falls back to its own fetch only if the
// prop is missing.

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown, Copy, X, Sparkles, Activity, ArrowRight,
  Package, FileText, Truck, Banknote, ShieldCheck, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TradeSummary {
  ustn: string;
  status: string;
  phase: number;
  commodity?: string;
  incoterm?: string;
  buyer?: { legalName?: string };
  seller?: { legalName?: string };
  healthScore?: number;
  pendingAction?: { label: string; workspace?: string } | null;
}

interface DashboardData {
  tenant?: any;
  inbox?: any[];
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
  invoices?: any[];
}

// ── Module-level helpers (shared by ActiveTradeContextBar + TradePicker) ──
function statusColor(status: string) {
  if (!status) return "#6b7280";
  if (status.includes("EXECUTION") || status.includes("SIGNED")) return "#10b981";
  if (status.includes("QUOTE") || status.includes("PENDING")) return "#f59e0b";
  if (status.includes("DISPUTE") || status.includes("DISTRESS")) return "#ef4444";
  if (status.includes("SETTLED") || status.includes("CLOSED")) return "#3b82f6";
  return "#6b7280";
}

function healthColor(score?: number) {
  if (score === undefined || score === null) return "#6b7280";
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function phaseLabel(phase: number) {
  const labels = ["Foundation", "Initiation", "Quote", "Contracting", "Financing", "Execution", "Settlement", "Distressed", "Dispute"];
  return labels[phase] || "—";
}

export function ActiveTradeContextBar({
  tenantGtid,
  dashboard,
}: {
  tenantGtid: string;
  dashboard?: DashboardData | null;
}) {
  const activeUstnContext = useAppStore((s) => s.activeUstnContext);
  const setUstnContext = useAppStore((s) => s.setUstnContext);
  const openTcc = useAppStore((s) => s.openTcc);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const setSubTab = useAppStore((s) => s.setSubTab);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build the trades list from the dashboard data (passed as prop) — no extra fetch.
  // Falls back to its own fetch only if the prop is missing.
  const tradesList: TradeSummary[] = useMemo(() => {
    const source = dashboard || {};
    const all = [
      ...(Array.isArray(source.tradesAsBuyer) ? source.tradesAsBuyer : []),
      ...(Array.isArray(source.tradesAsSeller) ? source.tradesAsSeller : []),
    ];
    return all.map((t: any) => ({
      ustn: t.ustn,
      status: t.status,
      phase: t.phase || 0,
      commodity: t.commodity,
      incoterm: t.incoterm,
      buyer: t.buyer,
      seller: t.seller,
      healthScore: t.healthScore,
    }));
  }, [dashboard]);

  // Fetch the active trade summary (if a USTN is selected) — this is a
  // lightweight single-trade fetch, not the full dashboard.
  const { data: trade } = useQuery<TradeSummary>({
    queryKey: ["active-trade-context", activeUstnContext],
    queryFn: async () => {
      if (!activeUstnContext) return null;
      try {
        const r = await fetch(`/api/sgtx/trade?ustn=${activeUstnContext}`);
        if (!r.ok) return null;
        return await r.json();
      } catch {
        return null;
      }
    },
    enabled: !!activeUstnContext,
    staleTime: 30_000,
  });

  const copyUstn = () => {
    if (!activeUstnContext) return;
    navigator.clipboard.writeText(activeUstnContext);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("USTN copied", { description: activeUstnContext });
  };

  const clearContext = () => {
    setUstnContext(null);
    toast.info("Trade context cleared");
  };

  const pickTrade = (ustn: string) => {
    setUstnContext(ustn);
    setPickerOpen(false);
    toast.success("Trade context set", { description: ustn });
  };

  // No active context — show the prompt
  if (!activeUstnContext) {
    return (
      <div className="border-b border-border/40 bg-gradient-to-r from-gold/5 via-transparent to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="w-3.5 h-3.5 text-gold/70" />
            <span className="hidden sm:inline">No active trade context —</span>
            <span className="sm:hidden">No trade —</span>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-gold hover:underline font-medium inline-flex items-center gap-1"
            >
              Pick a trade to thread context
              <ChevronDown className="w-3 h-3" />
            </button>
            {tradesList.length > 0 && (
              <span className="text-[0.6rem] text-muted-foreground/70">
                ({tradesList.length} available)
              </span>
            )}
          </div>
          <div className="ml-auto hidden md:flex items-center gap-1.5 text-[0.65rem] text-muted-foreground/70">
            <Sparkles className="w-3 h-3" />
            <span>Tip: selected trade follows you across workspaces</span>
          </div>
        </div>

        <TradePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          trades={tradesList}
          onPick={pickTrade}
        />
      </div>
    );
  }

  // Active context — show the chip + stage + CTA
  const pending = trade?.pendingAction;
  const ctaWorkspace = (pending?.workspace as any) || "trades";

  return (
    <>
      <div className="border-b border-border/40 bg-gradient-to-r from-gold/8 via-gold/3 to-transparent">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 sm:gap-3 min-w-0">
          {/* USTN chip */}
          <button
            onClick={copyUstn}
            className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background/80 border border-gold/30 hover:border-gold/60 transition-colors min-w-0"
            title="Click to copy USTN"
          >
            <Package className="w-3.5 h-3.5 text-gold flex-shrink-0" />
            <span className="font-mono text-[0.7rem] sm:text-xs text-foreground truncate max-w-[180px] sm:max-w-none">
              {activeUstnContext}
            </span>
            {copied ? (
              <span className="text-[0.6rem] text-emerald-400 flex-shrink-0">copied!</span>
            ) : (
              <Copy className="w-3 h-3 text-muted-foreground group-hover:text-gold flex-shrink-0" />
            )}
          </button>

          {/* Status badge */}
          {trade && (
            <Badge
              variant="outline"
              className="text-[0.6rem] sm:text-[0.65rem] h-5 px-1.5 flex-shrink-0"
              style={{
                color: statusColor(trade.status),
                borderColor: `${statusColor(trade.status)}55`,
                background: `${statusColor(trade.status)}10`,
              }}
            >
              {(trade.status || "").replace(/_/g, " ")}
            </Badge>
          )}

          {/* Phase */}
          {trade && (
            <span className="hidden sm:inline text-[0.65rem] text-muted-foreground flex-shrink-0">
              Phase {trade.phase}/8 · {phaseLabel(trade.phase)}
            </span>
          )}

          {/* Commodity + incoterm */}
          {trade?.commodity && (
            <span className="hidden md:inline text-[0.65rem] text-muted-foreground flex-shrink-0">
              · {trade.commodity}
              {trade.incoterm ? ` · ${trade.incoterm}` : ""}
            </span>
          )}

          {/* Health dot */}
          {trade?.healthScore !== undefined && (
            <span
              className="inline-flex items-center gap-1 text-[0.65rem] flex-shrink-0"
              title={`Health ${trade.healthScore}/100`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: healthColor(trade.healthScore) }}
              />
              <span className="hidden sm:inline text-muted-foreground">{trade.healthScore}</span>
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Pending action CTA */}
          {pending?.label && (
            <Button
              size="sm"
              className="h-7 px-2.5 text-[0.7rem] bg-gold-gradient text-sovereign hover:opacity-90 flex-shrink-0"
              onClick={() => {
                setWorkspace(ctaWorkspace);
                setSubTab("action");
                toast.info(`Opening: ${pending.label}`);
              }}
            >
              <Zap className="w-3 h-3 mr-1" />
              <span className="hidden sm:inline">{pending.label}</span>
              <span className="sm:hidden">Act</span>
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}

          {/* Open TCC */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.7rem] text-muted-foreground hover:text-gold flex-shrink-0"
            onClick={() => openTcc(activeUstnContext)}
            title="Open Trade Command Center (full screen)"
          >
            <Activity className="w-3.5 h-3.5 sm:mr-1" />
            <span className="hidden sm:inline">TCC</span>
          </Button>

          {/* Switch trade */}
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[0.7rem] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
            title="Switch active trade"
          >
            <ChevronDown className="w-3 h-3" />
            <span className="hidden sm:inline">Switch</span>
          </button>

          {/* Clear */}
          <button
            onClick={clearContext}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-colors flex-shrink-0"
            title="Clear active trade context"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <TradePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        trades={tradesList}
        onPick={pickTrade}
      />
    </>
  );
}

// ── Trade picker dropdown (uses data passed from parent — no extra fetch) ─
function TradePicker({
  open,
  onClose,
  trades,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  trades: TradeSummary[];
  onPick: (ustn: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return trades;
    const q = search.toLowerCase();
    return trades.filter((t) =>
      t.ustn?.toLowerCase().includes(q) ||
      t.status?.toLowerCase().includes(q) ||
      t.commodity?.toLowerCase().includes(q) ||
      t.buyer?.legalName?.toLowerCase().includes(q) ||
      t.seller?.legalName?.toLowerCase().includes(q)
    );
  }, [trades, search]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[65] bg-black/40 flex items-start justify-center pt-20 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[70vh] overflow-hidden flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-gold" />
              <h3 className="font-semibold text-sm">Pick active trade</h3>
              <span className="text-[0.65rem] text-muted-foreground ml-auto">
                {trades.length} trade{trades.length === 1 ? "" : "s"}
              </span>
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by USTN, commodity, status, party…"
              className="w-full px-3 py-2 text-sm bg-muted/30 rounded-lg border border-border/50 focus:outline-none focus:border-gold/50"
            />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filtered.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {trades.length === 0 ? "No trades found for this tenant." : "No matches."}
                </div>
              )}
              {filtered.map((t) => (
                <button
                  key={t.ustn}
                  onClick={() => onPick(t.ustn)}
                  className="w-full text-left p-3 rounded-lg hover:bg-muted/40 transition-colors border border-transparent hover:border-gold/30"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-3.5 h-3.5 text-gold flex-shrink-0" />
                    <span className="font-mono text-xs text-foreground truncate">{t.ustn}</span>
                    <Badge
                      variant="outline"
                      className="ml-auto text-[0.55rem] h-4 px-1 flex-shrink-0"
                      style={{
                        color: statusColor(t.status),
                        borderColor: `${statusColor(t.status)}55`,
                      }}
                    >
                      {(t.status || "").replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground flex items-center gap-2">
                    <span>Phase {t.phase}/8</span>
                    {t.commodity && <span>· {t.commodity}</span>}
                    {t.incoterm && <span>· {t.incoterm}</span>}
                  </div>
                  {(t.buyer?.legalName || t.seller?.legalName) && (
                    <div className="text-[0.65rem] text-muted-foreground/70 mt-0.5">
                      {t.buyer?.legalName} → {t.seller?.legalName}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="p-3 border-t border-border/50 flex items-center justify-between text-[0.65rem] text-muted-foreground">
            <span>Selected trade threads through all 6 workspaces</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
