// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Governor Phase 6 — Financial Gates (Blueprint §1-§9 G-F1..G-F6)
 * ------------------------------------------------------------
 * Six advisory Governor gates for Phase 6 (Payment, Trade Finance, LC
 * Presentation, Guarantee, Insurance, Reconciliation). Each gate is an
 * advisory PURE function that takes a domain object and returns:
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2/5 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / settlement.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * NON-MARKETPLACE ENFORCEMENT:
 *   • G-F2 enforces financier relationship verification (relationshipVerified
 *     must be true). No CONDITIONAL — a financier MUST be in the trader's
 *     approved list. This is the strictest of all 6 financial gates.
 *
 * Gates never throw — they degrade gracefully to DENY (for missing input) or
 * CONDITIONAL (for ambiguous input) with descriptive reasons when their
 * input is malformed.
 *
 * Usage:
 *   import {
 *     gatePaymentStatus, gateFinancierRelationship,
 *     gateLcPresentationReadiness, gateGuaranteeValidity,
 *     gateInsuranceCoverage, gateReconciliationStatus,
 *     mergeFinancialGates,
 *   } from "@/lib/sgtx/governor/gates-financial";
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

// Loose input shapes — the gates accept either a Prisma row or a
// compatible plain object so they remain pure and unit-testable without
// a DB connection.

/** G-F1 input — a GlobalPayment row (see schema.prisma line 6372). */
export interface PaymentLike {
  id?: string;
  paymentId?: string;
  ustn?: string;
  status?: string; // PENDING | SUBMITTED | PROCESSING | SETTLED | FAILED | CANCELLED | REVERSED | DUPLICATE
  amountUsd?: number;
  currency?: string;
  paymentMethod?: string;
  reconciliationStatus?: string;
}

/** G-F2 input — a TradeFinanceCase row (see schema.prisma line 6437). */
export interface TradeFinanceCaseLike {
  id?: string;
  caseId?: string;
  ustn?: string;
  borrowerGtid?: string;
  financierGtid?: string;
  financierType?: string;
  status?: string;
  relationshipVerified?: boolean; // the non-marketplace gate field
  amountUsd?: number;
}

/**
 * G-F3 input — a DocumentaryMatch row (see schema.prisma line 6527).
 * The `discrepancies` field is a JSON string of:
 *   Array<{ field, docA, docB, valueA, valueB, severity, type }>
 * where severity is "CRITICAL" | "MAJOR" | "MINOR".
 */
export interface DocumentaryMatchLike {
  id?: string;
  ustn?: string;
  lcNumber?: string;
  matchStatus?: string; // PENDING | MATCHED | DISCREPANT | WAIVED
  discrepancyCount?: number;
  discrepancies?: string | null; // JSON string
  fieldsChecked?: string | null;
  confidence?: number;
  readyForPresentation?: boolean;
}

/** G-F4 input — a GuaranteeRecord row (see schema.prisma line 6560). */
export interface GuaranteeLike {
  id?: string;
  guaranteeId?: string;
  ustn?: string;
  guaranteeType?: string;
  issuerGtid?: string;
  beneficiaryGtid?: string;
  amountUsd?: number;
  status?: string; // DRAFT | ISSUED | ACTIVE | CALLED | EXPIRED | RELEASED | CANCELLED
  issuedAt?: string | Date;
  validFrom?: string | Date;
  validUntil?: string | Date;
  releasedAt?: string | Date;
}

/** G-F5 input — an InsuranceLifecycle row (see schema.prisma line 6609). */
export interface InsuranceLifecycleLike {
  id?: string;
  ustn?: string;
  policyId?: string;
  claimId?: string;
  insuranceType?: string;
  insurerGtid?: string;
  insuredGtid?: string;
  coverageAmountUsd?: number;
  premiumUsd?: number;
  currentStep?: string;
  status?: string; // DRAFT | ACTIVE | INCIDENT | CLAIMED | SETTLED | RECOVERED | CLOSED | REJECTED
}

/** G-F6 input — a ReconciliationRecord row (see schema.prisma line 6733). */
export interface ReconciliationLike {
  id?: string;
  reconciliationId?: string;
  ustn?: string;
  reconciliationType?: string;
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetReference?: string;
  sourceAmountUsd?: number;
  targetAmountUsd?: number;
  differenceUsd?: number;
  status?: string; // PENDING | MATCHED | DISCREPANT | UNMATCHED | RESOLVED
  matchedAt?: string | Date;
}

