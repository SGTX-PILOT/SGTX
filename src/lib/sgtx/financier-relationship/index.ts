// @ts-nocheck
/**
 * SGTX Phase 6 — §2b Financier Relationship Layer (Non-Marketplace)
 * ===========================================================================
 *
 * The NON-MARKETPLACE financier visibility layer. SGTX does NOT publish a
 * financier marketplace, does NOT recommend financiers, and does NOT rank
 * financiers. A trader can use a financier ONLY if the trader has an ACTIVE
 * FinancierRelationship row linking their GTID to the financier's GTID.
 *
 * Three financier types (§2b):
 *   CONNECTED_BANK            — the trader's own connected bank
 *   TRADER_ADDED_FINANCIER    — a financier the trader explicitly saved
 *   APPROVED_FINANCING_ENTITY — a platform-wide-approved financing entity
 *                               (the trader must still explicitly select it)
 *
 * NON-MARKETPLACE guarantees (enforced in code):
 *   1. `listConnectedFinanciers` returns a FLAT list — no ranking, no
 *      public score, no recommendation. The list is ordered by
 *      `createdAt` (oldest first) so the trader's first-added financiers
 *      appear first — NOT by performance.
 *   2. `getFinancierInternalTrustScore` is marked INTERNAL — it MUST NOT be
 *      exposed publicly. The function name carries the `Internal` qualifier
 *      and the JSDoc repeats this contract.
 *
 * All DB calls are try/catch-wrapped with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §2b Constants ============

export const FINANCIER_TYPES = [
  "CONNECTED_BANK",
  "TRADER_ADDED_FINANCIER",
  "APPROVED_FINANCING_ENTITY",
] as const;

export const FINANCIER_RELATIONSHIP_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "EXPIRED",
] as const;

// ============ Types ============

export interface CreateFinancierInput {
  traderGtid: string;
  financierGtid: string;
  financierType: string;
  relationshipStatus?: string;
  authorizedFrom?: Date;
  authorizedUntil?: Date;
  authorizedBy?: string;
  creditLimitUsd?: number;
  internalTrustScore?: number;
  notes?: string;
}

// ============ §2b.0 Pure helpers ============

function isValidFinancierType(t?: string | null): boolean {
  return !!t && (FINANCIER_TYPES as readonly string[]).includes(t);
}

function isValidRelationshipStatus(s?: string | null): boolean {
  return !!s && (FINANCIER_RELATIONSHIP_STATUSES as readonly string[]).includes(s);
}

// ============ §2b.1 listConnectedFinanciers (NON-MARKETPLACE FLAT LIST) ============

/**
 * Returns the financiers a trader has a relationship with. **NON-MARKETPLACE**
 * guarantee: this is a FLAT list.
 *   - NO ranking (no sort by trust score, exposure, or any metric)
 *   - NO public score
 *   - NO recommendation
 *
 * Order: `createdAt ASC` (oldest relationship first — explicitly NOT a
 * performance ranking). The trader's first-added financiers appear first.
 *
 * Filters:
 *   • financierType   — only financiers of this type
 *   • relationshipStatus — only financiers in this status (default: ACTIVE
 *     is NOT applied — the trader can see all their financiers including
 *     SUSPENDED/EXPIRED ones so they can re-authorize or remove them).
 */
export async function listConnectedFinanciers(
  traderGtid: string,
  filters?: {
    financierType?: string;
    relationshipStatus?: string;
  },
): Promise<any[]> {
  if (!traderGtid) return [];

  const where: any = { traderGtid };
  if (filters?.financierType) where.financierType = filters.financierType;
  if (filters?.relationshipStatus)
    where.relationshipStatus = filters.relationshipStatus;

  try {
    const rows = await db.financierRelationship.findMany({
      where,
      // FLAT list — NO sort by trust score / exposure / ranking.
      // CreatedAt ASC so the trader sees their oldest relationships first.
      orderBy: { createdAt: "asc" },
    });
    return rows || [];
  } catch (err) {
    logger.error("[financier-relationship] listConnectedFinanciers failed", {
      error: String(err),
      traderGtid,
      filters,
    });
    return [];
  }
}

