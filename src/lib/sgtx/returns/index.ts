// @ts-nocheck
/**
 * SGTX Phase 7 — §3 Returns Engine
 * ===========================================================================
 *
 * Implements the 9-type returns lifecycle on top of the new `ReturnRecord`
 * Prisma model (schema line 6907). A ReturnRecord is created when goods
 * need to flow back — a rejection, a repair, a replacement, a re-export,
 * a re-import, a warranty return, a destruction order, or an abandonment.
 *
 * The full PARENT/CHILD USTN relationship is preserved:
 *
 *   - `parentUstn` — the ORIGINAL trade USTN (the trade that the goods
 *     originally belonged to).
 *   - `ustn`       — the NEW child USTN generated for this return
 *     transaction. This is a fresh USTN — the return is itself a trade-like
 *     event with its own tracking number.
 *
 * 9 return types (§3):
 *
 *   REJECTION     — goods rejected at delivery (sent back to seller)
 *   RETURN        — generic return (buyer-initiated, post-acceptance)
 *   REPAIR        — goods sent back for repair under warranty / contract
 *   REPLACEMENT   — goods sent back and replaced with new stock
 *   RE_EXPORT     — re-export customs declaration (goods leaving the country again)
 *   RE_IMPORT     — re-import customs declaration (goods returning to country of origin)
 *   WARRANTY      — warranty claim return (post-acceptance defect)
 *   DESTRUCTION   — goods destroyed (cannot be returned — e.g. contaminated)
 *   ABANDONMENT   — goods abandoned (no party wishes to take possession)
 *
 * Lifecycle (status state machine):
 *
 *   OPEN ──shipReturn──▶ IN_TRANSIT ──receiveReturn──▶ RECEIVED
 *        ──cancelReturn──▶ CANCELLED (from any non-terminal status)
 *
 *   RECEIVED ──processReturn──▶ PROCESSED ──completeReturn──▶ COMPLETED
 *
 * `processReturn` is type-aware:
 *   - REPAIR / REPLACEMENT → "goods are being processed" (refurb / replace workflow)
 *   - RE_EXPORT / RE_IMPORT → "customs declarations are being processed"
 *     (use `setReExportDeclaration` / `setReImportDeclaration` to attach
 *     the declaration numbers)
 *   - DESTRUCTION / ABANDONMENT → "disposal / abandonment paperwork is being processed"
 *
 * `getParentChildUstnMap(parentUstn)` builds the full parent/child USTN tree
 * for a trade — returns the parent USTN plus an array of all child return
 * USTNs with their return type + status.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers (`generateReturnId`)
 * have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { generateUSTN } from "@/lib/sgtx/ustn";

// ============ §3 Constants ============

export const RETURN_TYPES = [
  "REJECTION",
  "RETURN",
  "REPAIR",
  "REPLACEMENT",
  "RE_EXPORT",
  "RE_IMPORT",
  "WARRANTY",
  "DESTRUCTION",
  "ABANDONMENT",
] as const;

export const RETURN_STATUSES = [
  "OPEN",
  "IN_TRANSIT",
  "RECEIVED",
  "PROCESSED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const RETURN_TRANSPORT_MODES = [
  "ROAD",
  "AIR",
  "OCEAN",
  "RAIL",
  "FERRY",
] as const;

export const GOODS_CONDITIONS = [
  "GOOD",
  "DAMAGED",
  "DEFECTIVE",
  "CONTAMINATED",
] as const;

// ============ Types ============

export interface CreateReturnInput {
  parentUstn: string; // the original trade USTN (REQUIRED)
  parentTradeId?: string;
  ustn?: string; // optional — auto-generated if not provided (child USTN)
  returnType: string;
  reason?: string;
  quantityReturned?: number;
  quantityUnit?: string;
  goodsCondition?: string;
  returnOrigin?: string;
  returnDestination?: string;
  transportMode?: string;
  reExportDeclaration?: string;
  reImportDeclaration?: string;
  claimId?: string; // the §2 claim that triggered the return
  deliveryAcceptanceId?: string; // the §1 delivery that triggered the return
  initiatedAt?: Date | string;
  notes?: string;
  // For USTN auto-generation — only used if `ustn` is not provided
  buyerGtid?: string;
  sellerGtid?: string;
}

export interface ReturnRecord {
  id: string;
  returnId: string;
  ustn?: string | null;
  parentUstn?: string | null;
  parentTradeId?: string | null;
  returnType: string;
  reason?: string | null;
  quantityReturned?: number | null;
  quantityUnit?: string | null;
  goodsCondition: string;
  returnOrigin?: string | null;
  returnDestination?: string | null;
  transportMode?: string | null;
  reExportDeclaration?: string | null;
  reImportDeclaration?: string | null;
  status: string;
  claimId?: string | null;
  deliveryAcceptanceId?: string | null;
  initiatedAt?: Date | null;
  shippedAt?: Date | null;
  receivedAt?: Date | null;
  completedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ §3.0 Pure helpers ============

function isValidReturnType(t?: string | null): boolean {
  return !!t && (RETURN_TYPES as readonly string[]).includes(t);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (RETURN_STATUSES as readonly string[]).includes(s);
}

function isValidTransportMode(m?: string | null): boolean {
  return !!m && (RETURN_TRANSPORT_MODES as readonly string[]).includes(m);
}

function isValidGoodsCondition(c?: string | null): boolean {
  return !!c && (GOODS_CONDITIONS as readonly string[]).includes(c);
}

/**
 * Pure: generate a `RET-YYYYMMDD-NNNNN` return id. 5-digit zero-padded
 * random suffix. No DB, no side effects.
 *
 * NOTE: collisions on the random suffix are theoretically possible but
 * astronomically unlikely (1 in 100,000 per day per insert). The `returnId`
 * column is `@unique` so a collision will throw on insert — callers should
 * retry on a unique-constraint violation.
 */
