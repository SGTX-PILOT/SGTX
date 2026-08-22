// @ts-nocheck
/**
 * SGTX Phase 7 — §6 Trade Closure State Engine
 * ===========================================================================
 *
 * Implements the 7-condition trade closure gate on top of the new
 * `TradeClosureState` Prisma model (schema line 7037). The closure state
 * is the FINAL gate of a trade — a USTN cannot be marked USTN_CLOSED
 * until ALL 7 closure conditions are met.
 *
 * The 7 closure conditions (§6):
 *
 *   1. deliveryAccepted                              — §1 DeliveryAcceptance is ACCEPTED
 *   2. settlementComplete                            — Phase 6 GlobalPayment all SETTLED
 *   3. financialReconciliationComplete               — Phase 6 ReconciliationRecord all MATCHED/RESOLVED
 *   4. activeCustomsObligationsComplete              — Phase 4 CustomsOperation no GOVERNMENT_HOLD
 *   5. requiredPostClearanceObligationsComplete      — §4 PostClearanceAction none OPEN/IN_REVIEW/PENDING_PAYMENT
 *   6. disputeClaimStateResolved                     — §2 TradeClaim none OPEN/UNDER_REVIEW/ESCALATED
 *                                                      (OR formally open — allowed for closure with open dispute)
 *   7. evidencePackageSealed                         — §5 FinalEvidencePackage is SEALED
 *
 * Lifecycle (closureState state machine):
 *
 *   OPEN ──evaluateClosureReadiness (all 7 met)──▶ READY_FOR_CLOSURE
 *       ──closeTrade (all 7 met)────────────────▶ USTN_CLOSED
 *       ──closeTrade (1-5,7 met; 6 formally-open)▶ USTN_CLOSED_WITH_OPEN_DISPUTE
 *       ──reopenTrade────────────────────────────▶ OPEN (from USTN_CLOSED)
 *
 * `closeTrade` is the **USTN_CLOSED gate** — it ONLY sets
 * closureState=USTN_CLOSED if `evaluateClosureReadiness` returns
 * `allMet=true`. Otherwise it returns the state with
 * closureState=READY_FOR_CLOSURE (or stays OPEN) + the unmet conditions.
 * NEVER fabricates closure.
 *
 * Special case: if conditions 1-5 + 7 are met but condition 6
 * (disputeClaimStateResolved) is "formally open" (tracked but not
 * resolved — e.g. a long-running arbitration), the trade can be
 * closed as USTN_CLOSED_WITH_OPEN_DISPUTE. This is recorded on the
 * closureState so downstream consumers know the trade has an
 * outstanding dispute.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { isDeliveryAccepted } from "@/lib/sgtx/delivery-acceptance";
import { hasOpenClaims } from "@/lib/sgtx/claim";
import { hasOpenPostClearanceActions } from "@/lib/sgtx/post-clearance";

// ============ §6 Constants ============

/**
 * The 7 closure conditions (§6) — canonical IDs + display labels.
 */
export const CLOSURE_CONDITIONS = [
  {
    id: "deliveryAccepted",
    label: "Delivery accepted (§1)",
  },
  {
    id: "settlementComplete",
    label: "Settlement complete (Phase 6)",
  },
  {
    id: "financialReconciliationComplete",
    label: "Financial reconciliation complete (Phase 6)",
  },
  {
    id: "activeCustomsObligationsComplete",
    label: "Active customs obligations complete (Phase 4)",
  },
  {
    id: "requiredPostClearanceObligationsComplete",
    label: "Required post-clearance obligations complete (§4)",
  },
  {
    id: "disputeClaimStateResolved",
    label: "Dispute/claim state resolved or formally open (§2)",
  },
  {
    id: "evidencePackageSealed",
    label: "Evidence package sealed (§5)",
  },
] as const;

export const CLOSURE_STATES = [
  "OPEN",
  "READY_FOR_CLOSURE",
  "USTN_CLOSED",
  "USTN_CLOSED_WITH_OPEN_DISPUTE",
] as const;

// ============ Types ============

export interface ClosureConditionState {
  id: string;
  label: string;
  met: boolean;
  notes?: string;
}

export interface ClosureReadiness {
  conditions: ClosureConditionState[];
  allMet: boolean;
  readyForClosure: boolean;
}

export interface TradeClosureState {
  id: string;
  ustn: string;
  tradeId?: string | null;
  deliveryAccepted: boolean;
  settlementComplete: boolean;
  financialReconciliationComplete: boolean;
  activeCustomsObligationsComplete: boolean;
  requiredPostClearanceObligationsComplete: boolean;
  disputeClaimStateResolved: boolean;
  evidencePackageSealed: boolean;
  evidencePackageId?: string | null;
  closureState: string;
  closedAt?: Date | null;
  closedBy?: string | null;
  closureChecklist?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Machine-readable blocker codes (subset of CLOSURE_BLOCKER_CODES from
   * Phase 10 production-readiness lib). Populated by `closeTrade` when the
   * closure cannot proceed (allMet=false). NOT persisted — attached to the
   * returned object so callers can switch on specific blocker codes.
   */
  closureBlockers?: string[];
}

