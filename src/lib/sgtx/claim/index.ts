// @ts-nocheck
/**
 * SGTX Phase 7 — §2 Claim Engine
 * ===========================================================================
 *
 * Implements the 10-type claim lifecycle on top of the new `TradeClaim`
 * Prisma model (schema line 6860). A TradeClaim is the formal dispute
 * instrument raised when something goes wrong on a trade — a delivery is
 * rejected, goods are damaged, customs delay the consignment, a warranty
 * fails, etc. Every claim is linked to a USTN (and optionally a
 * `parentUstn` if the claim concerns a return/child transaction).
 *
 * 10 claim types (§2):
 *
 *   SHORTAGE       — partial delivery / quantity shortfall
 *   DAMAGE         — goods damaged in transit
 *   QUALITY        — goods fail to meet contractual quality
 *   TEMPERATURE    — cold-chain breach (reefer cargo)
 *   DELAY          — delivery outside contractual window
 *   CUSTOMS        — customs hold / duty dispute / classification issue
 *   DOCUMENTATION  — missing / incorrect documents
 *   LOGISTICS      — carrier / forwarder failure (not damage)
 *   INSURANCE      — claim against an insurance policy
 *   WARRANTY       — post-acceptance warranty claim
 *
 * Lifecycle (status state machine):
 *
 *   OPEN ──reviewClaim──▶ UNDER_REVIEW
 *                       ──acceptClaim──▶ ACCEPTED ──resolveClaim──▶ RESOLVED ──closeClaim──▶ (closed)
 *                       ──rejectClaim──▶ REJECTED  ──closeClaim──▶ (closed)
 *   OPEN / UNDER_REVIEW ──escalateClaim──▶ ESCALATED ──closeClaim──▶ (closed)
 *   any non-terminal      ──withdrawClaim──▶ WITHDRAWN ──closeClaim──▶ (closed)
 *
 * Linkage:
 *   - `linkToReturn(id, returnId)`            — link to a §3 ReturnRecord
 *   - `linkToInsurance(id, insuranceClaimId)` — link to the §6 InsuranceLifecycle
 *   - `deliveryAcceptanceId` is set by the §1 Delivery Acceptance engine when
 *     it auto-opens a claim; this lib does NOT manage that field.
 *
 * `getClaimSeverity(claimType)` is a pure helper returning the default
 * severity per type:
 *   - MAJOR:    DAMAGE, TEMPERATURE, CUSTOMS, INSURANCE
 *   - MINOR:    SHORTAGE, QUALITY, WARRANTY, DELAY, DOCUMENTATION, LOGISTICS
 *
 * `hasOpenClaims(ustn)` checks for OPEN | UNDER_REVIEW | ESCALATED claims
 * (the "active" claim set used by the TradeClosureState gate in §6).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers (`getClaimSeverity`,
 * `generateClaimId`) have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §2 Constants ============

export const CLAIM_TYPES = [
  "SHORTAGE",
  "DAMAGE",
  "QUALITY",
  "TEMPERATURE",
  "DELAY",
  "CUSTOMS",
  "DOCUMENTATION",
  "LOGISTICS",
  "INSURANCE",
  "WARRANTY",
] as const;

export const CLAIM_SEVERITIES = [
  "MINOR",
  "MAJOR",
  "CRITICAL",
] as const;

export const CLAIM_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "ACCEPTED",
  "REJECTED",
  "RESOLVED",
  "ESCALATED",
  "WITHDRAWN",
] as const;

/**
 * Statuses considered "open" / active — used by `hasOpenClaims` and by the
 * §6 TradeClosureState gate. RESOLVED / REJECTED / WITHDRAWN are NOT in
 * this set (they are terminal / closed-out).
 */
export const OPEN_CLAIM_STATUSES = ["OPEN", "UNDER_REVIEW", "ESCALATED"] as const;