// ============ Thresholds ============

/** Grace period for an EXPIRED guarantee (days). */
const GUARANTEE_GRACE_PERIOD_DAYS = 7;

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

/**
 * Parse a JSON string into an array of discrepancies. Defensive — returns []
 * on any parse error or non-array input. Pure.
 */
function parseDiscrepancies(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns true if any discrepancy has severity CRITICAL. Pure.
 */
function hasCriticalDiscrepancy(discrepancies: any[]): boolean {
  return discrepancies.some(
    (d) => String(d?.severity || "").toUpperCase() === "CRITICAL",
  );
}

/**
 * Returns true if any discrepancy has severity MAJOR (which is blocking
 * unless explicitly waived). Pure.
 */
function hasMajorDiscrepancy(discrepancies: any[]): boolean {
  return discrepancies.some(
    (d) => String(d?.severity || "").toUpperCase() === "MAJOR",
  );
}

/**
 * Returns true if the date is in the past (strict). Pure.
 */
function isPast(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

/**
 * Returns true if the date is in the future (strict). Pure.
 */
function isFuture(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() > Date.now();
}

/**
 * Returns the number of days between now and a date. Positive = future,
 * negative = past. Pure.
 */
function daysFromNow(d: string | Date | null | undefined): number {
  if (!d) return 0;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return 0;
  const ms = dt.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// ============ G-F1: Payment Status ============

/**
 * G-F1 — Payment Status.
 *
 * Verifies that a GlobalPayment is in a SETTLED state before downstream
 * financial actions (settlement, payout, accounting entry posting) are
 * allowed to proceed.
 *
 * • ALLOW       — payment.status = SETTLED.
 * • CONDITIONAL — payment.status = SUBMITTED or PROCESSING (in-flight —
 *                 the action can be queued but not finalized until SETTLED).
 * • DENY        — payment.status = FAILED / CANCELLED / REVERSED / DUPLICATE
 *                 or payment is null.
 *
 * Pure. Idempotent.
 */
export function gatePaymentStatus(
  payment: PaymentLike | null | undefined,
): GateResult {
  if (!payment) {
    return deny(
      "G-F1",
      cond(
        "no_payment",
        "No payment provided — initiate a payment before proceeding.",
        "unmet",
      ),
    );
  }

  const status = (payment.status || "").toUpperCase();

  if (status === "SETTLED") {
    return allow("G-F1");
  }

  if (status === "SUBMITTED" || status === "PROCESSING") {
    return conditional(
      "G-F1",
      cond(
        "payment_in_flight",
        `Payment ${payment.paymentId || payment.id || "(unidentified)"} is ${status} — settlement is in flight; queue the action until SETTLED.`,
        "warning",
      ),
    );
  }

  if (status === "PENDING") {
    return conditional(
      "G-F1",
      cond(
        "payment_pending",
        `Payment ${payment.paymentId || payment.id || "(unidentified)"} is PENDING — submit the payment before proceeding.`,
        "warning",
      ),
    );
  }

  if (
    status === "FAILED" ||
    status === "CANCELLED" ||
    status === "REVERSED" ||
    status === "DUPLICATE"
  ) {
    return deny(
      "G-F1",
      cond(
        "payment_terminal_failure",
        `Payment ${payment.paymentId || payment.id || "(unidentified)"} is ${status} — a non-settled payment cannot be used to gate a downstream financial action.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-F1",
    cond(
      "payment_unknown_status",
      `Payment ${payment.paymentId || payment.id || "(unidentified)"} has unrecognized status "${payment.status}" — verify before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-F2: Financier Relationship (NON-MARKETPLACE) ============

/**
 * G-F2 — Financier Relationship (NON-MARKETPLACE enforcement).
 *
 * Verifies that the financier in a TradeFinanceCase has been explicitly
 * verified as part of the trader's approved financier list. SGTX is
 * NON-MARKETPLACE — there is no public financier directory and no
 * recommendation engine. A financier can participate ONLY if the trader
 * has an active FinancierRelationship with them.
 *
 * • ALLOW       — case.relationshipVerified = true.
 * • DENY        — case.relationshipVerified = false OR case is null.
 *
 * NO CONDITIONAL — this is the strictest of all 6 financial gates. The
 * financier MUST be in the trader's approved list; there is no "maybe" path.
 *
 * Pure. Idempotent.
 */
export function gateFinancierRelationship(
  tradeFinanceCase: TradeFinanceCaseLike | null | undefined,
): GateResult {
  if (!tradeFinanceCase) {
    return deny(
      "G-F2",
      cond(
        "no_case",
        "No trade finance case provided — verify the financier relationship before proceeding.",
        "unmet",
      ),
    );
  }

  // relationshipVerified is a Boolean. Treat undefined/null/false all as
  // NOT verified — the safe default is DENY (non-marketplace fail-closed).
  if (tradeFinanceCase.relationshipVerified === true) {
    return allow("G-F2");
  }

  // Build a descriptive reason for the DENY.
  const caseRef =
    tradeFinanceCase.caseId || tradeFinanceCase.id || "(unidentified)";
  const financierRef = tradeFinanceCase.financierGtid || "(none)";
  return deny(
    "G-F2",
    cond(
      "relationship_not_verified",
      `Case ${caseRef} financier ${financierRef} is NOT in the trader's approved financier list — SGTX is non-marketplace; an explicit relationship is required (relationshipVerified=false).`,
      "unmet",
    ),
  );
}

// ============ G-F3: LC Presentation Readiness ============

/**
 * G-F3 — LC Presentation Readiness.
 *
 * Verifies that a documentary match is ready for LC presentation (the bank
 * will examine the documents and either accept or list discrepancies).
 *
 * • ALLOW       — match.readyForPresentation = true (no blocking discrepancies).
 * • CONDITIONAL — match.matchStatus = DISCREPANT with only MINOR
 *                 discrepancies (the bank may still accept, or waive).
 * • DENY        — match.matchStatus = DISCREPANT with CRITICAL discrepancies
 *                 OR match is null.
 *
 * MAJOR discrepancies that are NOT waived are treated as DENY (blocking
 * unless explicitly waived — see waiveDiscrepancy in the documentary-matching
 * lib). When matchStatus = WAIVED, the gate returns ALLOW (all discrepancies
 * have been explicitly waived).
 *
 * Pure.
 */
export function gateLcPresentationReadiness(
  match: DocumentaryMatchLike | null | undefined,
): GateResult {
  if (!match) {
    return deny(
      "G-F3",
      cond(
        "no_match",
        "No documentary match provided — run runDocumentaryMatch before presenting to the bank.",
        "unmet",
      ),
    );
  }

  // WAIVED — all discrepancies have been explicitly waived → ALLOW.
  const matchStatus = (match.matchStatus || "").toUpperCase();
  if (matchStatus === "WAIVED" || matchStatus === "MATCHED") {
    return allow("G-F3");
  }

  // readyForPresentation flag is the source of truth from the matching lib.
  if (match.readyForPresentation === true) {
    return allow("G-F3");
  }

  // PENDING — match not yet evaluated.
  if (matchStatus === "PENDING" || !matchStatus) {
    return conditional(
      "G-F3",
      cond(
        "match_pending",
        `Documentary match for LC ${match.lcNumber || "(unidentified)"} is PENDING — run the match before presenting.`,
        "warning",
      ),
    );
  }

  // DISCREPANT — inspect severity.
  if (matchStatus === "DISCREPANT") {
    const discrepancies = parseDiscrepancies(match.discrepancies);
    const critical = hasCriticalDiscrepancy(discrepancies);
    const major = hasMajorDiscrepancy(discrepancies);

    if (critical) {
      const criticalList = discrepancies
        .filter((d) => String(d?.severity || "").toUpperCase() === "CRITICAL")
        .slice(0, 5)
        .map((d) => `${d.field}${d.type ? ` (${d.type})` : ""}`)
        .join(", ");
      return deny(
        "G-F3",
        cond(
          "critical_discrepancies",
          `Documentary match for LC ${match.lcNumber || "(unidentified)"} has CRITICAL discrepancies: ${criticalList || "(none detailed)"} — presentation will be refused by the issuing bank.`,
          "unmet",
        ),
      );
    }

    if (major) {
      const majorList = discrepancies
        .filter((d) => String(d?.severity || "").toUpperCase() === "MAJOR")
        .slice(0, 5)
        .map((d) => `${d.field}${d.type ? ` (${d.type})` : ""}`)
        .join(", ");
      return deny(
        "G-F3",
        cond(
          "major_discrepancies_unwaived",
          `Documentary match for LC ${match.lcNumber || "(unidentified)"} has unwaived MAJOR discrepancies: ${majorList || "(none detailed)"} — waive explicitly or correct before presenting.`,
          "unmet",
        ),
      );
    }

    // Only MINOR discrepancies — bank may still accept.
    const minorList = discrepancies
      .filter((d) => String(d?.severity || "").toUpperCase() === "MINOR")
      .slice(0, 5)
      .map((d) => `${d.field}`)
      .join(", ");
    return conditional(
      "G-F3",
      cond(
        "minor_discrepancies",
        `Documentary match for LC ${match.lcNumber || "(unidentified)"} has ${discrepancies.length} MINOR discrepancy/discrepancies: ${minorList || "(none detailed)"} — bank may still accept; proceed with caution.`,
        "warning",
      ),
    );
  }

  // Unknown matchStatus — default to CONDITIONAL.
  return conditional(
    "G-F3",
    cond(
      "match_unknown_status",
      `Documentary match for LC ${match.lcNumber || "(unidentified)"} has unrecognized matchStatus "${match.matchStatus}" — verify before presenting.`,
      "warning",
    ),
  );
}

// ============ G-F4: Guarantee Validity ============

/**
 * G-F4 — Guarantee Validity.
 *
 * Verifies that a GuaranteeRecord is in an ACTIVE state and within its
 * valid date window (validFrom ≤ now ≤ validUntil). This gates actions
 * that rely on the guarantee being callable (customs release, payment
 * drawdown, etc.).
 *
 * • ALLOW       — guarantee.status = ACTIVE + within valid dates.
 * • CONDITIONAL — guarantee.status = ISSUED but not yet ACTIVE (validFrom
 *                 is in the future), OR guarantee.status = EXPIRED but
 *                 within the grace period (GUARANTEE_GRACE_PERIOD_DAYS = 7).
 * • DENY        — guarantee.status = CALLED / CANCELLED, OR EXPIRED beyond
 *                 grace period, OR guarantee is null.
 *
 * Pure.
 */
export function gateGuaranteeValidity(
  guarantee: GuaranteeLike | null | undefined,
): GateResult {
  if (!guarantee) {
    return deny(
      "G-F4",
      cond(
        "no_guarantee",
        "No guarantee provided — issue a guarantee before relying on it.",
        "unmet",
      ),
    );
  }

  const status = (guarantee.status || "").toUpperCase();
  const gref =
    guarantee.guaranteeId || guarantee.id || "(unidentified)";

  // RELEASED guarantees have served their purpose — typically ALLOW (they
  // were once ACTIVE and have been formally released, indicating successful
  // discharge). The spec doesn't explicitly mention RELEASED, but a
  // RELEASED guarantee is a positive outcome (customs cleared, payment
  // settled) — we ALLOW downstream actions that depend on the historical
  // guarantee.
  if (status === "RELEASED") {
    return allow("G-F4");
  }

  if (status === "ACTIVE") {
    // Verify the valid date window.
    const now = Date.now();
    const from = guarantee.validFrom ? new Date(guarantee.validFrom) : null;
    const until = guarantee.validUntil ? new Date(guarantee.validUntil) : null;

    if (from && !Number.isNaN(from.getTime()) && from.getTime() > now) {
      return conditional(
        "G-F4",
        cond(
          "guarantee_not_yet_active",
          `Guarantee ${gref} is ACTIVE but validFrom ${from.toISOString().slice(0, 10)} is in the future — activation pending.`,
          "warning",
        ),
      );
    }
    if (until && !Number.isNaN(until.getTime()) && until.getTime() < now) {
      // ACTIVE but past validUntil — should have been EXPIRED. Treat as
      // conditional (data inconsistency).
      return conditional(
        "G-F4",
        cond(
          "guarantee_past_validity",
          `Guarantee ${gref} is ACTIVE but validUntil ${until.toISOString().slice(0, 10)} is in the past — refresh the guarantee status.`,
          "warning",
        ),
      );
    }
    return allow("G-F4");
  }

  if (status === "ISSUED") {
    // ISSUED but not yet ACTIVE.
    const from = guarantee.validFrom ? new Date(guarantee.validFrom) : null;
    const daysUntilActive = from ? daysFromNow(from) : null;
    return conditional(
      "G-F4",
      cond(
        "guarantee_issued_not_active",
        `Guarantee ${gref} is ISSUED but not yet ACTIVE${daysUntilActive != null ? ` (activates in ${daysUntilActive} day(s))` : ""} — proceed with caution; downstream actions requiring drawdown will fail until ACTIVE.`,
        "warning",
      ),
    );
  }

  if (status === "EXPIRED") {
    // EXPIRED — check if within grace period.
    const until = guarantee.validUntil ? new Date(guarantee.validUntil) : null;
    const daysPast = until ? -daysFromNow(until) : null;
    if (daysPast != null && daysPast <= GUARANTEE_GRACE_PERIOD_DAYS) {
      return conditional(
        "G-F4",
        cond(
          "guarantee_expired_within_grace",
          `Guarantee ${gref} EXPIRED ${daysPast} day(s) ago — within the ${GUARANTEE_GRACE_PERIOD_DAYS}-day grace period; renew immediately.`,
          "warning",
        ),
      );
    }
    return deny(
      "G-F4",
      cond(
        "guarantee_expired_beyond_grace",
        `Guarantee ${gref} EXPIRED${daysPast != null ? ` ${daysPast} day(s) ago` : ""} — beyond the ${GUARANTEE_GRACE_PERIOD_DAYS}-day grace period; renew before relying on it.`,
        "unmet",
      ),
    );
  }

  if (status === "DRAFT") {
    return deny(
      "G-F4",
      cond(
        "guarantee_draft",
        `Guarantee ${gref} is DRAFT — issue + activate the guarantee before relying on it.`,
        "unmet",
      ),
    );
  }

  if (status === "CALLED" || status === "CANCELLED") {
    return deny(
      "G-F4",
      cond(
        "guarantee_terminal",
        `Guarantee ${gref} is ${status} — a ${status.toLowerCase()} guarantee cannot be relied on.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-F4",
    cond(
      "guarantee_unknown_status",
      `Guarantee ${gref} has unrecognized status "${guarantee.status}" — verify before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-F5: Insurance Coverage ============

/**
 * G-F5 — Insurance Coverage.
 *
 * Verifies that an InsuranceLifecycle is in a state where the underlying
 * shipment is insured (an ACTIVE bound policy, or a SETTLED claim). This
 * gates actions that depend on cargo being insured (loading, customs
 * clearance, payout).
 *
 * • ALLOW       — lifecycle.status = ACTIVE (bound policy) or SETTLED.
 * • CONDITIONAL — lifecycle.status = DRAFT (quote stage — not yet bound).
 * • DENY        — lifecycle.status = REJECTED or lifecycle is null.
 *
 * Note: INCIDENT / CLAIMED / RECOVERED / CLOSED are post-incident states —
 * they imply the policy was once ACTIVE. We ALLOW them (the coverage was
 * in force when the incident occurred; the lifecycle is now in the claims
 * phase). The gate is concerned with WHETHER the policy was bound, not
 * the current claim status.
 *
 * Pure.
 */
export function gateInsuranceCoverage(
  lifecycle: InsuranceLifecycleLike | null | undefined,
): GateResult {
  if (!lifecycle) {
    return deny(
      "G-F5",
      cond(
        "no_lifecycle",
        "No insurance lifecycle provided — bind a policy before relying on coverage.",
        "unmet",
      ),
    );
  }

  const status = (lifecycle.status || "").toUpperCase();
  const lref =
    lifecycle.policyId || lifecycle.id || "(unidentified)";

  if (status === "ACTIVE" || status === "SETTLED") {
    return allow("G-F5");
  }

  // Post-incident states — the policy was once bound; coverage applies.
  if (
    status === "INCIDENT" ||
    status === "CLAIMED" ||
    status === "RECOVERED" ||
    status === "CLOSED"
  ) {
    return allow("G-F5");
  }

  if (status === "DRAFT") {
    return conditional(
      "G-F5",
      cond(
        "insurance_draft",
        `Insurance lifecycle ${lref} is in DRAFT (quote stage — not yet bound) — bind the policy before relying on coverage.`,
        "warning",
      ),
    );
  }

  if (status === "REJECTED") {
    return deny(
      "G-F5",
      cond(
        "insurance_rejected",
        `Insurance lifecycle ${lref} is REJECTED — secure alternative coverage before proceeding.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-F5",
    cond(
      "insurance_unknown_status",
      `Insurance lifecycle ${lref} has unrecognized status "${lifecycle.status}" — verify before proceeding.`,
      "warning",
    ),
  );
}

// ============ G-F6: Reconciliation Status ============

/**
 * G-F6 — Reconciliation Status.
 *
 * Verifies that a ReconciliationRecord is in a reconciled state (MATCHED
 * or RESOLVED) before downstream actions (payout release, ledger close,
 * settlement confirmation) are allowed to proceed.
 *
 * • ALLOW       — reconciliation.status = MATCHED or RESOLVED.
 * • CONDITIONAL — reconciliation.status = DISCREPANT (unresolved
 *                 discrepancy — proceed with caution; finance team must
 *                 resolve or accept the difference).
 * • DENY        — reconciliation.status = UNMATCHED (no matching target
 *                 found) or reconciliation is null.
 *
 * PENDING is a transient state — treated as CONDITIONAL (the matching
 * engine has not yet evaluated this record).
 *
 * Pure.
 */
export function gateReconciliationStatus(
  reconciliation: ReconciliationLike | null | undefined,
): GateResult {
  if (!reconciliation) {
    return deny(
      "G-F6",
      cond(
        "no_reconciliation",
        "No reconciliation record provided — run reconciliation before proceeding.",
        "unmet",
      ),
    );
  }

  const status = (reconciliation.status || "").toUpperCase();
  const rref =
    reconciliation.reconciliationId || reconciliation.id || "(unidentified)";

  if (status === "MATCHED" || status === "RESOLVED") {
    return allow("G-F6");
  }

  if (status === "DISCREPANT") {
    const diff = Number(reconciliation.differenceUsd);
    const diffLabel = Number.isFinite(diff)
      ? ` (difference $${diff.toFixed(2)})`
      : "";
    return conditional(
      "G-F6",
      cond(
        "reconciliation_discrepant",
        `Reconciliation ${rref} is DISCREPANT${diffLabel} — finance team must resolve or accept the difference before proceeding.`,
        "warning",
      ),
    );
  }

  if (status === "PENDING") {
    return conditional(
      "G-F6",
      cond(
        "reconciliation_pending",
        `Reconciliation ${rref} is PENDING — the matching engine has not yet evaluated this record.`,
        "warning",
      ),
    );
  }

  if (status === "UNMATCHED") {
    return deny(
      "G-F6",
      cond(
        "reconciliation_unmatched",
        `Reconciliation ${rref} is UNMATCHED — no matching target record was found; investigate before proceeding.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to CONDITIONAL.
  return conditional(
    "G-F6",
    cond(
      "reconciliation_unknown_status",
      `Reconciliation ${rref} has unrecognized status "${reconciliation.status}" — verify before proceeding.`,
      "warning",
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
 * Merges an array of gate results into a single verdict. Strictest wins
 * (DENY > CONDITIONAL > ALLOW). Conditions from every non-ALLOW gate
 * are accumulated (in gate order).
 */
export function mergeFinancialGates(gates: GateResult[]): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-F-MERGED",
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
    gateId: "G-F-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 6 financial gates ============

export interface FinancialGateInput {
  payment?: PaymentLike | null;
  tradeFinanceCase?: TradeFinanceCaseLike | null;
  match?: DocumentaryMatchLike | null;
  guarantee?: GuaranteeLike | null;
  lifecycle?: InsuranceLifecycleLike | null;
  reconciliation?: ReconciliationLike | null;
}

/**
 * Convenience: runs all 6 financial gates and returns the merged verdict.
 * Each gate receives only the input it needs (null-safe). Useful for a
 * single "financial readiness" panel before settlement release.
 */
export function validateFinancialGates(
  input: FinancialGateInput,
): { verdict: GateVerdict; conditions: GateCondition[]; gates: GateResult[] } {
  const gates: GateResult[] = [
    gatePaymentStatus(input.payment),
    gateFinancierRelationship(input.tradeFinanceCase),
    gateLcPresentationReadiness(input.match),
    gateGuaranteeValidity(input.guarantee),
    gateInsuranceCoverage(input.lifecycle),
    gateReconciliationStatus(input.reconciliation),
  ];
  const merged = mergeFinancialGates(gates);
  return { verdict: merged.verdict, conditions: merged.conditions, gates };
}