/**
 * Map a closure condition id to its machine-readable blocker code (one of
 * CLOSURE_BLOCKER_CODES). Returns the condition id as-is if no mapping exists.
 *
 * Used by `closeTrade` + `detectStateIntegrityException` to give downstream
 * consumers actionable, machine-parseable blocker reasons.
 */
export function conditionToBlockerCode(conditionId: string): string {
  switch (conditionId) {
    case "deliveryAccepted":
      return "DELIVERY_NOT_ACCEPTED";
    case "settlementComplete":
      return "SETTLEMENT_INCOMPLETE";
    case "financialReconciliationComplete":
      return "FINANCIAL_RECONCILIATION_INCOMPLETE";
    case "activeCustomsObligationsComplete":
      return "CUSTOMS_OBLIGATION_OPEN";
    case "requiredPostClearanceObligationsComplete":
      return "POST_CLEARANCE_OPEN";
    case "disputeClaimStateResolved":
      return "DISPUTE_OPEN";
    case "evidencePackageSealed":
      return "EVIDENCE_NOT_SEALED";
    default:
      return conditionId;
  }
}

/**
 * Pure: derive the closureBlockers array from a ClosureReadiness evaluation.
 * Returns one blocker code per unmet condition, plus CLAIM_OPEN if there are
 * OPEN/ESCALATED TradeClaim rows (caller must check DB and append CLAIM_OPEN).
 *
 * This is the SYNC core (no DB lookups). Use `deriveClosureBlockersAsync` for
 * the version that also checks the TradeClaim table for OPEN/ESCALATED claims.
 */
export function deriveClosureBlockers(readiness: {
  conditions?: Array<{ id: string; met: boolean }>;
}): string[] {
  const blockers: string[] = [];
  for (const c of readiness?.conditions || []) {
    if (!c.met) {
      blockers.push(conditionToBlockerCode(c.id));
    }
  }
  return blockers;
}

/**
 * Async: derive the closureBlockers array from a ClosureReadiness evaluation,
 * INCLUDING the CLAIM_OPEN check (TradeClaim rows with OPEN/UNDER_REVIEW/
 * ESCALATED status). Best-effort — on DB error, only the condition-based
 * blockers are returned.
 */
export async function deriveClosureBlockersAsync(
  ustn: string,
  readiness: { conditions?: Array<{ id: string; met: boolean }> },
): Promise<string[]> {
  const blockers = deriveClosureBlockers(readiness);
  if (ustn) {
    try {
      const openClaims = await (db as any).tradeClaim?.count({
        where: {
          ustn,
          status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] },
        },
      });
      if (openClaims && openClaims > 0) {
        blockers.push("CLAIM_OPEN");
      }
    } catch (err) {
      logger.warn("[trade-closure] claim count for blockers failed", {
        error: String(err),
        ustn,
      });
    }
  }
  return blockers;
}

// ============ §6.0 Pure helpers ============

/**
 * Pure: serialize the closure checklist array to a JSON string for storage
 * in the `closureChecklist` column.
 */
function serializeChecklist(items: ClosureConditionState[]): string {
  return JSON.stringify(items || []);
}

/**
 * Pure: parse a closure checklist JSON string into an array. Defensive —
 * returns [] on any parse error or non-array input.
 */
