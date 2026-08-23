// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Master Constitutional Amendment — Governor Gates (§6-§115 G-A1..G-A7)
 * ===========================================================================
 *
 * Seven advisory Governor gates for the Constitutional Amendment engines.
 * Each gate is an advisory PURE function that takes a domain object (or
 * array) and returns:
 *
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2/5/6/7/8/9/10 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / settlement / closure.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * GATES:
 *   • G-A1 gateStateVectorConsistency   — state vector has no UNKNOWN domains
 *                                          and no CRITICAL divergence.
 *   • G-A2 gateEventSpineIntegrity       — canonical event spine hash chain
 *                                          is verified (no broken links).
 *   • G-A3 gateSettlementLegState         — all payment legs SETTLED.
 *   • G-A4 gateExceptionResolution        — no OPEN exceptions (or severity<=2
 *                                          for CONDITIONAL).
 *   • G-A5 gateFinancialExposure          — exposure is NONE/RESOLVED.
 *   • G-A6 gateObligationCompletion       — all obligations COMPLETED.
 *   • G-A7 gateClosurePolicy              — closure evaluation reports
 *                                          canClose=true.
 *
 * The merger `mergeConstitutionalGates(gates)` returns a single verdict
 * using strictest-wins semantics (DENY > CONDITIONAL > ALLOW).
 *
 * Gates never throw — they degrade gracefully to DENY (for missing input)
 * or CONDITIONAL (for ambiguous input) with descriptive reasons when their
 * input is malformed.
 *
 * Usage:
 *   import {
 *     gateStateVectorConsistency, gateEventSpineIntegrity,
 *     gateSettlementLegState, gateExceptionResolution,
 *     gateFinancialExposure, gateObligationCompletion,
 *     gateClosurePolicy, mergeConstitutionalGates,
 *   } from "@/lib/sgtx/governor/gates-constitutional";
 */

// ============ Types ============

export type GateVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface GateCondition {
  id: string;
  label: string;
  status: "met" | "unmet" | "warning";
}

export interface GateResult {
  gateId: string;
  verdict: GateVerdict;
  conditions: GateCondition[];
}

// Loose input shapes — the gates accept either a Prisma row or a compatible
// plain object so they remain pure and unit-testable without a DB connection.

/** G-A1 input — a TransactionStateVector row (§6-§8). */
export interface StateVectorLike {
  ustn?: string;
  execution?: string;
  financial?: string;
  legal?: string;
  physicalOperational?: string;
  documentary?: string;
  compliance?: string;
  regulatory?: string;
  counterparty?: string;
  reconciliation?: string;
  dispute?: string;
  exposure?: string;
  closure?: string;
  finalityClass?: string | null;
  divergenceIndex?: string | null;
  transactionHealth?: string | null;
  stateIntegrityScore?: number | null;
}

/** G-A2 input — the result of `verifyEventChain(ustn)` from the event-spine lib. */
export interface EventChainVerificationLike {
  ustn?: string;
  verified?: boolean;
  totalEvents?: number;
  brokenAt?: number | null;
  brokenEventId?: string | null;
  expectedHash?: string | null;
  actualHash?: string | null;
}

/** G-A3 input — an array of PaymentLeg rows (§37-§49). */
export interface PaymentLegLike {
  legId?: string;
  ustn?: string;
  settlementInstructionId?: string;
  beneficiaryId?: string | null;
  beneficiaryName?: string | null;
  beneficiaryType?: string | null;
  amount?: any;
  currency?: string | null;
  legState?: string; // PENDING | AUTHORIZED | SUBMITTED | PROCESSING | SETTLED | REJECTED | RETURNED | REVERSED
  valueDate?: string | Date | null;
  executionTimestamp?: string | Date | null;
  returnCode?: string | null;
  bankTransactionRef?: string | null;
  bankEvidenceRef?: string | null;
  sgtxEventHash?: string | null;
  reconciliationStatus?: string | null;
}

/** G-A4 input — an array of ExceptionEvent rows (§68-§73). */
export interface ExceptionEventLike {
  exceptionId?: string;
  ustn?: string;
  exceptionCategory?: string;
  exceptionType?: string;
  severity?: number; // 1..5
  status?: string; // OPEN | ACKNOWLEDGED | RESOLVED | ESCALATED | CLOSED
  triggeringEvent?: string | null;
  resolutionAction?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | Date | null;
  resolvedBy?: string | null;
  resolvedAt?: string | Date | null;
}

