"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX Smart Inbox Panel — Recommendation #13 (Strategic)
// ═══════════════════════════════════════════════════════════════════════════════
//
// AI-driven inbox prioritization panel. Shows the top N inbox items ranked
// by the `smartPriority` score computed on the backend:
//
//   smartPriority = basePriority*0.4 + tradeValueScore*0.3 + urgencyScore*0.2
//                   + criticalityScore*0.1
//
// Features:
//   - "Smart Sort" toggle — switches between basePriority (legacy) and
//     smartPriority (AI-computed) ordering. The same endpoint is hit; the
//     client just re-sorts the cached payload locally so the toggle is
//     instant (< 1ms).
//   - Each item: rank number, title, smart-priority progress bar, category
//     badge, age, trade value, CTA.
//   - Clicking an item navigates to the relevant tab based on its category
//     (passed via `onNavigate(tab)`).
//   - Two render modes:
//       * compact (5 items) — used by the Command Center card
//       * full (10 items)   — used by the standalone panel
//
// Uses useQuery + the relative `/api/sgtx/smart-inbox?tenantGtid=X&limit=N`
// endpoint. Refetches every 60s.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Inbox, Sparkles, Loader2, ChevronRight, ArrowUp, ArrowDown,
  ShieldAlert, Banknote, FileText, Gavel, MessageSquare,
} from "lucide-react";

type SmartInboxItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  basePriority: number;
  smartPriority: number;
  tradeValueUsd: number | null;
  ustn: string | null;
  ageHours: number;
  criticalityScore: number;
  urgencyScore: number;
  tradeValueScore: number;
  smartRank: number;
  ctaLabel: string | null;
  deadline: string | null;
};

type SmartInboxResponse = {
  ok: boolean;
  items: SmartInboxItem[];
  count: number;
  degraded?: boolean;
  degradedReason?: string;
  formula?: string;
};

// Category → tab deep-link map. Clicking an item navigates to the matching
// tab via the onNavigate callback (which setActiveTab in PortalContent).
const CATEGORY_TAB: Record<string, string> = {
  DISPUTE: "disputes",
  COMPLIANCE: "compliance",
  REGULATORY_OVERSIGHT: "compliance",
  NEW_OFFER: "quotes",
  NEGOTIATION: "quotes",
  GENERAL: "inbox",
};

function categoryIcon(category: string, className: string) {
  const upper = (category || "").toUpperCase();
  if (upper.includes("DISPUTE")) return <Gavel className={className} />;
  if (upper.includes("COMPLIANCE") || upper.includes("REGULATORY")) return <ShieldAlert className={className} />;
  if (upper.includes("NEGOTIATION") || upper.includes("OFFER")) return <Banknote className={className} />;
  if (upper.includes("CONTRACT")) return <FileText className={className} />;
  if (upper.includes("MESSAGE") || upper.includes("CHAT")) return <MessageSquare className={className} />;
  return <Inbox className={className} />;
}

