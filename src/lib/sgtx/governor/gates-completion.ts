// @ts-nocheck — defensive; advisory gates never throw
/**
 * SGTX Governor Phase 7 — Completion Gates (Blueprint §4-§6 G-P1..G-P6)
 * ------------------------------------------------------------
 * Six advisory Governor gates for Phase 7 (Delivery Acceptance, Claim
 * Resolution, Post-Clearance Completion, Evidence Package Seal,
 * Financial Reconciliation, Trade Closure). Each gate is an advisory
 * PURE function that takes a domain object (or array) and returns:
 *   { gateId, verdict, conditions: { id, label, status }[] }
 *
 * Verdict semantics (same as Phase 1/2/5/6 gates):
 *   • ALLOW       — the precondition is fully satisfied.
 *   • CONDITIONAL — the precondition is partially satisfied; can proceed
 *                   but the tenant must resolve the listed conditions
 *                   before contract lock / settlement / closure.
 *   • DENY        — hard violation; the action cannot proceed.
 *
 * GATES:
 *   • G-P1 gateDeliveryAcceptance        — delivery must be ACCEPTED
 *   • G-P2 gateClaimResolution            — no OPEN/ESCALATED claims
 *   • G-P3 gatePostClearanceCompletion    — no OPEN/IN_REVIEW actions
 *   • G-P4 gateEvidencePackageSeal       — evidence package SEALED
 *   • G-P5 gateFinancialReconciliation   — all reconciliations MATCHED/RESOLVED
 *   • G-P6 gateTradeClosure              — closureState = USTN_CLOSED
 *
 * The FINAL gate G-P6 is the USTN_CLOSED gate — it enforces that the
 * closure state of a trade is USTN_CLOSED before the trade is considered
 * fully closed / archived.
 *
 * Gates never throw — they degrade gracefully to DENY (for missing input)
 * or CONDITIONAL (for ambiguous input) with descriptive reasons when their
 * input is malformed.
 *
 * Usage:
 *   import {
 *     gateDeliveryAcceptance, gateClaimResolution,
 *     gatePostClearanceCompletion, gateEvidencePackageSeal,
 *     gateFinancialReconciliation, gateTradeClosure,
 *     mergeCompletionGates,
 *   } from "@/lib/sgtx/governor/gates-completion";
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

/** G-P1 input — a DeliveryAcceptance row (Phase 7 §1). */
export interface DeliveryAcceptanceLike {
  id?: string;
  ustn?: string;
  tradeId?: string;
  receiverGtid?: string;
  status?: string; // DELIVERED | ACCEPTED | REJECTED | PARTIAL_ACCEPTANCE
  quantityDelivered?: number;
  quantityAccepted?: number;
  condition?: string; // GOOD | DAMAGED | PARTIAL | CONTAMINATED | OTHER
  quality?: string; // ACCEPTABLE | REJECTED | CONDITIONAL
  podReference?: string;
  acceptanceTimestamp?: string | Date;
}

/** G-P2 input — an array of TradeClaim rows (Phase 7 §2). */
export interface TradeClaimLike {
  id?: string;
  claimId?: string;
  ustn?: string;
  parentUstn?: string;
  claimType?: string;
  status?: string; // OPEN | UNDER_REVIEW | ACCEPTED | REJECTED | RESOLVED | ESCALATED | WITHDRAWN
  claimSeverity?: string;
  filedAt?: string | Date;
  closedAt?: string | Date;
}

/** G-P3 input — an array of PostClearanceAction rows (Phase 7 §4). */
export interface PostClearanceActionLike {
  id?: string;
  actionId?: string;
  ustn?: string;
  actionType?: string;
  status?: string; // OPEN | IN_REVIEW | APPROVED | REJECTED | COMPLETED | PENDING_PAYMENT | PAID
  amountUsd?: number;
  filedAt?: string | Date;
  resolvedAt?: string | Date;
}

/** G-P4 input — a FinalEvidencePackage row (Phase 7 §5). */
export interface FinalEvidencePackageLike {
  id?: string;
  packageId?: string;
  ustn?: string;
  status?: string; // DRAFT | SEALED | AMENDED | ARCHIVED
  packageHash?: string;
  sealedAt?: string | Date;
  sealedBy?: string;
  completenessScore?: number;
}

/** G-P5 input — an array of ReconciliationRecord rows (Phase 6 §9). */
export interface ReconciliationLike {
  id?: string;
  reconciliationId?: string;
  ustn?: string;
  reconciliationType?: string;
  sourceAmountUsd?: number;
  targetAmountUsd?: number;
  differenceUsd?: number;
  status?: string; // PENDING | MATCHED | DISCREPANT | UNMATCHED | RESOLVED
  matchedAt?: string | Date;
}

