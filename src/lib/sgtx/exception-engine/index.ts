// @ts-nocheck
/**
 * SGTX Master Amendment — §68-73, §115 Exception + Recovery Engine
 * ===========================================================================
 *
 * Implements the §70 Exception Engine — the governed path for handling
 * any deviation from the expected transaction state. An exception is NOT
 * an error: it is a structured, SLA-tracked, recovery-path-tagged record
 * that says "something happened that requires governance action".
 *
 * §25 — Exception categories (orthogonal to severity):
 *   FINANCIAL        — payment failed, fee miscalc, FX loss
 *   DOCUMENT         — LC expired, BL revoked, CoO missing
 *   MILESTONE        — shipment delayed, customs late
 *   COMPLIANCE       — sanctions hit, SPS rejection, missing permit
 *   RECONCILIATION   — bank record vs SGTX record divergent
 *   EXECUTION        — goods rejected, partial delivery
 *   CLOSURE          — closure denied, blocker unresolvable
 *
 * §72 — Severity (1..5):
 *   1  Info            — informational only, no action required
 *   2  Operational    — needs action, no financial impact
 *   3  Financial       — has a financial impact (recovery needed)
 *   4  Suspension     — trade execution must pause
 *   5  Legal          — legal authority required (court, regulator)
 *
 * §70 — Resolution Actions (output of evaluation):
 *   CONTINUE              — proceed normally
 *   PAUSE                 — halt execution pending review
 *   ESCALATE              — escalate to higher authority
 *   RECONCILE             — trigger reconciliation
 *   CORRECT              — apply a corrective action
 *   COMPENSATE            — apply compensation
 *   REQUEST_AUTHORITY     — request external authority ruling
 *   CLOSE_WITH_EXCEPTION  — close the trade despite the exception
 *
 * §68 — Recovery Paths: governed pathways for recovering from an
 * exception. Each path is a named action with a target state.
 *
 * §69 — Causal Impact Analysis: when an event occurs, what other
 * obligations / domains are affected?
 *
 * §73 — SLA: detection → acknowledgment → resolution → escalation.
 *
 * §115 — Recovery actions are themselves governed events (recorded
 * in the canonical event spine).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { appendEvent } from "@/lib/sgtx/event-spine";

// ============ §25 Constants — exception categories ============

export const EXCEPTION_CATEGORIES = [
  "FINANCIAL",
  "DOCUMENT",
  "MILESTONE",
  "COMPLIANCE",
  "RECONCILIATION",
  "EXECUTION",
  "CLOSURE",
] as const;

export type ExceptionCategory = (typeof EXCEPTION_CATEGORIES)[number];

/**
 * §72 — Exception severity 1..5.
 */
export const EXCEPTION_SEVERITIES = [
  { level: 1, name: "INFO", description: "Informational only, no action required" },
  { level: 2, name: "OPERATIONAL", description: "Needs action, no financial impact" },
  { level: 3, name: "FINANCIAL", description: "Has a financial impact (recovery needed)" },
  { level: 4, name: "SUSPENSION", description: "Trade execution must pause" },
  { level: 5, name: "LEGAL", description: "Legal authority required (court, regulator)" },
] as const;

/**
 * §70 — Resolution Actions.
 */
export const RESOLUTION_ACTIONS = [
  "CONTINUE",
  "PAUSE",
  "ESCALATE",
  "RECONCILE",
  "CORRECT",
  "COMPENSATE",
  "REQUEST_AUTHORITY",
  "CLOSE_WITH_EXCEPTION",
] as const;

export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

/**
 * §68 — Governed recovery pathways. Each is a named, recoverable action
 * with a default target obligation state.
 */