function parseChecklist(raw: unknown): ClosureConditionState[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ClosureConditionState[];
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: returns the condition label for a given condition id. Returns
 * the id as-is if not found.
 */
function labelForCondition(id: string): string {
  const found = CLOSURE_CONDITIONS.find((c) => c.id === id);
  return found ? found.label : id;
}

// ============ §6.1 getOrCreateClosureState ============

/**
 * Get the TradeClosureState for a USTN, creating it (with all 7 conditions
 * = false + closureState=OPEN) if it doesn't already exist. Resolves
 * tradeId from the Trade table if ustn is provided.
 *
 * Returns a fresh OPEN state on error (so callers can still operate).
 */
export async function getOrCreateClosureState(
  ustn: string,
): Promise<TradeClosureState> {
  if (!ustn) throw new Error("ustn is required");
  try {
    // Try fetch first
    const existing = await db.tradeClosureState.findUnique({
      where: { ustn },
    });
    if (existing) return existing as TradeClosureState;
  } catch (err) {
    logger.warn("[trade-closure] findUnique failed — will attempt create", {
      error: String(err),
      ustn,
    });
  }
  // Create
  try {
    // Resolve tradeId
    let tradeId: string | null = null;
    try {
      const trade = await db.trade.findUnique({
        where: { ustn },
        select: { id: true },
      });
      if (trade) tradeId = trade.id;
    } catch (err) {
      logger.warn("[trade-closure] could not resolve tradeId", {
        error: String(err),
        ustn,
      });
    }
    const row = await db.tradeClosureState.create({
      data: {
        ustn,
        tradeId,
        deliveryAccepted: false,
        settlementComplete: false,
        financialReconciliationComplete: false,
        activeCustomsObligationsComplete: false,
        requiredPostClearanceObligationsComplete: false,
        disputeClaimStateResolved: false,
        evidencePackageSealed: false,
        evidencePackageId: null,
        closureState: "OPEN",
        closedAt: null,
        closedBy: null,
        closureChecklist: serializeChecklist([]),
        notes: null,
      },
    });
    logger.info("[trade-closure] closure state created (OPEN)", {
      ustn,
      tradeId,
    });
    return row as TradeClosureState;
  } catch (err) {
    // Possible race condition: another worker created it between our
    // findUnique + create. Try fetch one more time.
    logger.warn("[trade-closure] create failed — re-fetching", {
      error: String(err),
      ustn,
    });
    try {
      const row = await db.tradeClosureState.findUnique({
        where: { ustn },
      });
      if (row) return row as TradeClosureState;
    } catch (err2) {
      logger.error("[trade-closure] re-fetch failed", {
        error: String(err2),
        ustn,
      });
    }
    logger.error("[trade-closure] getOrCreateClosureState failed", {
      error: String(err),
      ustn,
    });
    throw err;
  }
}

// ============ §6.2 getClosureState ============

/**
 * Fetch the TradeClosureState for a USTN. Returns null on error or if no
 * closure state exists.
 */
export async function getClosureState(
  ustn: string,
): Promise<TradeClosureState | null> {
  if (!ustn) return null;
  try {
    const row = await db.tradeClosureState.findUnique({ where: { ustn } });
    return (row as TradeClosureState) || null;
  } catch (err) {
    logger.error("[trade-closure] getClosureState failed", {
      error: String(err),
      ustn,
    });
    return null;
  }
}

// ============ §6.3 updateClosureCondition ============

/**
 * Update ONE of the 7 closure conditions on a trade's closure state.
 * Sets the boolean + records optional notes in the closureChecklist.
 * Re-evaluates the closureState:
 *   - If all 7 conditions are met → closureState = READY_FOR_CLOSURE
 *   - Otherwise → closureState = OPEN (if not already USTN_CLOSED)
 *
 * Returns the updated closure state. Throws if the closure state does
 * not exist (call `getOrCreateClosureState` first).
 */
export async function updateClosureCondition(
  ustn: string,
  condition: string,
  met: boolean,
  notes?: string,
): Promise<TradeClosureState> {
  if (!ustn) throw new Error("ustn is required");
  if (!condition) throw new Error("condition is required");
  const validIds = CLOSURE_CONDITIONS.map((c) => c.id);
  if (!validIds.includes(condition)) {
    throw new Error(`Invalid condition: ${condition}`);
  }
  try {
    const existing = await db.tradeClosureState.findUnique({
      where: { ustn },
    });
    if (!existing) {
      throw new Error(
        `TradeClosureState for ${ustn} not found — call getOrCreateClosureState first`,
      );
    }

    // Update the condition boolean
    const updates: any = { [condition]: !!met };

    // Update the checklist
    const checklist = parseChecklist((existing as any).closureChecklist);
    const idx = checklist.findIndex((c) => c.id === condition);
    const entry: ClosureConditionState = {
      id: condition,
      label: labelForCondition(condition),
      met: !!met,
      ...(notes ? { notes } : {}),
    };
    if (idx >= 0) checklist[idx] = entry;
    else checklist.push(entry);
    updates.closureChecklist = serializeChecklist(checklist);

    // Re-evaluate closureState — if all 7 are met, transition to
    // READY_FOR_CLOSURE (but only if not already USTN_CLOSED).
    const merged = { ...(existing as any), ...updates } as TradeClosureState;
    const allMet =
      merged.deliveryAccepted &&
      merged.settlementComplete &&
      merged.financialReconciliationComplete &&
      merged.activeCustomsObligationsComplete &&
      merged.requiredPostClearanceObligationsComplete &&
      merged.disputeClaimStateResolved &&
      merged.evidencePackageSealed;
    if (
      allMet &&
      (existing as any).closureState !== "USTN_CLOSED" &&
      (existing as any).closureState !== "USTN_CLOSED_WITH_OPEN_DISPUTE"
    ) {
      updates.closureState = "READY_FOR_CLOSURE";
    } else if (
      !allMet &&
      (existing as any).closureState === "READY_FOR_CLOSURE"
    ) {
      // A condition was un-met — revert to OPEN
      updates.closureState = "OPEN";
    }

    const updated = await db.tradeClosureState.update({
      where: { ustn },
      data: updates,
    });
    logger.info("[trade-closure] condition updated", {
      ustn,
      condition,
      met: !!met,
      closureState: (updated as any).closureState,
    });
    return updated as TradeClosureState;
  } catch (err) {
    logger.error("[trade-closure] updateClosureCondition failed", {
      error: String(err),
      ustn,
      condition,
    });
    throw err;
  }
}

// ============ §6.4 evaluateClosureReadiness ============

/**
 * THE MAIN FUNCTION — evaluate ALL 7 closure conditions for a trade
 * USTN by inspecting the underlying models:
 *
 *   1. deliveryAccepted: `isDeliveryAccepted(ustn)` from §1 delivery-acceptance lib
 *   2. settlementComplete: check Phase 6 GlobalPayment — all payments for
 *      this USTN are SETTLED (no PENDING/SUBMITTED/PROCESSING/FAILED).
 *   3. financialReconciliationComplete: check Phase 6 ReconciliationRecord —
 *      all reconciliations for this USTN are MATCHED or RESOLVED (no
 *      DISCREPANT/UNMATCHED/PENDING).
 *   4. activeCustomsObligationsComplete: check Phase 4 CustomsOperation —
 *      no GOVERNMENT_HOLD; all are GOVERNMENT_RELEASED (or terminal).
 *   5. requiredPostClearanceObligationsComplete:
 *      `!hasOpenPostClearanceActions(ustn)` from §4 post-clearance lib.
 *   6. disputeClaimStateResolved: `!hasOpenClaims(ustn)` from §2 claim lib.
 *      (NOTE: if there are formally-open claims, this returns false — but
 *      `closeTrade` may still allow USTN_CLOSED_WITH_OPEN_DISPUTE per the
 *      §6 spec.)
 *   7. evidencePackageSealed: check §5 FinalEvidencePackage — at least one
 *      SEALED package exists for this USTN.
 *
 * Returns:
 *   - conditions: Array<{ id, label, met, notes }> — all 7 conditions
 *   - allMet: true if all 7 are met
 *   - readyForClosure: alias for allMet
 *
 * Does NOT modify the closure state — use `updateClosureCondition` to
 * persist individual conditions, or `closeTrade` to attempt closure.
 */
export async function evaluateClosureReadiness(
  ustn: string,
): Promise<ClosureReadiness> {
  if (!ustn) {
    return {
      conditions: CLOSURE_CONDITIONS.map((c) => ({
        id: c.id,
        label: c.label,
        met: false,
        notes: "ustn is required",
      })),
      allMet: false,
      readyForClosure: false,
    };
  }

  const conditions: ClosureConditionState[] = [];

  // 1. deliveryAccepted
  let deliveryOk = false;
  try {
    deliveryOk = await isDeliveryAccepted(ustn);
  } catch (err) {
    logger.warn("[trade-closure] deliveryAccepted check failed", {
      error: String(err),
      ustn,
    });
  }
  conditions.push({
    id: "deliveryAccepted",
    label: labelForCondition("deliveryAccepted"),
    met: deliveryOk,
    notes: deliveryOk ? undefined : "no ACCEPTED delivery found",
  });

  // 2. settlementComplete — all payments SETTLED
  let settlementOk = false;
  let settlementNotes: string | undefined;
  try {
    const total = await (db as any).globalPayment?.count({
      where: { ustn },
    });
    const settled = await (db as any).globalPayment?.count({
      where: {
        ustn,
        status: "SETTLED",
      },
    });
    const failed = await (db as any).globalPayment?.count({
      where: {
        ustn,
        status: { in: ["FAILED", "CANCELLED", "REVERSED", "DUPLICATE"] },
      },
    });
    if (total === 0) {
      settlementOk = false;
      settlementNotes = "no payments found";
    } else if (failed > 0) {
      settlementOk = false;
      settlementNotes = `${failed} failed/cancelled payment(s)`;
    } else if (settled === total) {
      settlementOk = true;
      settlementNotes = `${settled}/${total} SETTLED`;
    } else {
      settlementOk = false;
      settlementNotes = `${settled}/${total} SETTLED (${total - settled} pending)`;
    }
  } catch (err) {
    logger.warn("[trade-closure] settlementComplete check failed", {
      error: String(err),
      ustn,
    });
    settlementNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "settlementComplete",
    label: labelForCondition("settlementComplete"),
    met: settlementOk,
    notes: settlementNotes,
  });

  // 3. financialReconciliationComplete — all reconciliations MATCHED/RESOLVED
  let reconOk = false;
  let reconNotes: string | undefined;
  try {
    const total = await (db as any).reconciliationRecord?.count({
      where: { ustn },
    });
    const matched = await (db as any).reconciliationRecord?.count({
      where: {
        ustn,
        status: { in: ["MATCHED", "RESOLVED"] },
      },
    });
    if (total === 0) {
      reconOk = true; // no reconciliations required → considered complete
      reconNotes = "no reconciliations required";
    } else if (matched === total) {
      reconOk = true;
      reconNotes = `${matched}/${total} MATCHED/RESOLVED`;
    } else {
      reconOk = false;
      reconNotes = `${matched}/${total} MATCHED/RESOLVED (${total - matched} pending/discrepant/unmatched)`;
    }
  } catch (err) {
    logger.warn("[trade-closure] financialReconciliationComplete check failed", {
      error: String(err),
      ustn,
    });
    reconNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "financialReconciliationComplete",
    label: labelForCondition("financialReconciliationComplete"),
    met: reconOk,
    notes: reconNotes,
  });

  // 4. activeCustomsObligationsComplete — no GOVERNMENT_HOLD; all RELEASED
  let customsOk = false;
  let customsNotes: string | undefined;
  try {
    const total = await (db as any).customsOperation?.count({
      where: { ustn },
    });
    const hold = await (db as any).customsOperation?.count({
      where: { ustn, status: "HOLD" },
    });
    const released = await (db as any).customsOperation?.count({
      where: {
        ustn,
        status: { in: ["RELEASED", "AMENDED", "REJECTED"] },
      },
    });
    if (total === 0) {
      customsOk = true;
      customsNotes = "no customs operations required";
    } else if (hold > 0) {
      customsOk = false;
      customsNotes = `${hold} customs HOLD`;
    } else if (released === total) {
      customsOk = true;
      customsNotes = `${released}/${total} RELEASED`;
    } else {
      customsOk = false;
      customsNotes = `${released}/${total} RELEASED (${total - released} in-flight)`;
    }
  } catch (err) {
    logger.warn("[trade-closure] activeCustomsObligationsComplete check failed", {
      error: String(err),
      ustn,
    });
    customsNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "activeCustomsObligationsComplete",
    label: labelForCondition("activeCustomsObligationsComplete"),
    met: customsOk,
    notes: customsNotes,
  });

  // 5. requiredPostClearanceObligationsComplete — no OPEN/IN_REVIEW/PENDING_PAYMENT
  let postClearanceOk = false;
  let postClearanceNotes: string | undefined;
  try {
    const hasOpen = await hasOpenPostClearanceActions(ustn);
    postClearanceOk = !hasOpen;
    postClearanceNotes = hasOpen
      ? "open post-clearance actions exist"
      : "no open post-clearance actions";
  } catch (err) {
    logger.warn(
      "[trade-closure] requiredPostClearanceObligationsComplete check failed",
      { error: String(err), ustn },
    );
    postClearanceNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "requiredPostClearanceObligationsComplete",
    label: labelForCondition("requiredPostClearanceObligationsComplete"),
    met: postClearanceOk,
    notes: postClearanceNotes,
  });

  // 6. disputeClaimStateResolved — no OPEN/UNDER_REVIEW/ESCALATED claims
  let disputeOk = false;
  let disputeNotes: string | undefined;
  try {
    const hasOpen = await hasOpenClaims(ustn);
    disputeOk = !hasOpen;
    disputeNotes = hasOpen
      ? "open claims exist (formally-open dispute — may close WITH_OPEN_DISPUTE)"
      : "no open claims";
  } catch (err) {
    logger.warn("[trade-closure] disputeClaimStateResolved check failed", {
      error: String(err),
      ustn,
    });
    disputeNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "disputeClaimStateResolved",
    label: labelForCondition("disputeClaimStateResolved"),
    met: disputeOk,
    notes: disputeNotes,
  });

  // 7. evidencePackageSealed — at least one SEALED package
  let evidenceOk = false;
  let evidenceNotes: string | undefined;
  try {
    const sealedCount = await (db as any).finalEvidencePackage?.count({
      where: { ustn, status: "SEALED" },
    });
    evidenceOk = sealedCount > 0;
    evidenceNotes =
      sealedCount > 0
        ? `${sealedCount} sealed package(s)`
        : "no SEALED evidence package";
  } catch (err) {
    logger.warn("[trade-closure] evidencePackageSealed check failed", {
      error: String(err),
      ustn,
    });
    evidenceNotes = `check_error: ${String(err)}`;
  }
  conditions.push({
    id: "evidencePackageSealed",
    label: labelForCondition("evidencePackageSealed"),
    met: evidenceOk,
    notes: evidenceNotes,
  });

  const allMet = conditions.every((c) => c.met);
  return {
    conditions,
    allMet,
    readyForClosure: allMet,
  };
}