/** G-A5 input — a FinancialExposure row (§63-§65). */
export interface FinancialExposureLike {
  ustn?: string;
  grossCommercialValue?: any;
  expectedSettlement?: any;
  actualSettlement?: any;
  returnedAmount?: any;
  disputedAmount?: any;
  fees?: any;
  adjustments?: any;
  fxConsequences?: any;
  penalties?: any;
  compensation?: any;
  recoverableAmount?: any;
  outstandingExposure?: any;
  reopenedExposure?: any;
  contingentExposure?: any;
  exposureState?: string; // NONE | OPEN | RECOVERING | REOPENED | RESOLVED
  recoveryStatus?: string | null;
  currency?: string;
}

/** G-A6 input — an array of ObligationNode rows (§66-§68). */
export interface ObligationLike {
  obligationId?: string;
  ustn?: string;
  obligationType?: string;
  beneficiary?: string | null;
  amount?: any;
  currency?: string | null;
  prerequisites?: string | null;
  dependencies?: string | null;
  completionCondition?: string | null;
  reversalCondition?: string | null;
  disputeCondition?: string | null;
  recoveryPath?: string | null;
  financialConsequence?: any;
  state?: string; // PENDING | IN_PROGRESS | COMPLETED | FAILED | DISPUTED | BLOCKED | CANCELLED
  authority?: string | null;
  evidenceRequirement?: string | null;
  deadline?: string | Date | null;
}

/** G-A7 input — the result of `evaluateClosure(ustn)` from the closure-policy lib. */
export interface ClosureEvaluationLike {
  ustn?: string;
  policyId?: string;
  policyName?: string | null;
  conditions?: Array<{
    id: string;
    label: string;
    blockerCode: string;
    required: boolean;
    met: boolean;
    notes?: string;
  }>;
  allMet?: boolean;
  canClose?: boolean;
  outcome?: string; // CAN_CLOSE | CAN_CLOSE_WITH_EXCEPTION | BLOCKED | UNKNOWN
  blockers?: string[];
  closeWithExceptionAllowed?: boolean;
  evaluatedAt?: string | Date;
}

// ============ Helpers ============

function allow(gateId: string): GateResult {
  return { gateId, verdict: "ALLOW", conditions: [] };
}

function conditional(
  gateId: string,
  ...conditions: GateCondition[]
): GateResult {
  return {
    gateId,
    verdict: "CONDITIONAL",
    conditions: conditions.filter((c) => c && c.label),
  };
}

function deny(gateId: string, ...conditions: GateCondition[]): GateResult {
  return {
    gateId,
    verdict: "DENY",
    conditions: conditions.filter((c) => c && c.label),
  };
}

function cond(
  id: string,
  label: string,
  status: GateCondition["status"] = "unmet",
): GateCondition {
  return { id, label, status };
}

/** Pure: returns the upper-cased value or empty string for null/undefined. */
function upper(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).toUpperCase();
}

// ============ G-A1: State Vector Consistency ============