/** G-P6 input — a TradeClosureState row (Phase 7 §6). */
export interface TradeClosureStateLike {
  id?: string;
  ustn?: string;
  closureState?: string; // OPEN | READY_FOR_CLOSURE | USTN_CLOSED | USTN_CLOSED_WITH_OPEN_DISPUTE
  closedAt?: string | Date;
  closedBy?: string;
  deliveryAccepted?: boolean;
  settlementComplete?: boolean;
  financialReconciliationComplete?: boolean;
  activeCustomsObligationsComplete?: boolean;
  requiredPostClearanceObligationsComplete?: boolean;
  disputeClaimStateResolved?: boolean;
  evidencePackageSealed?: boolean;
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

// ============ G-P1: Delivery Acceptance ============

/**
 * G-P1 — Delivery Acceptance.
 *
 * Verifies that a delivery has been ACCEPTED by the receiver. This is
 * the precondition for trade closure — a trade with an unaccepted
 * delivery cannot be closed.
 *
 * • ALLOW       — acceptance.status = ACCEPTED.
 * • CONDITIONAL — acceptance.status = PARTIAL_ACCEPTANCE (partial
 *                 acceptance — the receiver accepted part of the
 *                 consignment) OR acceptance.status = DELIVERED
 *                 (delivery recorded but not yet accepted/rejected).
 * • DENY        — acceptance.status = REJECTED (the receiver rejected
 *                 the delivery) or acceptance is null.
 *
 * Pure. Idempotent.
 */
export function gateDeliveryAcceptance(
  acceptance: DeliveryAcceptanceLike | null | undefined,
): GateResult {
  if (!acceptance) {
    return deny(
      "G-P1",
      cond(
        "no_delivery",
        "No delivery acceptance record provided — a delivery must be accepted before trade closure.",
        "unmet",
      ),
    );
  }
  const status = (acceptance.status || "").toUpperCase();
  const ref = acceptance.ustn || acceptance.id || "(unidentified)";

  if (status === "ACCEPTED") {
    return allow("G-P1");
  }

  if (status === "PARTIAL_ACCEPTANCE") {
    return conditional(
      "G-P1",
      cond(
        "partial_acceptance",
        `Delivery ${ref} is PARTIAL_ACCEPTANCE — the receiver accepted part of the consignment; a §2 SHORTAGE claim should be filed for the missing portion before closure.`,
        "warning",
      ),
    );
  }

  if (status === "DELIVERED") {
    return conditional(
      "G-P1",
      cond(
        "delivery_not_accepted",
        `Delivery ${ref} is DELIVERED but not yet accepted/rejected — the receiver must sign the PoD before closure.`,
        "warning",
      ),
    );
  }

  if (status === "REJECTED") {
    return deny(
      "G-P1",
      cond(
        "delivery_rejected",
        `Delivery ${ref} is REJECTED — a rejected delivery cannot be used to close a trade. Resolve the rejection (file a claim, initiate a return) before closure.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to DENY
  return deny(
    "G-P1",
    cond(
      "unknown_acceptance_status",
      `Delivery ${ref} has unrecognized status "${acceptance.status}" — verify before closure.`,
      "unmet",
    ),
  );
}

// ============ G-P2: Claim Resolution ============

/**
 * G-P2 — Claim Resolution.
 *
 * Verifies that there are no blocking OPEN claims on the trade. A
 * "blocking" claim is one in status OPEN / UNDER_REVIEW / ESCALATED.
 * A trade with formally-tracked open claims MAY be closed as
 * USTN_CLOSED_WITH_OPEN_DISPUTE (per §6), but ESCALATED claims must
 * be resolved first.
 *
 * • ALLOW       — no OPEN / UNDER_REVIEW / ESCALATED claims (all
 *                 resolved or withdrawn).
 * • CONDITIONAL — there are formally-open claims (OPEN or UNDER_REVIEW)
 *                 but none ESCALATED. Allowed for closure with open
 *                 dispute — tracked but not yet resolved.
 * • DENY        — there are ESCALATED claims (must be resolved first)
 *                 OR claims is null (no claim state to evaluate).
 *
 * `claims` is an array of TradeClaim rows for the trade (typically
 * from `getClaimsByUstn(ustn)`).
 *
 * Pure. Idempotent.
 */
export function gateClaimResolution(
  claims: TradeClaimLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(claims)) {
    return deny(
      "G-P2",
      cond(
        "no_claim_state",
        "No claim state provided — claims must be loaded before evaluating closure readiness.",
        "unmet",
      ),
    );
  }
  if (claims.length === 0) {
    return allow("G-P2");
  }

  // Categorize the claims
  const escalated = claims.filter(
    (c) => (c?.status || "").toUpperCase() === "ESCALATED",
  );
  const open = claims.filter((c) => {
    const s = (c?.status || "").toUpperCase();
    return s === "OPEN" || s === "UNDER_REVIEW";
  });

  if (escalated.length > 0) {
    return deny(
      "G-P2",
      cond(
        "escalated_claims",
        `${escalated.length} ESCALATED claim(s) must be resolved before closure — escalated claims are blocking.`,
        "unmet",
      ),
    );
  }

  if (open.length > 0) {
    return conditional(
      "G-P2",
      cond(
        "formally_open_claims",
        `${open.length} formally-open claim(s) (OPEN / UNDER_REVIEW) — allowed for closure as USTN_CLOSED_WITH_OPEN_DISPUTE per §6. Claims are tracked but not yet resolved.`,
        "warning",
      ),
    );
  }

  // All claims are in a terminal state (ACCEPTED/REJECTED/RESOLVED/WITHDRAWN)
  return allow("G-P2");
}

// ============ G-P3: Post-Clearance Completion ============

/**
 * G-P3 — Post-Clearance Completion.
 *
 * Verifies that there are no blocking OPEN / IN_REVIEW post-clearance
 * actions on the trade. PENDING_PAYMENT actions (approved refunds /
 * drawbacks awaiting customs payment) are non-blocking but flagged as
 * CONDITIONAL — the trade can proceed to closure but the payment must
 * be tracked.
 *
 * • ALLOW       — no OPEN / IN_REVIEW / PENDING_PAYMENT actions.
 * • CONDITIONAL — there are PENDING_PAYMENT actions (approved, awaiting
 *                 customs payment) — the trade can proceed but the
 *                 payment must be tracked.
 * • DENY        — there are OPEN or IN_REVIEW actions (not yet
 *                 processed) OR actions is null.
 *
 * `actions` is an array of PostClearanceAction rows for the trade
 * (typically from `getActionsByUstn(ustn)`).
 *
 * Pure. Idempotent.
 */
export function gatePostClearanceCompletion(
  actions: PostClearanceActionLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(actions)) {
    return deny(
      "G-P3",
      cond(
        "no_action_state",
        "No post-clearance action state provided — actions must be loaded before evaluating closure readiness.",
        "unmet",
      ),
    );
  }
  if (actions.length === 0) {
    return allow("G-P3");
  }

  // Categorize the actions
  const open = actions.filter(
    (a) => (a?.status || "").toUpperCase() === "OPEN",
  );
  const inReview = actions.filter(
    (a) => (a?.status || "").toUpperCase() === "IN_REVIEW",
  );
  const pendingPayment = actions.filter(
    (a) => (a?.status || "").toUpperCase() === "PENDING_PAYMENT",
  );

  if (open.length > 0 || inReview.length > 0) {
    const blocking = open.length + inReview.length;
    return deny(
      "G-P3",
      cond(
        "open_post_clearance_actions",
        `${blocking} OPEN/IN_REVIEW post-clearance action(s) must be reviewed and resolved before closure — these represent unfulfilled customs obligations.`,
        "unmet",
      ),
    );
  }

  if (pendingPayment.length > 0) {
    return conditional(
      "G-P3",
      cond(
        "pending_payments",
        `${pendingPayment.length} PENDING_PAYMENT post-clearance action(s) — approved refunds/drawbacks awaiting customs payment. Trade can proceed but payments must be tracked.`,
        "warning",
      ),
    );
  }

  // All actions are in a terminal state (COMPLETED / REJECTED / PAID / APPROVED)
  return allow("G-P3");
}

// ============ G-P4: Evidence Package Seal ============

/**
 * G-P4 — Evidence Package Seal.
 *
 * Verifies that the final evidence package has been SEALED — the
 * packageHash is present, sealedAt is set, and the status is SEALED.
 * A DRAFT package (not yet sealed) blocks closure; an AMENDED package
 * implies a newer version exists and should be checked; an ARCHIVED
 * package without a newer sealed version is treated as DENY.
 *
 * • ALLOW       — pkg.status = SEALED + packageHash present + sealedAt set.
 * • CONDITIONAL — pkg.status = DRAFT (not yet sealed) or pkg.status =
 *                 AMENDED (a new version exists — should reference the
 *                 latest version).
 * • DENY        — pkg is null or pkg.status = ARCHIVED without a newer
 *                 sealed version.
 *
 * Pure. Idempotent.
 */
export function gateEvidencePackageSeal(
  pkg: FinalEvidencePackageLike | null | undefined,
): GateResult {
  if (!pkg) {
    return deny(
      "G-P4",
      cond(
        "no_evidence_package",
        "No final evidence package provided — a sealed evidence package is required for trade closure.",
        "unmet",
      ),
    );
  }

  const status = (pkg.status || "").toUpperCase();
  const ref = pkg.packageId || pkg.id || "(unidentified)";

  if (status === "SEALED") {
    const hasHash = !!pkg.packageHash;
    const hasSealedAt = !!pkg.sealedAt;
    if (hasHash && hasSealedAt) {
      return allow("G-P4");
    }
    // SEALED but missing hash or sealedAt — corrupted seal
    return deny(
      "G-P4",
      cond(
        "corrupted_seal",
        `Evidence package ${ref} is SEALED but missing ${!hasHash ? "packageHash" : ""} ${!hasHash && !hasSealedAt ? "and" : ""} ${!hasSealedAt ? "sealedAt" : ""} — the seal is corrupted; re-seal the package.`,
        "unmet",
      ),
    );
  }

  if (status === "DRAFT") {
    return conditional(
      "G-P4",
      cond(
        "package_not_sealed",
        `Evidence package ${ref} is DRAFT — compile + seal the package before trade closure.`,
        "warning",
      ),
    );
  }

  if (status === "AMENDED") {
    return conditional(
      "G-P4",
      cond(
        "package_amended",
        `Evidence package ${ref} is AMENDED — a newer version exists; reference the latest sealed version for closure.`,
        "warning",
      ),
    );
  }

  if (status === "ARCHIVED") {
    return deny(
      "G-P4",
      cond(
        "package_archived",
        `Evidence package ${ref} is ARCHIVED — an archived package cannot gate closure; create + seal a new evidence package.`,
        "unmet",
      ),
    );
  }

  // Unknown status — default to DENY
  return deny(
    "G-P4",
    cond(
      "unknown_package_status",
      `Evidence package ${ref} has unrecognized status "${pkg.status}" — verify before closure.`,
      "unmet",
    ),
  );
}

// ============ G-P5: Financial Reconciliation ============

/**
 * G-P5 — Financial Reconciliation.
 *
 * Verifies that all reconciliation records for the trade are in a
 * terminal state (MATCHED or RESOLVED). DISCREPANT records are
 * non-blocking but flagged as CONDITIONAL — the trade can proceed but
 * the discrepancies must be tracked. UNMATCHED records are blocking
 * — no matching target record was found.
 *
 * • ALLOW       — all reconciliations are MATCHED or RESOLVED (or there
 *                 are no reconciliations to perform).
 * • CONDITIONAL — some reconciliations are DISCREPANT (unresolved
 *                 differences).
 * • DENY        — some reconciliations are UNMATCHED (no matching
 *                 target) OR reconciliations is null.
 *
 * `reconciliations` is an array of ReconciliationRecord rows for the
 * trade (typically from a `listReconciliations({ ustn })` call).
 *
 * Pure. Idempotent.
 */
export function gateFinancialReconciliation(
  reconciliations: ReconciliationLike[] | null | undefined,
): GateResult {
  if (!Array.isArray(reconciliations)) {
    return deny(
      "G-P5",
      cond(
        "no_recon_state",
        "No reconciliation state provided — reconciliations must be loaded before evaluating closure readiness.",
        "unmet",
      ),
    );
  }
  if (reconciliations.length === 0) {
    return allow("G-P5");
  }

  const unmatched = reconciliations.filter(
    (r) => (r?.status || "").toUpperCase() === "UNMATCHED",
  );
  const discrepant = reconciliations.filter(
    (r) => (r?.status || "").toUpperCase() === "DISCREPANT",
  );
  const pending = reconciliations.filter(
    (r) => (r?.status || "").toUpperCase() === "PENDING",
  );

  if (unmatched.length > 0) {
    return deny(
      "G-P5",
      cond(
        "unmatched_reconciliations",
        `${unmatched.length} UNMATCHED reconciliation(s) — no matching target record found. Investigate before closure.`,
        "unmet",
      ),
    );
  }

  const blockingCount = discrepant.length + pending.length;
  if (blockingCount > 0) {
    return conditional(
      "G-P5",
      cond(
        "discrepant_reconciliations",
        `${discrepant.length} DISCREPANT + ${pending.length} PENDING reconciliation(s) — finance team must resolve or accept the differences before closure.`,
        "warning",
      ),
    );
  }

  // All reconciliations are MATCHED or RESOLVED
  return allow("G-P5");
}

// ============ G-P6: Trade Closure (FINAL USTN_CLOSED GATE) ============

/**
 * G-P6 — Trade Closure (the FINAL USTN_CLOSED gate).
 *
 * Verifies that the trade's closure state is USTN_CLOSED — the
 * definitive gate that the trade has been formally closed. This is
 * the gate that downstream consumers (archive, regulatory retention,
 * reporting) check before treating a trade as "done".
 *
 * • ALLOW       — closureState.closureState = USTN_CLOSED.
 * • CONDITIONAL — closureState = READY_FOR_CLOSURE (all conditions met
 *                 but not yet closed — the user just needs to click the
 *                 "close" button) OR USTN_CLOSED_WITH_OPEN_DISPUTE
 *                 (closed but with a formally-open dispute).
 * • DENY        — closureState = OPEN (not ready for closure) or
 *                 closureState is null.
 *
 * Pure. Idempotent.
 */
export function gateTradeClosure(
  closureState: TradeClosureStateLike | null | undefined,
): GateResult {
  if (!closureState) {
    return deny(
      "G-P6",
      cond(
        "no_closure_state",
        "No closure state provided — the trade has not been evaluated for closure readiness.",
        "unmet",
      ),
    );
  }

  const state = (closureState.closureState || "").toUpperCase();
  const ref = closureState.ustn || "(unidentified)";

  if (state === "USTN_CLOSED") {
    return allow("G-P6");
  }

  if (state === "READY_FOR_CLOSURE") {
    return conditional(
      "G-P6",
      cond(
        "ready_not_closed",
        `Trade ${ref} is READY_FOR_CLOSURE — all 7 closure conditions are met; call closeTrade() to formally close.`,
        "warning",
      ),
    );
  }

  if (state === "USTN_CLOSED_WITH_OPEN_DISPUTE") {
    return conditional(
      "G-P6",
      cond(
        "closed_with_open_dispute",
        `Trade ${ref} is USTN_CLOSED_WITH_OPEN_DISPUTE — the trade is closed but a formally-open dispute is tracked. Resolve the dispute when possible.`,
        "warning",
      ),
    );
  }

  if (state === "OPEN") {
    return deny(
      "G-P6",
      cond(
        "trade_not_ready",
        `Trade ${ref} is OPEN — not all 7 closure conditions are met. Resolve the unmet conditions before closure.`,
        "unmet",
      ),
    );
  }

  // Unknown closureState — default to DENY
  return deny(
    "G-P6",
    cond(
      "unknown_closure_state",
      `Trade ${ref} has unrecognized closureState "${closureState.closureState}" — verify before treating as closed.`,
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
 * Merges an array of gate results into a single verdict. Strictest wins
 * (DENY > CONDITIONAL > ALLOW). Conditions from every non-ALLOW gate
 * are accumulated (in gate order).
 */
export function mergeCompletionGates(gates: GateResult[]): GateResult {
  if (!Array.isArray(gates) || gates.length === 0) {
    return {
      gateId: "G-P-MERGED",
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
    gateId: "G-P-MERGED",
    verdict: merged,
    conditions,
  };
}

// ============ Convenience: run all 6 completion gates ============

export interface CompletionGateInput {
  acceptance?: DeliveryAcceptanceLike | null;
  claims?: TradeClaimLike[] | null;
  actions?: PostClearanceActionLike[] | null;
  evidencePackage?: FinalEvidencePackageLike | null;
  reconciliations?: ReconciliationLike[] | null;
  closureState?: TradeClosureStateLike | null;
}

/**
 * Convenience: runs all 6 completion gates and returns the merged
 * verdict. Each gate receives only the input it needs (null-safe).
 * Useful for a single "completion readiness" panel before trade
 * archive / regulatory retention handoff.
 */
export function validateCompletionGates(
  input: CompletionGateInput,
): { verdict: GateVerdict; conditions: GateCondition[]; gates: GateResult[] } {
  const gates: GateResult[] = [
    gateDeliveryAcceptance(input.acceptance),
    gateClaimResolution(input.claims),
    gatePostClearanceCompletion(input.actions),
    gateEvidencePackageSeal(input.evidencePackage),
    gateFinancialReconciliation(input.reconciliations),
    gateTradeClosure(input.closureState),
  ];
  const merged = mergeCompletionGates(gates);
  return {
    verdict: merged.verdict,
    conditions: merged.conditions,
    gates,
  };
}