// ============ §6.5 closeTrade ============

/**
 * THE USTN_CLOSED GATE — close a trade. ONLY sets closureState=USTN_CLOSED
 * if `evaluateClosureReadiness` returns `allMet=true`. Otherwise:
 *   - Updates the closure state with the evaluated conditions + sets
 *     closureState=READY_FOR_CLOSURE (if all met) or stays OPEN.
 *   - Returns the state with the unmet conditions in the closureChecklist.
 *
 * SPECIAL CASE: if conditions 1-5 + 7 are met but condition 6
 * (disputeClaimStateResolved) is "formally open" (claims are tracked but
 * not resolved — e.g. a long-running arbitration), the trade is closed
 * as USTN_CLOSED_WITH_OPEN_DISPUTE. The trade is technically closed but
 * an outstanding dispute is recorded for downstream consumers.
 *
 * NEVER fabricates closure — if the conditions are not met, the trade
 * stays OPEN / READY_FOR_CLOSURE.
 */
export async function closeTrade(
  ustn: string,
  closedBy: string,
): Promise<TradeClosureState> {
  if (!ustn) throw new Error("ustn is required");
  try {
    const readiness = await evaluateClosureReadiness(ustn);
    const state = await getOrCreateClosureState(ustn);

    // Phase 10 remediation — compute machine-readable closureBlockers from
    // the failed conditions + the TradeClaim table (CLAIM_OPEN). Attached to
    // every returned state object so downstream consumers can switch on
    // specific blocker codes (rather than the soft `conditions` array).
    const closureBlockers = await deriveClosureBlockersAsync(ustn, readiness);

    // Persist the evaluated conditions on the closure state
    const updates: any = {
      deliveryAccepted: readiness.conditions[0].met,
      settlementComplete: readiness.conditions[1].met,
      financialReconciliationComplete: readiness.conditions[2].met,
      activeCustomsObligationsComplete: readiness.conditions[3].met,
      requiredPostClearanceObligationsComplete: readiness.conditions[4].met,
      disputeClaimStateResolved: readiness.conditions[5].met,
      evidencePackageSealed: readiness.conditions[6].met,
      closureChecklist: serializeChecklist(readiness.conditions),
    };

    if (readiness.allMet) {
      // All 7 conditions met → USTN_CLOSED
      updates.closureState = "USTN_CLOSED";
      updates.closedAt = new Date();
      updates.closedBy = closedBy || null;
      const updated = await db.tradeClosureState.update({
        where: { ustn },
        data: updates,
      });
      logger.info("[trade-closure] trade CLOSED", {
        ustn,
        closedBy,
      });
      return { ...(updated as TradeClosureState), closureBlockers: [] };
    }

    // Special case: conditions 1-5 + 7 met but condition 6 (dispute)
    // is "formally open" (claims exist but tracked) → USTN_CLOSED_WITH_OPEN_DISPUTE
    const conditions1to5And7Met =
      readiness.conditions[0].met && // delivery
      readiness.conditions[1].met && // settlement
      readiness.conditions[2].met && // reconciliation
      readiness.conditions[3].met && // customs
      readiness.conditions[4].met && // post-clearance
      readiness.conditions[6].met; // evidence
    const disputeOpen = !readiness.conditions[5].met;

    if (conditions1to5And7Met && disputeOpen) {
      updates.closureState = "USTN_CLOSED_WITH_OPEN_DISPUTE";
      updates.closedAt = new Date();
      updates.closedBy = closedBy || null;
      updates.notes = `Closed with open dispute per §6 — claims are formally tracked but not yet resolved.`;
      const updated = await db.tradeClosureState.update({
        where: { ustn },
        data: updates,
      });
      logger.info("[trade-closure] trade CLOSED WITH OPEN DISPUTE", {
        ustn,
        closedBy,
      });
      // The only blocker is the formally-open dispute — by design.
      return {
        ...(updated as TradeClosureState),
        closureBlockers: ["DISPUTE_OPEN"],
      };
    }

    // STATE INTEGRITY ENFORCEMENT (Phase 10 remediation):
    // evaluateClosureReadiness returned allMet=false — we must NOT set
    // closureState=USTN_CLOSED. Return the state as-is (READY_FOR_CLOSURE
    // or OPEN) with closureBlockers listing the specific blocker codes.
    const currentClosureState = (state as any).closureState;
    if (
      currentClosureState === "USTN_CLOSED" ||
      currentClosureState === "USTN_CLOSED_WITH_OPEN_DISPUTE"
    ) {
      // Trade is already closed — don't regress it.
      // Just persist the updated conditions without changing closureState.
      // NOTE: this is a STATE_INTEGRITY_EXCEPTION — the trade is marked
      // closed but the closure conditions are NOT all met. The caller can
      // detect this via the returned closureBlockers (non-empty) +
      // closureState=USTN_CLOSED. Use `detectStateIntegrityException`
      // for an explicit check.
      const updated = await db.tradeClosureState.update({
        where: { ustn },
        data: {
          deliveryAccepted: updates.deliveryAccepted,
          settlementComplete: updates.settlementComplete,
          financialReconciliationComplete:
            updates.financialReconciliationComplete,
          activeCustomsObligationsComplete:
            updates.activeCustomsObligationsComplete,
          requiredPostClearanceObligationsComplete:
            updates.requiredPostClearanceObligationsComplete,
          disputeClaimStateResolved: updates.disputeClaimStateResolved,
          evidencePackageSealed: updates.evidencePackageSealed,
          closureChecklist: updates.closureChecklist,
        },
      });
      logger.warn(
        "[trade-closure] trade already closed but conditions not met — STATE_INTEGRITY_EXCEPTION",
        {
          ustn,
          closureState: currentClosureState,
          closureBlockers,
        },
      );
      return {
        ...(updated as TradeClosureState),
        closureBlockers,
      };
    }

    // Not ready + not closed → READY_FOR_CLOSURE or OPEN
    const allMet = readiness.conditions.every((c) => c.met);
    updates.closureState = allMet ? "READY_FOR_CLOSURE" : "OPEN";
    const updated = await db.tradeClosureState.update({
      where: { ustn },
      data: updates,
    });
    logger.info("[trade-closure] trade NOT closed — conditions not met", {
      ustn,
      closureState: updates.closureState,
      unmetConditions: readiness.conditions
        .filter((c) => !c.met)
        .map((c) => c.id),
      closureBlockers,
    });
    return {
      ...(updated as TradeClosureState),
      closureBlockers,
    };
  } catch (err) {
    logger.error("[trade-closure] closeTrade failed", {
      error: String(err),
      ustn,
    });
    throw err;
  }
}

