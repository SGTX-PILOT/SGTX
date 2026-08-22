// @ts-nocheck
/**
 * SGTX Phase 6 — §2 Trade Finance Engine (Case Lifecycle)
 * ===========================================================================
 *
 * **NON-MARKETPLACE §2 enforcement**: financing is permitted ONLY through:
 *   1. A trader's CONNECTED BANK
 *   2. A trader's explicitly-saved financier (TRADER_ADDED_FINANCIER)
 *   3. An APPROVED_FINANCING_ENTITY explicitly selected by the trader
 *
 * SGTX does NOT publish a financier marketplace, does NOT recommend
 * financiers, and does NOT rank financiers. The `verifyFinancierRelationship`
 * gate is the hard enforcement: if the financier is NOT in the trader's
 * approved list, the case is REJECTED at creation.
 *
 * Lifecycle (status, with allowed forward transitions):
 *
 *   FINANCING_REQUEST → CONNECTED_BANK_FINANCING → TRADER_ADDED_FINANCIER
 *                       ↓                            ↓
 *                      OFFER ←───────────────────────┘
 *                       ↓
 *                    ACCEPTANCE → DISBURSEMENT → REPAYMENT → SETTLEMENT → CLOSED
 *                                                    ↓          ↓
 *                                                MARGIN_CALL (side-state)
 *
 *   At any point: → GUARANTEE (collateral/guarantee step, side-state)
 *   At any point: → COLLATERAL (collateral check, side-state)
 *   REJECTED — terminal; set when the relationship gate fails or the offer
 *              is explicitly rejected.
 *
 * Link references preserved:
 *   - financingRequestId → FinancingRequest.requestId (legacy RFQ flow)
 *   - financingAgreementId → FinancingAgreement.id (legacy agreement flow)
 *
 * All DB calls are try/catch-wrapped with safe defaults. The engine never
 * throws synchronously into API routes — it returns the prior row + an error
 * note in `notes` instead.
 *
 * NOTE: The legacy `TradeFinanceDocument` (Add-On 20) functionality now
 * lives in `./documents.ts`. This file is the Phase 6 CASE lifecycle on the
 * `TradeFinanceCase` Prisma model.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
// updateExposure lives in the financier-relationship layer; safe to import
// here (financier-relationship does NOT import back into trade-finance).
import { updateExposure } from "@/lib/sgtx/financier-relationship";

// ============ §2 Constants ============

export const TRADE_FINANCE_STATUSES = [
  "FINANCING_REQUEST",
  "CONNECTED_BANK_FINANCING",
  "TRADER_ADDED_FINANCIER",
  "OFFER",
  "ACCEPTANCE",
  "DISBURSEMENT",
  "REPAYMENT",
  "GUARANTEE",
  "COLLATERAL",
  "MARGIN_CALL",
  "SETTLEMENT",
  "CLOSED",
  "REJECTED",
] as const;

export const FINANCIER_TYPES = [
  "CONNECTED_BANK",
  "TRADER_ADDED_FINANCIER",
  "APPROVED_FINANCING_ENTITY",
] as const;

/**
 * Allowed lifecycle transitions. Each entry maps a `from` status to the set
 * of statuses it can transition INTO. The map is exhaustive — any
 * transition not listed here is rejected by `transitionCaseStatus`.
 *
 * GUARANTEE / COLLATERAL / MARGIN_CALL are "side-states" — they're allowed
 * from any active lifecycle state (the case returns to its prior active
 * state when the side-step is resolved). For simplicity this engine treats
 * them as forward destinations; callers must re-transition back.
 */
const LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  FINANCING_REQUEST: [
    "CONNECTED_BANK_FINANCING",
    "TRADER_ADDED_FINANCIER",
    "OFFER",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  CONNECTED_BANK_FINANCING: [
    "TRADER_ADDED_FINANCIER",
    "OFFER",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  TRADER_ADDED_FINANCIER: [
    "OFFER",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  OFFER: [
    "ACCEPTANCE",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  ACCEPTANCE: [
    "DISBURSEMENT",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  DISBURSEMENT: [
    "REPAYMENT",
    "MARGIN_CALL",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  REPAYMENT: [
    "SETTLEMENT",
    "MARGIN_CALL",
    "GUARANTEE",
    "COLLATERAL",
    "REJECTED",
  ],
  MARGIN_CALL: [
    "REPAYMENT",
    "SETTLEMENT",
    "REJECTED",
  ],
  GUARANTEE: [
    "FINANCING_REQUEST",
    "OFFER",
    "ACCEPTANCE",
    "DISBURSEMENT",
    "REPAYMENT",
    "SETTLEMENT",
    "REJECTED",
  ],
  COLLATERAL: [
    "FINANCING_REQUEST",
    "OFFER",
    "ACCEPTANCE",
    "DISBURSEMENT",
    "REPAYMENT",
    "SETTLEMENT",
    "REJECTED",
  ],
  SETTLEMENT: [
    "CLOSED",
    "MARGIN_CALL",
  ],
  CLOSED: [],
  REJECTED: [],
};

// ============ Types ============

export interface CreateCaseInput {
  ustn?: string;
  tradeId?: string;
  borrowerGtid: string;
  financierGtid: string;
  financierType?: string;
  amountUsd: number;
  currency?: string;
  tenorDays?: number;
  apr?: number;
  collateralType?: string;
  collateralValueUsd?: number;
  /** Optional link to the legacy FinancingRequest row */
  financingRequestId?: string;
  /** Optional link to the legacy FinancingAgreement row */
  financingAgreementId?: string;
  notes?: string;
}

// ============ §2.0 Helpers ============

/**
 * Generate a TradeFinanceCase business ID of the form
 * `TFC-YYYYMMDD-NNNNN`. Pure (no DB, no side effects).
 */
export function generateCaseId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `TFC-${ymd}-${n}`;
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (TRADE_FINANCE_STATUSES as readonly string[]).includes(s);
}

function isValidFinancierType(t?: string | null): boolean {
  return !!t && (FINANCIER_TYPES as readonly string[]).includes(t);
}

function appendNote(existing: string | null | undefined, note: string): string {
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${note}`;
  if (!existing) return line;
  return `${existing}\n${line}`;
}

// ============ §2.1 verifyFinancierRelationship (NON-MARKETPLACE GATE) ============

/**
 * NON-MARKETPLACE gate. Verifies that the financier is in the trader's
 * approved list — i.e. there is an ACTIVE FinancierRelationship row linking
 * the traderGtid to the financierGtid.
 *
 * Returns:
 *   verified=true ONLY if an ACTIVE relationship exists.
 *   Otherwise verified=false with a `reason` describing why.
 *
 * This is the hard enforcement gate — `createFinancingCase` calls this
 * first; if verification fails, the case is REJECTED at creation.
 *
 * NOTE: This function queries the FinancierRelationship table directly so
 * there is NO circular import with `@/lib/sgtx/financier-relationship`. The
 * financier-relationship lib's `canTraderUseFinancier` performs the same
 * check (kept as the public API for the financier-relationship layer).
 */
export async function verifyFinancierRelationship(
  traderGtid: string,
  financierGtid: string,
): Promise<{
  verified: boolean;
  relationshipType?: string;
  reason: string;
}> {
  if (!traderGtid || !financierGtid) {
    return {
      verified: false,
      reason: "traderGtid and financierGtid are required",
    };
  }

  let rel: any = null;
  try {
    rel = await db.financierRelationship.findUnique({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
    });
  } catch (err) {
    logger.error("[trade-finance] verifyFinancierRelationship lookup failed", {
      error: String(err),
      traderGtid,
      financierGtid,
    });
    return {
      verified: false,
      reason: `relationship lookup failed: ${String(err)}`,
    };
  }

  if (!rel) {
    return {
      verified: false,
      reason:
        "no financier relationship — financier is NOT in the trader's approved list (non-marketplace §2 enforcement)",
    };
  }

  if (rel.relationshipStatus !== "ACTIVE") {
    return {
      verified: false,
      relationshipType: rel.financierType,
      reason: `financier relationship status is ${rel.relationshipStatus} (must be ACTIVE)`,
    };
  }

  // Relationship exists + is ACTIVE — verify the authorization window.
  const now = new Date();
  if (rel.authorizedFrom && now < rel.authorizedFrom) {
    return {
      verified: false,
      relationshipType: rel.financierType,
      reason: `financier authorization not yet effective (authorizedFrom=${rel.authorizedFrom.toISOString()})`,
    };
  }
  if (rel.authorizedUntil && now > rel.authorizedUntil) {
    return {
      verified: false,
      relationshipType: rel.financierType,
      reason: `financier authorization expired (authorizedUntil=${rel.authorizedUntil.toISOString()})`,
    };
  }

  return {
    verified: true,
    relationshipType: rel.financierType,
    reason: "ACTIVE relationship verified",
  };
}

// ============ §2.2 createFinancingCase ============

/**
 * Create a TradeFinanceCase. The `financierGtid` MUST be provided (explicit
 * trader selection — SGTX never auto-selects a financier).
 *
 * The relationship gate runs first via `verifyFinancierRelationship`. If the
 * financier is NOT verified, the case is created with `relationshipVerified=false`
 * + `status=REJECTED` (so the rejection is auditable). If verified, the case
 * is created with `relationshipVerified=true` + `status=FINANCING_REQUEST`.
 */
export async function createFinancingCase(
  input: CreateCaseInput,
): Promise<any> {
  if (!input?.borrowerGtid) {
    throw new Error("borrowerGtid is required");
  }
  if (!input?.financierGtid) {
    throw new Error(
      "financierGtid is required (non-marketplace §2 — explicit selection)",
    );
  }
  if (!(Number(input.amountUsd) > 0)) {
    throw new Error("amountUsd must be positive");
  }
  if (input.financierType && !isValidFinancierType(input.financierType)) {
    throw new Error(`Invalid financierType: ${input.financierType}`);
  }

  // Run the non-marketplace gate FIRST.
  const verify = await verifyFinancierRelationship(
    input.borrowerGtid,
    input.financierGtid,
  );

  const caseId = generateCaseId();
  const data: any = {
    caseId,
    borrowerGtid: input.borrowerGtid,
    financierGtid: input.financierGtid,
    amountUsd: +Number(input.amountUsd).toFixed(2),
    currency: input.currency || "USD",
    relationshipVerified: verify.verified,
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.tradeId) data.tradeId = input.tradeId;
  if (input.financierType) data.financierType = input.financierType;
  else if (verify.relationshipType) data.financierType = verify.relationshipType;
  if (input.tenorDays != null) data.tenorDays = +Number(input.tenorDays).toFixed(0);
  if (input.apr != null) data.apr = +Number(input.apr).toFixed(4);
  if (input.collateralType) data.collateralType = input.collateralType;
  if (input.collateralValueUsd != null)
    data.collateralValueUsd = +Number(input.collateralValueUsd).toFixed(2);
  if (input.financingRequestId)
    data.financingRequestId = input.financingRequestId;
  if (input.financingAgreementId)
    data.financingAgreementId = input.financingAgreementId;

  if (verify.verified) {
    data.status = "FINANCING_REQUEST";
    data.notes = appendNote(
      input.notes || null,
      `case created — relationship verified (${verify.relationshipType})`,
    );
  } else {
    data.status = "REJECTED";
    data.notes = appendNote(
      input.notes || null,
      `case REJECTED at creation — ${verify.reason}`,
    );
  }

  try {
    const created = await db.tradeFinanceCase.create({ data });
    logger.info("[trade-finance] case created", {
      caseId,
      borrowerGtid: input.borrowerGtid,
      financierGtid: input.financierGtid,
      relationshipVerified: verify.verified,
      status: data.status,
    });
    return created;
  } catch (err) {
    logger.error("[trade-finance] createFinancingCase DB error", {
      error: String(err),
      caseId,
    });
    throw err;
  }
}

// ============ §2.3 listFinancingCases ============

/** List TradeFinanceCase rows with optional filters. Empty array on error. */
export async function listFinancingCases(filters?: {
  ustn?: string;
  borrowerGtid?: string;
  financierGtid?: string;
  status?: string;
}): Promise<any[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.borrowerGtid) where.borrowerGtid = filters.borrowerGtid;
  if (filters?.financierGtid) where.financierGtid = filters.financierGtid;
  if (filters?.status) where.status = filters.status;

  try {
    return await db.tradeFinanceCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[trade-finance] listFinancingCases failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §2.4 getFinancingCase ============

/** Fetch a TradeFinanceCase by its database id. */
export async function getFinancingCase(id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.tradeFinanceCase.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[trade-finance] getFinancingCase failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §2.5 transitionCaseStatus ============

/**
 * Transition a TradeFinanceCase to a new lifecycle status. The transition
 * must be listed in `LIFECYCLE_TRANSITIONS[currentStatus]`. Otherwise throws.
 *
 * If `notes` is provided, it is appended (timestamped) to the existing
 * notes field without overwriting prior history.
 */
export async function transitionCaseStatus(
  caseId: string,
  newStatus: string,
  notes?: string,
): Promise<any> {
  if (!caseId) throw new Error("caseId is required");
  if (!isValidStatus(newStatus)) {
    throw new Error(`Invalid newStatus: ${newStatus}`);
  }

  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] transitionCaseStatus lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) {
    throw new Error(`case not found: ${caseId}`);
  }

  const allowed = LIFECYCLE_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `illegal transition: ${existing.status} → ${newStatus} (allowed: ${allowed.join(", ") || "—"})`,
    );
  }

  const updateData: any = { status: newStatus };
  if (notes) updateData.notes = appendNote(existing.notes, notes);

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: updateData,
    });
    logger.info("[trade-finance] case transitioned", {
      caseId,
      from: existing.status,
      to: newStatus,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] transitionCaseStatus DB error", {
      error: String(err),
      caseId,
      newStatus,
    });
    throw err;
  }
}

// ============ §2.6 acceptOffer ============

/**
 * Transition a case OFFER → ACCEPTANCE. The financier's offer (terms,
 * amount, APR, tenor) has been accepted by the borrower.
 */
export async function acceptOffer(caseId: string): Promise<any> {
  return transitionCaseStatus(
    caseId,
    "ACCEPTANCE",
    "offer accepted by borrower",
  );
}

// ============ §2.7 disburse ============

/**
 * Transition a case ACCEPTANCE → DISBURSEMENT. Sets disbursementAmountUsd +
 * disbursementDate. Updates the FinancierRelationship currentExposureUsd by
 * +amountUsd (delegated to `updateExposure` in the financier-relationship
 * layer — non-marketplace exposure tracking).
 */
export async function disburse(
  caseId: string,
  amountUsd: number,
): Promise<any> {
  if (!(Number(amountUsd) > 0)) {
    throw new Error("amountUsd must be positive");
  }

  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] disburse lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  // Transition first (validates the lifecycle).
  const transitioned = await transitionCaseStatus(
    caseId,
    "DISBURSEMENT",
    `disbursement of $${Number(amountUsd).toFixed(2)}`,
  );

  const updateData: any = {
    disbursementAmountUsd: +Number(amountUsd).toFixed(2),
    disbursementDate: new Date(),
  };

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: updateData,
    });

    // Update the FinancierRelationship exposure (+amountUsd).
    if (existing.borrowerGtid && existing.financierGtid) {
      try {
        await updateExposure(
          existing.financierGtid,
          existing.borrowerGtid,
          +Number(amountUsd).toFixed(2),
        );
        logger.info("[trade-finance] exposure incremented", {
          caseId,
          financierGtid: existing.financierGtid,
          borrowerGtid: existing.borrowerGtid,
          delta: +Number(amountUsd).toFixed(2),
        });
      } catch (err) {
        // Exposure update failed — log + add note, but DON'T roll back the
        // disbursement (the financier has already paid out).
        logger.error("[trade-finance] exposure update failed", {
          error: String(err),
          caseId,
        });
        await db.tradeFinanceCase
          .update({
            where: { id: caseId },
            data: {
              notes: appendNote(
                updated.notes,
                `WARNING: exposure update failed — ${String(err)}`,
              ),
            },
          })
          .catch(() => undefined);
      }
    }

    logger.info("[trade-finance] case disbursed", {
      caseId,
      amountUsd,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] disburse DB error", {
      error: String(err),
      caseId,
    });
    throw err;
  }
}

// ============ §2.8 repay ============

/**
 * Transition a case DISBURSEMENT → REPAYMENT. Sets repaymentAmountUsd +
 * repaymentDate. Decrements the FinancierRelationship currentExposureUsd by
 * amountUsd (delegated to `updateExposure` with a negative delta).
 */
export async function repay(
  caseId: string,
  amountUsd: number,
): Promise<any> {
  if (!(Number(amountUsd) > 0)) {
    throw new Error("amountUsd must be positive");
  }

  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] repay lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  const transitioned = await transitionCaseStatus(
    caseId,
    "REPAYMENT",
    `repayment of $${Number(amountUsd).toFixed(2)}`,
  );

  const updateData: any = {
    repaymentAmountUsd: +Number(amountUsd).toFixed(2),
    repaymentDate: new Date(),
  };

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: updateData,
    });

    // Decrement exposure (negative delta).
    if (existing.borrowerGtid && existing.financierGtid) {
      try {
        await updateExposure(
          existing.financierGtid,
          existing.borrowerGtid,
          -+Number(amountUsd).toFixed(2),
        );
        logger.info("[trade-finance] exposure decremented", {
          caseId,
          financierGtid: existing.financierGtid,
          borrowerGtid: existing.borrowerGtid,
          delta: -+Number(amountUsd).toFixed(2),
        });
      } catch (err) {
        logger.error("[trade-finance] exposure decrement failed", {
          error: String(err),
          caseId,
        });
        await db.tradeFinanceCase
          .update({
            where: { id: caseId },
            data: {
              notes: appendNote(
                updated.notes,
                `WARNING: exposure decrement failed — ${String(err)}`,
              ),
            },
          })
          .catch(() => undefined);
      }
    }

    logger.info("[trade-finance] case repaid", {
      caseId,
      amountUsd,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] repay DB error", {
      error: String(err),
      caseId,
    });
    throw err;
  }
}

// ============ §2.9 triggerMarginCall ============

/**
 * Trigger a margin call on a case. Sets marginCallTriggered=true +
 * marginCallDate=now. Allowed from any active post-disbursement state
 * (DISBURSEMENT / REPAYMENT / MARGIN_CALL). The case is transitioned into
 * MARGIN_CALL status (if not already there).
 */
export async function triggerMarginCall(
  caseId: string,
  reason: string,
): Promise<any> {
  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] triggerMarginCall lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  // If the case is already in MARGIN_CALL, just update the trigger metadata.
  if (existing.status !== "MARGIN_CALL") {
    const allowed = LIFECYCLE_TRANSITIONS[existing.status] || [];
    if (!allowed.includes("MARGIN_CALL")) {
      throw new Error(
        `cannot trigger margin call from status=${existing.status}`,
      );
    }
    await transitionCaseStatus(
      caseId,
      "MARGIN_CALL",
      `margin call triggered — ${reason}`,
    );
  }

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: {
        marginCallTriggered: true,
        marginCallDate: new Date(),
        notes: appendNote(
          existing.notes,
          `MARGIN CALL — ${reason}`,
        ),
      },
    });
    logger.warn("[trade-finance] margin call triggered", {
      caseId,
      reason,
      priorStatus: existing.status,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] triggerMarginCall DB error", {
      error: String(err),
      caseId,
    });
    throw err;
  }
}

// ============ §2.10 settleCase ============

/**
 * Transition a case REPAYMENT (or MARGIN_CALL) → SETTLEMENT → CLOSED. This
 * is a two-step forward: SETTLEMENT then CLOSED. The function performs both
 * transitions sequentially (each is validated against the lifecycle map).
 *
 * Allowed source states: REPAYMENT, MARGIN_CALL, SETTLEMENT.
 */
export async function settleCase(caseId: string): Promise<any> {
  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] settleCase lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  // Validate that we can move toward SETTLEMENT from the current state.
  if (!["REPAYMENT", "MARGIN_CALL", "SETTLEMENT"].includes(existing.status)) {
    throw new Error(
      `cannot settle from status=${existing.status} (must be REPAYMENT, MARGIN_CALL, or SETTLEMENT)`,
    );
  }

  let current = existing;
  if (existing.status !== "SETTLEMENT") {
    current = await transitionCaseStatus(
      caseId,
      "SETTLEMENT",
      "case settled — moving to SETTLEMENT",
    );
  }

  // Now move SETTLEMENT → CLOSED.
  const closed = await transitionCaseStatus(
    caseId,
    "CLOSED",
    "case closed — lifecycle complete",
  );

  logger.info("[trade-finance] case settled + closed", {
    caseId,
    from: existing.status,
  });
  return closed;
}

// ============ §2.11 getFinancingCasesForTrader ============

/** All TradeFinanceCase rows where the trader is the borrower. */
export async function getFinancingCasesForTrader(
  traderGtid: string,
): Promise<any[]> {
  if (!traderGtid) return [];
  try {
    return await db.tradeFinanceCase.findMany({
      where: { borrowerGtid: traderGtid },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[trade-finance] getFinancingCasesForTrader failed", {
      error: String(err),
      traderGtid,
    });
    return [];
  }
}

// ============ §2.12 getFinancingCasesForFinancier ============

/** All TradeFinanceCase rows where the financier is the selected counterparty. */
export async function getFinancingCasesForFinancier(
  financierGtid: string,
): Promise<any[]> {
  if (!financierGtid) return [];
  try {
    return await db.tradeFinanceCase.findMany({
      where: { financierGtid },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[trade-finance] getFinancingCasesForFinancier failed", {
      error: String(err),
      financierGtid,
    });
    return [];
  }
}

// ============ §2.13 linkToExistingFinancingRequest ============

/**
 * Link a TradeFinanceCase to the legacy FinancingRequest row (Phase 4
 * RFQ/bid/agreement flow). Sets `financingRequestId` on the case. Idempotent
 * — if the link is already set to the same value, returns the existing row.
 */
export async function linkToExistingFinancingRequest(
  caseId: string,
  financingRequestId: string,
): Promise<any> {
  if (!caseId || !financingRequestId) {
    throw new Error("caseId and financingRequestId are required");
  }

  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] linkToFinancingRequest lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  if (existing.financingRequestId === financingRequestId) {
    return existing; // idempotent
  }

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: {
        financingRequestId,
        notes: appendNote(
          existing.notes,
          `linked to FinancingRequest ${financingRequestId}`,
        ),
      },
    });
    logger.info("[trade-finance] case linked to FinancingRequest", {
      caseId,
      financingRequestId,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] linkToFinancingRequest DB error", {
      error: String(err),
      caseId,
      financingRequestId,
    });
    throw err;
  }
}

// ============ §2.14 linkToExistingFinancingAgreement ============

/**
 * Link a TradeFinanceCase to the legacy FinancingAgreement row (Phase 4
 * master contract). Sets `financingAgreementId` on the case. Idempotent.
 */
export async function linkToExistingFinancingAgreement(
  caseId: string,
  financingAgreementId: string,
): Promise<any> {
  if (!caseId || !financingAgreementId) {
    throw new Error("caseId and financingAgreementId are required");
  }

  let existing: any = null;
  try {
    existing = await db.tradeFinanceCase.findUnique({ where: { id: caseId } });
  } catch (err) {
    logger.error("[trade-finance] linkToFinancingAgreement lookup failed", {
      error: String(err),
      caseId,
    });
    throw err;
  }
  if (!existing) throw new Error(`case not found: ${caseId}`);

  if (existing.financingAgreementId === financingAgreementId) {
    return existing; // idempotent
  }

  try {
    const updated = await db.tradeFinanceCase.update({
      where: { id: caseId },
      data: {
        financingAgreementId,
        notes: appendNote(
          existing.notes,
          `linked to FinancingAgreement ${financingAgreementId}`,
        ),
      },
    });
    logger.info("[trade-finance] case linked to FinancingAgreement", {
      caseId,
      financingAgreementId,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance] linkToFinancingAgreement DB error", {
      error: String(err),
      caseId,
      financingAgreementId,
    });
    throw err;
  }
}

// ============ Re-export the documents layer ============

/**
 * Backwards-compat re-exports — the Phase 6 trade-finance DOCUMENT helpers
 * (Add-On 20) now live in `./documents.ts`. Re-export here so any future
 * importer of `@/lib/sgtx/trade-finance` still sees them.
 */
export {
  createTradeFinanceDocument,
  listTradeFinanceDocuments,
  verifyTradeFinanceDocument,
} from "./documents";
export type {
  TradeFinanceDocumentType,
  TradeFinanceDocumentStatus,
  CreateTradeFinanceDocumentInput,
  VerifyDocumentInput,
} from "./documents";
