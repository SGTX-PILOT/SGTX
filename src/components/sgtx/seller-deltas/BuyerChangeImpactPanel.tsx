"use client";

// SGTX Seller Delta 2 — Buyer Change Impact Panel (CCL-005)
// Shows the downstream impact of a buyer's amendment before the seller accepts.
// States: UNCHANGED / RECALCULATED / INVALIDATED / RECONFIRM_REQUIRED /
// REQUOTE_REQUIRED / REGENERATE_REQUIRED

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitCompare, ChevronRight } from "lucide-react";
import { calculateBuyerChangeImpact, type BuyerChangeImpactInput } from "@/lib/sgtx/seller/change-impact";

const STATE_PALETTE: Record<string, { color: string; label: string }> = {
  UNCHANGED: { color: "#94a3b8", label: "—" },
  RECALCULATED: { color: "#f59e0b", label: "RECALC" },
  INVALIDATED: { color: "#ef4444", label: "INVALID" },
  RECONFIRM_REQUIRED: { color: "#f59e0b", label: "RECONFIRM" },
  REQUOTE_REQUIRED: { color: "#ef4444", label: "REQUOTE" },
  REGENERATE_REQUIRED: { color: "#f59e0b", label: "REGEN" },
};

export function BuyerChangeImpactPanel({ input }: { input: BuyerChangeImpactInput }) {
  const result = calculateBuyerChangeImpact(input);

  return (
    <Card className="p-4 border border-info/20 bg-gradient-to-br from-info/5 to-transparent">
      <div className="flex items-center gap-2 mb-3">
        <GitCompare className="w-4 h-4 text-info" />
        <p className="text-sm font-semibold text-info">Buyer Change Impact</p>
        {result.requiresGovernorApproval && (
          <Badge variant="outline" className="ml-auto text-[0.5rem] text-warning border-warning/40">
            Governor Approval Required
          </Badge>
        )}
      </div>

      {result.changes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No changes detected.</p>
      ) : (
        <>
          {/* Changed fields */}
          <div className="space-y-1 mb-3">
            {result.changes.map((change, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground min-w-[120px]">{change.label}:</span>
                <span className="text-muted-foreground line-through">{String(change.oldValue ?? "—")}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium text-foreground">{String(change.newValue ?? "—")}</span>
              </div>
            ))}
          </div>

          {/* Impact items */}
          <div className="grid grid-cols-1 gap-1">
            {result.impacts.map((impact, i) => {
              const palette = STATE_PALETTE[impact.state] || STATE_PALETTE.UNCHANGED;
              return (
                <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded border border-border/30">
                  <span className="text-muted-foreground min-w-[100px]">{impact.area}</span>
                  <Badge
                    variant="outline"
                    className="text-[0.5rem] ml-auto"
                    style={{ color: palette.color, borderColor: `${palette.color}40` }}
                  >
                    {palette.label}
                  </Badge>
                  <span className="text-[0.6rem] text-muted-foreground hidden sm:inline">{impact.detail}</span>
                  {impact.governorBlocking && (
                    <span className="text-[0.5rem] text-destructive">⛔</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Margin impact */}
          {result.deltaMargin !== 0 && (
            <div className="mt-2 p-2 rounded bg-muted/20 text-xs">
              <span className="text-muted-foreground">Margin Impact: </span>
              <span className={result.deltaMargin < 0 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                {result.deltaMargin >= 0 ? "+" : ""}${result.deltaMargin.toFixed(0)}
                {" "}
                ({result.deltaMarginPct >= 0 ? "+" : ""}{result.deltaMarginPct.toFixed(1)}%)
              </span>
            </div>
          )}

          {/* Advisory */}
          <p className="text-[0.65rem] text-muted-foreground mt-2 italic">{result.advisory}</p>

          {result.blockingIssues.length > 0 && (
            <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/20">
              <p className="text-[0.6rem] font-semibold text-destructive mb-1">Blocking Issues:</p>
              {result.blockingIssues.map((issue, i) => (
                <p key={i} className="text-[0.6rem] text-destructive">• {issue}</p>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