// ============ §6.6 reopenTrade ============

/**
 * Reopen a USTN_CLOSED (or USTN_CLOSED_WITH_OPEN_DISPUTE) trade. Sets
 * closureState=OPEN + clears closedAt/closedBy. Records the reopen reason
 * in `notes`. Used when a new issue arises post-closure (e.g. a customs
 * post-clearance audit is launched, a warranty claim is filed, etc.).
 *
 * Throws if the trade is not currently in a closed state.
 */
export async function reopenTrade(
  ustn: string,
  reason: string,
): Promise<TradeClosureState> {
  if (!ustn) throw new Error("ustn is required");
  try {
    const existing = await db.tradeClosureState.findUnique({
      where: { ustn },
    });
    if (!existing) {
      throw new Error(
        `TradeClosureState for ${ustn} not found — call getOrCreateClosureState first`,
      );
    }
    const currentStatus = (existing as any).closureState;
    if (
      currentStatus !== "USTN_CLOSED" &&
      currentStatus !== "USTN_CLOSED_WITH_OPEN_DISPUTE"
    ) {
      throw new Error(
        `Cannot reopen trade in status ${currentStatus} (expected USTN_CLOSED or USTN_CLOSED_WITH_OPEN_DISPUTE)`,
      );
    }
    const updated = await db.tradeClosureState.update({
      where: { ustn },
      data: {
        closureState: "OPEN",
        closedAt: null,
        closedBy: null,
        notes: `Reopened: ${reason || "(no reason provided)"}`,
      },
    });
    logger.info("[trade-closure] trade reopened", {
      ustn,
      reason,
      previousClosureState: currentStatus,
    });
    return updated as TradeClosureState;
  } catch (err) {
    logger.error("[trade-closure] reopenTrade failed", {
      error: String(err),
      ustn,
    });
    throw err;
  }
}

