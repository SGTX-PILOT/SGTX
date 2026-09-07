"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  Sparkles,
  Loader2,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ArrowRight,
  Shield,
  Clock,
  FileSearch,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============ AI Loading Guide (Part 3B.3.4.5) ============
export function LoadingGuideWidget({ commodity, containerCount, coldChain }: { commodity: string; containerCount: number; coldChain: boolean }) {
  const [guide, setGuide] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);

  const generate = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/loading-guide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodity, containerCount, coldChain }),
      });
      const d = await res.json();
      setGuide(d.content);
      setProvider(d.provider);
    } catch { setGuide("Loading guide unavailable."); }
    finally { setLoading(false); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-gold" /> AI Loading Guide</h3>
        {provider && <span className="text-[0.55rem] text-muted-foreground">via {provider}</span>}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Generating step-by-step guide…</div>
      ) : guide ? (
        <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{guide}</div>
      ) : (
        <Button size="sm" onClick={generate} variant="outline" className="h-7">🧠 Generate loading guide (A1)</Button>
      )}
    </Card>
  );
}

// ============ Governor Decision Panel (Part 15.4 — PlainLanguage, zero-jargon) ============
//
// This is the v17-aligned rewrite of the original Part 12A.3 panel. It is:
//
//   • Zero-jargon — never exposes OPA / WasmEdge / Loom terminology to the
//     operator. Verdict labels are plain English: "Approved",
//     "Cannot proceed", "Needs attention before proceeding",
//     "Needs human review".
//   • Condition checklist — every check is shown as ❌ (not met) or ✅ (met)
//     with a plain-language description and a one-click "Fix now" button when
//     the condition is actionable.
//   • Request Human Review (A3, 24-hour SLA) — visible for DENY / ESCALATE /
//     REVIEW verdicts, optional on CONDITIONAL.
//   • Resolution timer — when a CONDITIONAL decision has a `deadline`, a live
//     countdown shows the time remaining before auto-escalation to a human.
//   • Confidence + evidence expandable — a `Collapsible` "Why this decision?"
//     disclosure surfaces the confidence percentage, evidence references
//     (clickable when a URL is provided), per-check pass/fail, and a "View
//     audit trail" link that resolves to the Loom verification page using
//     the supplied audit-trail reference (loom hash).
//
// Rendering modes:
//   • Inline Card — when `open` is undefined (default for new v17 callers).
//   • Slide-over panel — when `open` is provided (kept for the legacy
//     slide-over call sites; PortalContent.tsx imports the component for
//     backward compatibility). The zero-jargon body is identical in both.
//
// The component preserves backward compatibility: callers that pass the
// legacy `{ open, onClose, action, verdict, conditions: string[] }` shape
// still work — string conditions are coerced to `GovernorCondition` rows
// with `met: false` and no `actionable` flag.

export type GovernorVerdict =
  | "ALLOW"        // approved
  | "DENY"         // cannot proceed
  | "CONDITIONAL"  // needs attention before proceeding
  | "ESCALATE"     // needs human review
  | "REVIEW";      // legacy alias for ESCALATE

export interface GovernorCondition {
  /** Stable identifier (used to call back into `onRemediate`). */
  id?: string;
  /** Plain-language description shown to the operator. */
  description: string;
  /** ✅ met / ❌ not met. */
  met: boolean;
  /** Can this condition be remediated one-click? Defaults to true when a
   *  remediation label or `onRemediate` is available. */
  actionable?: boolean;
  /** Label for the "Fix now" button, e.g. "Upload document". */
  remediationLabel?: string;
  /** Link to the fix page. When provided, the "Fix now" button is an anchor. */
  remediationHref?: string;
  /** Plain-language check name, e.g. "Policy check", "Sanctions check". */
  check?: string;
}

export interface EvidenceRef {
  id: string;
  label: string;
  /** When provided, the evidence row is an anchor that opens the reference. */
  href?: string;
  status?: "passed" | "failed" | "info";
}

