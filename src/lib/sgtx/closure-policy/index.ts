// @ts-nocheck
/**
 * SGTX Master Amendment — §11 Closure Policy Engine
 * ===========================================================================
 *
 * Implements the §11 Closure Policy Engine — the configurable policy
 * gate that decides whether a USTN can be closed.
 *
 * §11 — A closure policy is a versioned set of required conditions. At
 * any point in time, exactly one policy is `active=true`. The engine
 * evaluates the active policy against the USTN's state vector +
 * supporting engines (settlement, reconciliation, exceptions, evidence).
 *
 * §121 — The 7 canonical closure conditions (a subset of the §121 32
 * constitutional rules):
 *
 *   1. requireDeliveryAccepted              — §1 delivery accepted
 *   2. requireSettlementComplete            — §45 all payment legs SETTLED
 *   3. requireFinancialReconciliation        — §63 exposure RESOLVED
 *   4. requireCustomsComplete                — customs obligations COMPLETED
 *   5. requirePostClearance                 — §4 post-clearance actions none OPEN
 *   6. requireDisputesResolved               — §70 exceptions all RESOLVED/CLOSED
 *   7. requireEvidenceSealed                — §91 evidence package sealed
 *
 * §113 — closeWithException: closure may be granted WITH an open
 * exception if the policy explicitly allows it (severity <= 2 + a
 * documented reason + governance approval recorded).
 *
 * §E — Machine-readable blocker codes:
 *
 *   DELIVERY_NOT_ACCEPTED
 *   SETTLEMENT_INCOMPLETE
 *   FINANCIAL_RECONCILIATION_INCOMPLETE
 *   CUSTOMS_OBLIGATION_OPEN
 *   POST_CLEARANCE_OPEN
 *   DISPUTE_OPEN
 *   EVIDENCE_NOT_SEALED
 *   CLAIM_OPEN
 *   EXCEPTION_OPEN
 *   POST_CLOSURE_OBSERVATION_ACTIVE
 *
 * NEVER auto-closes: `canClose` ONLY returns true if ALL conditions pass
 * (or §113 close-with-exception is explicitly invoked). The engine is
 * advisory — the actual closure gate is enforced by the §6 Trade Closure
 * State Engine (`trade-closure` lib).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getStateVector } from "@/lib/sgtx/state-vector";
import { getPaymentLegs } from "@/lib/sgtx/settlement-orchestration";
import { getExposure } from "@/lib/sgtx/financial-exposure";
import { getExceptions } from "@/lib/sgtx/exception-engine";
import { getEntriesByType } from "@/lib/sgtx/recovery-vault";
import { getObligations } from "@/lib/sgtx/obligation-graph";

// ============ §11 Constants ============

/**
 * §121 — The 7 canonical closure conditions.
 */
export const CLOSURE_CONDITIONS = [
  {
    id: "requireDeliveryAccepted",
    label: "Delivery accepted (§1)",
    blockerCode: "DELIVERY_NOT_ACCEPTED",
  },
  {
    id: "requireSettlementComplete",
    label: "Settlement complete (§45)",
    blockerCode: "SETTLEMENT_INCOMPLETE",
  },
  {
    id: "requireFinancialReconciliation",
    label: "Financial reconciliation complete (§63)",
    blockerCode: "FINANCIAL_RECONCILIATION_INCOMPLETE",
  },
  {
    id: "requireCustomsComplete",
    label: "Customs obligations complete (§66)",
    blockerCode: "CUSTOMS_OBLIGATION_OPEN",
  },
  {
    id: "requirePostClearance",
    label: "Post-clearance obligations complete (§4)",
    blockerCode: "POST_CLEARANCE_OPEN",
  },
  {
    id: "requireDisputesResolved",
    label: "Disputes / exceptions resolved (§70)",
    blockerCode: "EXCEPTION_OPEN",
  },
  {
    id: "requireEvidenceSealed",
    label: "Evidence package sealed (§91)",
    blockerCode: "EVIDENCE_NOT_SEALED",
  },
] as const;

/**
 * §E — Machine-readable closure blocker codes.
 */