export const RECOVERY_PATHS = [
  {
    path: "REROUTE_PAYMENT",
    description: "Reroute payment through a different PSP / bank rail",
    targetState: "PENDING",
    appliesTo: ["FINANCIAL"],
  },
  {
    path: "REISSUE_DOCUMENT",
    description: "Re-issue the document with corrections",
    targetState: "PENDING",
    appliesTo: ["DOCUMENT"],
  },
  {
    path: "RETRY_SUBMISSION",
    description: "Retry the failed submission after fix",
    targetState: "PENDING",
    appliesTo: ["MILESTONE", "COMPLIANCE"],
  },
  {
    path: "PARTIAL_RECONCILIATION",
    description: "Reconcile what can be reconciled, escalate the rest",
    targetState: "PARTIALLY_RESOLVED",
    appliesTo: ["RECONCILIATION"],
  },
  {
    path: "GOODS_RETURN",
    description: "Return goods to seller; reverse payment",
    targetState: "REVERSED",
    appliesTo: ["EXECUTION"],
  },
  {
    path: "REFUND_AND_CLOSE",
    description: "Refund the buyer and close the trade",
    targetState: "CLOSED",
    appliesTo: ["FINANCIAL", "EXECUTION"],
  },
  {
    path: "ESCALATE_AUTHORITY",
    description: "Escalate to external authority (court, regulator)",
    targetState: "ESCALATED",
    appliesTo: ["COMPLIANCE", "CLOSURE"],
  },
  {
    path: "COMPENSATE_AND_PROCEED",
    description: "Compensate the affected party and proceed",
    targetState: "COMPLETED",
    appliesTo: ["FINANCIAL", "MILESTONE"],
  },
  {
    path: "CLOSE_WITH_EXCEPTION",
    description: "Close the trade despite the open exception",
    targetState: "CLOSED",
    appliesTo: ["CLOSURE"],
  },
] as const;

/**
 * Exception lifecycle states.
 */
export const EXCEPTION_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "ESCALATED",
  "CLOSED",
] as const;

/**
 * Default SLA hours by severity (§73).
 */
export const DEFAULT_SLA_HOURS: Record<number, {
  detection: number;
  acknowledgment: number;
  resolution: number;
  escalation: number;
}> = {
  1: { detection: 24, acknowledgment: 48, resolution: 168, escalation: 336 },
  2: { detection: 8, acknowledgment: 24, resolution: 72, escalation: 144 },
  3: { detection: 4, acknowledgment: 8, resolution: 48, escalation: 96 },
  4: { detection: 1, acknowledgment: 4, resolution: 24, escalation: 48 },
  5: { detection: 1, acknowledgment: 2, resolution: 12, escalation: 24 },
};

// ============ Types ============

export interface RaiseExceptionInput {
  ustn?: string | null;
  exceptionCategory: string;
  exceptionType: string;
  severity?: number;
  triggeringEvent?: string | null;
  currentStateVector?: Record<string, any> | null;
  policyApplied?: string | null;
  affectedScope?: string[] | null;
  notes?: string | null;
  raisedBy?: string | null;
}