export interface GovernorDecisionPanelProps {
  // ── New v17 PlainLanguage API ────────────────────────────────────────
  /** Stable identifier for this decision (for audit-trail cross-reference). */
  decisionId?: string;
  verdict: GovernorVerdict;
  conditions?: GovernorCondition[];
  /** Pre-generated plain-language explanation. When omitted, the panel calls
   *  `/api/sgtx/ai/tenant-message` (A1 advisory) to produce one. */
  tenantMessage?: string;
  /** Confidence 0-100. Hidden when omitted. */
  confidence?: number;
  /** Evidence references shown in the "Why this decision?" disclosure. */
  evidenceRefs?: EvidenceRef[];
  /** Audit trail reference (Loom hash) — rendered as a monospace code chip and
   *  linked to the public Loom verification page. */
  loomHash?: string;
  /** ISO-8601 deadline for CONDITIONAL verdicts — used by the resolution
   *  timer to show the time remaining before auto-escalation. */
  deadline?: string;
  /** One-click remediation callback. Receives the condition `id`. */
  onRemediate?: (conditionId?: string) => void;
  /** Request Human Review (A3) callback. */
  onRequestHumanReview?: () => void;
  /** Optional override for the "View audit trail" link target. */
  onViewAuditTrail?: () => void;

  // ── Legacy slide-over API (kept for backward compatibility) ──────────
  /** When provided, the panel renders as a slide-over overlay. When omitted,
   *  the panel renders as an inline Card (new v17 default). */
  open?: boolean;
  onClose?: () => void;
  /** Legacy: human-readable name of the action that was evaluated (used for
   *  the AI tenant-message fallback and the panel subtitle). */
  action?: string;
}

// ── Zero-jargon verdict labels ────────────────────────────────────────────────
const VERDICT_LABEL: Record<GovernorVerdict, string> = {
  ALLOW: "Approved",
  DENY: "Cannot proceed",
  CONDITIONAL: "Needs attention before proceeding",
  ESCALATE: "Needs human review",
  REVIEW: "Needs human review",
};

const VERDICT_COLOR: Record<GovernorVerdict, string> = {
  ALLOW: "#10b981",
  CONDITIONAL: "#fbbf24",
  DENY: "#f87171",
  ESCALATE: "#a78bfa",
  REVIEW: "#a78bfa",
};

const VERDICT_ICON: Record<GovernorVerdict, typeof CheckCircle2> = {
  ALLOW: CheckCircle2,
  CONDITIONAL: AlertTriangle,
  DENY: XCircle,
  ESCALATE: Shield,
  REVIEW: Shield,
};

// Defensive jargon sanitiser — strips stale technical tokens from a message
// even if the caller (or an upstream LLM) let them slip through. Idempotent.
function sanitizeJargon(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bOPA policy\b/gi, "policy check")
    .replace(/\bOPA\b/gi, "policy check")
    .replace(/\bWasmEdge module\b/gi, "constitutional check")
    .replace(/\bWasmEdge\b/gi, "constitutional check")
    .replace(/\bLoom hash\b/gi, "audit trail reference")
    .replace(/\bLoom\b/gi, "audit trail")
    .replace(/\bgovernor\b/gi, "the system")
    .replace(/\bverdict\b/gi, "decision")
    .replace(/\bALLOW\b/g, "Approved")
    .replace(/\bDENY\b/g, "Cannot proceed")
    .replace(/\bCONDITIONAL\b/g, "Needs attention")
    .replace(/\bESCALATE\b/g, "Needs human review")
    .replace(/\bREVIEW\b/g, "Needs human review");
}

// Format a millisecond delta as a friendly countdown.
function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return "Auto-escalation triggered";
  const sec = Math.floor(msRemaining / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  if (mins > 0) return `${mins}m remaining`;
  return "less than 1m remaining";
}

// Coerce the legacy `conditions: string[]` shape into the new typed shape so
// the rewrite is backward-compatible with existing callers (the panel was
// imported by PortalContent.tsx even though it was never rendered there).
function normalizeConditions(
  raw: GovernorCondition[] | string[] | undefined,
): GovernorCondition[] {
  if (!raw) return [];
  return raw.map((c, i) =>
    typeof c === "string"
      ? { id: `legacy-${i}`, description: c, met: false }
      : (c as GovernorCondition),
  );
}