export function generateReturnId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `RET-${ymd}-${n}`;
}

// ============ §3.1 createReturn ============

/**
 * Create a new ReturnRecord. Generates `returnId` (RET-YYYYMMDD-NNNNN).
 * Sets `ustn` (the child USTN — auto-generated via `generateUSTN` if not
 * provided) + `parentUstn` (the original trade USTN — REQUIRED).
 * `status=OPEN`.
 *
 * The parent/child USTN relationship is the core abstraction of the §3
 * Returns Engine: the parent USTN is the original trade; the child USTN
 * is the new tracking number for THIS return transaction. This means a
 * single parent trade can have multiple returns (each with its own child
 * USTN) — `getParentChildUstnMap` builds the full tree.
 *
 * For RE_EXPORT / RE_IMPORT types, callers typically attach the customs
 * declaration numbers AFTER creation via `setReExportDeclaration` /
 * `setReImportDeclaration` (since the declarations are issued by customs
 * asynchronously).
 *
 * Retries the insert up to 3 times on `returnId` collision (unique
 * constraint violation) before giving up.
 */
export async function createReturn(input: CreateReturnInput): Promise<ReturnRecord> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!input.parentUstn) {
    throw new Error("parentUstn is required (the original trade USTN)");
  }
  if (!isValidReturnType(input.returnType)) {
    throw new Error(`Invalid returnType: ${input.returnType}`);
  }

  // Auto-generate a child USTN if not provided.
  let childUstn = input.ustn || null;
  if (!childUstn) {
    try {
      // Resolve buyerGtid/sellerGtid from the parent trade if available.
      let buyerGtid = input.buyerGtid || "";
      let sellerGtid = input.sellerGtid || "";
      if (!buyerGtid || !sellerGtid) {
        try {
          const parentTrade = await db.trade.findUnique({
            where: { ustn: input.parentUstn },
          });
          if (parentTrade) {
            buyerGtid = buyerGtid || (parentTrade as any).buyerGtid || "";
            sellerGtid = sellerGtid || (parentTrade as any).sellerGtid || "";
            // also lift the parentTradeId if not provided
            if (!input.parentTradeId) {
              input.parentTradeId = (parentTrade as any).id;
            }
          }
        } catch (err) {
          logger.warn("[returns] parent trade lookup failed — using placeholder GTIDs", {
            error: String(err),
            parentUstn: input.parentUstn,
          });
        }
      }
      if (buyerGtid && sellerGtid) {
        childUstn = generateUSTN(buyerGtid, sellerGtid);
      } else {
        // Last-resort fallback — a pseudo-USTN that includes the parent USTN
        // so it's at least traceable. Will fail strict format validation
        // but is unique and traceable.
        const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
        childUstn = `${input.parentUstn}-RET-${rand}`;
      }
    } catch (err) {
      logger.error("[returns] child USTN generation failed", {
        error: String(err),
        parentUstn: input.parentUstn,
      });
      // continue — store null and let caller decide
      childUstn = null;
    }
  }

  const goodsCondition = isValidGoodsCondition(input.goodsCondition)
    ? input.goodsCondition!
    : "GOOD";

  const data: any = {
    returnId: generateReturnId(),
    ustn: childUstn,
    parentUstn: input.parentUstn,
    parentTradeId: input.parentTradeId || null,
    returnType: input.returnType,
    reason: input.reason || null,
    quantityReturned:
      input.quantityReturned !== undefined && input.quantityReturned !== null
        ? Number(input.quantityReturned)
        : null,
    quantityUnit: input.quantityUnit || null,
    goodsCondition,
    returnOrigin: input.returnOrigin || null,
    returnDestination: input.returnDestination || null,
    transportMode: isValidTransportMode(input.transportMode)
      ? input.transportMode!
      : null,
    reExportDeclaration: input.reExportDeclaration || null,
    reImportDeclaration: input.reImportDeclaration || null,
    status: "OPEN",
    claimId: input.claimId || null,
    deliveryAcceptanceId: input.deliveryAcceptanceId || null,
    initiatedAt: input.initiatedAt
      ? input.initiatedAt instanceof Date
        ? input.initiatedAt
        : new Date(input.initiatedAt)
      : new Date(),
    shippedAt: null,
    receivedAt: null,
    completedAt: null,
    notes: input.notes || null,
  };

  // Retry on returnId collision (unique constraint)
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.returnRecord.create({ data });
      logger.info("[returns] return created (OPEN)", {
        id: row.id,
        returnId: row.returnId,
        returnType: input.returnType,
        parentUstn: input.parentUstn,
        childUstn,
      });
      return row as ReturnRecord;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (/unique|constraint|returnId/i.test(msg) && attempt < 2) {
        logger.warn("[returns] returnId collision — retrying", {
          returnId: data.returnId,
          attempt: attempt + 1,
        });
        data.returnId = generateReturnId();
        continue;
      }
      break;
    }
  }

  logger.error("[returns] createReturn DB error", {
    error: String(lastErr),
    returnType: input.returnType,
    parentUstn: input.parentUstn,
  });
  throw lastErr;
}