// ============ §6.7 isTradeClosed ============

/**
 * Check if a trade USTN is closed (closureState = USTN_CLOSED). Returns
 * false on error or if the trade is not closed. NOTE:
 * USTN_CLOSED_WITH_OPEN_DISPUTE is NOT considered "closed" by this check
 * — use `isTradeClosedOrDisputed` for the broader check.
 */
export async function isTradeClosed(ustn: string): Promise<boolean> {
  if (!ustn) return false;
  try {
    const row = await db.tradeClosureState.findUnique({
      where: { ustn },
      select: { closureState: true },
    });
    if (!row) return false;
    return (row as any).closureState === "USTN_CLOSED";
  } catch (err) {
    logger.error("[trade-closure] isTradeClosed failed", {
      error: String(err),
      ustn,
    });
    return false;
  }
}

// ============ §6.8 getClosureChecklist ============

/**
 * Returns the 7-condition closure checklist for a trade USTN. If a
 * TradeClosureState exists, the checklist is read from the stored
 * `closureChecklist` column (last-persisted state). Otherwise, a fresh
 * `evaluateClosureReadiness` is run.
 *
 * Returns an array of 7 `{ condition, met, notes }` objects.
 */
export async function getClosureChecklist(
  ustn: string,
): Promise<Array<{ condition: string; met: boolean; notes?: string }>> {
  if (!ustn) {
    return CLOSURE_CONDITIONS.map((c) => ({
      condition: c.id,
      met: false,
      notes: "ustn is required",
    }));
  }
  // First try the stored checklist
  try {
    const row = await db.tradeClosureState.findUnique({
      where: { ustn },
    });
    if (row) {
      const checklist = parseChecklist((row as any).closureChecklist);
      if (checklist.length > 0) {
        // Pad any missing conditions with `met=false`
        const result: Array<{
          condition: string;
          met: boolean;
          notes?: string;
        }> = [];
        for (const c of CLOSURE_CONDITIONS) {
          const found = checklist.find((item) => item.id === c.id);
          result.push({
            condition: c.id,
            met: !!(found && found.met),
            notes: found?.notes,
          });
        }
        return result;
      }
    }
  } catch (err) {
    logger.warn("[trade-closure] getClosureChecklist: stored read failed", {
      error: String(err),
      ustn,
    });
  }
  // Fallback: run a fresh evaluation
  try {
    const readiness = await evaluateClosureReadiness(ustn);
    return readiness.conditions.map((c) => ({
      condition: c.id,
      met: c.met,
      notes: c.notes,
    }));
  } catch (err) {
    logger.error("[trade-closure] getClosureChecklist fallback failed", {
      error: String(err),
      ustn,
    });
    return CLOSURE_CONDITIONS.map((c) => ({
      condition: c.id,
      met: false,
      notes: `check_failed: ${String(err)}`,
    }));
  }
}

