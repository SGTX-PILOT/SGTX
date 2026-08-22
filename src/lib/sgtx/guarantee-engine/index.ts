// @ts-nocheck
/**
 * SGTX Phase 6 — §5 Guarantee Engine
 * ===========================================================================
 *
 * Implements the 6 guarantee types per the spec. Builds on top of the
 * existing `CustomsBond` model (prisma schema line 4267) but extends to the
 * full guarantee family — the `GuaranteeRecord` row (schema line 6560) is the
 * new lifecycle layer; the legacy `CustomsBond` row may be linked via the
 * `customsBondId` field, and the `BankSettlementInstruction` row may be
 * linked via the `bankSettlementId` field.
 *
 * 6 guarantee types (§5):
 *
 *   CUSTOMS_GUARANTEE   — guarantee securing customs duties
 *   BANK_GUARANTEE      — bank-issued demand guarantee
 *   TRANSIT_GUARANTEE   — T1/T2 transit guarantee (EU UCC)
 *   DUTY_DEFERRAL       — deferred-duty guarantee
 *   TEMPORARY_ADMISSION — ATA Carnet / temporary admission guarantee
 *   BONDED_WAREHOUSE    — bonded warehouse guarantee
 *
 * Lifecycle:
 *   DRAFT → ISSUED → ACTIVE → CALLED
 *                       ↘ RELEASED
 *                       ↘ EXPIRED (past validUntil)
 *   Any → CANCELLED
 *
 * All DB calls are try/catch-wrapped with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §5 Constants ============

export const GUARANTEE_TYPES = [
  "CUSTOMS_GUARANTEE",
  "BANK_GUARANTEE",
  "TRANSIT_GUARANTEE",
  "DUTY_DEFERRAL",
  "TEMPORARY_ADMISSION",
  "BONDED_WAREHOUSE",
] as const;

export const GUARANTEE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "ACTIVE",
  "CALLED",
  "EXPIRED",
  "RELEASED",
  "CANCELLED",
] as const;

// ============ Types ============

export interface CreateGuaranteeInput {
  ustn?: string;
  tradeId?: string;
  guaranteeType: string;
  issuerGtid?: string;
  issuerName?: string;
  beneficiaryGtid?: string;
  beneficiaryName?: string;
  amountUsd: number;
  currency?: string;
  coverageScope?: string[]; // JSON array of covered items
  validFrom?: Date;
  validUntil?: Date;
  customsBondId?: string; // link to existing CustomsBond
  bankSettlementId?: string; // link to existing BankSettlementInstruction
  guaranteeNumber?: string;
  attachments?: string[];
  notes?: string;
}

export interface GuaranteeRecord {
  id: string;
  guaranteeId: string;
  ustn?: string | null;
  tradeId?: string | null;
  guaranteeType: string;
  issuerGtid?: string | null;
  issuerName?: string | null;
  beneficiaryGtid?: string | null;
  beneficiaryName?: string | null;
  amountUsd: number;
  currency: string;
  coverageScope?: string | null;
  status: string;
  issuedAt?: Date | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  releasedAt?: Date | null;
  callAmountUsd?: number | null;
  calledAt?: Date | null;
  callReason?: string | null;
  customsBondId?: string | null;
  bankSettlementId?: string | null;
  guaranteeNumber?: string | null;
  attachments?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ §5.0 Pure helpers ============

function isValidGuaranteeType(t?: string | null): boolean {
  return !!t && (GUARANTEE_TYPES as readonly string[]).includes(t);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (GUARANTEE_STATUSES as readonly string[]).includes(s);
}

/**
 * Generate a guarantee ID of the form `GR-YYYYMMDD-NNNNN`. Pure.
 */
export function generateGuaranteeId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `GR-${ymd}-${n}`;
}

/**
 * Pure: is the guarantee valid at the given date?
 *   - status === "ACTIVE"
 *   - validFrom <= at
 *   - validUntil >= at
 *
 * If `validFrom` is null, the guarantee is considered issued at issuedAt (or
 * createdAt if issuedAt is also null). If `validUntil` is null, the guarantee
 * has no expiry.
 */