/**
 * G-A1 — State Vector Consistency.
 *
 * Verifies that the 12-domain state vector has no UNKNOWN entries and no
 * CRITICAL divergence.
 *
 * • ALLOW       — no domain is UNKNOWN and divergenceIndex != CRITICAL.
 * • CONDITIONAL — at least one domain is UNKNOWN (the trade has pending
 *                 state initialization; not yet ready for terminal actions
 *                 but not blocked).
 * • DENY        — divergenceIndex = CRITICAL (the 12 domains have diverged
 *                 so far that the transaction reality is broken — manual
 *                 intervention is required before proceeding) OR the state
 *                 vector is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateStateVectorConsistency(
  stateVector: StateVectorLike | null | undefined,
): GateResult {
  if (!stateVector) {
    return deny(
      "G-A1",
      cond(
        "no_state_vector",
        "No state vector provided — the trade has not been initialized in the §7 multi-clock state vector model. Run getOrCreateStateVector(ustn) before evaluating consistency.",
        "unmet",
      ),
    );
  }
  const ref = stateVector.ustn || "(unidentified)";
  const domainKeys: Array<keyof StateVectorLike> = [
    "execution",
    "financial",
    "legal",
    "physicalOperational",
    "documentary",
    "compliance",
    "regulatory",
    "counterparty",
    "reconciliation",
    "dispute",
    "exposure",
    "closure",
  ];
  const unknownDomains: string[] = [];
  for (const k of domainKeys) {
    const v = upper((stateVector as any)[k]);
    if (v === "UNKNOWN") unknownDomains.push(String(k));
  }

  const divergence = upper(stateVector.divergenceIndex);
  if (divergence === "CRITICAL") {
    return deny(
      "G-A1",
      cond(
        "critical_divergence",
        `State vector for ${ref} reports CRITICAL divergence — the 12 domains have diverged so far that the transaction reality is broken. Manual intervention is required before proceeding.`,
        "unmet",
      ),
    );
  }

  if (unknownDomains.length > 0) {
    return conditional(
      "G-A1",
      cond(
        "unknown_domains",
        `State vector for ${ref} has ${unknownDomains.length} UNKNOWN domain(s): ${unknownDomains.join(", ")}. The trade has pending state initialization; can proceed but terminal actions (settlement, closure) should wait until all domains are populated.`,
        "warning",
      ),
    );
  }

  return allow("G-A1");
}

// ============ G-A2: Event Spine Integrity ============

/**
 * G-A2 — Event Spine Integrity.
 *
 * Verifies that the canonical event spine hash chain is intact (each
 * event's previousEventHash links to its predecessor's eventHash, and
 * every eventHash recomputes to the stored value).
 *
 * • ALLOW       — verified=true (the chain is intact).
 * • DENY        — verified=false (broken link or hash mismatch — the
 *                 event spine has been tampered with or corrupted) OR
 *                 the verification input is null/undefined.
 *
 * Note: an empty chain (totalEvents=0, verified=true) is ALLOWED — there
 * is nothing to verify, so nothing is broken.
 *
 * Pure. Idempotent.
 */
export function gateEventSpineIntegrity(
  verified: EventChainVerificationLike | null | undefined,
): GateResult {
  if (!verified) {
    return deny(
      "G-A2",
      cond(
        "no_verification",
        "No event-spine verification result provided — run verifyEventChain(ustn) before evaluating integrity.",
        "unmet",
      ),
    );
  }
  const ref = verified.ustn || "(unidentified)";
  const isVerified = verified.verified === true;
  if (isVerified) {
    return allow("G-A2");
  }
  const brokenAt = verified.brokenAt ?? "?";
  const brokenEventId = verified.brokenEventId || "?";
  return deny(
    "G-A2",
    cond(
      "broken_event_chain",
      `Event spine for ${ref} is BROKEN at position ${brokenAt} (eventId=${brokenEventId}) — the hash chain link is broken or the event hash has been tampered with. The canonical event spine must be repaired (replayFromHistory) before any further state transitions can be trusted.`,
      "unmet",
    ),
  );
}

// ============ G-A3: Settlement Leg State ============

