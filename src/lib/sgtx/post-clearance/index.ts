// @ts-nocheck
/**
 * SGTX Phase 7 — §4 Post-Clearance Action Engine
 * ===========================================================================
 *
 * Implements the 9-type post-clearance action lifecycle on top of the new
 * `PostClearanceAction` Prisma model (schema line 6949). Post-clearance
 * actions are the formal instruments raised by (or against) a trade AFTER
 * the customs declaration has been cleared / released — a customs audit,
 * a customs query, a correction, a reassessment of duty, a refund claim,
 * a drawback claim, a penalty, an appeal, or a record-retrieval request.
 *
 * 9 action types (§4):
 *
 *   CUSTOMS_AUDIT     — customs authority launches a formal audit
 *   CUSTOMS_QUERY     — customs asks a question about the declaration
 *   CORRECTION        — voluntary correction of an inaccuracy
 *   REASSESSMENT      — customs reassesses the duty / valuation
 *   REFUND            — claim for refund of overpaid duty
 *   DRAWBACK          — claim for drawback (re-export of duty-paid goods)
 *   PENALTY           — penalty imposed by customs
 *   APPEAL            — formal appeal against any of the above
 *   RECORD_RETRIEVAL  — request to retrieve archived declaration records
 *
 * Lifecycle (status state machine):
 *
 *   OPEN ──reviewAction──▶ IN_REVIEW
 *        IN_REVIEW ──approveAction──▶ { COMPLETED | PENDING_PAYMENT }
 *                   ──rejectAction──▶ REJECTED
 *
 * For REFUND / DRAWBACK actions, `approveAction` transitions to
 * PENDING_PAYMENT (not COMPLETED) — the action stays open until the
 * refund / drawback is paid by the customs authority. `markPaid` then
 * transitions PENDING_PAYMENT → PAID. `completeAction` finally sets
 * PAID → COMPLETED with `resolvedAt`.
 *
 * For all other action types, `approveAction` transitions directly to
 * COMPLETED.
 *
 * `fileAppeal(id, reason)` creates a NEW PostClearanceAction with
 * actionType=APPEAL linked back to the original action via the
 * `customsOperationId` field (the parent action's id is recorded in
 * the new action's `notes`).
 *
 * Linkage:
 *   - `linkAccounting(id, accountingEntryId)`   — link to a §7 AccountingEntry
 *   - `linkReconciliation(id, reconciliationId)` — link to a §9 ReconciliationRecord
 *
 * `hasOpenPostClearanceActions(ustn)` checks for OPEN | IN_REVIEW |
 * PENDING_PAYMENT actions (the "active" set used by the §6 TradeClosureState
 * gate — a trade with outstanding post-clearance obligations cannot be
 * closed).
 *
 * `getPendingPayments(ustn)` returns all REFUND/DRAWBACK actions in
 * PENDING_PAYMENT state for the trade — used by the §5 Final Evidence
 * Package compiler and the §6 closure gate.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes. Pure helpers
 * (`generateActionId`) have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §4 Constants ============

export const POST_CLEARANCE_ACTION_TYPES = [
  "CUSTOMS_AUDIT",
  "CUSTOMS_QUERY",
  "CORRECTION",
  "REASSESSMENT",
  "REFUND",
  "DRAWBACK",
  "PENALTY",
  "APPEAL",
  "RECORD_RETRIEVAL",
] as const;

export const POST_CLEARANCE_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "PENDING_PAYMENT",
  "PAID",
] as const;

/**
 * Statuses considered "open" / active — used by `hasOpenPostClearanceActions`
 * and by the §6 TradeClosureState gate. APPROVED / REJECTED / COMPLETED / PAID
 * are NOT in this set (they are terminal / closed-out — PAID REFUND/DRAWBACK
 * actions no longer block closure once `completeAction` sets them to
 * COMPLETED).
 */
export const OPEN_POST_CLEARANCE_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "PENDING_PAYMENT",
] as const;

/**
 * Action types that route through the PENDING_PAYMENT / PAID sub-lifecycle
 * (rather than transitioning directly to COMPLETED on `approveAction`).
 */
export const PAYMENT_REQUIRED_ACTION_TYPES = ["REFUND", "DRAWBACK"] as const;

// ============ Types ============

