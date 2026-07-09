"use client";

/**
 * BrainDecisionPanel — SGTX Brain AI Decision Display (FIX-8 / FIX-10)
 * ====================================================================
 *
 * Renders the verdict of the SGTX Brain AI (the `autoCheckCompliance`
 * pre-screen module or any other Brain module that returns a
 * `BrainPrescreenResult`-shaped object) on a mutation that has just been
 * attempted. Used by:
 *
 *   • The Contract Signing screen (FIX-8b) — when the user clicks
 *     "Sign with passkey", the BrainDecisionPanel renders the
 *     `brainVerdict` / `brainConditions` returned by
 *     `/api/sgtx/contract/sign` (which is wrapped in
 *     `withBrainPrescreen(autoCheckCompliance, ...)`).
 *   • The Trade Request wizard's Compliance Gates step (FIX-10) — when
 *     the user runs the compliance pre-check, the panel renders the
 *     overall verdict so the buyer can see the Brain's view of the
 *     trade BEFORE submission.
 *
 * Surface contract:
 *   verdict       — "ALLOW" | "CONDITIONAL" | "DENY"
 *   aiConfidence  — Brain confidence in [0,1] (optional; shown with a
 *                   small progress bar).
 *   brainModule   — e.g. "autoCheckCompliance" (optional; informational).
 *   conditions    — list of { condition_id, label, status: met|unmet }
 *                   conditions the Brain checked (optional).
 *   rationale     — plain-language rationale string (optional; when
 *                   absent the panel synthesizes a sensible default from
 *                   the verdict + conditions).
 *
 * The panel is COLLAPSIBLE — the whole card collapses to a single
 * summary line. This is the default behaviour for ALLOW verdicts
 * (`defaultCollapsed` prop, but callers can override). DENY verdicts
 * are shown expanded and prominent (the contract is blocked).
 *
 * Styling follows the SGTX gold/dark theme:
 *   • Card border tinted with the verdict colour.
 *   • Verdict badge — emerald (ALLOW), amber (CONDITIONAL), red (DENY).
 *   • Brain icon + "SGTX Brain AI Decision" header in gold.
 *   • Conditions list with ✓ (met, emerald) / ⚠ (unmet, amber) icons.
 *   • "Why this matters" expandable explanation row.
 */

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface BrainCondition {
  condition_id: string;
  label: string;
  status: "met" | "unmet";
}