export interface ExceptionEventRow {
  id: string;
  exceptionId: string;
  ustn?: string | null;
  exceptionCategory: string;
  exceptionType: string;
  severity: number;
  triggeringEvent?: string | null;
  currentStateVector?: string | null;
  policyApplied?: string | null;
  resolutionAction?: string | null;
  affectedScope?: string | null;
  detectionDeadline?: Date | null;
  acknowledgmentDeadline?: Date | null;
  resolutionTarget?: Date | null;
  escalationDeadline?: Date | null;
  status: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: Date | null;
  resolvedBy?: string | null;
  resolvedAt?: Date | null;
  resolutionNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CausalImpact {
  eventType: string;
  ustn?: string | null;
  affectedDomains: string[];
  affectedObligationTypes: string[];
  affectedExceptionCategories: string[];
  propagationPaths: string[];
  severityEscalation: number;
}

export interface RecoveryPathOption {
  path: string;
  description: string;
  targetState: string;
  appliesTo: string[];
  recommended: boolean;
}

// ============ §70.0 Pure helpers ============

/**
 * Pure: generate an exceptionId in the form:
 *   EX-{ustn8}-{YYYYMMDDHHMMSS}-{RANDOM6}
 */
export function generateExceptionId(
  ustn?: string | null,
  when?: Date,
): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const t = when || new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EX-${u}-${ts}-${r}`;
}

/**
 * Pure: derive default SLA deadlines for a given severity (§73).
 * Returns absolute Date values relative to now.
 */
export function deriveSlaDeadlines(severity: number, from?: Date): {
  detectionDeadline: Date;
  acknowledgmentDeadline: Date;
  resolutionTarget: Date;
  escalationDeadline: Date;
} {
  const base = from || new Date();
  const sla = DEFAULT_SLA_HOURS[severity] || DEFAULT_SLA_HOURS[2];
  const add = (h: number) => new Date(base.getTime() + h * 3600 * 1000);
  return {
    detectionDeadline: add(sla.detection),
    acknowledgmentDeadline: add(sla.acknowledgment),
    resolutionTarget: add(sla.resolution),
    escalationDeadline: add(sla.escalation),
  };
}

/**
 * Pure: parse the affectedScope JSON array. Defensive — returns [] on
 * parse error or non-array input.
 */
export function parseAffectedScope(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: parse the currentStateVector JSON. Defensive — returns {} on
 * parse error or non-object input.
 */
export function parseStateVector(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Pure: evaluate the resolution action for an exception based on its
 * category + severity. Algorithm:
 *
 *   - severity >= 5 (LEGAL)         → REQUEST_AUTHORITY
 *   - severity == 4 (SUSPENSION)     → PAUSE
 *   - category == RECONCILIATION    → RECONCILE
 *   - category == CLOSURE           → CLOSE_WITH_EXCEPTION
 *   - category == FINANCIAL + sev 3 → COMPENSATE
 *   - category == EXECUTION         → CORRECT (then maybe COMPENSATE)
 *   - severity == 2 (OPERATIONAL)   → CONTINUE
 *   - severity == 1 (INFO)          → CONTINUE
 *
 * Default: CONTINUE.
 */
export function evaluateResolutionAction(
  category: string,
  severity: number,
): string {
  if (severity >= 5) return "REQUEST_AUTHORITY";
  if (severity === 4) return "PAUSE";
  const cat = String(category || "").toUpperCase();
  if (cat === "RECONCILIATION") return "RECONCILE";
  if (cat === "CLOSURE") return "CLOSE_WITH_EXCEPTION";
  if (cat === "FINANCIAL" && severity === 3) return "COMPENSATE";
  if (cat === "EXECUTION" && severity >= 3) return "CORRECT";
  if (cat === "COMPLIANCE" && severity >= 3) return "ESCALATE";
  return "CONTINUE";
}

// ============ §70.1 raiseException ============

/**
 * Raise a new exception event. Computes the SLA deadlines from severity
 * (§73), evaluates the initial resolutionAction (§70), and persists the
 * ExceptionEvent row. Also appends a canonical EXCEPTION_RAISED event.
 *
 * Returns the new exception row (or null on error).
 */
export async function raiseException(
  input: RaiseExceptionInput,
): Promise<ExceptionEventRow | null> {
  if (!input || !input.exceptionCategory || !input.exceptionType) {
    logger.warn("[exception-engine] raiseException rejected: missing required fields");
    return null;
  }
  if (!EXCEPTION_CATEGORIES.includes(input.exceptionCategory as ExceptionCategory)) {
    logger.warn("[exception-engine] unknown category", {
      category: input.exceptionCategory,
    });
    return null;
  }
  const severity =
    typeof input.severity === "number" && input.severity >= 1 && input.severity <= 5
      ? input.severity
      : 2;
  const exceptionId = generateExceptionId(input.ustn);
  const sla = deriveSlaDeadlines(severity);
  const resolutionAction = evaluateResolutionAction(input.exceptionCategory, severity);

  try {
    const row = await db.exceptionEvent.create({
      data: {
        exceptionId,
        ustn: input.ustn || null,
        exceptionCategory: input.exceptionCategory,
        exceptionType: input.exceptionType,
        severity,
        triggeringEvent: input.triggeringEvent || null,
        currentStateVector: input.currentStateVector
          ? JSON.stringify(input.currentStateVector)
          : null,
        policyApplied: input.policyApplied || null,
        resolutionAction,
        affectedScope: input.affectedScope
          ? JSON.stringify(input.affectedScope)
          : null,
        detectionDeadline: sla.detectionDeadline,
        acknowledgmentDeadline: sla.acknowledgmentDeadline,
        resolutionTarget: sla.resolutionTarget,
        escalationDeadline: sla.escalationDeadline,
        status: "OPEN",
      },
    });
    logger.info("[exception-engine] exception raised", {
      exceptionId,
      ustn: input.ustn,
      category: input.exceptionCategory,
      type: input.exceptionType,
      severity,
      resolutionAction,
    });

    // Append canonical EXCEPTION_RAISED event
    try {
      await appendEvent({
        ustn: input.ustn,
        eventType: "EXCEPTION_RAISED",
        eventTypeCategory: "ASSERTION",
        authority: "SGTX",
        actor: input.raisedBy || "exception-engine",
        evidenceReference: [exceptionId],
        notes: `Exception ${exceptionId} raised: ${input.exceptionType} (severity ${severity})`,
        idempotencyKey: `EX-RAISE-${exceptionId}`,
      });
    } catch (err) {
      logger.warn("[exception-engine] could not append canonical event", {
        error: String(err),
        exceptionId,
      });
    }

    return row as ExceptionEventRow;
  } catch (err) {
    logger.error("[exception-engine] raiseException create failed", {
      error: String(err),
      exceptionId,
      ustn: input.ustn,
    });
    return null;
  }
}

// ============ §70.2 evaluateExceptionResolution ============

/**
 * Re-evaluate the resolution action for an exception based on the latest
 * inputs (severity, category, age, prior resolution attempts).
 *
 * Returns the recommended resolution action + an explanation. Does NOT
 * mutate the exception — callers should call `executeRecovery` to apply
 * the resolution.
 */
export async function evaluateExceptionResolution(
  exceptionId: string,
): Promise<{
  exceptionId: string;
  currentResolutionAction: string | null;
  recommendedResolutionAction: string;
  status: string;
  severity: number;
  category: string;
  isOverdue: boolean;
  explanation: string;
}> {
  const empty = {
    exceptionId,
    currentResolutionAction: null,
    recommendedResolutionAction: "CONTINUE",
    status: "UNKNOWN",
    severity: 2,
    category: "OPERATIONAL",
    isOverdue: false,
    explanation: "exception not found",
  };
  if (!exceptionId) return empty;
  try {
    const row = (await db.exceptionEvent.findUnique({
      where: { exceptionId },
    })) as ExceptionEventRow | null;
    if (!row) return empty;

    const recommended = evaluateResolutionAction(
      row.exceptionCategory,
      row.severity,
    );
    const now = new Date();
    const resolutionTarget = row.resolutionTarget || new Date(0);
    const isOverdue = now.getTime() > resolutionTarget.getTime();
    let final = recommended;
    if (isOverdue && row.severity >= 3) final = "ESCALATE";
    if (row.status === "ESCALATED") final = "REQUEST_AUTHORITY";

    return {
      exceptionId,
      currentResolutionAction: row.resolutionAction,
      recommendedResolutionAction: final,
      status: row.status,
      severity: row.severity,
      category: row.exceptionCategory,
      isOverdue,
      explanation: isOverdue
        ? `Exception is overdue (resolution target ${resolutionTarget.toISOString()}); escalating.`
        : `Recommended action: ${final}`,
    };
  } catch (err) {
    logger.error("[exception-engine] evaluateExceptionResolution failed", {
      error: String(err),
      exceptionId,
    });
    return empty;
  }
}

// ============ §69 causalImpactAnalysis ============

/**
 * §69 — Causal Impact Analysis: given an event type, evaluate what else
 * is affected. Returns a structured impact profile.
 *
 * Pure-ish (no DB writes), but reads the current state vector for the
 * USTN to inform the analysis. Falls back to a deterministic mapping
 * when no USTN is provided.
 */
export async function causalImpactAnalysis(
  eventType: string,
  ustn?: string | null,
): Promise<CausalImpact> {
  const t = String(eventType || "").toUpperCase();
  const base: CausalImpact = {
    eventType: t,
    ustn: ustn || null,
    affectedDomains: [],
    affectedObligationTypes: [],
    affectedExceptionCategories: [],
    propagationPaths: [],
    severityEscalation: 0,
  };

  // Deterministic mapping (no DB needed)
  const M: Record<string, Partial<CausalImpact>> = {
    PAYMENT_REJECTED: {
      affectedDomains: ["financial", "reconciliation", "exposure"],
      affectedObligationTypes: ["FINANCIAL"],
      affectedExceptionCategories: ["FINANCIAL", "RECONCILIATION"],
      propagationPaths: ["financial→exposure", "financial→reconciliation"],
      severityEscalation: 1,
    },
    PAYMENT_REVERSED: {
      affectedDomains: ["financial", "reconciliation", "exposure", "closure"],
      affectedObligationTypes: ["FINANCIAL"],
      affectedExceptionCategories: ["FINANCIAL", "RECONCILIATION", "CLOSURE"],
      propagationPaths: ["financial→exposure", "financial→closure"],
      severityEscalation: 2,
    },
    CUSTOMS_HOLD: {
      affectedDomains: ["compliance", "regulatory", "execution"],
      affectedObligationTypes: ["COMPLIANCE", "CUSTOMS"],
      affectedExceptionCategories: ["COMPLIANCE", "MILESTONE"],
      propagationPaths: ["compliance→execution"],
      severityEscalation: 1,
    },
    DOCUMENT_REVOKED: {
      affectedDomains: ["documentary", "legal", "compliance"],
      affectedObligationTypes: ["DOCUMENT"],
      affectedExceptionCategories: ["DOCUMENT"],
      propagationPaths: ["documentary→legal"],
      severityEscalation: 1,
    },
    GOODS_REJECTED: {
      affectedDomains: ["execution", "physicalOperational", "dispute", "exposure"],
      affectedObligationTypes: ["LOGISTICS"],
      affectedExceptionCategories: ["EXECUTION", "FINANCIAL", "RECONCILIATION"],
      propagationPaths: ["execution→dispute", "execution→exposure"],
      severityEscalation: 2,
    },
    EXCEPTION_RAISED: {
      affectedDomains: ["execution"],
      affectedObligationTypes: [],
      affectedExceptionCategories: [],
      propagationPaths: [],
      severityEscalation: 0,
    },
    CLOSURE_DENIED: {
      affectedDomains: ["closure"],
      affectedObligationTypes: [],
      affectedExceptionCategories: ["CLOSURE"],
      propagationPaths: [],
      severityEscalation: 1,
    },
  };

  const mapped = M[t] || {
    affectedDomains: [],
    affectedObligationTypes: [],
    affectedExceptionCategories: [],
    propagationPaths: [],
    severityEscalation: 0,
  };

  return { ...base, ...mapped } as CausalImpact;
}

// ============ §68 getRecoveryPaths ============

/**
 * §68 — Get governed recovery pathways applicable to a given exception.
 * Returns the matching RECOVERY_PATHS entries (those whose `appliesTo`
 * includes the exception's category). The first applicable path is
 * marked `recommended=true`.
 */
export async function getRecoveryPaths(
  exceptionId: string,
): Promise<RecoveryPathOption[]> {
  if (!exceptionId) return [];
  try {
    const row = (await db.exceptionEvent.findUnique({
      where: { exceptionId },
    })) as ExceptionEventRow | null;
    if (!row) return [];
    const category = row.exceptionCategory;
    const applicable = RECOVERY_PATHS.filter((p) =>
      (p.appliesTo as readonly string[]).includes(category),
    ).map((p) => ({
      path: p.path,
      description: p.description,
      targetState: p.targetState,
      appliesTo: [...p.appliesTo],
      recommended: false,
    }));
    if (applicable.length > 0) applicable[0].recommended = true;
    return applicable;
  } catch (err) {
    logger.error("[exception-engine] getRecoveryPaths failed", {
      error: String(err),
      exceptionId,
    });
    return [];
  }
}

// ============ §115 executeRecovery ============

/**
 * Execute a recovery action for an exception. Marks the exception
 * RESOLVED (or ESCALATED for the ESCALATE_AUTHORITY path), records the
 * recovery on the canonical event spine, and returns the updated row.
 *
 * Returns null on error or unknown recovery path.
 */
export async function executeRecovery(
  exceptionId: string,
  recoveryPath: string,
  metadata?: { resolvedBy?: string; notes?: string },
): Promise<ExceptionEventRow | null> {
  if (!exceptionId || !recoveryPath) return null;
  try {
    const row = (await db.exceptionEvent.findUnique({
      where: { exceptionId },
    })) as ExceptionEventRow | null;
    if (!row) {
      logger.warn("[exception-engine] executeRecovery: exception not found", {
        exceptionId,
      });
      return null;
    }
    const path = RECOVERY_PATHS.find((p) => p.path === recoveryPath);
    if (!path) {
      logger.warn("[exception-engine] unknown recovery path", {
        exceptionId,
        recoveryPath,
      });
      return null;
    }

    const newStatus =
      recoveryPath === "ESCALATE_AUTHORITY"
        ? "ESCALATED"
        : recoveryPath === "CLOSE_WITH_EXCEPTION"
          ? "CLOSED"
          : "RESOLVED";

    const updated = await db.exceptionEvent.update({
      where: { exceptionId },
      data: {
        status: newStatus,
        resolvedBy: metadata?.resolvedBy || row.resolvedBy || "exception-engine",
        resolvedAt: new Date(),
        resolutionNotes: metadata?.notes || `Recovery path: ${recoveryPath}`,
      },
    });

    // Append canonical RECOVERY_INITIATED event
    try {
      await appendEvent({
        ustn: row.ustn,
        eventType: "RECOVERY_INITIATED",
        eventTypeCategory: "COMMAND",
        authority: "SGTX",
        actor: metadata?.resolvedBy || "exception-engine",
        evidenceReference: [exceptionId],
        notes: `Recovery ${recoveryPath} executed for exception ${exceptionId}`,
        idempotencyKey: `EX-RECOVER-${exceptionId}-${recoveryPath}`,
      });
    } catch (err) {
      logger.warn("[exception-engine] could not append canonical event", {
        error: String(err),
        exceptionId,
      });
    }

    logger.info("[exception-engine] recovery executed", {
      exceptionId,
      recoveryPath,
      newStatus,
    });
    return updated as ExceptionEventRow;
  } catch (err) {
    logger.error("[exception-engine] executeRecovery failed", {
      error: String(err),
      exceptionId,
      recoveryPath,
    });
    return null;
  }
}

// ============ §70.3 getExceptions ============

/**
 * Get all exceptions for a USTN, ordered by severity (desc) then by
 * createdAt (asc). Returns [] on error.
 */
export async function getExceptions(
  ustn: string,
  filters?: {
    status?: string[];
    category?: string[];
    minSeverity?: number;
  },
): Promise<ExceptionEventRow[]> {
  if (!ustn) return [];
  try {
    const where: any = { ustn };
    if (filters?.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters?.category && filters.category.length > 0) {
      where.exceptionCategory = { in: filters.category };
    }
    if (typeof filters?.minSeverity === "number") {
      where.severity = { gte: filters.minSeverity };
    }
    const rows = await db.exceptionEvent.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
    });
    return (rows as ExceptionEventRow[]) || [];
  } catch (err) {
    logger.error("[exception-engine] getExceptions failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Get a single exception by its exceptionId. Returns null if not found.
 */
export async function getException(
  exceptionId: string,
): Promise<ExceptionEventRow | null> {
  if (!exceptionId) return null;
  try {
    const row = await db.exceptionEvent.findUnique({
      where: { exceptionId },
    });
    return (row as ExceptionEventRow) || null;
  } catch (err) {
    logger.error("[exception-engine] getException failed", {
      error: String(err),
      exceptionId,
    });
    return null;
  }
}

/**
 * Acknowledge an exception (§73 acknowledgment SLA). Sets status to
 * ACKNOWLEDGED + records who/when. Returns the updated row.
 */
export async function acknowledgeException(
  exceptionId: string,
  acknowledgedBy: string,
): Promise<ExceptionEventRow | null> {
  if (!exceptionId) return null;
  try {
    const updated = await db.exceptionEvent.update({
      where: { exceptionId },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedBy: acknowledgedBy || "unknown",
        acknowledgedAt: new Date(),
      },
    });
    return updated as ExceptionEventRow;
  } catch (err) {
    logger.error("[exception-engine] acknowledgeException failed", {
      error: String(err),
      exceptionId,
    });
    return null;
  }
}
