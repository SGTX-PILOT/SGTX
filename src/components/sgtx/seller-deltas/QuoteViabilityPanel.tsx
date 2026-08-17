"use client";

// SGTX Seller Delta 1 — Quote Viability Panel (CCL-005)
// Shows a consolidated assessment before the seller finalizes the quote.
// States: VIABLE / VIABLE_WITH_CONDITIONS / BLOCKED
//
// Rendered inside QuoteBuilderScreen near the submit button.

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scale, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { calculateQuoteViability, type QuoteViabilityInput } from "@/lib/sgtx/seller/quote-viability";

const STATE_PALETTE: Record<string, { Icon: any; color: string; label: string }> = {
  FIT: { Icon: CheckCircle2, color: "#10b981", label: "✓" },
  CONDITION: { Icon: AlertTriangle, color: "#f59e0b", label: "⚠" },
  MISSING: { Icon: AlertTriangle, color: "#ef4444", label: "⚠" },
  BLOCKED: { Icon: XCircle, color: "#ef4444", label: "✕" },
  NOT_APPLICABLE: { Icon: CheckCircle2, color: "#94a3b8", label: "○" },
};

export function QuoteViabilityPanel({ input }: { input: QuoteViabilityInput }) {
  const [expanded, setExpanded] = useState(false);
  const result = useMemo(() => calculateQuoteViability(input), [input]);

  const overallColor =
    result.overallState === "VIABLE" ? "#10b981"
    : result.overallState === "VIABLE_WITH_CONDITIONS" ? "#f59e0b"
    : "#ef4444";

  return (
    <Card className="p-4 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent">
      <div className="flex items-center gap-2 mb-3">
        <Scale className="w-4 h-4 text-gold" />
        <p className="text-sm font-semibold text-gold">Quote Viability</p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div
        className="p-2 rounded-md text-xs font-semibold mb-3"
        style={{ background: `${overallColor}15`, color: overallColor, border: `1px solid ${overallColor}40` }}
        aria-live="polite"
      >
        {result.summary}
      </div>

      {/* Compact view */}
      <div className="grid grid-cols-2 gap-1.5">
        {result.categories.map((cat) => {
          const palette = STATE_PALETTE[cat.state] || STATE_PALETTE.FIT;
          return (
            <div key={cat.key} className="flex items-center gap-1.5 text-[0.65rem]">
              <span style={{ color: palette.color }} className="font-bold">{palette.label}</span>
              <span className="text-muted-foreground">{cat.label}</span>
            </div>
          );
        })}
      </div>

      {/* Expanded view with details */}
      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3">
          {result.categories.map((cat) => {
            const palette = STATE_PALETTE[cat.state] || STATE_PALETTE.FIT;
            return (
              <div key={cat.key} className="flex items-start gap-2 text-xs">
                <palette.Icon className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: palette.color }} aria-hidden="true" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cat.label}</span>
                    <Badge variant="outline" className="text-[0.5rem]" style={{ color: palette.color, borderColor: `${palette.color}40` }}>
                      {cat.state.replace("_", " ")}
                    </Badge>
                  </div>
                  {cat.detail && <p className="text-[0.6rem] text-muted-foreground mt-0.5">{cat.detail}</p>}
                  {cat.actionLabel && (
                    <button className="text-[0.6rem] text-gold hover:underline mt-0.5">{cat.actionLabel}</button>
                  )}
                </div>
              </div>
            );
          })}

          {result.blockingIssues.length > 0 && (
            <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/20">
              <p className="text-[0.6rem] font-semibold text-destructive mb-1">Blocking Issues:</p>
              {result.blockingIssues.map((issue, i) => (
                <p key={i} className="text-[0.6rem] text-destructive">• {issue}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