export interface BrainDecision {
  verdict: "ALLOW" | "DENY" | "CONDITIONAL";
  aiConfidence?: number;
  brainModule?: string;
  conditions?: BrainCondition[];
  rationale?: string;
  /** Optional — when the Brain denied, the human-readable denial reason. */
  denialReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict helpers
// ─────────────────────────────────────────────────────────────────────────────

type VerdictStyle = {
  /** Tailwind text colour class for the verdict label + icons. */
  text: string;
  /** Inline border colour for the Card (semi-transparent). */
  border: string;
  /** Inline background tint for the Card. */
  bg: string;
  /** Badge background + text classes. */
  badgeClass: string;
  /** Lucide icon component for the verdict. */
  Icon: typeof CheckCircle2;
  /** One-word human label for the verdict. */
  label: string;
};

function verdictStyle(verdict: BrainDecision["verdict"]): VerdictStyle {
  switch (verdict) {
    case "ALLOW":
      return {
        text: "text-success",
        border: "rgba(16, 185, 129, 0.35)",
        bg: "rgba(16, 185, 129, 0.05)",
        badgeClass:
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        Icon: CheckCircle2,
        label: "Allow",
      };
    case "CONDITIONAL":
      return {
        text: "text-warning",
        border: "rgba(245, 158, 11, 0.40)",
        bg: "rgba(245, 158, 11, 0.06)",
        badgeClass:
          "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        Icon: AlertTriangle,
        label: "Conditional",
      };
    case "DENY":
    default:
      return {
        text: "text-destructive",
        border: "rgba(239, 68, 68, 0.45)",
        bg: "rgba(239, 68, 68, 0.06)",
        badgeClass:
          "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
        Icon: XCircle,
        label: "Deny",
      };
  }
}

/** Synthesize a plain-language rationale from the verdict + conditions
 *  when the caller did not provide one. */
function synthesizeRationale(decision: BrainDecision): string {
  const met = (decision.conditions || []).filter((c) => c.status === "met");
  const unmet = (decision.conditions || []).filter((c) => c.status === "unmet");
  switch (decision.verdict) {
    case "ALLOW":
      if (met.length === 0 && unmet.length === 0) {
        return "The SGTX Brain AI reviewed this action against the active compliance gates (sanctions, force majeure, EUDR, CBAM, FTA) and found no blockers. The action may proceed.";
      }
      return `The SGTX Brain AI cleared this action — ${met.length} compliance condition${
        met.length === 1 ? "" : "s"
      } verified${unmet.length > 0 ? `; ${unmet.length} advisory note${unmet.length === 1 ? "" : "s"} attached` : ""}. The action may proceed.`;
    case "CONDITIONAL":
      return `The SGTX Brain AI flagged ${unmet.length} unmet condition${
        unmet.length === 1 ? "" : "s"
      } that must be resolved before this trade can be cleared unconditionally. The action may proceed, but the trade will carry the attached conditions on its audit trail and downstream gates (B/L issuance, customs clearance, settlement) may require additional evidence.`;
    case "DENY":
      return (
        decision.denialReason ||
        `The SGTX Brain AI blocked this action. ${unmet.length} blocking condition${
          unmet.length === 1 ? "" : "s"
        } remain unresolved. The action cannot proceed until each blocking condition is cleared and the Brain is re-run.`
      );
  }
}

/** Synthesize a "why this matters" explanation for the verdict. */
function synthesizeWhy(decision: BrainDecision): string {
  switch (decision.verdict) {
    case "ALLOW":
      return "An ALLOW verdict means the Brain's compliance modules (sanctions screening, force majeure corridor assessment, EUDR Annex I scope, CBAM Annex I scope, and FTA / duty lookup) all passed without raising a blocking condition. The mutation proceeds normally. ALLOW verdicts are still recorded on the trade's audit trail so downstream regulators can verify the Brain's gate ran.";
    case "CONDITIONAL":
      return "A CONDITIONAL verdict means at least one compliance module flagged an unmet condition. The mutation is permitted to proceed (the contract can be signed, the trade request can be submitted) but the conditions are stamped on the trade's Activity feed and may block downstream gates — for example, B/L issuance may be refused until EUDR geo-location polygons are uploaded, or customs clearance may be withheld until a CBAM carbon declaration is filed.";
    case "DENY":
      return "A DENY verdict is the Brain's hard block — the mutation does not execute and no database writes occur. DENY is reserved for high-confidence blockers: a sanctions hit on a counterparty (OFAC SDN / EU Consolidated / UK OFSI / UN 1267), a catastrophic force majeure event on the trade corridor (war, port closure), or any condition the Brain rates as fundamentally incompatible with the platform's compliance posture. The denial is signed and recorded for audit; the operator must clear the underlying issue and re-run the Brain before retrying.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function BrainDecisionPanel({
  decision,
  /** When true, the panel renders as a single summary line until clicked.
   *  Defaults to: collapsed for ALLOW, expanded for CONDITIONAL / DENY. */
  defaultCollapsed,
  /** Optional title override. Defaults to "SGTX Brain AI Decision". */
  title = "SGTX Brain AI Decision",
  /** Optional — small caption shown beneath the title (e.g. "Pre-contract
   *  compliance gate"). */
  subtitle,
}: {
  decision: BrainDecision;
  defaultCollapsed?: boolean;
  title?: string;
  subtitle?: string;
}) {
  // ALLOW collapses by default (it's a green-light, just a summary needed).
  // CONDITIONAL + DENY expand by default (the user must see the conditions).
  const [collapsed, setCollapsed] = useState(
    defaultCollapsed ?? decision.verdict === "ALLOW",
  );
  const [showWhy, setShowWhy] = useState(false);

  const style = verdictStyle(decision.verdict);
  const { Icon } = style;

  const confidencePct = useMemo(() => {
    if (typeof decision.aiConfidence !== "number") return null;
    return Math.round(Math.max(0, Math.min(1, decision.aiConfidence)) * 100);
  }, [decision.aiConfidence]);

  const rationale =
    decision.rationale?.trim() || synthesizeRationale(decision);
  const why = synthesizeWhy(decision);

  const conditions = decision.conditions || [];
  const metCount = conditions.filter((c) => c.status === "met").length;
  const unmetCount = conditions.filter((c) => c.status === "unmet").length;

  return (
    <Card
      className="p-4 transition-colors"
      style={{
        borderColor: style.border,
        background: style.bg,
      }}
    >
      {/* ── Header row — always visible (collapsed + expanded) ────────── */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 rounded-md"
        aria-expanded={!collapsed}
        aria-controls="brain-decision-panel-body"
      >
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, oklch(0.90 0.10 90) 0%, oklch(0.62 0.13 70) 100%)" }}
        >
          <Brain className="w-4 h-4 text-sovereign" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <Badge
              variant="outline"
              className={`text-[0.6rem] uppercase tracking-wide font-bold ${style.badgeClass}`}
            >
              <Icon className="w-3 h-3 mr-1" />
              {style.label}
            </Badge>
            {decision.brainModule && (
              <span className="text-[0.6rem] text-muted-foreground font-mono">
                · {decision.brainModule}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[0.6rem] text-muted-foreground mt-0.5">{subtitle}</p>
          )}
          {/* Inline confidence meter — collapsed view shows this in the header so
              the operator sees the Brain's confidence without expanding. */}
          {confidencePct !== null && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[0.55rem] text-muted-foreground whitespace-nowrap">
                AI confidence
              </span>
              <Progress
                value={confidencePct}
                className="h-1.5 max-w-[140px]"
              />
              <span className={`text-[0.6rem] font-semibold ${style.text}`}>
                {confidencePct}%
              </span>
            </div>
          )}
        </div>
        {/* Collapse / expand chevron */}
        <span className="text-muted-foreground flex-shrink-0">
          {collapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* ── Collapsed summary line ──────────────────────────────────────── */}
      {collapsed && (
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`w-3.5 h-3.5 ${style.text}`} />
          <span className="truncate">
            {decision.verdict === "ALLOW" && conditions.length > 0
              ? `${conditions.length} compliance check${conditions.length === 1 ? "" : "s"} passed — no blockers.`
              : decision.verdict === "CONDITIONAL"
                ? `${unmetCount} condition${unmetCount === 1 ? "" : "s"} require attention before downstream gates clear.`
                : decision.verdict === "DENY"
                  ? decision.denialReason ||
                    `Blocked — ${unmetCount} hard condition${unmetCount === 1 ? "" : "s"} unmet.`
                  : "Brain verdict rendered."}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(false);
            }}
            className="ml-auto text-[0.6rem] text-gold hover:underline whitespace-nowrap"
          >
            Details
          </button>
        </div>
      )}

      {/* ── Expanded body ──────────────────────────────────────────────── */}
      {!collapsed && (
        <div id="brain-decision-panel-body" className="mt-3 space-y-3">
          {/* Rationale */}
          <div className="rounded-md bg-background/50 border border-border/60 p-2.5">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-gold" /> Brain rationale
            </p>
            <p className="text-xs text-foreground/90 leading-relaxed">{rationale}</p>
          </div>

          {/* Conditions checklist */}
          {conditions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">
                  Conditions ({conditions.length})
                </p>
                <p className="text-[0.55rem] text-muted-foreground">
                  <span className="text-success font-semibold">{metCount} met</span>
                  {" · "}
                  <span className="text-warning font-semibold">{unmetCount} unmet</span>
                </p>
              </div>
              <ul className="space-y-1 max-h-56 overflow-y-auto scroll-gold pr-1">
                {conditions.map((c) => {
                  const isMet = c.status === "met";
                  return (
                    <li
                      key={c.condition_id}
                      className={`flex items-start gap-2 rounded-md border p-2 text-xs ${
                        isMet
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-amber-500/25 bg-amber-500/5"
                      }`}
                    >
                      {isMet ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground/90 leading-snug">{c.label}</p>
                        <p className="text-[0.55rem] text-muted-foreground font-mono mt-0.5">
                          {c.condition_id} · {isMet ? "met" : "unmet"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Denial reason callout (DENY only) */}
          {decision.verdict === "DENY" && decision.denialReason && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5">
              <p className="text-[0.6rem] tracking-widest text-destructive uppercase font-semibold mb-1 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Denial reason
              </p>
              <p className="text-xs text-foreground/90 leading-relaxed">
                {decision.denialReason}
              </p>
            </div>
          )}

          {/* Why this matters — expandable */}
          <div className="rounded-md border border-border/60">
            <button
              type="button"
              onClick={() => setShowWhy((s) => !s)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left"
              aria-expanded={showWhy}
            >
              <span className="text-[0.65rem] font-semibold text-gold flex items-center gap-1">
                <Brain className="w-3 h-3" /> Why this matters
              </span>
              {showWhy ? (
                <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
            {showWhy && (
              <div className="px-2.5 pb-2.5">
                <p className="text-[0.7rem] text-muted-foreground leading-relaxed">
                  {why}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default BrainDecisionPanel;
