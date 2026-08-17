"use client";

// SGTX Seller Delta 4+5 — Execution Mode Panel + Control Tower (CCL-005)
// Shows post-contract execution emphasis + consolidated control tower cards.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, Clock, ChevronRight, TowerControl } from "lucide-react";
import type { ControlTowerSummary } from "@/lib/sgtx/seller/control-tower";

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  URGENT: "#f59e0b",
  ACTION_REQUIRED: "#3b82f6",
  INFORMATION: "#94a3b8",
};

const STATUS_COLOR: Record<string, string> = {
  GREEN: "#10b981",
  AMBER: "#f59e0b",
  RED: "#ef4444",
};

// ── Execution Mode Panel (Delta 4) ──────────────────────────────────────
export function ExecutionModePanel({
  executionMode,
  onNavigate,
}: {
  executionMode: NonNullable<ControlTowerSummary["executionMode"]>;
  onNavigate?: (tab: string) => void;
}) {
  const statusColor = STATUS_COLOR[executionMode.status] || "#94a3b8";

  return (
    <Card className="p-4 border-2" style={{ borderColor: `${statusColor}40` }}>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4" style={{ color: statusColor }} />
        <p className="text-sm font-semibold">Shipment Execution</p>
        <Badge variant="outline" className="ml-auto text-[0.5rem]" style={{ color: statusColor, borderColor: `${statusColor}40` }}>
          {executionMode.status}
        </Badge>
      </div>

      <div className="text-[0.6rem] text-muted-foreground mb-2">
        USTN: <span className="font-mono text-foreground">{executionMode.ustn}</span>
      </div>

      <div className="p-2 rounded-md mb-3 text-xs font-semibold" style={{ background: `${statusColor}15`, color: statusColor }}>
        NEXT ACTION: {executionMode.nextAction}
      </div>

      <div className="mb-3">
        <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1">Critical</p>
        <div className="grid grid-cols-2 gap-1.5">
          {executionMode.critical.map((c, i) => {
            const color = c.state === "OK" ? "#10b981" : c.state === "WARNING" ? "#f59e0b" : "#ef4444";
            return (
              <div key={i} className="flex items-center gap-1.5 text-[0.65rem]">
                <span style={{ color }} className="font-bold">
                  {c.state === "OK" ? "✓" : c.state === "WARNING" ? "⚠" : "✕"}
                </span>
                <span className="text-muted-foreground">{c.area}</span>
              </div>
            );
          })}
        </div>
      </div>

      {executionMode.lastSafeAction && (
        <div className="p-2 rounded bg-warning/5 border border-warning/20 mb-2">
          <p className="text-[0.6rem] font-semibold text-warning flex items-center gap-1">
            <Clock className="w-3 h-3" /> LAST SAFE ACTION:
          </p>
          <p className="text-[0.65rem] text-foreground mt-0.5">{executionMode.lastSafeAction}</p>
        </div>
      )}

      {executionMode.nextMilestone && (
        <div className="p-2 rounded bg-info/5 border border-info/20">
          <p className="text-[0.6rem] font-semibold text-info">NEXT MILESTONE:</p>
          <p className="text-[0.65rem] text-foreground mt-0.5">{executionMode.nextMilestone}</p>
        </div>
      )}
    </Card>
  );
}

// ── Seller Control Tower (Delta 5) ──────────────────────────────────────
export function SellerControlTower({
  summary,
  onNavigate,
}: {
  summary: ControlTowerSummary;
  onNavigate?: (tab: string) => void;
}) {
  return (
    <Card className="p-4 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent">
      <div className="flex items-center gap-2 mb-3">
        <TowerControl className="w-4 h-4 text-gold" />
        <p className="text-sm font-semibold text-gold">Seller Control Tower</p>
      </div>

      {/* Summary line */}
      <div className="flex flex-wrap gap-2 mb-3 text-[0.65rem]">
        <span className="text-muted-foreground">{summary.counts.openTrades} Open Trades</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{summary.counts.quotesInProgress} Quotes in Progress</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{summary.counts.exceptions} Exceptions</span>
        {summary.counts.criticalIssues > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-destructive font-semibold">{summary.counts.criticalIssues} Critical</span>
          </>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{summary.counts.activeShipments} Active Shipments</span>
        {summary.counts.paymentsDue > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-warning font-semibold">{summary.counts.paymentsDue} Payments Due</span>
          </>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
        {summary.cards.slice(0, 9).map((card) => {
          const color = PRIORITY_COLOR[card.priority] || "#94a3b8";
          return (
            <button
              key={card.key}
              onClick={() => card.actionUrl && onNavigate?.(card.actionUrl)}
              className="text-left p-2 rounded border bg-background/40 hover:bg-background/80 transition-colors"
              style={{ borderColor: `${color}20` }}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">{card.category}</span>
                {card.priority === "CRITICAL" && <AlertTriangle className="w-3 h-3 text-destructive" />}
                {card.priority === "URGENT" && <Clock className="w-3 h-3 text-warning" />}
              </div>
              <p className="text-[0.6rem] text-muted-foreground">{card.label}</p>
              <p className="text-sm font-semibold" style={{ color }}>{card.value}</p>
              {card.sub && <p className="text-[0.55rem] text-muted-foreground">{card.sub}</p>}
            </button>
          );
        })}
      </div>

      {/* Next actions */}
      {summary.actions.length > 0 && (
        <div>
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1.5">Next Actions</p>
          <div className="space-y-1">
            {summary.actions.slice(0, 5).map((action, i) => {
              const color = PRIORITY_COLOR[action.priority] || "#94a3b8";
              return (
                <button
                  key={i}
                  onClick={() => action.actionUrl && onNavigate?.(action.actionUrl)}
                  className="w-full flex items-center gap-2 text-left p-1.5 rounded hover:bg-muted/20 transition-colors"
                >
                  <span className="text-[0.55rem] font-bold w-4" style={{ color }}>{i + 1}.</span>
                  <span className="text-xs text-foreground flex-1">{action.label}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Execution mode (if post-contract) */}
      {summary.executionMode && (
        <div className="mt-3 border-t border-border/40 pt-3">
          <ExecutionModePanel executionMode={summary.executionMode} onNavigate={onNavigate} />
        </div>
      )}
    </Card>
  );
}