function categoryTone(category: string): {
  bg: string;
  text: string;
  border: string;
} {
  const upper = (category || "").toUpperCase();
  if (upper.includes("DISPUTE"))
    return { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30" };
  if (upper.includes("COMPLIANCE") || upper.includes("REGULATORY"))
    return { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" };
  if (upper.includes("NEGOTIATION") || upper.includes("OFFER"))
    return { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" };
  return { bg: "bg-muted/40", text: "text-muted-foreground", border: "border-border/40" };
}

function fmtAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function fmtUsd(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function priorityBarColor(score: number): string {
  if (score >= 80) return "bg-rose-500";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-emerald-500";
  return "bg-muted-foreground/60";
}

// ── Single row renderer ──────────────────────────────────────────────────
function SmartInboxRow({
  item,
  onNavigate,
}: {
  item: SmartInboxItem;
  onNavigate?: (tab: string) => void;
}) {
  const tone = categoryTone(item.category);
  const tab = CATEGORY_TAB[item.category?.toUpperCase()] || "inbox";
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.(tab);
        toast.info(`Opening ${tab}`, { description: item.title });
      }}
      className="w-full text-left p-3 rounded-lg border border-border/50 hover:border-gold/40 hover:bg-gold/5 transition-all group"
      aria-label={`Open ${item.title}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Rank number */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gold/10 text-gold flex items-center justify-center text-[0.65rem] font-bold">
          {item.smartRank}
        </div>
        {/* Icon */}
        <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${tone.bg} ${tone.text} ${tone.border} border`}>
          {categoryIcon(item.category, "w-3.5 h-3.5")}
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-foreground truncate group-hover:text-gold transition-colors">
              {item.title}
            </p>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-gold transition-colors" />
          </div>
          {/* Smart-priority progress bar */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${priorityBarColor(item.smartPriority)}`}
                style={{ width: `${Math.max(0, Math.min(100, item.smartPriority))}%` }}
              />
            </div>
            <span className="text-[0.6rem] font-mono font-semibold text-foreground/70 tabular-nums">
              {item.smartPriority}
            </span>
          </div>
          {/* Metadata row */}
          <div className="mt-1.5 flex items-center flex-wrap gap-1.5">
            <Badge variant="outline" className={`text-[0.55rem] h-4 px-1 ${tone.bg} ${tone.text} ${tone.border}`}>
              {item.category}
            </Badge>
            <span className="text-[0.6rem] text-muted-foreground">
              {fmtAge(item.ageHours)} old
            </span>
            {item.tradeValueUsd != null && item.tradeValueUsd > 0 && (
              <span className="text-[0.6rem] font-mono text-foreground/80">
                {fmtUsd(item.tradeValueUsd)}
              </span>
            )}
            {item.ctaLabel && (
              <span className="text-[0.55rem] text-gold ml-auto">
                {item.ctaLabel} →
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────
interface SmartInboxPanelProps {
  tenantGtid: string;
  limit?: number;
  // Compact mode = 5 items, no header card, no toggle (for Command Center card).
  // Full mode = 10 items, header card, smart-sort toggle (for standalone panel).
  variant?: "compact" | "full";
  onNavigate?: (tab: string) => void;
  onViewAll?: () => void;
}

export function SmartInboxPanel({
  tenantGtid,
  limit = 10,
  variant = "full",
  onNavigate,
  onViewAll,
}: SmartInboxPanelProps) {
  const [smartSort, setSmartSort] = useState(true);

  const { data, isLoading, isError } = useQuery<SmartInboxResponse>({
    queryKey: ["sgtx-smart-inbox", tenantGtid, limit],
    queryFn: async () => {
      try {
        const r = await fetch(
          `/api/sgtx/smart-inbox?tenantGtid=${encodeURIComponent(tenantGtid)}&limit=${limit}`,
        );
        if (!r.ok) return { ok: false, items: [], count: 0 };
        const j = (await r.json()) as SmartInboxResponse;
        return j || { ok: false, items: [], count: 0 };
      } catch {
        return { ok: false, items: [], count: 0 };
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!tenantGtid,
  });

  // Client-side re-sort when the toggle flips. The endpoint already returns
  // items sorted by smartPriority; we re-sort by basePriority when the user
  // toggles "smart" off.
  const items = useMemo(() => {
    const list = (data?.items || []).slice();
    if (smartSort) {
      return list.sort((a, b) => b.smartPriority - a.smartPriority);
    }
    return list.sort((a, b) => b.basePriority - a.basePriority);
  }, [data, smartSort]);

  const isCompact = variant === "compact";
  const degraded = data?.degraded === true;

  // ── COMPACT variant (Command Center card) ───────────────────────────────
  if (isCompact) {
    return (
      <Card className="p-4 border-gold/20">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Smart Inbox Priority
          </h3>
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-[0.65rem] text-gold hover:text-gold/80 font-medium"
            >
              View All →
            </button>
          )}
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Ranking items…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No priority items — you're all caught up.
          </p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map((it) => (
              <SmartInboxRow key={it.id} item={it} onNavigate={onNavigate} />
            ))}
          </div>
        )}
        {degraded && (
          <p className="text-[0.55rem] text-amber-600 dark:text-amber-400 mt-2 italic">
            Smart-priority temporarily degraded — showing base-priority order.
          </p>
        )}
      </Card>
    );
  }

  // ── FULL variant (standalone panel) ──────────────────────────────────────
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg sgtx-bg-gold-soft flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-gold" />
          </div>
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Smart Inbox Priority
              {degraded && (
                <Badge variant="outline" className="text-[0.5rem] border-amber-500/40 text-amber-600 dark:text-amber-400">
                  degraded
                </Badge>
              )}
            </h3>
            <p className="text-[0.6rem] text-muted-foreground">
              AI-ranked by trade value × urgency × criticality
            </p>
          </div>
        </div>
        {/* Smart Sort toggle */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20">
          <span className={`text-[0.65rem] font-medium ${!smartSort ? "text-foreground" : "text-muted-foreground"}`}>
            Base
          </span>
          <Switch
            checked={smartSort}
            onCheckedChange={setSmartSort}
            aria-label="Toggle smart-priority sorting"
          />
          <span className={`text-[0.65rem] font-medium flex items-center gap-1 ${smartSort ? "text-gold" : "text-muted-foreground"}`}>
            {smartSort && <Sparkles className="w-3 h-3" />}
            Smart
          </span>
        </div>
      </div>

      {/* Formula chip */}
      <div className="mb-3 p-2 rounded-md bg-muted/30 border border-border/40">
        <p className="text-[0.55rem] font-mono text-muted-foreground break-all">
          smartPriority = basePriority&times;0.4 + tradeValueScore&times;0.3 + urgencyScore&times;0.2 + criticalityScore&times;0.1
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Ranking inbox items…
        </div>
      ) : isError ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          Could not load smart inbox — showing base-priority fallback.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Inbox is empty — you're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto scroll-gold pr-1">
          {items.map((it) => (
            <SmartInboxRow key={it.id} item={it} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* Score legend */}
      <div className="mt-4 pt-3 border-t border-border/40 flex items-center flex-wrap gap-3 text-[0.55rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <ArrowUp className="w-3 h-3 text-rose-500" />
          {">=80 critical"}
        </span>
        <span className="flex items-center gap-1">
          <ArrowDown className="w-3 h-3 text-emerald-500" />
          {"<40 low"}
        </span>
        <span className="ml-auto">
          {items.length} item{items.length === 1 ? "" : "s"} ranked
        </span>
      </div>
    </Card>
  );
}