/**
 * G-A3 — Settlement Leg State.
 *
 * Verifies that all payment legs for a trade are SETTLED.
 *
 * • ALLOW       — all legs are SETTLED (or there are no legs — nothing
 *                 to settle).
 * • CONDITIONAL — at least one leg is SETTLED but some are still
 *                 PENDING/AUTHORIZED/SUBMITTED/PROCESSING (partially
 *                 settled — settlement is in flight).
 * • DENY        — any leg is REJECTED / RETURNED / REVERSED (a hard
 *                 failure has occurred that requires resolution before
 *                 the trade can proceed) OR legs is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateSettlementLegState(
  legs: PaymentLegLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(legs)) {
    return deny(
      "G-A3",
      cond(
        "no_leg_state",
        "No payment-leg state provided — legs must be loaded (getPaymentLegs) before evaluating settlement readiness.",
        "unmet",
      ),
    );
  }
  if (legs.length === 0) {
    // No legs — nothing to settle. Allowed (settlement is trivially complete).
    return allow("G-A3");
  }
  const settled = legs.filter((l) => upper(l?.legState) === "SETTLED");
  const failed = legs.filter((l) => {
    const s = upper(l?.legState);
    return s === "REJECTED" || s === "RETURNED" || s === "REVERSED";
  });
  if (failed.length > 0) {
    return deny(
      "G-A3",
      cond(
        "failed_legs",
        `${failed.length} payment leg(s) are in a terminal-failure state (REJECTED/RETURNED/REVERSED): ${failed
          .map((l) => l.legId || "?")
          .join(", ")}. Resolve the failed legs (reversal, retry, or manual reconciliation) before proceeding.`,
        "unmet",
      ),
    );
  }
  if (settled.length < legs.length) {
    const pending = legs.length - settled.length;
    return conditional(
      "G-A3",
      cond(
        "partially_settled",
        `${settled.length}/${legs.length} payment legs SETTLED — ${pending} leg(s) still in flight (PENDING/AUTHORIZED/SUBMITTED/PROCESSING). Settlement is in progress; closure should wait until all legs SETTLE.`,
        "warning",
      ),
    );
  }
  return allow("G-A3");
}

// ============ G-A4: Exception Resolution ============

/**
 * G-A4 — Exception Resolution.
 *
 * Verifies that there are no blocking OPEN exceptions on the trade.
 *
 * • ALLOW       — no OPEN / ACKNOWLEDGED exceptions (all are RESOLVED /
 *                 CLOSED, or there are no exceptions at all).
 * • CONDITIONAL — there are OPEN / ACKNOWLEDGED exceptions but all have
 *                 severity 1-2 (operational — non-critical; can proceed
 *                 but must be tracked).
 * • DENY        — any OPEN / ACKNOWLEDGED exception has severity 3-5
 *                 (material / critical — must be resolved before
 *                 proceeding) OR exceptions is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateExceptionResolution(
  exceptions: ExceptionEventLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(exceptions)) {
    return deny(
      "G-A4",
      cond(
        "no_exception_state",
        "No exception state provided — exceptions must be loaded (getExceptions) before evaluating resolution readiness.",
        "unmet",
      ),
    );
  }
  if (exceptions.length === 0) {
    return allow("G-A4");
  }
  const open = exceptions.filter((e) => {
    const s = upper(e?.status);
    return s === "OPEN" || s === "ACKNOWLEDGED";
  });
  if (open.length === 0) {
    return allow("G-A4");
  }
  const critical = open.filter((e) => Number(e?.severity) >= 3);
  if (critical.length > 0) {
    return deny(
      "G-A4",
      cond(
        "critical_open_exceptions",
        `${critical.length} OPEN exception(s) with severity 3-5 (material/critical): ${critical
          .map((e) => `${e.exceptionId}(sev=${e.severity})`)
          .join(", ")}. Resolve the material exceptions before proceeding (executeRecovery or escalate).`,
        "unmet",
      ),
    );
  }
  return conditional(
    "G-A4",
    cond(
      "operational_open_exceptions",
      `${open.length} OPEN exception(s) with severity 1-2 (operational) — non-blocking but must be tracked. Proceeding is permitted but the exceptions must be resolved before trade closure.`,
      "warning",
    ),
  );
}

// ============ G-A5: Financial Exposure ============

/**
 * G-A5 — Financial Exposure.
 *
 * Verifies that the trade's financial exposure is fully resolved.
 *
 * • ALLOW       — exposureState = NONE or RESOLVED (no exposure, or the
 *                 exposure has been formally resolved).
 * • CONDITIONAL — exposureState = OPEN (exposure is tracked but not yet
 *                 resolved; can proceed but the exposure must be tracked
 *                 to RESOLVED before closure).
 * • DENY        — exposureState = REOPENED AND outstandingExposure is
 *                 critical (a previously-resolved exposure was reopened —
 *                 the §65 reversal is material and must be investigated
 *                 before proceeding) OR exposure is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateFinancialExposure(
  exposure: FinancialExposureLike | null | undefined,
): GateResult {
  if (!exposure) {
    return deny(
      "G-A5",
      cond(
        "no_exposure_state",
        "No financial exposure state provided — exposure must be loaded (getExposure or getOrCreateExposure) before evaluating closure readiness.",
        "unmet",
      ),
    );
  }
  const state = upper(exposure.exposureState);
  const ref = exposure.ustn || "(unidentified)";
  const outstanding = Number(exposure.outstandingExposure || 0);
  const reopened = Number(exposure.reopenedExposure || 0);

  if (state === "NONE" || state === "RESOLVED") {
    return allow("G-A5");
  }

  if (state === "REOPENED") {
    // Critical if the reopened amount exceeds a material threshold
    // (§65 — material exposure is defined as >= 10000 in any currency;
    // the threshold is intentionally low because REOPENED already implies
    // a reversal has occurred).
    const isCritical = reopened >= 10000 || outstanding >= 10000;
    if (isCritical) {
      return deny(
        "G-A5",
        cond(
          "reopened_critical_exposure",
          `Financial exposure for ${ref} is REOPENED with outstanding=${outstanding} ${exposure.currency || "USD"} (reopened=${reopened}). A previously-resolved exposure was reopened — investigate the §65 reversal before proceeding.`,
          "unmet",
        ),
      );
    }
    return conditional(
      "G-A5",
      cond(
        "reopened_exposure",
        `Financial exposure for ${ref} is REOPENED with outstanding=${outstanding} ${exposure.currency || "USD"} (below the material threshold of 10000). Track the reopened exposure to RESOLVED before closure.`,
        "warning",
      ),
    );
  }

  if (state === "OPEN" || state === "RECOVERING") {
    return conditional(
      "G-A5",
      cond(
        "open_exposure",
        `Financial exposure for ${ref} is ${state} (outstanding=${outstanding} ${exposure.currency || "USD"}). The exposure must be tracked to RESOLVED before closure can proceed.`,
        "warning",
      ),
    );
  }

  // Unknown state — treat as conditional (best-effort).
  return conditional(
    "G-A5",
    cond(
      "unknown_exposure_state",
      `Financial exposure for ${ref} has unknown exposureState "${exposure.exposureState}" — verify the exposure state before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-A6: Obligation Completion ============

/**
 * G-A6 — Obligation Completion.
 *
 * Verifies that all obligations on the trade are COMPLETED.
 *
 * • ALLOW       — all obligations are COMPLETED (or there are no
 *                 obligations — nothing to complete).
 * • CONDITIONAL — some obligations are PENDING / IN_PROGRESS / BLOCKED /
 *                 DISPUTED (in flight — the trade can proceed but the
 *                 obligations must be tracked to COMPLETED).
 * • DENY        — any obligation is FAILED (a hard failure has occurred
 *                 that requires resolution before proceeding) OR
 *                 obligations is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateObligationCompletion(
  obligations: ObligationLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(obligations)) {
    return deny(
      "G-A6",
      cond(
        "no_obligation_state",
        "No obligation state provided — obligations must be loaded (getObligations) before evaluating completion readiness.",
        "unmet",
      ),
    );
  }
  if (obligations.length === 0) {
    return allow("G-A6");
  }
  const failed = obligations.filter((o) => upper(o?.state) === "FAILED");
  if (failed.length > 0) {
    return deny(
      "G-A6",
      cond(
        "failed_obligations",
        `${failed.length} obligation(s) are in FAILED state: ${failed
          .map((o) => `${o.obligationId}(${o.obligationType})`)
          .join(", ")}. Resolve the failed obligations (executeRecovery, failObligation cascade, or disputeObligation) before proceeding.`,
        "unmet",
      ),
    );
  }
  const inFlight = obligations.filter((o) => {
    const s = upper(o?.state);
    return (
      s === "PENDING" ||
      s === "IN_PROGRESS" ||
      s === "BLOCKED" ||
      s === "DISPUTED"
    );
  });
  if (inFlight.length > 0) {
    const completedCount = obligations.length - inFlight.length;
    return conditional(
      "G-A6",
      cond(
        "in_flight_obligations",
        `${completedCount}/${obligations.length} obligations COMPLETED — ${inFlight.length} still in flight (PENDING/IN_PROGRESS/BLOCKED/DISPUTED). Track the in-flight obligations to COMPLETED before closure.`,
        "warning",
      ),
    );
  }
  return allow("G-A6");
}

// ============ G-A7: Closure Policy ============

/**
 * G-A7 — Closure Policy.
 *
 * Verifies that the closure policy evaluation reports that the trade
 * can be closed.
 *
 * • ALLOW       — closureResult.canClose = true (no blockers).
 * • CONDITIONAL — closureResult.closeWithExceptionAllowed = true but
 *                 canClose is false (the only blocker is an OPEN
 *                 exception with severity <= 2 — §113 close-with-
 *                 exception is permitted; closure is allowed with
 *                 the documented exception).
 * • DENY        — closureResult has blockers (any non-empty
 *                 blockers array that is not just EXCEPTION_OPEN with
 *                 severity <= 2) OR closureResult is null/undefined.
 *
 * Pure. Idempotent.
 */