export function isGuaranteeValid(
  guarantee: GuaranteeRecord,
  at: Date = new Date(),
): boolean {
  if (!guarantee) return false;
  if (guarantee.status !== "ACTIVE") return false;
  const now = at instanceof Date ? at : new Date(at);
  if (isNaN(now.getTime())) return false;
  if (guarantee.validFrom) {
    const from = new Date(guarantee.validFrom);
    if (!isNaN(from.getTime()) && now < from) return false;
  }
  if (guarantee.validUntil) {
    const until = new Date(guarantee.validUntil);
    if (!isNaN(until.getTime()) && now > until) return false;
  }
  return true;
}

function appendNote(existing: string | null, addition: string): string {
  if (!existing) return addition;
  return `${existing}\n${addition}`;
}

// ============ §5.1 createGuarantee ============

/**
 * Create a GuaranteeRecord. The record starts in DRAFT status with a
 * generated `guaranteeId` of the form `GR-YYYYMMDD-NNNNN`. The caller
 * subsequently issues / activates the guarantee via `issueGuarantee` /
 * `activateGuarantee`.
 */
export async function createGuarantee(
  input: CreateGuaranteeInput,
): Promise<GuaranteeRecord> {
  if (!input) {
    throw new Error("input is required");
  }
  if (!isValidGuaranteeType(input.guaranteeType)) {
    throw new Error(`Invalid guaranteeType: ${input.guaranteeType}`);
  }
  const amt = Number(input.amountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("amountUsd must be > 0");
  }
  if (!input.beneficiaryGtid && !input.beneficiaryName) {
    throw new Error("beneficiaryGtid or beneficiaryName is required");
  }

  const data: any = {
    guaranteeId: generateGuaranteeId(),
    ustn: input.ustn || null,
    tradeId: input.tradeId || null,
    guaranteeType: input.guaranteeType,
    issuerGtid: input.issuerGtid || null,
    issuerName: input.issuerName || null,
    beneficiaryGtid: input.beneficiaryGtid || null,
    beneficiaryName: input.beneficiaryName || null,
    amountUsd: +amt.toFixed(2),
    currency: input.currency || "USD",
    coverageScope: Array.isArray(input.coverageScope)
      ? JSON.stringify(input.coverageScope)
      : null,
    status: "DRAFT",
    customsBondId: input.customsBondId || null,
    bankSettlementId: input.bankSettlementId || null,
    guaranteeNumber: input.guaranteeNumber || null,
    attachments: Array.isArray(input.attachments)
      ? JSON.stringify(input.attachments)
      : null,
    notes: input.notes || null,
  };
  if (input.validFrom) data.validFrom = input.validFrom;
  if (input.validUntil) data.validUntil = input.validUntil;

  try {
    const row = await db.guaranteeRecord.create({ data });
    logger.info("[guarantee-engine] guarantee created (DRAFT)", {
      id: row.id,
      guaranteeId: row.guaranteeId,
      type: input.guaranteeType,
      amountUsd: amt,
    });
    return row as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] createGuarantee DB error", {
      error: String(err),
      type: input.guaranteeType,
    });
    throw err;
  }
}

// ============ §5.2 getGuarantee ============