/**
 * Statuses considered "terminal" — eligible for `closeClaim`. After
 * `closeClaim` sets `closedAt`, the row remains in its terminal status
 * (RESOLVED / REJECTED / WITHDRAWN) — `closedAt` is the only new field.
 */
export const TERMINAL_CLAIM_STATUSES = [
  "RESOLVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

// ============ Types ============

export interface FileClaimInput {
  ustn?: string;
  tradeId?: string;
  parentUstn?: string; // the original trade USTN (if this is a return/child claim)
  claimType: string;
  claimSeverity?: string;
  claimDescription?: string;
  claimedAmountUsd?: number;
  claimedAmountLocal?: number;
  currency?: string;
  claimantGtid?: string;
  respondentGtid?: string;
  evidence?: any[];
  deliveryAcceptanceId?: string;
  returnId?: string;
  insuranceClaimId?: string;
  notes?: string;
}

export interface TradeClaim {
  id: string;
  claimId: string;
  ustn?: string | null;
  tradeId?: string | null;
  parentUstn?: string | null;
  claimType: string;
  claimSeverity: string;
  claimDescription?: string | null;
  claimedAmountUsd?: number | null;
  claimedAmountLocal?: number | null;
  currency: string;
  claimantGtid?: string | null;
  respondentGtid?: string | null;
  evidence?: string | null;
  status: string;
  resolutionAmountUsd?: number | null;
  resolutionNotes?: string | null;
  deliveryAcceptanceId?: string | null;
  returnId?: string | null;
  insuranceClaimId?: string | null;
  filedAt?: Date | null;
  reviewedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ §2.0 Pure helpers ============

function isValidClaimType(t?: string | null): boolean {
  return !!t && (CLAIM_TYPES as readonly string[]).includes(t);
}

function isValidSeverity(s?: string | null): boolean {
  return !!s && (CLAIM_SEVERITIES as readonly string[]).includes(s);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (CLAIM_STATUSES as readonly string[]).includes(s);
}

function parseEvidence(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringifyEvidence(arr: any[]): string {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

/**
 * Pure: generate a `CLM-YYYYMMDD-NNNNN` claim id. 5-digit zero-padded random
 * suffix. No DB, no side effects.
 *
 * NOTE: collisions on the random suffix are theoretically possible but
 * astronomically unlikely (1 in 100,000 per day per insert). The `claimId`
 * column is `@unique` so a collision will throw on insert — callers should
 * retry on a unique-constraint violation.
 */
export function generateClaimId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `CLM-${ymd}-${n}`;
}

/**
 * Pure: return the default claim severity for a given claim type.
 *
 *   MAJOR:    DAMAGE, TEMPERATURE, CUSTOMS, INSURANCE
 *   MINOR:    SHORTAGE, QUALITY, WARRANTY, DELAY, DOCUMENTATION, LOGISTICS
 *
 * Unknown types default to MINOR.
 */
export function getClaimSeverity(claimType: string): string {
  switch (claimType) {
    case "DAMAGE":
    case "TEMPERATURE":
    case "CUSTOMS":
    case "INSURANCE":
      return "MAJOR";
    case "SHORTAGE":
    case "QUALITY":
    case "WARRANTY":
    case "DELAY":
    case "DOCUMENTATION":
    case "LOGISTICS":
      return "MINOR";
    default:
      return "MINOR";
  }
}

// ============ §2.1 fileClaim ============

/**
 * Create a new TradeClaim. Generates `claimId` (CLM-YYYYMMDD-NNNNN), sets
 * `status=OPEN` + `filedAt`. Links to `ustn` (and `parentUstn` if provided —
 * for return/child claims).
 *
 * If `claimSeverity` is omitted, it is defaulted via `getClaimSeverity`.
 * If `claimType` is invalid, an error is thrown.
 *
 * Retries the insert up to 3 times on `claimId` collision (unique
 * constraint violation) before giving up.
 */
export async function fileClaim(input: FileClaimInput): Promise<TradeClaim> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!isValidClaimType(input.claimType)) {
    throw new Error(`Invalid claimType: ${input.claimType}`);
  }

  const severity = isValidSeverity(input.claimSeverity)
    ? input.claimSeverity!
    : getClaimSeverity(input.claimType);

  const evidenceArr = Array.isArray(input.evidence) ? input.evidence : [];

  const data: any = {
    claimId: generateClaimId(),
    ustn: input.ustn || null,
    tradeId: input.tradeId || null,
    parentUstn: input.parentUstn || null,
    claimType: input.claimType,
    claimSeverity: severity,
    claimDescription: input.claimDescription || null,
    claimedAmountUsd:
      input.claimedAmountUsd !== undefined && input.claimedAmountUsd !== null
        ? Number(input.claimedAmountUsd)
        : null,
    claimedAmountLocal:
      input.claimedAmountLocal !== undefined && input.claimedAmountLocal !== null
        ? Number(input.claimedAmountLocal)
        : null,
    currency: input.currency || "USD",
    claimantGtid: input.claimantGtid || null,
    respondentGtid: input.respondentGtid || null,
    evidence: stringifyEvidence(evidenceArr),
    status: "OPEN",
    resolutionAmountUsd: null,
    resolutionNotes: null,
    deliveryAcceptanceId: input.deliveryAcceptanceId || null,
    returnId: input.returnId || null,
    insuranceClaimId: input.insuranceClaimId || null,
    filedAt: new Date(),
    reviewedAt: null,
    resolvedAt: null,
    closedAt: null,
    notes: input.notes || null,
  };

  // Retry on claimId collision (unique constraint)
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db.tradeClaim.create({ data });
      logger.info("[claim] claim filed (OPEN)", {
        id: row.id,
        claimId: row.claimId,
        claimType: input.claimType,
        severity,
        ustn: input.ustn,
      });
      return row as TradeClaim;
    } catch (err: any) {
      lastErr = err;
      // If unique constraint violation on claimId, regenerate and retry
      const msg = String(err?.message || err);
      if (/unique|constraint|claimId/i.test(msg) && attempt < 2) {
        logger.warn("[claim] claimId collision — retrying", {
          claimId: data.claimId,
          attempt: attempt + 1,
        });
        data.claimId = generateClaimId();
        continue;
      }
      break;
    }
  }

  logger.error("[claim] fileClaim DB error", {
    error: String(lastErr),
    claimType: input.claimType,
    ustn: input.ustn,
  });
  throw lastErr;
}

