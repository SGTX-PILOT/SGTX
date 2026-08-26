"use client";

// ════════════════════════════════════════════════════════════════════════════
// TradeLifecycleVisualizer — SGTX Recommendation #6 (Art 129 full E2E workflow)
//
// A horizontal scrollable progress strip showing all 36 lifecycle stages of a
// trade per blueprint Art 129. Completed stages render with an emerald check,
// the current stage pulses in gold (sgtx-pulse-glow), blocked stages render
// with a red X, and future stages render as a gray outline.
//
// Visual design:
//   • Mobile — horizontal scroll (scroll-gold class), small circles, label
//     inline to the right of each circle (compact chip layout).
//   • Desktop — single row, all 36 circles in a row, label below the circle.
//   • Connector lines between circles: emerald for completed→completed, gold
//     for completed→current, gray for future stages.
//
// Props:
//   • currentStage     — string id of the active stage (e.g. "CONTRACT")
//   • completedStages? — string[] ids already done
//   • blockedStages?   — string[] ids that are blocked
//   • onStageClick?    — optional click handler
//
// The 36-stage constant is exported as TRADE_LIFECYCLE_STAGES_36 so the helper
// functions deriveCurrentStage / deriveCompletedStages (in PortalContent.tsx)
// can reference the canonical list.
// ════════════════════════════════════════════════════════════════════════════