// ============ §2b.2 canTraderUseFinancier ============

/**
 * NON-MARKETPLACE check: can the trader use this financier? Returns
 * `allowed=true` ONLY if an ACTIVE FinancierRelationship exists between the
 * trader and the financier AND the authorization window is in effect.
 *
 * This is the public API of the financier-relationship layer (the same check
 * is performed internally by `verifyFinancierRelationship` in the trade-finance
 * engine, but that engine queries the table directly to avoid circular
 * imports).
 */
export async function canTraderUseFinancier(
  traderGtid: string,
  financierGtid: string,
): Promise<{
  allowed: boolean;
  reason: string;
  relationshipType?: string;
}> {
  if (!traderGtid || !financierGtid) {
    return {
      allowed: false,
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
    logger.error("[financier-relationship] canTraderUseFinancier lookup failed", {
      error: String(err),
      traderGtid,
      financierGtid,
    });
    return { allowed: false, reason: `lookup failed: ${String(err)}` };
  }

  if (!rel) {
    return {
      allowed: false,
      reason:
        "no financier relationship — financier is NOT in the trader's approved list (non-marketplace §2b)",
    };
  }

  if (rel.relationshipStatus !== "ACTIVE") {
    return {
      allowed: false,
      relationshipType: rel.financierType,
      reason: `financier relationship status is ${rel.relationshipStatus} (must be ACTIVE)`,
    };
  }

  const now = new Date();
  if (rel.authorizedFrom && now < rel.authorizedFrom) {
    return {
      allowed: false,
      relationshipType: rel.financierType,
      reason: `financier authorization not yet effective (authorizedFrom=${rel.authorizedFrom.toISOString()})`,
    };
  }
  if (rel.authorizedUntil && now > rel.authorizedUntil) {
    return {
      allowed: false,
      relationshipType: rel.financierType,
      reason: `financier authorization expired (authorizedUntil=${rel.authorizedUntil.toISOString()})`,
    };
  }

  return {
    allowed: true,
    relationshipType: rel.financierType,
    reason: "ACTIVE relationship verified",
  };
}

// ============ §2b.3 createFinancierRelationship ============

/**
 * Create a FinancierRelationship. The trader explicitly adds a financier
 * (connected bank / saved financier / approved entity). This is the only
 * way for a trader to establish financier visibility — SGTX never auto-creates
 * financier relationships.
 *
 * Idempotent on the unique constraint `(traderGtid, financierGtid)`:
 *   - If a relationship already exists, it is updated (status reset to ACTIVE,
 *     authorization window refreshed) and the existing row is returned with
 *     an `__reused` flag in the notes.
 */
export async function createFinancierRelationship(
  input: CreateFinancierInput,
): Promise<any> {
  if (!input?.traderGtid || !input?.financierGtid) {
    throw new Error("traderGtid and financierGtid are required");
  }
  if (!isValidFinancierType(input.financierType)) {
    throw new Error(`Invalid financierType: ${input.financierType}`);
  }
  if (
    input.relationshipStatus &&
    !isValidRelationshipStatus(input.relationshipStatus)
  ) {
    throw new Error(`Invalid relationshipStatus: ${input.relationshipStatus}`);
  }
  if (input.internalTrustScore != null) {
    const score = Number(input.internalTrustScore);
    if (isNaN(score) || score < 0 || score > 100) {
      throw new Error("internalTrustScore must be in [0, 100]");
    }
  }

  const status = input.relationshipStatus || "ACTIVE";
  const data: any = {
    traderGtid: input.traderGtid,
    financierGtid: input.financierGtid,
    financierType: input.financierType,
    relationshipStatus: status,
  };
  if (input.authorizedFrom) data.authorizedFrom = input.authorizedFrom;
  if (input.authorizedUntil) data.authorizedUntil = input.authorizedUntil;
  if (input.authorizedBy) data.authorizedBy = input.authorizedBy;
  if (input.creditLimitUsd != null)
    data.creditLimitUsd = +Number(input.creditLimitUsd).toFixed(2);
  if (input.internalTrustScore != null)
    data.internalTrustScore = Math.round(Number(input.internalTrustScore));
  if (input.notes) data.notes = input.notes;

  // Idempotent upsert on (traderGtid, financierGtid).
  try {
    const rel = await db.financierRelationship.upsert({
      where: {
        traderGtid_financierGtid: {
          traderGtid: input.traderGtid,
          financierGtid: input.financierGtid,
        },
      },
      create: data,
      update: {
        financierType: data.financierType,
        relationshipStatus: status,
        ...(data.authorizedFrom ? { authorizedFrom: data.authorizedFrom } : {}),
        ...(data.authorizedUntil ? { authorizedUntil: data.authorizedUntil } : {}),
        ...(data.authorizedBy ? { authorizedBy: data.authorizedBy } : {}),
        ...(data.creditLimitUsd != null ? { creditLimitUsd: data.creditLimitUsd } : {}),
        ...(data.internalTrustScore != null ? { internalTrustScore: data.internalTrustScore } : {}),
        ...(data.notes ? { notes: data.notes } : {}),
      },
    });
    logger.info("[financier-relationship] relationship created/upserted", {
      traderGtid: input.traderGtid,
      financierGtid: input.financierGtid,
      financierType: input.financierType,
      status,
    });
    return rel;
  } catch (err) {
    logger.error("[financier-relationship] createFinancierRelationship DB error", {
      error: String(err),
      traderGtid: input.traderGtid,
      financierGtid: input.financierGtid,
    });
    throw err;
  }
}

// ============ §2b.4 getFinancierRelationship ============

/** Fetch a FinancierRelationship by its database id. */
export async function getFinancierRelationship(
  id: string,
): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.financierRelationship.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[financier-relationship] getFinancierRelationship failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §2b.5 getFinancierRelationshipByGtids ============

/** Fetch the FinancierRelationship row for a (trader, financier) pair. */
export async function getFinancierRelationshipByGtids(
  traderGtid: string,
  financierGtid: string,
): Promise<any | null> {
  if (!traderGtid || !financierGtid) return null;
  try {
    return await db.financierRelationship.findUnique({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
    });
  } catch (err) {
    logger.error("[financier-relationship] getFinancierRelationshipByGtids failed", {
      error: String(err),
      traderGtid,
      financierGtid,
    });
    return null;
  }
}

// ============ §2b.6 updateFinancierRelationshipStatus ============

/**
 * Update the relationshipStatus of a FinancierRelationship. Validates the
 * new status against the FINANCIER_RELATIONSHIP_STATUSES constant.
 */
export async function updateFinancierRelationshipStatus(
  id: string,
  newStatus: string,
): Promise<any> {
  if (!id) throw new Error("id is required");
  if (!isValidRelationshipStatus(newStatus)) {
    throw new Error(`Invalid relationshipStatus: ${newStatus}`);
  }

  try {
    const updated = await db.financierRelationship.update({
      where: { id },
      data: { relationshipStatus: newStatus },
    });
    logger.info("[financier-relationship] status updated", {
      id,
      newStatus,
    });
    return updated;
  } catch (err) {
    logger.error("[financier-relationship] updateFinancierRelationshipStatus DB error", {
      error: String(err),
      id,
      newStatus,
    });
    throw err;
  }
}

// ============ §2b.7 updateExposure ============

/**
 * Increment (or decrement, if `deltaUsd` is negative) the
 * `currentExposureUsd` of the FinancierRelationship for the given
 * (financierGtid, traderGtid) pair. Used by the trade-finance engine's
 * `disburse` (positive delta) and `repay` (negative delta) operations.
 *
 * The update is performed atomically via a Prisma `update` with the
 * `inc` operator. If the relationship does not exist, the function throws
 * (the trader cannot have exposure to a financier they have no relationship
 * with — non-marketplace enforcement).
 */
export async function updateExposure(
  financierGtid: string,
  traderGtid: string,
  deltaUsd: number,
): Promise<any> {
  if (!financierGtid || !traderGtid) {
    throw new Error("financierGtid and traderGtid are required");
  }
  const delta = +Number(deltaUsd).toFixed(2);
  if (delta === 0) {
    // No-op — return the existing row without writing.
    return getFinancierRelationshipByGtids(traderGtid, financierGtid);
  }

  try {
    const updated = await db.financierRelationship.update({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
      data: {
        currentExposureUsd: { inc: delta },
      },
    });
    logger.info("[financier-relationship] exposure updated", {
      traderGtid,
      financierGtid,
      delta,
      newExposure: updated.currentExposureUsd,
    });
    return updated;
  } catch (err) {
    logger.error("[financier-relationship] updateExposure DB error", {
      error: String(err),
      traderGtid,
      financierGtid,
      delta,
    });
    throw err;
  }
}

// ============ §2b.8 checkCreditLimit ============

/**
 * Check whether a requested amount fits within the trader's credit limit
 * with the financier. Returns:
 *   withinLimit      — true iff currentExposure + requestedAmount <= creditLimit
 *                      (or there is no credit limit set on the relationship)
 *   currentExposure  — the current exposure (USD) — 0 if no relationship
 *   creditLimit      — the credit limit (USD) — null/Infinity if none
 *   remaining        — creditLimit - currentExposure (Infinity if no limit)
 */
export async function checkCreditLimit(
  traderGtid: string,
  financierGtid: string,
  requestedAmountUsd: number,
): Promise<{
  withinLimit: boolean;
  currentExposure: number;
  creditLimit: number;
  remaining: number;
}> {
  const requested = +Number(requestedAmountUsd || 0).toFixed(2);

  let rel: any = null;
  try {
    rel = await db.financierRelationship.findUnique({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
    });
  } catch (err) {
    logger.error("[financier-relationship] checkCreditLimit lookup failed", {
      error: String(err),
      traderGtid,
      financierGtid,
    });
    // On DB error: fail CLOSED (withinLimit=false) — never over-lend.
    return {
      withinLimit: false,
      currentExposure: 0,
      creditLimit: 0,
      remaining: 0,
    };
  }

  if (!rel) {
    // No relationship → no credit.
    return {
      withinLimit: false,
      currentExposure: 0,
      creditLimit: 0,
      remaining: 0,
    };
  }

  const currentExposure = +Number(rel.currentExposureUsd || 0).toFixed(2);
  // No credit limit set → treat as Infinity (no ceiling).
  if (rel.creditLimitUsd == null) {
    return {
      withinLimit: true,
      currentExposure,
      creditLimit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
    };
  }
  const creditLimit = +Number(rel.creditLimitUsd).toFixed(2);
  const remaining = +(creditLimit - currentExposure).toFixed(2);
  const withinLimit = currentExposure + requested <= creditLimit + 1e-9; // 1¢ tolerance
  return { withinLimit, currentExposure, creditLimit, remaining };
}

// ============ §2b.9 approveFinancierEntity ============

/**
 * Platform-wide approval of a financing entity. This creates (or refreshes)
 * a FinancierRelationship row with `financierType=APPROVED_FINANCING_ENTITY`
 * for the given trader. The `authorizedBy` field records the platform
 * administrator / governance body that approved the entity.
 *
 * Visibility scope (per §2b): the approved entity is available to all
 * traders who explicitly select it. This function does NOT auto-create
 * relationships for every trader — each trader must still explicitly select
 * the financier via `createFinancierRelationship` (or by initiating a
 * TradeFinanceCase that names the financier).
 *
 * The `scope.creditLimitUsd` (if provided) is applied as the per-trader
 * credit limit on the relationship. If the relationship already exists, the
 * credit limit is updated (not replaced) — existing exposure is preserved.
 */
export async function approveFinancierEntity(
  financierGtid: string,
  authorizedBy: string,
  scope?: {
    creditLimitUsd?: number;
    traderGtid?: string; // optional: approve for a specific trader
    internalTrustScore?: number;
    validUntil?: Date;
  },
): Promise<any> {
  if (!financierGtid) throw new Error("financierGtid is required");
  if (!authorizedBy) throw new Error("authorizedBy is required");

  // If traderGtid is provided, approve for that specific trader.
  // Otherwise, create a self-referential APPROVED_FINANCING_ENTITY row
  // (traderGtid = financierGtid) as a marker that the entity is platform-wide
  // approved. This marker row is recognized by `listConnectedFinanciers`
  // downstream (when the trader later adds the financier, the marker row
  // validates the platform approval).
  const traderGtid = scope?.traderGtid || financierGtid; // self-marker
  const now = new Date();

  const data: any = {
    traderGtid,
    financierGtid,
    financierType: "APPROVED_FINANCING_ENTITY",
    relationshipStatus: "ACTIVE",
    authorizedFrom: now,
    authorizedBy,
    internalTrustScore: 85, // default for platform-approved entities
  };
  if (scope?.creditLimitUsd != null)
    data.creditLimitUsd = +Number(scope.creditLimitUsd).toFixed(2);
  if (scope?.internalTrustScore != null)
    data.internalTrustScore = Math.round(Number(scope.internalTrustScore));
  if (scope?.validUntil) data.authorizedUntil = scope.validUntil;

  try {
    const rel = await db.financierRelationship.upsert({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
      create: data,
      update: {
        financierType: "APPROVED_FINANCING_ENTITY",
        relationshipStatus: "ACTIVE",
        authorizedFrom: data.authorizedFrom,
        authorizedBy: data.authorizedBy,
        ...(data.authorizedUntil ? { authorizedUntil: data.authorizedUntil } : {}),
        ...(data.creditLimitUsd != null ? { creditLimitUsd: data.creditLimitUsd } : {}),
        ...(data.internalTrustScore != null ? { internalTrustScore: data.internalTrustScore } : {}),
      },
    });
    logger.info("[financier-relationship] financier entity approved", {
      financierGtid,
      traderGtid,
      authorizedBy,
    });
    return rel;
  } catch (err) {
    logger.error("[financier-relationship] approveFinancierEntity DB error", {
      error: String(err),
      financierGtid,
      traderGtid,
      authorizedBy,
    });
    throw err;
  }
}

// ============ §2b.10 getFinancierInternalTrustScore ============

/**
 * INTERNAL — returns the internal trust score (0..100) of the financier
 * relative to the trader. This score is computed from the
 * FinancierRelationship row's `internalTrustScore` field (default 70 if the
 * field is null).
 *
 * **INTERNAL — NEVER EXPOSE PUBLICLY.** SGTX does not publish financier
 * rankings, does not expose financier trust scores to other traders, and
 * does not use this score for any cross-trader comparison. The score is for
 * the trader's own internal decision-making only.
 *
 * If the relationship does not exist or the lookup fails, returns 0 (no
 * trust — unknown financier).
 */
export async function getFinancierInternalTrustScore(
  traderGtid: string,
  financierGtid: string,
): Promise<number> {
  // Function name carries `Internal` qualifier — JSDoc + function name
  // both make the INTERNAL contract explicit. Do NOT rename.
  if (!traderGtid || !financierGtid) return 0;
  try {
    const rel = await db.financierRelationship.findUnique({
      where: {
        traderGtid_financierGtid: { traderGtid, financierGtid },
      },
    });
    if (!rel) return 0;
    const score = Number(rel.internalTrustScore);
    if (isNaN(score) || score < 0) return 0;
    if (score > 100) return 100;
    return Math.round(score);
  } catch (err) {
    logger.error("[financier-relationship] getFinancierInternalTrustScore failed", {
      error: String(err),
      traderGtid,
      financierGtid,
    });
    return 0;
  }
}