export interface CreateActionInput {
  ustn?: string;
  tradeId?: string;
  customsOperationId?: string;
  actionType: string;
  description?: string;
  customsAuthority?: string;
  customsReference?: string;
  amountUsd?: number;
  currency?: string;
  notes?: string;
}

export interface PostClearanceAction {
  id: string;
  actionId: string;
  ustn?: string | null;
  tradeId?: string | null;
  customsOperationId?: string | null;
  actionType: string;
  description?: string | null;
  customsAuthority?: string | null;
  customsReference?: string | null;
  amountUsd?: number | null;
  currency: string;
  status: string;
  resolution?: string | null;
  resolutionNotes?: string | null;
  filedAt?: Date | null;
  reviewedAt?: Date | null;
  resolvedAt?: Date | null;
  accountingEntryId?: string | null;
  reconciliationId?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListActionsFilter {
  ustn?: string;
  customsOperationId?: string;
  actionType?: string;
  status?: string;
}

// ============ §4.0 Pure helpers ============

function isValidActionType(t?: string | null): boolean {
  return !!t && (POST_CLEARANCE_ACTION_TYPES as readonly string[]).includes(t);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (POST_CLEARANCE_STATUSES as readonly string[]).includes(s);
}

/**
 * Pure: generate a `PCA-YYYYMMDD-NNNNN` action id. 5-digit zero-padded
 * random suffix. No DB, no side effects.
 *
 * NOTE: collisions on the random suffix are theoretically possible but
 * astronomically unlikely (1 in 100,000 per day per insert). The
 * `actionId` column is `@unique` so a collision will throw on insert —
 * callers should retry on a unique-constraint violation.
 */
export function generateActionId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `PCA-${ymd}-${n}`;
}

/**
 * Pure: returns true if the action type routes through the
 * PENDING_PAYMENT / PAID sub-lifecycle (REFUND or DRAWBACK).
 */
export function isPaymentActionType(actionType: string): boolean {
  return (PAYMENT_REQUIRED_ACTION_TYPES as readonly string[]).includes(
    actionType,
  );
}

// ============ §4.1 createPostClearanceAction ============

/**
 * Create a new PostClearanceAction. Generates `actionId`
 * (PCA-YYYYMMDD-NNNNN), sets `status=OPEN` + `filedAt`. Links to `ustn`,
 * `tradeId`, and `customsOperationId` (if provided).
 *
 * If `actionType` is invalid, an error is thrown.
 *
 * Retries the insert up to 3 times on `actionId` collision (unique
 * constraint violation) before giving up.
 */
export async function createPostClearanceAction(
  input: CreateActionInput,
): Promise<PostClearanceAction> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!isValidActionType(input.actionType)) {
    throw new Error(`Invalid actionType: ${input.actionType}`);
  }

  const data: any = {
    actionId: generateActionId(),
    ustn: input.ustn || null,
    tradeId: input.tradeId || null,
    customsOperationId: input.customsOperationId || null,
    actionType: input.actionType,
    description: input.description || null,
    customsAuthority: input.customsAuthority || null,
    customsReference: input.customsReference || null,
    amountUsd:
      input.amountUsd !== undefined && input.amountUsd !== null
        ? Number(input.amountUsd)
        : null,
    currency: input.currency || "USD",
    status: "OPEN",
    resolution: null,
    resolutionNotes: null,
    filedAt: new Date(),
    reviewedAt: null,
    resolvedAt: null,
    accountingEntryId: null,
    reconciliationId: null,
    notes: input.notes || null,
  };

  // Retry on actionId collision (unique constraint)
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.postClearanceAction.create({ data });
      logger.info("[post-clearance] action created (OPEN)", {
        id: row.id,
        actionId: row.actionId,
        actionType: input.actionType,
        ustn: input.ustn,
      });
      return row as PostClearanceAction;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (/unique|constraint|actionId/i.test(msg) && attempt < 2) {
        logger.warn("[post-clearance] actionId collision — retrying", {
          actionId: data.actionId,
          attempt: attempt + 1,
        });
        data.actionId = generateActionId();
        continue;
      }
      break;
    }
  }
  logger.error("[post-clearance] createPostClearanceAction failed", {
    error: String(lastErr),
    actionType: input.actionType,
    ustn: input.ustn,
  });
  throw lastErr || new Error("createPostClearanceAction failed");
}

// ============ §4.2 getAction ============