// ============ §2.2 getClaim ============

/** Fetch a TradeClaim by its database id. Null-safe. */
export async function getClaim(id: string): Promise<TradeClaim | null> {
  if (!id) return null;
  try {
    const row = await db.tradeClaim.findUnique({ where: { id } });
    return (row as TradeClaim) || null;
  } catch (err) {
    logger.error("[claim] getClaim failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §2.3 getClaimByClaimId ============

/** Fetch a TradeClaim by its business `claimId` (CLM-YYYYMMDD-NNNNN). Null-safe. */
export async function getClaimByClaimId(
  claimId: string,
): Promise<TradeClaim | null> {
  if (!claimId) return null;
  try {
    const row = await db.tradeClaim.findUnique({ where: { claimId } });
    return (row as TradeClaim) || null;
  } catch (err) {
    logger.error("[claim] getClaimByClaimId failed", {
      error: String(err),
      claimId,
    });
    return null;
  }
}

// ============ §2.4 listClaims ============

/**
 * List TradeClaims with optional filters. Ordered by filedAt desc.
 * Empty array on error.
 */
export async function listClaims(filters?: {
  ustn?: string;
  parentUstn?: string;
  claimType?: string;
  status?: string;
  claimantGtid?: string;
  respondentGtid?: string;
}): Promise<TradeClaim[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.parentUstn) where.parentUstn = filters.parentUstn;
  if (filters?.claimType) where.claimType = filters.claimType;
  if (filters?.status) where.status = filters.status;
  if (filters?.claimantGtid) where.claimantGtid = filters.claimantGtid;
  if (filters?.respondentGtid) where.respondentGtid = filters.respondentGtid;

  try {
    const rows = await db.tradeClaim.findMany({
      where,
      orderBy: { filedAt: "desc" },
    });
    return (rows as TradeClaim[]) || [];
  } catch (err) {
    logger.error("[claim] listClaims failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §2.5 getClaimsByUstn ============

/**
 * All claims for a trade USTN — both direct claims (`ustn` matches) AND
 * child claims linked via `parentUstn`. Empty array on error.
 *
 * This is the canonical "give me everything for this trade" query — used
 * by the §6 TradeClosureState gate and by the §5 evidence autocompiler.
 */
export async function getClaimsByUstn(ustn: string): Promise<TradeClaim[]> {
  if (!ustn) return [];
  try {
    const rows = await db.tradeClaim.findMany({
      where: {
        OR: [{ ustn }, { parentUstn: ustn }],
      },
      orderBy: { filedAt: "desc" },
    });
    return (rows as TradeClaim[]) || [];
  } catch (err) {
    logger.error("[claim] getClaimsByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §2.6 reviewClaim ============

/**
 * OPEN → UNDER_REVIEW. Sets `reviewedAt`. Validates that the claim is in
 * OPEN status — claims already under review cannot be re-reviewed (use
 * `escalateClaim` to advance past UNDER_REVIEW).
 */
export async function reviewClaim(
  id: string,
  reviewer: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reviewer) {
    throw new Error("reviewer is required");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] reviewClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }
  if (row.status !== "OPEN") {
    throw new Error(
      `Cannot review claim in status ${row.status} — must be OPEN`,
    );
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: {
        status: "UNDER_REVIEW",
        reviewedAt: new Date(),
      },
    });
    logger.info("[claim] claim under review", {
      id,
      reviewer,
      claimId: row.claimId,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] reviewClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.7 acceptClaim ============

/**
 * UNDER_REVIEW → ACCEPTED. Sets `resolutionAmountUsd` + `resolutionNotes`.
 * Validates that the claim is in UNDER_REVIEW status.
 *
 * `resolutionAmountUsd` may differ from `claimedAmountUsd` — the reviewer
 * can accept a partial amount.
 */
export async function acceptClaim(
  id: string,
  resolutionAmountUsd: number,
  notes: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (
    resolutionAmountUsd === undefined ||
    resolutionAmountUsd === null ||
    Number.isNaN(Number(resolutionAmountUsd)) ||
    Number(resolutionAmountUsd) < 0
  ) {
    throw new Error("resolutionAmountUsd must be >= 0");
  }
  if (!notes || !notes.trim()) {
    throw new Error("notes are required to accept a claim");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] acceptClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }
  if (row.status !== "UNDER_REVIEW") {
    throw new Error(
      `Cannot accept claim in status ${row.status} — must be UNDER_REVIEW`,
    );
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        resolutionAmountUsd: Number(resolutionAmountUsd),
        resolutionNotes: notes,
      },
    });
    logger.info("[claim] claim accepted", {
      id,
      claimId: row.claimId,
      resolutionAmountUsd,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] acceptClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.8 rejectClaim ============

/**
 * UNDER_REVIEW → REJECTED. Sets `resolutionNotes` to the rejection reason.
 * Validates that the claim is in UNDER_REVIEW status.
 */
export async function rejectClaim(
  id: string,
  reason: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required to reject a claim");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] rejectClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }
  if (row.status !== "UNDER_REVIEW") {
    throw new Error(
      `Cannot reject claim in status ${row.status} — must be UNDER_REVIEW`,
    );
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: {
        status: "REJECTED",
        resolutionNotes: reason,
        resolutionAmountUsd: 0,
      },
    });
    logger.info("[claim] claim rejected", {
      id,
      claimId: row.claimId,
      reason,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] rejectClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.9 resolveClaim ============

/**
 * ACCEPTED → RESOLVED. Sets `resolvedAt` + final `resolutionAmountUsd` +
 * `resolutionNotes`. Validates that the claim is in ACCEPTED status.
 *
 * RESOLVED is the canonical "money has changed hands / obligation fulfilled"
 * state — downstream `closeClaim` is then a clerical close-out.
 */
export async function resolveClaim(
  id: string,
  resolutionAmountUsd: number,
  notes: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (
    resolutionAmountUsd === undefined ||
    resolutionAmountUsd === null ||
    Number.isNaN(Number(resolutionAmountUsd)) ||
    Number(resolutionAmountUsd) < 0
  ) {
    throw new Error("resolutionAmountUsd must be >= 0");
  }
  if (!notes || !notes.trim()) {
    throw new Error("notes are required to resolve a claim");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] resolveClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }
  if (row.status !== "ACCEPTED") {
    throw new Error(
      `Cannot resolve claim in status ${row.status} — must be ACCEPTED`,
    );
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolutionAmountUsd: Number(resolutionAmountUsd),
        resolutionNotes: notes,
        resolvedAt: new Date(),
      },
    });
    logger.info("[claim] claim resolved", {
      id,
      claimId: row.claimId,
      resolutionAmountUsd,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] resolveClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.10 escalateClaim ============

/**
 * Any non-terminal status → ESCALATED. Sets `resolutionNotes` to the
 * escalation reason. ESCALATED claims are visible in `hasOpenClaims` (they
 * are still active).
 *
 * Allowed source statuses: OPEN, UNDER_REVIEW (and ESCALATED itself is a
 * no-op idempotent re-escalation that updates the notes).
 */
export async function escalateClaim(
  id: string,
  reason: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required to escalate a claim");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] escalateClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  const terminal = (TERMINAL_CLAIM_STATUSES as readonly string[]).includes(
    row.status,
  );
  if (terminal) {
    throw new Error(
      `Cannot escalate claim in terminal status ${row.status}`,
    );
  }

  const updateData: any = {
    status: "ESCALATED",
    resolutionNotes: reason,
  };

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: updateData,
    });
    logger.info("[claim] claim escalated", {
      id,
      claimId: row.claimId,
      fromStatus: row.status,
      reason,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] escalateClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.11 withdrawClaim ============

/**
 * Any non-terminal status → WITHDRAWN. Sets `resolutionNotes` to the
 * withdrawal reason. The claimant withdraws the claim — no resolution
 * amount, no further action.
 */
export async function withdrawClaim(
  id: string,
  reason: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required to withdraw a claim");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] withdrawClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  const terminal = (TERMINAL_CLAIM_STATUSES as readonly string[]).includes(
    row.status,
  );
  if (terminal) {
    throw new Error(
      `Cannot withdraw claim in terminal status ${row.status}`,
    );
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: {
        status: "WITHDRAWN",
        resolutionNotes: reason,
        resolvedAt: new Date(),
      },
    });
    logger.info("[claim] claim withdrawn", {
      id,
      claimId: row.claimId,
      fromStatus: row.status,
      reason,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] withdrawClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.12 closeClaim ============

/**
 * Terminal status (RESOLVED / REJECTED / WITHDRAWN) → closed. Sets
 * `closedAt`. Does NOT change the status — the claim stays in its terminal
 * state but is now marked as administratively closed.
 *
 * Validates that the claim is in a terminal status.
 */
export async function closeClaim(id: string): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] closeClaim lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  const terminal = (TERMINAL_CLAIM_STATUSES as readonly string[]).includes(
    row.status,
  );
  if (!terminal) {
    throw new Error(
      `Cannot close claim in non-terminal status ${row.status} — resolve/reject/withdraw first`,
    );
  }
  if (row.closedAt) {
    // idempotent — already closed
    return row as TradeClaim;
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: { closedAt: new Date() },
    });
    logger.info("[claim] claim closed", {
      id,
      claimId: row.claimId,
      fromStatus: row.status,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] closeClaim DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.13 addEvidence ============

/**
 * Append evidence items to a claim's `evidence` JSON array. Existing items
 * are preserved; new items are appended.
 *
 * `evidence` may be:
 *   - an array of evidence items (each typically `{ type, reference, hash, uploadedAt }`)
 *   - a single object — wrapped into a one-element array
 */
export async function addEvidence(
  id: string,
  evidence: any,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!evidence) {
    throw new Error("evidence is required");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] addEvidence lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  let newItems: any[] = [];
  if (Array.isArray(evidence)) {
    newItems = evidence;
  } else if (evidence && typeof evidence === "object") {
    newItems = [evidence];
  } else {
    newItems = [{ value: evidence }];
  }

  // Stamp `uploadedAt` if missing
  const now = new Date().toISOString();
  newItems = newItems.map((item: any) =>
    item && typeof item === "object" && !item.uploadedAt
      ? { ...item, uploadedAt: now }
      : item,
  );

  const existing = parseEvidence(row.evidence);
  const merged = [...existing, ...newItems];

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: { evidence: stringifyEvidence(merged) },
    });
    logger.info("[claim] evidence added", {
      id,
      itemsAdded: newItems.length,
      totalItems: merged.length,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] addEvidence DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.14 linkToReturn ============

/**
 * Link a claim to a §3 ReturnRecord (the `returnId` field — the return's
 * business `RET-YYYYMMDD-NNNNN` id). Used when a claim triggers a return
 * (or vice versa — the §3 engine calls this in reverse via `linkClaim`).
 */
export async function linkToReturn(
  id: string,
  returnId: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!returnId) {
    throw new Error("returnId is required");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] linkToReturn lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: { returnId },
    });
    logger.info("[claim] claim linked to return", {
      id,
      claimId: row.claimId,
      returnId,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] linkToReturn DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.15 linkToInsurance ============

/**
 * Link a claim to the §6 InsuranceLifecycle (the `insuranceClaimId` field —
 * the insurance lifecycle's database id). Used when a claim is filed against
 * an insurance policy.
 */
export async function linkToInsurance(
  id: string,
  insuranceClaimId: string,
): Promise<TradeClaim> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!insuranceClaimId) {
    throw new Error("insuranceClaimId is required");
  }

  let row: any = null;
  try {
    row = await db.tradeClaim.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[claim] linkToInsurance lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`TradeClaim not found: ${id}`);
  }

  try {
    const updated = await db.tradeClaim.update({
      where: { id },
      data: { insuranceClaimId },
    });
    logger.info("[claim] claim linked to insurance", {
      id,
      claimId: row.claimId,
      insuranceClaimId,
    });
    return updated as TradeClaim;
  } catch (err) {
    logger.error("[claim] linkToInsurance DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §2.16 hasOpenClaims ============

/**
 * Check if a trade USTN has any OPEN / UNDER_REVIEW / ESCALATED claims
 * (the active set). Returns false on error or if no active claims exist.
 *
 * Checks both `ustn` (direct claims) and `parentUstn` (child claims) so
 * a trade with an open return-claim is correctly flagged.
 *
 * Used by the §6 TradeClosureState gate — a trade cannot be USTN_CLOSED
 * while it has open claims (unless explicitly marked as
 * `USTN_CLOSED_WITH_OPEN_DISPUTE`).
 */
export async function hasOpenClaims(ustn: string): Promise<boolean> {
  if (!ustn) return false;
  try {
    const count = await db.tradeClaim.count({
      where: {
        OR: [{ ustn }, { parentUstn: ustn }],
        status: { in: [...OPEN_CLAIM_STATUSES] },
      },
    });
    return count > 0;
  } catch (err) {
    logger.error("[claim] hasOpenClaims failed", {
      error: String(err),
      ustn,
    });
    return false;
  }
}