export function gateClosurePolicy(
  closureResult: ClosureEvaluationLike | null | undefined,
): GateResult {
  if (!closureResult) {
    return deny(
      "G-A7",
      cond(
        "no_closure_evaluation",
        "No closure evaluation provided — run evaluateClosure(ustn) before evaluating closure readiness.",
        "unmet",
      ),
    );
  }
  const ref = closureResult.ustn || "(unidentified)";
  if (closureResult.canClose === true) {
    return allow("G-A7");
  }
  if (closureResult.closeWithExceptionAllowed === true) {
    return conditional(
      "G-A7",
      cond(
        "close_with_exception",
        `Trade ${ref} can be closed WITH an open exception (§113) — closeWithExceptionAllowed=true. The sole blocker is an OPEN exception with severity <= 2 (operational). Closure is permitted but the exception must be tracked.`,
        "warning",
      ),
    );
  }
  const blockers = Array.isArray(closureResult.blockers)
    ? closureResult.blockers
    : [];
  return deny(
    "G-A7",
    cond(
      "closure_blockers",
      `Trade ${ref} has ${blockers.length} closure blocker(s): ${blockers.join(", ") || "(unknown)"}. Resolve the blockers before closure can proceed (see getClosureBlockers + evaluateClosure).`,
      "unmet",
    ),
  );
}

