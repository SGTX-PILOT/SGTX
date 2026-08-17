"use client";

// SGTX Seller Delta 3 — Contract Readiness Panel (CCL-005)
// A sticky sidebar checklist showing pre-lock contract conditions.
// States: READY / ACTION_REQUIRED / BLOCKED
// Each item deep-links to the responsible workflow.

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileCheck, CheckCircle2, AlertCircle, XCircle, Circle } from "lucide-react";
import { calculateContractReadiness, type ContractReadinessInput } from "@/lib/sgtx/seller/contract-readiness";

const STATE_ICON: Record<string, { Icon: any; color: string }> = {
  READY: { Icon: CheckCircle2, color: "#10b981" },
  ACTION_REQUIRED: { Icon: AlertCircle, color: "#f59e0b" },
  BLOCKED: { Icon: XCircle, color: "#ef4444" },
  NOT_APPLICABLE: { Icon: Circle, color: "#94a3b8" },
};

export function ContractReadinessPanel({
  input,
  onNavigate,
  className = "",
}: {
  input: ContractReadinessInput;
  onNavigate?: (tab: string) => void;
  className?: string;
}) {
  const result = calculateContractReadiness(input);

  const overallColor =
    result.overallState === "READY" ? "#10b981"
    : result.overallState === "ACTION_REQUIRED" ? "#f59e0b"
    : "#ef4444";

  return (
    <Card className={`p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <FileCheck className="w-3.5 h-3.5 text-gold flex-shrink-0" />
        <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Contract Readiness</p>
        <Badge variant="outline" className="ml-auto text-[0.5rem] text-muted-foreground">
          {result.readyCount}/{result.items.length}
        </Badge>
      </div>

      <div
        className="p-2 rounded-md text-[0.65rem] font-semibold mb-2.5 leading-tight"
        style={{ background: `${overallColor}15`, color: overallColor, border: `1px solid ${overallColor}40` }}
        aria-live="polite"
      >
        {result.summary}
      </div>

      <div className="space-y-1.5 max-h-[480px] overflow-y-auto scroll-gold pr-0.5">
        {result.items.map((item) => {
          const palette = STATE_ICON[item.state] || STATE_ICON.NOT_APPLICABLE;
          const Icon = palette.Icon;
          return (
            <div
              key={item.key}
              className="p-1.5 rounded border"
              style={{ borderColor: `${palette.color}20` }}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: palette.color }} aria-hidden="true" />
                <p className="text-[0.65rem] font-medium flex-1 leading-tight">{item.label}</p>
                <span
                  className="text-[0.5rem] uppercase font-bold tracking-wider"
                  style={{ color: palette.color }}
                >
                  {item.state.replace("_", " ")}
                </span>
              </div>
              {item.detail && (
                <p className="text-[0.55rem] text-muted-foreground mt-0.5 ml-4 leading-tight">{item.detail}</p>
              )}
              {item.actionLabel && onNavigate && (
                <button
                  onClick={() => {
                    // Deep-link mapping
                    const tabMap: Record<string, string> = {
                      exwPrice: "quote-builder",
                      packing: "quote-builder",
                      logistics: "quote-builder",
                      capacity: "quote-builder",
                      addenda: "contract",
                      documents: "documents",
                      qc: "qc-booking",
                      lab: "lab-selection",
                      customs: "customs",
                      insurance: "quote-builder",
                      settlement: "settlement",
                      governor: "contract",
                    };
                    onNavigate(tabMap[item.key] || "contract");
                  }}
                  className="text-[0.55rem] text-gold hover:underline mt-0.5 ml-4 block"
                >
                  → {item.actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {result.governorBlocking && (
        <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/20">
          <p className="text-[0.55rem] font-bold text-destructive">⛔ BLOCKED BY GOVERNOR</p>
          <p className="text-[0.55rem] text-destructive mt-0.5">{result.governorBlocking}</p>
        </div>
      )}
    </Card>
  );
}