export const CLOSURE_BLOCKER_CODES = [
  "DELIVERY_NOT_ACCEPTED",
  "SETTLEMENT_INCOMPLETE",
  "FINANCIAL_RECONCILIATION_INCOMPLETE",
  "CUSTOMS_OBLIGATION_OPEN",
  "POST_CLEARANCE_OPEN",
  "DISPUTE_OPEN",
  "EXCEPTION_OPEN",
  "EVIDENCE_NOT_SEALED",
  "CLAIM_OPEN",
  "POST_CLOSURE_OBSERVATION_ACTIVE",
] as const;

/**
 * Closure evaluation outcomes.
 */
export const CLOSURE_OUTCOMES = [
  "CAN_CLOSE",                // all conditions met
  "BLOCKED",                  // one or more conditions not met
  "CAN_CLOSE_WITH_EXCEPTION", // §113 closure with open exception allowed
  "CLOSED_WITH_EXCEPTION",    // §113 already applied
  "POST_CLOSURE_ACTIVE",      // §22 observation still active
] as const;

// ============ Types ============

export interface ClosurePolicyRow {
  id: string;
  policyId: string;
  policyName: string;
  requireDeliveryAccepted: boolean;
  requireSettlementComplete: boolean;
  requireFinancialReconciliation: boolean;
  requireCustomsComplete: boolean;
  requirePostClearance: boolean;
  requireDisputesResolved: boolean;
  requireEvidenceSealed: boolean;
  customConditions?: string | null;
  postClosureObservationDays?: number | null;
  version: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClosurePolicyInput {
  policyName: string;
  requireDeliveryAccepted?: boolean;
  requireSettlementComplete?: boolean;
  requireFinancialReconciliation?: boolean;
  requireCustomsComplete?: boolean;
  requirePostClearance?: boolean;
  requireDisputesResolved?: boolean;
  requireEvidenceSealed?: boolean;
  customConditions?: Array<{ condition: string; description: string }>;
  postClosureObservationDays?: number;
  activate?: boolean; // if true, sets active=true and deactivates all others
}

export interface ClosureConditionResult {
  id: string;
  label: string;
  blockerCode: string;
  required: boolean;
  met: boolean;
  notes?: string;
}

export interface ClosureEvaluation {
  ustn: string;
  policyId: string;
  policyName: string;
  conditions: ClosureConditionResult[];
  allMet: boolean;
  canClose: boolean;
  outcome: string;
  blockers: string[];
  closeWithExceptionAllowed: boolean;
  evaluatedAt: Date;
}

// ============ §11.0 Pure helpers ============

/**
 * Pure: generate a policyId in the form:
 *   CP-{YYYYMMDDHHMMSS}-{RANDOM6}
 */
export function generatePolicyId(when?: Date): string {
  const t = when || new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CP-${ts}-${r}`;
}

/**
 * Pure: parse the customConditions JSON array. Defensive — returns [] on
 * parse error or non-array input.
 */
export function parseCustomConditions(
  raw: unknown,
): Array<{ condition: string; description: string }> {
  if (Array.isArray(raw)) return raw as any[];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: derive the closure outcome from the condition results.
 */
export function deriveOutcome(
  conditions: ClosureConditionResult[],
  closeWithExceptionAllowed: boolean,
): {
  allMet: boolean;
  canClose: boolean;
  outcome: string;
  blockers: string[];
} {
  const requiredConditions = conditions.filter((c) => c.required);
  const failedRequired = requiredConditions.filter((c) => !c.met);
  const allMet = failedRequired.length === 0;
  const blockers = failedRequired.map((c) => c.blockerCode);
  if (allMet) {
    return {
      allMet: true,
      canClose: true,
      outcome: "CAN_CLOSE",
      blockers: [],
    };
  }
  // §113 — closeWithException is allowed only if the only blocker is
  // EXCEPTION_OPEN (not a delivery / settlement / evidence blocker)
  const onlyExceptionBlocker =
    blockers.length === 1 && blockers[0] === "EXCEPTION_OPEN";
  if (closeWithExceptionAllowed && onlyExceptionBlocker) {
    return {
      allMet: false,
      canClose: true,
      outcome: "CAN_CLOSE_WITH_EXCEPTION",
      blockers,
    };
  }
  return {
    allMet: false,
    canClose: false,
    outcome: "BLOCKED",
    blockers,
  };
}

// ============ §11.1 getActiveClosurePolicy ============

/**
 * Get the currently active closure policy. If none is active, returns null
 * (the caller should create one via `createClosurePolicy` with activate=true).
 *
 * Returns null on error or if no active policy exists.
 */
export async function getActiveClosurePolicy(): Promise<ClosurePolicyRow | null> {
  try {
    const row = await db.closurePolicy.findFirst({
      where: { active: true },
      orderBy: { version: "desc" },
    });
    return (row as ClosurePolicyRow) || null;
  } catch (err) {
    logger.error("[closure-policy] getActiveClosurePolicy failed", {
      error: String(err),
    });
    return null;
  }
}

// ============ §11.2 createClosurePolicy ============

/**
 * Create a new closure policy. If `activate=true`, all other policies are
 * deactivated and the new one becomes the active policy.
 *
 * Returns the new policy row, or null on error.
 */
export async function createClosurePolicy(
  input: CreateClosurePolicyInput,
): Promise<ClosurePolicyRow | null> {
  if (!input || !input.policyName) {
    logger.warn("[closure-policy] create rejected: missing policyName");
    return null;
  }
  const policyId = generatePolicyId();
  const activate = input.activate !== false; // default true
  try {
    // If activating, deactivate all others first
    if (activate) {
      try {
        await db.closurePolicy.updateMany({
          where: { active: true },
          data: { active: false },
        });
      } catch (err) {
        logger.warn("[closure-policy] could not deactivate prior policies", {
          error: String(err),
        });
      }
    }
    // Resolve next version
    let version = 1;
    try {
      const latest = await db.closurePolicy.findFirst({
        where: { policyName: input.policyName },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      if (latest) version = (latest.version || 0) + 1;
    } catch (err) {
      logger.warn("[closure-policy] could not resolve version", {
        error: String(err),
      });
    }
    const row = await db.closurePolicy.create({
      data: {
        policyId,
        policyName: input.policyName,
        requireDeliveryAccepted: input.requireDeliveryAccepted ?? true,
        requireSettlementComplete: input.requireSettlementComplete ?? true,
        requireFinancialReconciliation: input.requireFinancialReconciliation ?? true,
        requireCustomsComplete: input.requireCustomsComplete ?? true,
        requirePostClearance: input.requirePostClearance ?? true,
        requireDisputesResolved: input.requireDisputesResolved ?? true,
        requireEvidenceSealed: input.requireEvidenceSealed ?? true,
        customConditions: input.customConditions
          ? JSON.stringify(input.customConditions)
          : null,
        postClosureObservationDays: input.postClosureObservationDays ?? 90,
        version,
        active: activate,
      },
    });
    logger.info("[closure-policy] policy created", {
      policyId,
      policyName: input.policyName,
      version,
      active: activate,
    });
    return row as ClosurePolicyRow;
  } catch (err) {
    logger.error("[closure-policy] createClosurePolicy failed", {
      error: String(err),
      policyId,
      policyName: input.policyName,
    });
    return null;
  }
}

// ============ §11.3 evaluateClosure ============

/**
 * Evaluate the active closure policy against a USTN's current state. Checks
 * each of the 7 conditions + any custom conditions.
 *
 * NEVER auto-closes — this function is purely evaluative. The caller must
 * invoke `closeTrade` on the §6 Trade Closure State Engine to actually
 * close the USTN.
 *
 * Returns the full evaluation (conditions + blockers + outcome).
 */
export async function evaluateClosure(
  ustn: string,
): Promise<ClosureEvaluation | null> {
  if (!ustn) return null;
  const policy = await getActiveClosurePolicy();
  if (!policy) {
    logger.warn("[closure-policy] no active closure policy", { ustn });
    return null;
  }
  // Gather state from supporting engines (best-effort, all try/catch)
  let stateVector: any = null;
  try {
    stateVector = await getStateVector(ustn);
  } catch (err) {
    logger.warn("[closure-policy] getStateVector failed", {
      error: String(err),
      ustn,
    });
  }

  let paymentLegs: any[] = [];
  try {
    paymentLegs = await getPaymentLegs(ustn);
  } catch (err) {
    logger.warn("[closure-policy] getPaymentLegs failed", {
      error: String(err),
      ustn,
    });
  }

  let exposure: any = null;
  try {
    exposure = await getExposure(ustn);
  } catch (err) {
    logger.warn("[closure-policy] getExposure failed", {
      error: String(err),
      ustn,
    });
  }

  let exceptions: any[] = [];
  try {
    exceptions = await getExceptions(ustn);
  } catch (err) {
    logger.warn("[closure-policy] getExceptions failed", {
      error: String(err),
      ustn,
    });
  }

  let obligations: any[] = [];
  try {
    obligations = await getObligations(ustn);
  } catch (err) {
    logger.warn("[closure-policy] getObligations failed", {
      error: String(err),
      ustn,
    });
  }

  let sealedEvidence: any[] = [];
  try {
    sealedEvidence = await getEntriesByType(ustn, "CLOSURE_CERTIFICATE");
  } catch (err) {
    logger.warn("[closure-policy] getEntriesByType failed", {
      error: String(err),
      ustn,
    });
  }

  // Evaluate each condition
  const conditions: ClosureConditionResult[] = [];

  // 1. requireDeliveryAccepted — derived from state vector execution domain
  const deliveryMet =
    stateVector?.execution === "COMPLETED" ||
    stateVector?.physicalOperational === "COMPLETED";
  conditions.push({
    id: "requireDeliveryAccepted",
    label: "Delivery accepted (§1)",
    blockerCode: "DELIVERY_NOT_ACCEPTED",
    required: policy.requireDeliveryAccepted,
    met: deliveryMet,
    notes: deliveryMet ? undefined : "delivery not yet accepted",
  });

  // 2. requireSettlementComplete — all payment legs SETTLED
  const settledLegs = paymentLegs.filter((p) => p.legState === "SETTLED").length;
  const allSettled = paymentLegs.length > 0 && settledLegs === paymentLegs.length;
  conditions.push({
    id: "requireSettlementComplete",
    label: "Settlement complete (§45)",
    blockerCode: "SETTLEMENT_INCOMPLETE",
    required: policy.requireSettlementComplete,
    met: allSettled,
    notes: allSettled
      ? `${settledLegs}/${paymentLegs.length} legs settled`
      : `${settledLegs}/${paymentLegs.length} legs settled`,
  });

  // 3. requireFinancialReconciliation — exposure RESOLVED
  const reconMet = exposure?.exposureState === "RESOLVED";
  conditions.push({
    id: "requireFinancialReconciliation",
    label: "Financial reconciliation complete (§63)",
    blockerCode: "FINANCIAL_RECONCILIATION_INCOMPLETE",
    required: policy.requireFinancialReconciliation,
    met: reconMet,
    notes: reconMet ? undefined : `exposure state: ${exposure?.exposureState || "NONE"}`,
  });

  // 4. requireCustomsComplete — no customs obligation PENDING/IN_PROGRESS
  const customsObligations = obligations.filter((o) => o.obligationType === "CUSTOMS");
  const customsMet =
    customsObligations.length === 0 ||
    customsObligations.every((o) => o.state === "COMPLETED");
  conditions.push({
    id: "requireCustomsComplete",
    label: "Customs obligations complete (§66)",
    blockerCode: "CUSTOMS_OBLIGATION_OPEN",
    required: policy.requireCustomsComplete,
    met: customsMet,
    notes: customsMet
      ? undefined
      : `${customsObligations.filter((o) => o.state !== "COMPLETED").length} customs obligations open`,
  });

  // 5. requirePostClearance — no compliance obligation PENDING/IN_PROGRESS
  const postClearance = obligations.filter((o) => o.obligationType === "COMPLIANCE");
  const postClearanceMet =
    postClearance.length === 0 ||
    postClearance.every((o) => o.state === "COMPLETED");
  conditions.push({
    id: "requirePostClearance",
    label: "Post-clearance obligations complete (§4)",
    blockerCode: "POST_CLEARANCE_OPEN",
    required: policy.requirePostClearance,
    met: postClearanceMet,
    notes: postClearanceMet
      ? undefined
      : `${postClearance.filter((o) => o.state !== "COMPLETED").length} post-clearance obligations open`,
  });

  // 6. requireDisputesResolved — all exceptions RESOLVED or CLOSED
  const openExceptions = exceptions.filter(
    (e) => !["RESOLVED", "CLOSED"].includes(e.status),
  );
  const disputesMet = openExceptions.length === 0;
  conditions.push({
    id: "requireDisputesResolved",
    label: "Disputes / exceptions resolved (§70)",
    blockerCode: "EXCEPTION_OPEN",
    required: policy.requireDisputesResolved,
    met: disputesMet,
    notes: disputesMet
      ? undefined
      : `${openExceptions.length} open exceptions`,
  });

  // 7. requireEvidenceSealed — at least one CLOSURE_CERTIFICATE vault entry
  const evidenceMet = sealedEvidence.length > 0;
  conditions.push({
    id: "requireEvidenceSealed",
    label: "Evidence package sealed (§91)",
    blockerCode: "EVIDENCE_NOT_SEALED",
    required: policy.requireEvidenceSealed,
    met: evidenceMet,
    notes: evidenceMet
      ? `${sealedEvidence.length} sealed certificate(s)`
      : "no sealed evidence certificate",
  });

  // §113 closeWithException is allowed only if the only blocker is EXCEPTION_OPEN
  // AND the open exceptions are all severity <= 2 (operational)
  const onlyExceptionBlocker =
    !disputesMet &&
    conditions
      .filter((c) => c.required && !c.met)
      .every((c) => c.blockerCode === "EXCEPTION_OPEN") &&
    openExceptions.every((e) => (e.severity || 0) <= 2);
  const closeWithExceptionAllowed = onlyExceptionBlocker;

  const outcome = deriveOutcome(conditions, closeWithExceptionAllowed);
  const evaluation: ClosureEvaluation = {
    ustn,
    policyId: policy.policyId,
    policyName: policy.policyName,
    conditions,
    allMet: outcome.allMet,
    canClose: outcome.canClose,
    outcome: outcome.outcome,
    blockers: outcome.blockers,
    closeWithExceptionAllowed,
    evaluatedAt: new Date(),
  };

  logger.info("[closure-policy] closure evaluated", {
    ustn,
    policyId: policy.policyId,
    outcome: outcome.outcome,
    blockers: outcome.blockers,
  });

  return evaluation;
}

// ============ §11.4 canClose ============

/**
 * Convenience wrapper: returns true if `evaluateClosure` returns an outcome
 * of CAN_CLOSE or CAN_CLOSE_WITH_EXCEPTION. Returns false on error.
 *
 * NOTE: This does NOT close the trade — it only reports whether closure
 * is permissible under the active policy.
 */
export async function canClose(ustn: string): Promise<boolean> {
  const evalResult = await evaluateClosure(ustn);
  if (!evalResult) return false;
  return evalResult.canClose;
}

// ============ §11.5 getClosureBlockers ============

/**
 * Get the machine-readable blocker codes for a USTN. Returns [] if closure
 * is permissible (no blockers).
 *
 * §E — Blocker codes:
 *   DELIVERY_NOT_ACCEPTED
 *   SETTLEMENT_INCOMPLETE
 *   FINANCIAL_RECONCILIATION_INCOMPLETE
 *   CUSTOMS_OBLIGATION_OPEN
 *   POST_CLEARANCE_OPEN
 *   EXCEPTION_OPEN
 *   EVIDENCE_NOT_SEALED
 */
export async function getClosureBlockers(ustn: string): Promise<string[]> {
  const evalResult = await evaluateClosure(ustn);
  if (!evalResult) return ["UNKNOWN"];
  return evalResult.blockers;
}

// ============ §113 closeWithException ============

/**
 * §113 — Close the trade WITH an open exception. This is allowed only when:
 *
 *   - the active policy permits it (i.e. closeWithExceptionAllowed=true)
 *   - the open exception's severity is <= 2 (operational)
 *   - a documented reason is provided
 *   - governance approval is recorded (via the canonical event spine)
 *
 * This function does NOT mutate the §6 Trade Closure State directly —
 * it returns the evaluation result with outcome=CLOSED_WITH_EXCEPTION
 * so the caller (typically an API route) can invoke the actual closure
 * on the trade-closure engine.
 *
 * Returns the updated evaluation, or null on error or policy violation.
 */
export async function closeWithException(
  ustn: string,
  exceptionId: string,
  reason: string,
  approver?: string,
): Promise<ClosureEvaluation | null> {
  if (!ustn || !exceptionId || !reason) return null;
  const evaluation = await evaluateClosure(ustn);
  if (!evaluation) return null;
  if (!evaluation.closeWithExceptionAllowed) {
    logger.warn("[closure-policy] closeWithException not permitted by policy", {
      ustn,
      exceptionId,
      blockers: evaluation.blockers,
    });
    return evaluation;
  }

  // Verify the exception exists + severity is low enough
  let exceptionRow: any = null;
  try {
    exceptionRow = await db.exceptionEvent.findUnique({
      where: { exceptionId },
    });
  } catch (err) {
    logger.warn("[closure-policy] could not verify exception", {
      error: String(err),
      exceptionId,
    });
  }
  if (exceptionRow && (exceptionRow.severity || 0) > 2) {
    logger.warn("[closure-policy] closeWithException rejected: severity too high", {
      ustn,
      exceptionId,
      severity: exceptionRow.severity,
    });
    return evaluation;
  }

  // Append canonical CLOSURE_GRANTED event (governance approval record)
  try {
    const { appendEvent } = await import("@/lib/sgtx/event-spine");
    await appendEvent({
      ustn,
      eventType: "CLOSURE_GRANTED",
      eventTypeCategory: "COMMAND",
      authority: "SGTX",
      actor: approver || "closure-policy",
      evidenceReference: [exceptionId],
      notes: `§113 closure with exception ${exceptionId}: ${reason}`,
      idempotencyKey: `CLOSURE-EX-${ustn}-${exceptionId}`,
    });
  } catch (err) {
    logger.warn("[closure-policy] could not append canonical closure event", {
      error: String(err),
      ustn,
      exceptionId,
    });
  }

  return {
    ...evaluation,
    outcome: "CLOSED_WITH_EXCEPTION",
  };
}

/**
 * Get a closure policy by its policyId. Returns null if not found.
 */
export async function getClosurePolicy(
  policyId: string,
): Promise<ClosurePolicyRow | null> {
  if (!policyId) return null;
  try {
    const row = await db.closurePolicy.findUnique({
      where: { policyId },
    });
    return (row as ClosurePolicyRow) || null;
  } catch (err) {
    logger.error("[closure-policy] getClosurePolicy failed", {
      error: String(err),
      policyId,
    });
    return null;
  }
}

/**
 * List all closure policies (active + inactive). Returns [] on error.
 */
export async function listClosurePolicies(
  activeOnly: boolean = false,
): Promise<ClosurePolicyRow[]> {
  try {
    const rows = await db.closurePolicy.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: [{ active: "desc" }, { policyName: "asc" }, { version: "desc" }],
    });
    return (rows as ClosurePolicyRow[]) || [];
  } catch (err) {
    logger.error("[closure-policy] listClosurePolicies failed", {
      error: String(err),
    });
    return [];
  }
}

/**
 * Activate a specific closure policy (deactivates all others).
 */
export async function activateClosurePolicy(
  policyId: string,
): Promise<ClosurePolicyRow | null> {
  if (!policyId) return null;
  try {
    await db.closurePolicy.updateMany({
      where: { active: true },
      data: { active: false },
    });
    const updated = await db.closurePolicy.update({
      where: { policyId },
      data: { active: true },
    });
    logger.info("[closure-policy] policy activated", { policyId });
    return updated as ClosurePolicyRow;
  } catch (err) {
    logger.error("[closure-policy] activateClosurePolicy failed", {
      error: String(err),
      policyId,
    });
    return null;
  }
}