/** Fetch a GuaranteeRecord by its database id. Null-safe. */
export async function getGuarantee(
  id: string,
): Promise<GuaranteeRecord | null> {
  if (!id) return null;
  try {
    const row = await db.guaranteeRecord.findUnique({ where: { id } });
    return (row as GuaranteeRecord) || null;
  } catch (err) {
    logger.error("[guarantee-engine] getGuarantee failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §5.3 getGuaranteeByGuaranteeId ============

/** Fetch a GuaranteeRecord by its business `guaranteeId` (`GR-...`). Null-safe. */
export async function getGuaranteeByGuaranteeId(
  guaranteeId: string,
): Promise<GuaranteeRecord | null> {
  if (!guaranteeId) return null;
  try {
    const row = await db.guaranteeRecord.findUnique({
      where: { guaranteeId },
    });
    return (row as GuaranteeRecord) || null;
  } catch (err) {
    logger.error("[guarantee-engine] getGuaranteeByGuaranteeId failed", {
      error: String(err),
      guaranteeId,
    });
    return null;
  }
}

// ============ §5.4 listGuarantees ============

/** List GuaranteeRecords with optional filters. Ordered by createdAt desc. */
export async function listGuarantees(
  filters?: {
    ustn?: string;
    guaranteeType?: string;
    status?: string;
    issuerGtid?: string;
    beneficiaryGtid?: string;
  },
): Promise<GuaranteeRecord[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.guaranteeType) where.guaranteeType = filters.guaranteeType;
  if (filters?.status) where.status = filters.status;
  if (filters?.issuerGtid) where.issuerGtid = filters.issuerGtid;
  if (filters?.beneficiaryGtid) where.beneficiaryGtid = filters.beneficiaryGtid;

  try {
    const rows = await db.guaranteeRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as GuaranteeRecord[]) || [];
  } catch (err) {
    logger.error("[guarantee-engine] listGuarantees failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §5.5 issueGuarantee ============

/**
 * DRAFT → ISSUED. Sets `issuedAt` + `guaranteeNumber` (the official bank/
 * issuer guarantee number, distinct from the SGTX `guaranteeId`).
 */
export async function issueGuarantee(
  id: string,
  guaranteeNumber: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!guaranteeNumber) {
    throw new Error("guaranteeNumber is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] issueGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.status !== "DRAFT") {
    throw new Error(
      `issueGuarantee requires status=DRAFT (current: ${row.status})`,
    );
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        status: "ISSUED",
        issuedAt: new Date(),
        guaranteeNumber,
      },
    });
    logger.info("[guarantee-engine] guarantee issued", {
      id,
      guaranteeNumber,
    });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] issueGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.6 activateGuarantee ============

/** ISSUED → ACTIVE. The guarantee is now in force. */
export async function activateGuarantee(
  id: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] activateGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.status !== "ISSUED") {
    throw new Error(
      `activateGuarantee requires status=ISSUED (current: ${row.status})`,
    );
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
    logger.info("[guarantee-engine] guarantee activated", { id });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] activateGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.7 callGuarantee ============

/**
 * ACTIVE → CALLED. The beneficiary invokes the guarantee. Sets
 * `callAmountUsd`, `calledAt`, `callReason`.
 */
export async function callGuarantee(
  id: string,
  callAmountUsd: number,
  callReason: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  const amt = Number(callAmountUsd);
  if (isNaN(amt) || amt <= 0) {
    throw new Error("callAmountUsd must be > 0");
  }
  if (!callReason) {
    throw new Error("callReason is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] callGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.status !== "ACTIVE") {
    throw new Error(
      `callGuarantee requires status=ACTIVE (current: ${row.status})`,
    );
  }
  if (amt > row.amountUsd + 0.01) {
    throw new Error(
      `callAmountUsd ${amt} exceeds guarantee amount ${row.amountUsd}`,
    );
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        status: "CALLED",
        callAmountUsd: +amt.toFixed(2),
        calledAt: new Date(),
        callReason,
      },
    });
    logger.info("[guarantee-engine] guarantee called", {
      id,
      callAmountUsd: amt,
      callReason,
    });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] callGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.8 releaseGuarantee ============

/** ACTIVE → RELEASED. The beneficiary releases the guarantee. Sets `releasedAt`. */
export async function releaseGuarantee(
  id: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] releaseGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.status !== "ACTIVE") {
    throw new Error(
      `releaseGuarantee requires status=ACTIVE (current: ${row.status})`,
    );
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
      },
    });
    logger.info("[guarantee-engine] guarantee released", { id });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] releaseGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.9 expireGuarantee ============

/**
 * Move the guarantee to EXPIRED. Allowed from any non-terminal status when
 * the `validUntil` date has passed (or no `validUntil` is set but the
 * guarantee is being force-expired). Typically invoked by a scheduled job
 * that scans for guarantees past their validity window.
 */