// ============ Merger ============

const VERDICT_RANK: Record<GateVerdict, number> = {
  ALLOW: 0,
  CONDITIONAL: 1,
  DENY: 2,
};

/**
 * Merges an array of constitutional gate results into a single verdict.
 * Strictest wins (DENY > CONDITIONAL > ALLOW). Conditions from every
 * non-ALLOW gate are accumulated (in gate order).
 */
export function mergeConstitutionalGates(
  gates: GateResult[],
): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-A-MERGED",
      verdict: "ALLOW",
      conditions: [],
    };
  }
  let merged: GateVerdict = "ALLOW";
  const conditions: GateCondition[] = [];
  for (const g of gates) {
    if (!g) continue;
    if (VERDICT_RANK[g.verdict] > VERDICT_RANK[merged]) {
      merged = g.verdict;
    }
    if (g.verdict !== "ALLOW" && Array.isArray(g.conditions)) {
      conditions.push(...g.conditions);
    }
  }
  return {
    gateId: "G-A-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 7 constitutional gates ============

export interface ConstitutionalGateInput {
  stateVector?: StateVectorLike | null;
  eventChainVerification?: EventChainVerificationLike | null;
  paymentLegs?: PaymentLegLike[] | null;
  exceptions?: ExceptionEventLike[] | null;
  exposure?: FinancialExposureLike | null;
  obligations?: ObligationLike[] | null;
  closureEvaluation?: ClosureEvaluationLike | null;
}

/**
 * Convenience: runs all 7 constitutional gates and returns the merged
 * verdict. Each gate receives only the input it needs (null-safe). Useful
 * for a single "constitutional readiness" panel before settlement
 * submission, trade closure, or post-closure archival.
 *
 * The `stateVector` input is used by G-A1.
 * The `eventChainVerification` input is used by G-A2.
 * The `paymentLegs` input is used by G-A3.
 * The `exceptions` input is used by G-A4.
 * The `exposure` input is used by G-A5.
 * The `obligations` input is used by G-A6.
 * The `closureEvaluation` input is used by G-A7.
 */
export function validateConstitutionalGates(
  input: ConstitutionalGateInput,
): {
  verdict: GateVerdict;
  conditions: GateCondition[];
  gates: GateResult[];
} {
  const gates: GateResult[] = [
    gateStateVectorConsistency(input.stateVector),
    gateEventSpineIntegrity(input.eventChainVerification),
    gateSettlementLegState(input.paymentLegs),
    gateExceptionResolution(input.exceptions),
    gateFinancialExposure(input.exposure),
    gateObligationCompletion(input.obligations),
    gateClosurePolicy(input.closureEvaluation),
  ];
  const merged = mergeConstitutionalGates(gates);
  return {
    verdict: merged.verdict,
    conditions: merged.conditions,
    gates,
  };
}