// ============ §6.9 linkEvidencePackage ============

/**
 * Link a sealed FinalEvidencePackage to the closure state. Stores the
 * package's `id` in `evidencePackageId` and sets `evidencePackageSealed=true`
 * (the package must be SEALED — DRAFT / ARCHIVED packages are rejected).
 *
 * Returns the updated closure state. Throws if the closure state does
 * not exist or the package is not SEALED.
 */
export async function linkEvidencePackage(
  ustn: string,
  packageId: string,
): Promise<TradeClosureState> {
  if (!ustn) throw new Error("ustn is required");
  if (!packageId) throw new Error("packageId is required");
  try {
    const existing = await db.tradeClosureState.findUnique({
      where: { ustn },
    });
    if (!existing) {
      throw new Error(
        `TradeClosureState for ${ustn} not found — call getOrCreateClosureState first`,
      );
    }
    // Verify the package exists + is SEALED
    let sealed = false;
    let pkgId: string | null = null;
    try {
      const pkg = await (db as any).finalEvidencePackage?.findUnique({
        where: { packageId },
        select: { id: true, status: true },
      });
      if (pkg) {
        sealed = (pkg as any).status === "SEALED";
        pkgId = (pkg as any).id;
      } else {
        throw new Error(`FinalEvidencePackage ${packageId} not found`);
      }
    } catch (err) {
      logger.error("[trade-closure] linkEvidencePackage: package lookup failed", {
        error: String(err),
        packageId,
      });
      throw err;
    }
    if (!sealed) {
      throw new Error(
        `Cannot link package ${packageId} — package is not SEALED`,
      );
    }

    const updated = await db.tradeClosureState.update({
      where: { ustn },
      data: {
        evidencePackageId: pkgId,
        evidencePackageSealed: true,
      },
    });
    logger.info("[trade-closure] evidence package linked", {
      ustn,
      packageId,
      evidencePackageId: pkgId,
    });
    return updated as TradeClosureState;
  } catch (err) {
    logger.error("[trade-closure] linkEvidencePackage failed", {
      error: String(err),
      ustn,
      packageId,
    });
    throw err;
  }
}