export function GovernorDecisionPanel(props: GovernorDecisionPanelProps) {
  const {
    decisionId,
    verdict,
    conditions: rawConditions,
    tenantMessage,
    confidence,
    evidenceRefs = [],
    loomHash,
    deadline,
    onRemediate,
    onRequestHumanReview,
    onViewAuditTrail,
    // legacy
    open,
    onClose,
    action,
  } = props;

  const conditions = normalizeConditions(rawConditions as any);

  // ── AI tenant-message fallback (legacy: when no tenantMessage provided) ──
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const ensureMessage = async () => {
    if (tenantMessage || aiMessage || aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/tenant-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action || decisionId || "Governor decision",
          verdict,
          conditions: conditions.map((c) => c.description),
        }),
      });
      const d = await res.json();
      setAiMessage(d.content);
      setAiProvider(d.provider);
    } catch {
      setAiMessage("Unable to generate an explanation at this time. Please retry or request a human review.");
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-generate the AI explanation once when no `tenantMessage` is supplied
  // and the panel is being shown (open !== false in legacy mode, or any
  // inline mode where `action`/`decisionId` is available).
  useEffect(() => {
    if (!tenantMessage && open !== false && (action || decisionId)) {
      void ensureMessage();
    }
    // `ensureMessage` is a stable-enough closure (only reads state via local
    // refs already in the deps array) — intentionally not in the dep list.
  }, [tenantMessage, action, decisionId, open]);

  // ── Resolution timer for CONDITIONAL with a deadline ────────────────
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const verdictColor = VERDICT_COLOR[verdict] || "#6b7280";
  const verdictLabel = VERDICT_LABEL[verdict] || "Decision pending";
  const VerdictIcon = VERDICT_ICON[verdict] || AlertTriangle;
  const isBlockedOrReview =
    verdict === "DENY" || verdict === "ESCALATE" || verdict === "REVIEW";
  const isConditional = verdict === "CONDITIONAL";
  const message = tenantMessage
    ? sanitizeJargon(tenantMessage)
    : aiMessage
      ? sanitizeJargon(aiMessage)
      : null;

  const msRemaining = deadline ? new Date(deadline).getTime() - now : 0;
  const deadlineActive = isConditional && !!deadline && msRemaining > 0;
  const deadlineExpired = isConditional && !!deadline && msRemaining <= 0;
  const metCount = conditions.filter((c) => c.met).length;

  // ── Body — used by both inline Card and slide-over modes ─────────────
  const body = (
    <div className="space-y-4">
      {/* Decision headline */}
      <div
        className="rounded-lg border p-3"
        style={{ borderColor: `${verdictColor}40`, background: `${verdictColor}10` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${verdictColor}1a` }}
          >
            <VerdictIcon className="w-5 h-5" style={{ color: verdictColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: verdictColor }}>
              {verdictLabel}
            </p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              SGTX decision
              {decisionId ? ` · ${decisionId}` : ""}
              {action ? ` · ${action}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Plain-language explanation */}
      <div>
        <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1.5">
          What this means for you
        </p>
        {message ? (
          <p className="text-sm text-foreground/90 leading-relaxed">{message}</p>
        ) : aiLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Writing a plain-language explanation…
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isBlockedOrReview
              ? "The system has stopped this action to keep your trade compliant. Request a human review if you believe this is wrong."
              : isConditional
                ? "The system can approve this once the items below are resolved."
                : "The system has approved this action."}
          </p>
        )}
        {aiProvider && !tenantMessage && aiMessage && (
          <p className="text-[0.55rem] text-muted-foreground mt-1">via {aiProvider}</p>
        )}
      </div>

      {/* Resolution timer (CONDITIONAL with deadline) */}
      {(deadlineActive || deadlineExpired) && (
        <Alert variant={deadlineExpired ? "destructive" : "default"} className="py-2.5">
          <Clock className="w-4 h-4" />
          <AlertTitle className="text-xs font-semibold">
            {deadlineExpired ? "Auto-escalation triggered" : "Auto-escalation timer"}
          </AlertTitle>
          <AlertDescription className="text-[0.7rem]">
            {deadlineExpired
              ? "This decision has been escalated to a human reviewer because the conditions were not resolved in time."
              : `${formatCountdown(msRemaining)} — then escalated to a human reviewer (24-hour response SLA).`}
          </AlertDescription>
        </Alert>
      )}

      {/* Condition checklist */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.65rem] tracking-widest text-muted-foreground uppercase font-semibold">
            Checklist
          </p>
          {conditions.length > 0 && (
            <span className="text-[0.6rem] text-muted-foreground/70">
              {metCount}/{conditions.length} met
            </span>
          )}
        </div>
        {conditions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No specific checklist items — manual review required.
          </p>
        ) : (
          <ul className="space-y-2">
            {conditions.map((c, i) => {
              const Icon = c.met ? CheckCircle2 : XCircle;
              const iconColor = c.met ? "#10b981" : "#f87171";
              const canRemediate =
                !c.met &&
                c.actionable !== false &&
                (!!(c.remediationLabel || c.remediationHref) || !!onRemediate);
              const fixLabel = c.remediationLabel || "Fix now";
              return (
                <li
                  key={c.id || i}
                  className="rounded-lg border border-border bg-card/40 p-2.5"
                >
                  <div className="flex items-start gap-2">
                    <Icon
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      style={{ color: iconColor }}
                    />
                    <div className="flex-1 min-w-0">
                      {c.check && (
                        <p className="text-[0.55rem] text-muted-foreground/70 uppercase tracking-wider mb-0.5">
                          {c.check}
                        </p>
                      )}
                      <p className="text-xs text-foreground leading-snug">
                        {c.description}
                      </p>
                      {canRemediate && (
                        <div className="mt-2 flex items-center gap-2">
                          {c.remediationHref ? (
                            <a
                              href={c.remediationHref}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.65rem] font-medium text-foreground bg-gold/10 border border-gold/30 hover:bg-gold/20 transition"
                            >
                              {fixLabel}
                              <ArrowRight className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRemediate?.(c.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.65rem] font-medium text-foreground bg-gold/10 border border-gold/30 hover:bg-gold/20 transition"
                            >
                              {fixLabel}
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Why this decision? (expandable confidence + evidence) */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-gold transition w-full py-1">
          <FileSearch className="w-3.5 h-3.5 text-muted-foreground" />
          Why this decision?
          <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">
          {/* Confidence */}
          {typeof confidence === "number" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                  Confidence
                </p>
                <span className="text-xs font-semibold tabular-nums">
                  {Math.round(confidence)}%
                </span>
              </div>
              <Progress
                value={Math.max(0, Math.min(100, confidence))}
                className="h-1.5"
              />
            </div>
          )}

          {/* Evidence references */}
          {evidenceRefs.length > 0 && (
            <div>
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-1.5">
                Evidence
              </p>
              <ul className="space-y-1">
                {evidenceRefs.map((e) => {
                  const Icon =
                    e.status === "passed"
                      ? CheckCircle2
                      : e.status === "failed"
                        ? XCircle
                        : FileSearch;
                  const iconColor =
                    e.status === "passed"
                      ? "#10b981"
                      : e.status === "failed"
                        ? "#f87171"
                        : "#6b7280";
                  const inner = (
                    <>
                      <Icon
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: iconColor }}
                      />
                      <span className="text-xs text-foreground">{e.label}</span>
                      {e.href && (
                        <ExternalLink className="w-2.5 h-2.5 text-muted-foreground ml-1" />
                      )}
                    </>
                  );
                  return (
                    <li key={e.id} className="flex items-center gap-2 py-0.5">
                      {e.href ? (
                        <a
                          href={e.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          {inner}
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-2">{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Audit trail reference */}
          {loomHash && (
            <div className="pt-2 border-t border-border/60">
              <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-1.5">
                Audit trail reference
              </p>
              <div className="flex items-center justify-between gap-2">
                <code className="text-[0.65rem] text-foreground/70 font-mono bg-muted/40 px-2 py-1 rounded truncate max-w-[60%]">
                  {loomHash}
                </code>
                {onViewAuditTrail ? (
                  <button
                    type="button"
                    onClick={onViewAuditTrail}
                    className="text-[0.65rem] text-gold hover:underline flex items-center gap-1 flex-shrink-0"
                  >
                    View audit trail <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                ) : (
                  <a
                    href={`/trust?loom=${encodeURIComponent(loomHash)}`}
                    className="text-[0.65rem] text-gold hover:underline flex items-center gap-1 flex-shrink-0"
                  >
                    View audit trail <ArrowRight className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {!loomHash && evidenceRefs.length === 0 && typeof confidence !== "number" && (
            <p className="text-[0.65rem] text-muted-foreground">
              No additional evidence available for this decision.
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {isBlockedOrReview && (
          <Button
            size="sm"
            onClick={() => onRequestHumanReview?.()}
            className="h-8"
            style={{ background: verdictColor, color: "#fff" }}
          >
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Request human review
          </Button>
        )}
        {isConditional && (
          <Button
            size="sm"
            onClick={() => onRequestHumanReview?.()}
            variant="outline"
            className="h-8"
          >
            <Shield className="w-3.5 h-3.5 mr-1.5" />
            Request human review
          </Button>
        )}
      </div>
      {isBlockedOrReview && (
        <p className="text-[0.6rem] text-muted-foreground">
          A human reviewer will respond within{" "}
          <span className="font-semibold">24 hours</span>.
        </p>
      )}

      {/* Non-marketplace guardrail */}
      <p className="text-[0.55rem] text-muted-foreground/70 text-center pt-1">
        The system never suggests alternative counterparties.
      </p>
    </div>
  );

  // ── Inline Card mode (new v17 PlainLanguage default) ────────────────
  if (open === undefined) {
    return (
      <Card className="p-5 gap-0">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Governor Decision</h3>
          <p className="text-[0.65rem] text-muted-foreground">
            What this decision means and what to do next.
          </p>
        </div>
        {body}
      </Card>
    );
  }

  // ── Legacy slide-over mode (kept for backward compatibility) ────────
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[30rem] bg-card border-l border-border z-50 flex flex-col"
          >
            <div className="h-16 flex items-center justify-between px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${verdictColor}1a` }}
                >
                  <VerdictIcon className="w-4 h-4" style={{ color: verdictColor }} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{verdictLabel}</h3>
                  <p className="text-[0.6rem] text-muted-foreground">
                    SGTX decision
                    {decisionId ? ` · ${decisionId}` : ""}
                  </p>
                </div>
              </div>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-5 scroll-gold">{body}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============ AI Inference Log Screen (Part 1.4 — ai_inference_records) ============
export function InferenceLogScreen() {
  const [records, setRecords] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/inference-log");
      const d = await res.json();
      setRecords(d);
    } catch { setRecords([]); }
    finally { setLoading(false); }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> AI Inference Records</h3>
        <Button size="sm" onClick={load} variant="outline" className="h-7">{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}</Button>
      </div>
      {records === null ? (
        <p className="text-xs text-muted-foreground">Click "Refresh" to load recent AI inference records (Part 1.4 — ai_inference_records table).</p>
      ) : records.length === 0 ? (
        <p className="text-xs text-muted-foreground">No AI calls recorded yet. Use AI features to populate the log.</p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto scroll-gold">
          {records.map((r, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${r.success ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="font-mono text-[0.6rem] text-muted-foreground w-32 truncate">{r.agent_name}</span>
              <Badge variant="outline" className="text-[0.55rem] h-4 px-1">{r.authority_level}</Badge>
              <span className="text-[0.6rem] text-muted-foreground w-20">{r.provider}</span>
              <span className="text-[0.6rem] text-muted-foreground ml-auto">{r.latency_ms}ms</span>
              {r.fallback_used && <Badge variant="outline" className="text-[0.55rem] h-4 px-1 text-amber-400 border-amber-500/30">fallback</Badge>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