// ============ §3.2 getReturn ============

/** Fetch a ReturnRecord by its database id. Null-safe. */
export async function getReturn(id: string): Promise<ReturnRecord | null> {
  if (!id) return null;
  try {
    const row = await db.returnRecord.findUnique({ where: { id } });
    return (row as ReturnRecord) || null;
  } catch (err) {
    logger.error("[returns] getReturn failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §3.3 getReturnByReturnId ============

/** Fetch a ReturnRecord by its business `returnId` (RET-YYYYMMDD-NNNNN). Null-safe. */
export async function getReturnByReturnId(
  returnId: string,
): Promise<ReturnRecord | null> {
  if (!returnId) return null;
  try {
    const row = await db.returnRecord.findUnique({ where: { returnId } });
    return (row as ReturnRecord) || null;
  } catch (err) {
    logger.error("[returns] getReturnByReturnId failed", {
      error: String(err),
      returnId,
    });
    return null;
  }
}

// ============ §3.4 listReturns ============

/**
 * List ReturnRecords with optional filters. Ordered by createdAt desc.
 * Empty array on error.
 */
export async function listReturns(filters?: {
  ustn?: string;
  parentUstn?: string;
  returnType?: string;
  status?: string;
}): Promise<ReturnRecord[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.parentUstn) where.parentUstn = filters.parentUstn;
  if (filters?.returnType) where.returnType = filters.returnType;
  if (filters?.status) where.status = filters.status;

  try {
    const rows = await db.returnRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as ReturnRecord[]) || [];
  } catch (err) {
    logger.error("[returns] listReturns failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §3.5 getReturnsByParentUstn ============

/**
 * All returns for a parent trade (returns whose `parentUstn` matches).
 * Empty array on error.
 */
export async function getReturnsByParentUstn(
  parentUstn: string,
): Promise<ReturnRecord[]> {
  if (!parentUstn) return [];
  try {
    const rows = await db.returnRecord.findMany({
      where: { parentUstn },
      orderBy: { createdAt: "desc" },
    });
    return (rows as ReturnRecord[]) || [];
  } catch (err) {
    logger.error("[returns] getReturnsByParentUstn failed", {
      error: String(err),
      parentUstn,
    });
    return [];
  }
}

// ============ §3.6 getReturnsByChildUstn ============

/**
 * Returns where this USTN is the child (`ustn` matches). Empty array on error.
 *
 * Typically returns at most one row (each return has its own unique child
 * USTN), but the array shape is preserved for consistency with the other
 * list helpers.
 */
export async function getReturnsByChildUstn(
  ustn: string,
): Promise<ReturnRecord[]> {
  if (!ustn) return [];
  try {
    const rows = await db.returnRecord.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return (rows as ReturnRecord[]) || [];
  } catch (err) {
    logger.error("[returns] getReturnsByChildUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §3.7 shipReturn ============

/**
 * OPEN → IN_TRANSIT. Sets `shippedAt` + `transportMode`. Validates that
 * the return is in OPEN status.
 *
 * `transportMode` should be one of: ROAD | AIR | OCEAN | RAIL | FERRY
 * (validated against `RETURN_TRANSPORT_MODES`). Unknown modes are rejected.
 */
export async function shipReturn(
  id: string,
  transportMode: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!isValidTransportMode(transportMode)) {
    throw new Error(
      `Invalid transportMode: ${transportMode} — must be one of ${RETURN_TRANSPORT_MODES.join(", ")}`,
    );
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] shipReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }
  if (row.status !== "OPEN") {
    throw new Error(
      `Cannot ship return in status ${row.status} — must be OPEN`,
    );
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: {
        status: "IN_TRANSIT",
        transportMode,
        shippedAt: new Date(),
      },
    });
    logger.info("[returns] return shipped", {
      id,
      returnId: row.returnId,
      transportMode,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] shipReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.8 receiveReturn ============

/**
 * IN_TRANSIT → RECEIVED. Sets `receivedAt`. Validates that the return is
 * in IN_TRANSIT status.
 *
 * For DESTRUCTION / ABANDONMENT returns, this transition marks "goods
 * received at the disposal facility" — the subsequent `processReturn`
 * records the destruction / abandonment certificate.
 */
export async function receiveReturn(id: string): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] receiveReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }
  if (row.status !== "IN_TRANSIT") {
    throw new Error(
      `Cannot receive return in status ${row.status} — must be IN_TRANSIT`,
    );
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
      },
    });
    logger.info("[returns] return received", {
      id,
      returnId: row.returnId,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] receiveReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.9 processReturn ============

/**
 * RECEIVED → PROCESSED. Sets `notes` to the processing notes.
 *
 * Type-aware semantics (recorded in notes for downstream consumers):
 *   - REPAIR / REPLACEMENT → "goods are being processed" (refurb / replace workflow)
 *   - RE_EXPORT / RE_IMPORT → "customs declarations are being processed"
 *     (use `setReExportDeclaration` / `setReImportDeclaration` BEFORE or
 *     AFTER this call to attach the declaration numbers)
 *   - DESTRUCTION / ABANDONMENT → "disposal / abandonment paperwork being processed"
 *   - REJECTION / RETURN / WARRANTY → "return is being processed"
 *
 * Validates that the return is in RECEIVED status.
 */
export async function processReturn(
  id: string,
  notes: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!notes || !notes.trim()) {
    throw new Error("notes are required to process a return");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] processReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }
  if (row.status !== "RECEIVED") {
    throw new Error(
      `Cannot process return in status ${row.status} — must be RECEIVED`,
    );
  }

  const typeSpecificNote = (() => {
    switch (row.returnType) {
      case "REPAIR":
      case "REPLACEMENT":
        return "Goods are being processed (refurb / replace workflow).";
      case "RE_EXPORT":
        return "Re-export customs declarations are being processed.";
      case "RE_IMPORT":
        return "Re-import customs declarations are being processed.";
      case "DESTRUCTION":
        return "Destruction / disposal paperwork is being processed.";
      case "ABANDONMENT":
        return "Abandonment paperwork is being processed.";
      case "REJECTION":
      case "RETURN":
      case "WARRANTY":
      default:
        return "Return is being processed.";
    }
  })();

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: {
        status: "PROCESSED",
        notes: `${typeSpecificNote}\n${notes}`,
      },
    });
    logger.info("[returns] return processed", {
      id,
      returnId: row.returnId,
      returnType: row.returnType,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] processReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.10 completeReturn ============

/**
 * PROCESSED → COMPLETED. Sets `completedAt`. Validates that the return is
 * in PROCESSED status.
 *
 * For RE_EXPORT / RE_IMPORT: ideally the customs declarations should be
 * attached before completion (via `setReExportDeclaration` /
 * `setReImportDeclaration`), but this is not enforced — completion is
 * the clerical close-out.
 */
export async function completeReturn(id: string): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] completeReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }
  if (row.status !== "PROCESSED") {
    throw new Error(
      `Cannot complete return in status ${row.status} — must be PROCESSED`,
    );
  }
  if (row.completedAt) {
    // idempotent — already completed
    return row as ReturnRecord;
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    logger.info("[returns] return completed", {
      id,
      returnId: row.returnId,
      returnType: row.returnType,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] completeReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.11 cancelReturn ============

/**
 * Any non-terminal status (OPEN / IN_TRANSIT / RECEIVED / PROCESSED) →
 * CANCELLED. Sets `notes` to the cancellation reason.
 *
 * COMPLETED / CANCELLED are terminal — cannot be cancelled again.
 */
export async function cancelReturn(
  id: string,
  reason: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required to cancel a return");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] cancelReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }

  if (row.status === "COMPLETED" || row.status === "CANCELLED") {
    throw new Error(
      `Cannot cancel return in terminal status ${row.status}`,
    );
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: {
        status: "CANCELLED",
        notes: `${row.notes ? row.notes + "\n" : ""}CANCELLED: ${reason}`,
      },
    });
    logger.info("[returns] return cancelled", {
      id,
      returnId: row.returnId,
      fromStatus: row.status,
      reason,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] cancelReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.12 linkClaim ============

/**
 * Link a return to a §2 TradeClaim (the `claimId` field — the claim's
 * business `CLM-YYYYMMDD-NNNNN` id). Used when a claim triggers the return
 * (or vice versa — the §1 Delivery Acceptance engine auto-opens claims and
 * this engine can back-link them).
 */
export async function linkClaim(
  id: string,
  claimId: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!claimId) {
    throw new Error("claimId is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] linkClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: { claimId },
    });
    logger.info("[returns] return linked to claim", {
      id,
      returnId: row.returnId,
      claimId,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] linkClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.13 linkDeliveryAcceptance ============

/**
 * Link a return to a §1 DeliveryAcceptance (the `deliveryAcceptanceId`
 * field — the delivery's database id). Used when a delivery rejection
 * triggers the return.
 */
export async function linkDeliveryAcceptance(
  id: string,
  deliveryAcceptanceId: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!deliveryAcceptanceId) {
    throw new Error("deliveryAcceptanceId is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] linkDeliveryAcceptance lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: { deliveryAcceptanceId },
    });
    logger.info("[returns] return linked to delivery acceptance", {
      id,
      returnId: row.returnId,
      deliveryAcceptanceId,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] linkDeliveryAcceptance DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.14 setReExportDeclaration ============

/**
 * Set the re-export customs declaration number on the return. Used for
 * RE_EXPORT returns (and any return that crosses a customs border on the
 * way out). Can be set at any point in the lifecycle but typically
 * attached during the PROCESSED phase.
 */
export async function setReExportDeclaration(
  id: string,
  declarationNumber: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!declarationNumber || !declarationNumber.trim()) {
    throw new Error("declarationNumber is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] setReExportDeclaration lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: { reExportDeclaration: declarationNumber },
    });
    logger.info("[returns] re-export declaration set", {
      id,
      returnId: row.returnId,
      declarationNumber,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] setReExportDeclaration DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.15 setReImportDeclaration ============

/**
 * Set the re-import customs declaration number on the return. Used for
 * RE_IMPORT returns (and any return that crosses a customs border on the
 * way back in). Can be set at any point in the lifecycle but typically
 * attached during the PROCESSED phase.
 */
export async function setReImportDeclaration(
  id: string,
  declarationNumber: string,
): Promise<ReturnRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!declarationNumber || !declarationNumber.trim()) {
    throw new Error("declarationNumber is required");
  }

  let row: any = null;
  try {
    row = await db.returnRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[returns] setReImportDeclaration lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`ReturnRecord not found: ${id}`);
  }

  try {
    const updated = await db.returnRecord.update({
      where: { id },
      data: { reImportDeclaration: declarationNumber },
    });
    logger.info("[returns] re-import declaration set", {
      id,
      returnId: row.returnId,
      declarationNumber,
    });
    return updated as ReturnRecord;
  } catch (err) {
    logger.error("[returns] setReImportDeclaration DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §3.16 getParentChildUstnMap ============

/**
 * Build the full parent/child USTN tree for a trade.
 *
 * Returns:
 *   {
 *     parentUstn: string,
 *     children: Array<{
 *       ustn:        string,   // the child USTN (the return's `ustn`)
 *       returnId:    string,   // RET-YYYYMMDD-NNNNN
 *       returnType:  string,  // REJECTION | RETURN | REPAIR | ...
 *       status:      string,  // OPEN | IN_TRANSIT | RECEIVED | ...
 *     }>
 *   }
 *
 * If the parent trade has no returns, `children` is an empty array.
 * On error, returns `{ parentUstn, children: [] }` so callers always get
 * a well-formed object.
 *
 * This is the canonical query for the §6 TradeClosureState gate and the
 * §5 evidence autocompiler — both need the full USTN tree to enumerate
 * every related transaction for a parent trade.
 */
export async function getParentChildUstnMap(parentUstn: string): Promise<{
  parentUstn: string;
  children: Array<{
    ustn: string;
    returnId: string;
    returnType: string;
    status: string;
  }>;
}> {
  if (!parentUstn) {
    return { parentUstn: "", children: [] };
  }

  let children: Array<{
    ustn: string;
    returnId: string;
    returnType: string;
    status: string;
  }> = [];

  try {
    const rows = await db.returnRecord.findMany({
      where: { parentUstn },
      orderBy: { createdAt: "asc" },
      select: {
        ustn: true,
        returnId: true,
        returnType: true,
        status: true,
      },
    });
    children = (rows || [])
      .filter((r: any) => r && r.ustn)
      .map((r: any) => ({
        ustn: r.ustn as string,
        returnId: r.returnId as string,
        returnType: r.returnType as string,
        status: r.status as string,
      }));
  } catch (err) {
    logger.error("[returns] getParentChildUstnMap failed", {
      error: String(err),
      parentUstn,
    });
    // safe default — empty children
    children = [];
  }

  return {
    parentUstn,
    children,
  };
}