// ============ §6.10 detectStateIntegrityException ============

/**
 * Detect a state-integrity exception on a trade: closureState=USTN_CLOSED (or
 * USTN_CLOSED_WITH_OPEN_DISPUTE) but `canClose=false` (i.e.
 * `evaluateClosureReadiness` returns `allMet=false`).
 *
 * The system must NEVER allow contradictory authoritative lifecycle state.
 * This function is the explicit check — callers can use it to surface
 * state-integrity violations to operators / admin / break-glass.
 *
 * Returns:
 *   - `exception: boolean`     — true if the trade is in a contradictory state.
 *   - `closureState: string`   — the current closureState.
 *   - `canClose: boolean`      — the freshness evaluation result.
 *   - `reason: string`         — human-readable reason + the closureBlockers.
 *
 * Never throws — returns a safe default (`exception: false`) on error.
 *
 * Usage:
 *   ```ts
 *   const { exception, closureBlockers } = await detectStateIntegrityException(ustn);
 *   if (exception) {
 *     // Surface to operator — this is a state-integrity violation.
 *     await alertAdmin(ustn, closureBlockers);
 *   }
 *   ```
 */
export async function detectStateIntegrityException(ustn: string): Promise<{
  exception: boolean;
  closureState: string;
  canClose: boolean;
  reason: string;
  closureBlockers: string[];
}> {
  if (!ustn) {
    return {
      exception: false,
      closureState: "OPEN",
      canClose: false,
      reason: "ustn is required",
      closureBlockers: [],
    };
  }

  // 1. Get the current closure state.
  let closureState = "OPEN";
  try {
    const cs = await getClosureState(ustn);
    if (cs) closureState = cs.closureState || "OPEN";
  } catch (err) {
    logger.warn("[trade-closure] detectStateIntegrityException: closure lookup failed", {
      error: String(err),
      ustn,
    });
  }

  // 2. Evaluate closure readiness fresh.
  let readiness: any = null;
  try {
    readiness = await evaluateClosureReadiness(ustn);
  } catch (err) {
    logger.warn("[trade-closure] detectStateIntegrityException: readiness failed", {
      error: String(err),
      ustn,
    });
    readiness = { conditions: [], allMet: false, readyForClosure: false };
  }
  const canClose = !!readiness?.allMet;

  // 3. Compute closureBlockers (machine-readable codes).
  const closureBlockers = await deriveClosureBlockersAsync(ustn, readiness || {});

  // 4. Exception: closureState is USTN_CLOSED* but canClose=false.
  const isClosed =
    closureState === "USTN_CLOSED" ||
    closureState === "USTN_CLOSED_WITH_OPEN_DISPUTE";
  const exception = isClosed && !canClose;

  let reason: string;
  if (exception) {
    reason = `STATE_INTEGRITY_EXCEPTION — closureState=${closureState} but canClose=false. closureBlockers: [${closureBlockers.join(", ")}]`;
    logger.error("[trade-closure] STATE_INTEGRITY_EXCEPTION detected", {
      ustn,
      closureState,
      canClose,
      closureBlockers,
    });
  } else if (isClosed && canClose) {
    reason = `OK — closureState=${closureState} and canClose=true.`;
  } else {
    reason = `OK — trade not closed (closureState=${closureState}); canClose=${canClose}.`;
  }

  return {
    exception,
    closureState,
    canClose,
    reason,
    closureBlockers,
  };
}