/**
 * Fetch a single PostClearanceAction by its primary `id`. Returns null on
 * error or if not found.
 */
export async function getAction(
  id: string,
): Promise<PostClearanceAction | null> {
  if (!id) return null;
  try {
    const row = await db.postClearanceAction.findUnique({ where: { id } });
    return (row as PostClearanceAction) || null;
  } catch (err) {
    logger.error("[post-clearance] getAction failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §4.3 getActionByActionId ============

/**
 * Fetch a single PostClearanceAction by its business `actionId`
 * (PCA-YYYYMMDD-NNNNN). Returns null on error or if not found.
 */
export async function getActionByActionId(
  actionId: string,
): Promise<PostClearanceAction | null> {
  if (!actionId) return null;
  try {
    const row = await db.postClearanceAction.findUnique({
      where: { actionId },
    });
    return (row as PostClearanceAction) || null;
  } catch (err) {
    logger.error("[post-clearance] getActionByActionId failed", {
      error: String(err),
      actionId,
    });
    return null;
  }
}

// ============ §4.4 listActions ============

/**
 * List PostClearanceActions with optional filters (ustn, customsOperationId,
 * actionType, status). Returns an empty array on error. Ordered by
 * `createdAt DESC` (newest first).
 */
export async function listActions(
  filters?: ListActionsFilter,
): Promise<PostClearanceAction[]> {
  try {
    const where: any = {};
    if (filters?.ustn) where.ustn = filters.ustn;
    if (filters?.customsOperationId)
      where.customsOperationId = filters.customsOperationId;
    if (filters?.actionType) where.actionType = filters.actionType;
    if (filters?.status) where.status = filters.status;
    const rows = await db.postClearanceAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as PostClearanceAction[]) || [];
  } catch (err) {
    logger.error("[post-clearance] listActions failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §4.5 getActionsByUstn ============

/**
 * Convenience wrapper: list all post-clearance actions for a given USTN.
 * Returns an empty array on error.
 */
export async function getActionsByUstn(
  ustn: string,
): Promise<PostClearanceAction[]> {
  if (!ustn) return [];
  return listActions({ ustn });
}

// ============ §4.6 reviewAction ============

/**
 * Transition an action OPEN → IN_REVIEW. Sets `reviewedAt`. Throws on
 * invalid state transition or DB error so the API layer can return a 4xx.
 */
export async function reviewAction(
  id: string,
  reviewer: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    if ((existing as any).status !== "OPEN") {
      throw new Error(
        `Cannot review action in status ${(existing as any).status} (expected OPEN)`,
      );
    }
    const notes = reviewer
      ? `Reviewed by ${reviewer}`
      : undefined;
    const row = await db.postClearanceAction.update({
      where: { id },
      data: {
        status: "IN_REVIEW",
        reviewedAt: new Date(),
        ...(notes ? { notes } : {}),
      },
    });
    logger.info("[post-clearance] action reviewed (IN_REVIEW)", {
      id,
      actionId: (row as any).actionId,
      reviewer,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] reviewAction failed", {
      error: String(err),
      id,
      reviewer,
    });
    throw err;
  }
}

// ============ §4.7 approveAction ============

/**
 * Transition an action IN_REVIEW → APPROVED. For REFUND / DRAWBACK actions
 * the action then transitions to PENDING_PAYMENT (awaiting customs payment);
 * for all other types the action transitions directly to COMPLETED with
 * `resolvedAt` set. Stores `resolution` and `resolutionNotes` on the row.
 *
 * Throws on invalid state transition or DB error.
 */
export async function approveAction(
  id: string,
  resolution: string,
  notes: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const status = (existing as any).status;
    if (status !== "IN_REVIEW") {
      throw new Error(
        `Cannot approve action in status ${status} (expected IN_REVIEW)`,
      );
    }
    const actionType = (existing as any).actionType;
    const now = new Date();
    const isPaymentAction = isPaymentActionType(actionType);
    const updated = await db.postClearanceAction.update({
      where: { id },
      data: {
        status: isPaymentAction ? "PENDING_PAYMENT" : "COMPLETED",
        resolution: resolution || null,
        resolutionNotes: notes || null,
        resolvedAt: isPaymentAction ? null : now,
      },
    });
    logger.info("[post-clearance] action approved", {
      id,
      actionId: (updated as any).actionId,
      actionType,
      newStatus: (updated as any).status,
    });
    return updated as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] approveAction failed", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.8 rejectAction ============

/**
 * Transition an action IN_REVIEW → REJECTED. Stores the rejection reason
 * in `resolutionNotes`. Throws on invalid state transition or DB error.
 */
export async function rejectAction(
  id: string,
  reason: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const status = (existing as any).status;
    if (status !== "IN_REVIEW") {
      throw new Error(
        `Cannot reject action in status ${status} (expected IN_REVIEW)`,
      );
    }
    const row = await db.postClearanceAction.update({
      where: { id },
      data: {
        status: "REJECTED",
        resolution: "REJECTED",
        resolutionNotes: reason || null,
        resolvedAt: new Date(),
      },
    });
    logger.info("[post-clearance] action rejected", {
      id,
      actionId: (row as any).actionId,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] rejectAction failed", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.9 completeAction ============

/**
 * Mark an action as COMPLETED. Sets `resolvedAt`. Used for:
 *   - PAID → COMPLETED (after `markPaid` for REFUND/DRAWBACK actions)
 *   - APPROVED → COMPLETED (manual completion if the action was approved
 *     but not auto-completed)
 *
 * Throws if the action is in a terminal status (REJECTED) or DB error.
 */
export async function completeAction(
  id: string,
  notes: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const status = (existing as any).status;
    if (status === "COMPLETED") {
      // Idempotent — already completed
      return existing as PostClearanceAction;
    }
    if (status === "REJECTED") {
      throw new Error(
        `Cannot complete action in status REJECTED (rejected actions are terminal)`,
      );
    }
    const row = await db.postClearanceAction.update({
      where: { id },
      data: {
        status: "COMPLETED",
        resolvedAt: new Date(),
        ...(notes ? { resolutionNotes: notes } : {}),
      },
    });
    logger.info("[post-clearance] action completed", {
      id,
      actionId: (row as any).actionId,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] completeAction failed", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.10 markPaid ============

/**
 * Transition a REFUND/DRAWBACK action PENDING_PAYMENT → PAID. Records the
 * customs / treasury payment reference in `resolutionNotes`. The action
 * is NOT yet COMPLETED — `completeAction` must be called separately to
 * set the resolvedAt timestamp + COMPLETED status (allows the treasury
 * settlement to be reconciled first).
 *
 * Throws if the action is not in PENDING_PAYMENT or not a payment-type
 * action.
 */
export async function markPaid(
  id: string,
  paymentReference: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  if (!paymentReference) throw new Error("paymentReference is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const status = (existing as any).status;
    const actionType = (existing as any).actionType;
    if (status !== "PENDING_PAYMENT") {
      throw new Error(
        `Cannot markPaid action in status ${status} (expected PENDING_PAYMENT)`,
      );
    }
    if (!isPaymentActionType(actionType)) {
      throw new Error(
        `Cannot markPaid action of type ${actionType} (only REFUND/DRAWBACK route through PENDING_PAYMENT)`,
      );
    }
    const row = await db.postClearanceAction.update({
      where: { id },
      data: {
        status: "PAID",
        resolutionNotes: `Paid — reference: ${paymentReference}`,
      },
    });
    logger.info("[post-clearance] action marked PAID", {
      id,
      actionId: (row as any).actionId,
      paymentReference,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] markPaid failed", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.11 fileAppeal ============

/**
 * File an appeal against an existing post-clearance action. Creates a NEW
 * PostClearanceAction with `actionType=APPEAL` linked back to the original
 * action — the new appeal's `customsOperationId` is set to the original
 * action's `customsOperationId` (if any), and the original action's id is
 * recorded in the new appeal's `notes` field so the appeal trail is
 * traceable.
 *
 * The original action's status is NOT changed (it remains in its current
 * state — the appeal is a separate legal instrument). Returns the new
 * APPEAL action.
 */
export async function fileAppeal(
  id: string,
  reason: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const appeal = await createPostClearanceAction({
      ustn: (existing as any).ustn || undefined,
      tradeId: (existing as any).tradeId || undefined,
      customsOperationId: (existing as any).customsOperationId || undefined,
      actionType: "APPEAL",
      description: `Appeal against ${(existing as any).actionId} (${(existing as any).actionType}): ${reason || "(no reason provided)"}`,
      customsAuthority: (existing as any).customsAuthority || undefined,
      customsReference: (existing as any).customsReference || undefined,
      amountUsd:
        (existing as any).amountUsd !== null &&
        (existing as any).amountUsd !== undefined
          ? Number((existing as any).amountUsd)
          : undefined,
      currency: (existing as any).currency || "USD",
      notes: `Parent action id: ${id} | actionId: ${(existing as any).actionId} | reason: ${reason || "(none)"}`,
    });
    logger.info("[post-clearance] appeal filed", {
      parentActionId: (existing as any).actionId,
      appealActionId: appeal.actionId,
    });
    return appeal;
  } catch (err) {
    logger.error("[post-clearance] fileAppeal failed", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §4.12 linkAccounting ============

/**
 * Link a PostClearanceAction to a §7 AccountingEntry (e.g. for REFUND /
 * DRAWBACK actions where the refund is posted as an accounting entry).
 * Idempotent — overwrites any previously linked accountingEntryId.
 *
 * Throws if the action is not found.
 */
export async function linkAccounting(
  id: string,
  accountingEntryId: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  if (!accountingEntryId) throw new Error("accountingEntryId is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const row = await db.postClearanceAction.update({
      where: { id },
      data: { accountingEntryId },
    });
    logger.info("[post-clearance] accounting entry linked", {
      id,
      actionId: (row as any).actionId,
      accountingEntryId,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] linkAccounting failed", {
      error: String(err),
      id,
      accountingEntryId,
    });
    throw err;
  }
}

// ============ §4.13 linkReconciliation ============

/**
 * Link a PostClearanceAction to a §9 ReconciliationRecord (e.g. for
 * REFUND / DRAWBACK actions where the refund payment is reconciled against
 * a customs/treasury statement). Idempotent — overwrites any previously
 * linked reconciliationId.
 *
 * Throws if the action is not found.
 */
export async function linkReconciliation(
  id: string,
  reconciliationId: string,
): Promise<PostClearanceAction> {
  if (!id) throw new Error("id is required");
  if (!reconciliationId) throw new Error("reconciliationId is required");
  try {
    const existing = await db.postClearanceAction.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error(`PostClearanceAction ${id} not found`);
    }
    const row = await db.postClearanceAction.update({
      where: { id },
      data: { reconciliationId },
    });
    logger.info("[post-clearance] reconciliation linked", {
      id,
      actionId: (row as any).actionId,
      reconciliationId,
    });
    return row as PostClearanceAction;
  } catch (err) {
    logger.error("[post-clearance] linkReconciliation failed", {
      error: String(err),
      id,
      reconciliationId,
    });
    throw err;
  }
}

// ============ §4.14 hasOpenPostClearanceActions ============

/**
 * Check if a trade USTN has any OPEN / IN_REVIEW / PENDING_PAYMENT
 * post-clearance actions. Returns false on error or if no active actions
 * exist.
 *
 * Used by the §6 TradeClosureState gate — a trade with outstanding
 * post-clearance obligations CANNOT be closed.
 */
export async function hasOpenPostClearanceActions(
  ustn: string,
): Promise<boolean> {
  if (!ustn) return false;
  try {
    const count = await db.postClearanceAction.count({
      where: {
        ustn,
        status: { in: [...OPEN_POST_CLEARANCE_STATUSES] },
      },
    });
    return count > 0;
  } catch (err) {
    logger.error("[post-clearance] hasOpenPostClearanceActions failed", {
      error: String(err),
      ustn,
    });
    return false;
  }
}

// ============ §4.15 getPendingPayments ============

/**
 * Returns all REFUND / DRAWBACK actions for a trade USTN that are in the
 * PENDING_PAYMENT state (approved, awaiting customs/treasury payment).
 *
 * Returns an empty array on error or if no pending payments exist.
 */
export async function getPendingPayments(
  ustn: string,
): Promise<PostClearanceAction[]> {
  if (!ustn) return [];
  try {
    const rows = await db.postClearanceAction.findMany({
      where: {
        ustn,
        status: "PENDING_PAYMENT",
        actionType: { in: [...PAYMENT_REQUIRED_ACTION_TYPES] },
      },
      orderBy: { filedAt: "asc" },
    });
    return (rows as PostClearanceAction[]) || [];
  } catch (err) {
    logger.error("[post-clearance] getPendingPayments failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}