import { Check, X, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LifecycleStage {
  id: string;
  label: string;
  shortLabel: string;
}

// ─── Art 129 — 36 canonical lifecycle stages ────────────────────────────────
// Ordered INTENT → USTN_CLOSED per the blueprint's full E2E trade workflow.
// shortLabel is the 1-3 word form used inside the small circle chips.
export const TRADE_LIFECYCLE_STAGES_36: LifecycleStage[] = [
  { id: "INTENT",            label: "Intent Captured",            shortLabel: "INTENT" },
  { id: "COUNTERPARTY",      label: "Counterparty Identified",     shortLabel: "PARTY" },
  { id: "RFQ",               label: "RFQ Issued",                 shortLabel: "RFQ" },
  { id: "QUOTE",             label: "Quote Received",             shortLabel: "QUOTE" },
  { id: "NEGOTIATION",       label: "Negotiation Round",          shortLabel: "NEG" },
  { id: "PO/SO",             label: "PO / SO Matched",            shortLabel: "PO/SO" },
  { id: "PROFORMA",          label: "Proforma Issued",            shortLabel: "PI" },
  { id: "CONTRACT",          label: "Contract Signed",            shortLabel: "CONTRACT" },
  { id: "REG_SNAPSHOT",      label: "Regulatory Snapshot",        shortLabel: "REG" },
  { id: "CLASSIFICATION",    label: "HS Classification",          shortLabel: "HS" },
  { id: "ORIGIN",            label: "Certificate of Origin",     shortLabel: "COO" },
  { id: "FTA",               label: "FTA Preference",             shortLabel: "FTA" },
  { id: "LICENSE",          label: "Export License",              shortLabel: "LIC" },
  { id: "PERMIT",            label: "Permit Issued",              shortLabel: "PERMIT" },
  { id: "CERTIFICATE",       label: "Compliance Certificate",     shortLabel: "CERT" },
  { id: "INSURANCE",         label: "Insurance Bound",            shortLabel: "INS" },
  { id: "PACKING",           label: "Packing List",               shortLabel: "PACK" },
  { id: "TRANSPORT",         label: "Transport Confirmed",        shortLabel: "TRANS" },
  { id: "BOOKING",           label: "Booking Confirmed",          shortLabel: "BOOK" },
  { id: "EXPORT_CUSTOMS",   label: "Export Customs Filed",        shortLabel: "EXP" },
  { id: "SECURITY",          label: "Security Screening",         shortLabel: "SEC" },
  { id: "EXECUTION",         label: "Execution Started",          shortLabel: "EXEC" },
  { id: "TRANSIT",           label: "In Transit",                 shortLabel: "TRANSIT" },
  { id: "IMPORT_CUSTOMS",    label: "Import Customs Filed",        shortLabel: "IMP" },
  { id: "DUTY/TAX",          label: "Duty / Tax Paid",            shortLabel: "DUTY" },
  { id: "INSPECTION",        label: "Inspection Cleared",         shortLabel: "INSP" },
  { id: "RELEASE",           label: "Cargo Released",             shortLabel: "REL" },
  { id: "DELIVERY",          label: "Delivered",                  shortLabel: "DELIV" },
  { id: "ACCEPTANCE",        label: "Buyer Acceptance",           shortLabel: "ACC" },
  { id: "SETTLEMENT",        label: "Settlement Complete",        shortLabel: "SETTLE" },
  { id: "RECONCILIATION",    label: "Reconciliation",             shortLabel: "RECON" },
  { id: "ACCOUNTING",        label: "Accounting Posted",          shortLabel: "ACCT" },
  { id: "CLAIMS",            label: "Claims Window",              shortLabel: "CLAIM" },
  { id: "POST_CLEARANCE",   label: "Post-Clearance",              shortLabel: "POST" },
  { id: "EVIDENCE",          label: "Evidence Sealed",            shortLabel: "EVID" },
  { id: "USTN_CLOSED",       label: "USTN Closed",                 shortLabel: "CLOSED" },
];

export interface TradeLifecycleVisualizerProps {
  currentStage: string;
  completedStages?: string[];
  blockedStages?: string[];
  onStageClick?: (stage: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stageState(
  stageId: string,
  currentStage: string,
  completedSet: Set<string>,
  blockedSet: Set<string>,
): "completed" | "current" | "blocked" | "future" {
  if (completedSet.has(stageId)) return "completed";
  if (stageId === currentStage) return "current";
  if (blockedSet.has(stageId)) return "blocked";
  return "future";
}

function connectorTone(
  prevState: "completed" | "current" | "blocked" | "future",
  curState: "completed" | "current" | "blocked" | "future",
): string {
  // Connector links prev (left) → cur (right). It is "filled" only when both
  // endpoints are completed or the prev is completed and cur is current.
  if (prevState === "completed" && (curState === "completed" || curState === "current")) {
    return "bg-emerald-500/60";
  }
  return "bg-border/40";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TradeLifecycleVisualizer({
  currentStage,
  completedStages = [],
  blockedStages = [],
  onStageClick,
}: TradeLifecycleVisualizerProps) {
  const completedSet = new Set(completedStages);
  const blockedSet = new Set(blockedStages);

  // Precompute the state for each stage so the connector logic can look back.
  const stageStates = TRADE_LIFECYCLE_STAGES_36.map((s) => ({
    stage: s,
    state: stageState(s.id, currentStage, completedSet, blockedSet),
  }));

  return (
    <div className="w-full">
      {/* Desktop / tablet — single row of 36 circles with labels below */}
      <div className="hidden lg:block">
        <div className="flex items-start gap-0 w-full min-w-[1100px]">
          {stageStates.map(({ stage, state }, idx) => {
            const prev = idx > 0 ? stageStates[idx - 1].state : null;
            return (
              <div
                key={stage.id}
                className="flex items-start flex-1 min-w-0"
              >
                {/* Connector line before this stage (skip first) */}
                {idx > 0 && (
                  <div className="flex items-center h-9 flex-1 min-w-[6px]">
                    <div
                      className={cn(
                        "h-px w-full transition-colors",
                        prev && connectorTone(prev, state),
                      )}
                    />
                  </div>
                )}

                {/* Circle + label column */}
                <button
                  type="button"
                  onClick={onStageClick ? () => onStageClick(stage.id) : undefined}
                  disabled={!onStageClick}
                  className={cn(
                    "flex flex-col items-center gap-1.5 flex-shrink-0 group",
                    onStageClick && "cursor-pointer",
                    !onStageClick && "cursor-default",
                  )}
                  aria-label={`Stage ${idx + 1}: ${stage.label} — ${state}`}
                  title={`#${idx + 1} · ${stage.label} · ${state.toUpperCase()}`}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                      state === "completed" &&
                        "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                      state === "current" &&
                        "border-gold bg-gold/15 text-gold sgtx-pulse-glow",
                      state === "blocked" &&
                        "border-red-500/60 bg-red-500/15 text-red-600 dark:text-red-400",
                      state === "future" &&
                        "border-border bg-muted/30 text-muted-foreground/50",
                      onStageClick && "sgtx-hover-lift",
                    )}
                  >
                    {state === "completed" ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : state === "blocked" ? (
                      <X className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : state === "current" ? (
                      <Circle className="w-2.5 h-2.5 fill-gold/60" />
                    ) : (
                      <span className="text-[0.5rem] font-semibold text-muted-foreground/60">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[0.55rem] font-medium whitespace-nowrap transition-colors",
                      state === "completed" && "text-emerald-700 dark:text-emerald-300",
                      state === "current" && "text-gold",
                      state === "blocked" && "text-red-700 dark:text-red-300",
                      state === "future" && "text-muted-foreground/60",
                    )}
                  >
                    {stage.shortLabel}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile / small tablet — horizontal scroll with chip-style rows */}
      <div className="lg:hidden overflow-x-auto scroll-gold pb-2 -mx-1 px-1">
        <div className="flex items-center gap-2 min-w-max">
          {stageStates.map(({ stage, state }, idx) => (
            <div key={stage.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={onStageClick ? () => onStageClick(stage.id) : undefined}
                disabled={!onStageClick}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1.5 rounded-full border-2 flex-shrink-0 transition-all",
                  state === "completed" &&
                    "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  state === "current" &&
                    "border-gold bg-gold/10 text-gold sgtx-pulse-glow",
                  state === "blocked" &&
                    "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
                  state === "future" &&
                    "border-border bg-muted/20 text-muted-foreground/60",
                  onStageClick && "sgtx-hover-lift",
                )}
                aria-label={`Stage ${idx + 1}: ${stage.label} — ${state}`}
                title={`#${idx + 1} · ${stage.label} · ${state.toUpperCase()}`}
              >
                <span className="text-[0.55rem] font-semibold tabular-nums opacity-70">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {state === "completed" ? (
                  <Check className="w-3 h-3" strokeWidth={3} />
                ) : state === "blocked" ? (
                  <X className="w-3 h-3" strokeWidth={3} />
                ) : state === "current" ? (
                  <Circle className="w-2 h-2 fill-gold/60" />
                ) : null}
                <span className="text-[0.6rem] font-medium whitespace-nowrap">
                  {stage.shortLabel}
                </span>
              </button>
              {idx < TRADE_LIFECYCLE_STAGES_36.length - 1 && (
                <div
                  className={cn(
                    "h-px w-3 transition-colors",
                    state === "completed" ? "bg-emerald-500/60" : "bg-border/40",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[0.65rem] text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
          Completed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gold sgtx-pulse-glow" />
          Current
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/60" />
          Blocked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full border border-border bg-muted/30" />
          Pending
        </span>
        <span className="ml-auto text-muted-foreground/70">
          {completedSet.size} / {TRADE_LIFECYCLE_STAGES_36.length} stages complete
          {currentStage && ` · current: ${currentStage}`}
        </span>
      </div>
    </div>
  );
}

export default TradeLifecycleVisualizer;