export async function expireGuarantee(
  id: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] expireGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }

  // Don't allow re-expiring terminal records.
  if (row.status === "EXPIRED" || row.status === "CANCELLED") {
    return row as GuaranteeRecord;
  }
  // Only ACTIVE / ISSUED guarantees can expire (DRAFT should be cancelled
  // rather than expired; CALLED / RELEASED are already terminal).
  if (row.status !== "ACTIVE" && row.status !== "ISSUED") {
    throw new Error(
      `expireGuarantee requires status=ACTIVE or ISSUED (current: ${row.status})`,
    );
  }

  // If validUntil is set and we're not past it, allow the caller to expire
  // anyway (force-expire) — but log a warning.
  if (row.validUntil) {
    const until = new Date(row.validUntil);
    if (!isNaN(until.getTime()) && new Date() < until) {
      logger.warn("[guarantee-engine] expireGuarantee called before validUntil", {
        id,
        validUntil: until.toISOString(),
      });
    }
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: { status: "EXPIRED" },
    });
    logger.info("[guarantee-engine] guarantee expired", { id });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] expireGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.10 cancelGuarantee ============

/** Cancel the guarantee from any non-terminal status. Sets a note. */
export async function cancelGuarantee(
  id: string,
  reason: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason) {
    throw new Error("reason is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] cancelGuarantee lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.status === "CANCELLED") {
    return row as GuaranteeRecord; // idempotent
  }

  const stampedNote = `[${new Date().toISOString()} CANCELLED] ${reason}`;

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        status: "CANCELLED",
        notes: appendNote(row.notes || null, stampedNote),
      },
    });
    logger.info("[guarantee-engine] guarantee cancelled", { id, reason });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] cancelGuarantee DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §5.11 linkToCustomsBond ============

/**
 * Link the GuaranteeRecord to an existing `CustomsBond` row. Idempotent —
 * returns the existing row if already linked to the same customsBondId.
 */
export async function linkToCustomsBond(
  id: string,
  customsBondId: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!customsBondId) {
    throw new Error("customsBondId is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] linkToCustomsBond lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.customsBondId === customsBondId) {
    return row as GuaranteeRecord; // idempotent
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        customsBondId,
        notes: appendNote(
          row.notes || null,
          `[${new Date().toISOString()} LINK] linked to CustomsBond ${customsBondId}`,
        ),
      },
    });
    logger.info("[guarantee-engine] linked to CustomsBond", {
      id,
      customsBondId,
    });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] linkToCustomsBond DB error", {
      error: String(err),
      id,
      customsBondId,
    });
    throw err;
  }
}

// ============ §5.12 linkToBankSettlement ============

/**
 * Link the GuaranteeRecord to an existing `BankSettlementInstruction` row.
 * Idempotent — returns the existing row if already linked to the same
 * bankSettlementId.
 */
export async function linkToBankSettlement(
  id: string,
  bankSettlementId: string,
): Promise<GuaranteeRecord> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!bankSettlementId) {
    throw new Error("bankSettlementId is required");
  }

  let row: any = null;
  try {
    row = await db.guaranteeRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[guarantee-engine] linkToBankSettlement lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`GuaranteeRecord not found: ${id}`);
  }
  if (row.bankSettlementId === bankSettlementId) {
    return row as GuaranteeRecord; // idempotent
  }

  try {
    const updated = await db.guaranteeRecord.update({
      where: { id },
      data: {
        bankSettlementId,
        notes: appendNote(
          row.notes || null,
          `[${new Date().toISOString()} LINK] linked to BankSettlementInstruction ${bankSettlementId}`,
        ),
      },
    });
    logger.info("[guarantee-engine] linked to BankSettlement", {
      id,
      bankSettlementId,
    });
    return updated as GuaranteeRecord;
  } catch (err) {
    logger.error("[guarantee-engine] linkToBankSettlement DB error", {
      error: String(err),
      id,
      bankSettlementId,
    });
    throw err;
  }
}

// ============ §5.14 getGuaranteesForUstn ============

/** Convenience: list guarantees for a USTN (any status). */
export async function getGuaranteesForUstn(
  ustn: string,
): Promise<GuaranteeRecord[]> {
  if (!ustn) return [];
  return listGuarantees({ ustn });
}

// ============ Module exports ============
// All exports are named — no default export (matches existing SGTX lib
// convention, avoids `import/no-anonymous-default-export` warning).
