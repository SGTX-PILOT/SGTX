// @ts-nocheck
/**
 * SGTX Phase 6 — §9 Reconciliation Engine
 * ===========================================================================
 *
 * Reconciles SGTX source records (GlobalPayment, AccountingEntry,
 * CustomsOperation, etc.) against external target records (bank statements,
 * PSP reports, carrier invoices, broker invoices, insurance premium
 * confirmations, ERP-imported accounting). The engine matches by
 * (amount + reference) and creates a ReconciliationRecord row per source
 * record. Differences > $0.01 surface as DISCREPANT.
 *
 * 8 reconciliation types (§9):
 *
 *   PAYMENT         — GlobalPayment vs. bank statement
 *   GOVERNMENT_FEE  — CustomsOperation (duty/tax) vs. government receipt
 *   BANK            — bank account ledger vs. bank statement
 *   PSP             — PSP settlement vs. PSP report
 *   CARRIER         — freight invoice vs. carrier confirmation
 *   BROKER          — broker invoice vs. broker confirmation
 *   INSURANCE       — insurance premium vs. insurer confirmation
 *   ACCOUNTING     — AccountingEntry vs. ERP-imported ledger
 *
 * Statuses:
 *   PENDING    — created, not yet evaluated (transient)
 *   MATCHED   — sourceAmountUsd === targetAmountUsd (within $0.01 tolerance)
 *   DISCREPANT — source/target amounts differ (within tolerance would have
 *                been MATCHED, so DISCREPANT means a real difference)
 *   UNMATCHED  — no matching target record found
 *   RESOLVED   — DISCREPANT, manually reviewed + accepted
 *
 * `runReconciliation` is the main entrypoint. It loads source records for
 * the given (ustn, reconciliationType, period), generates a set of simulated
 * target records, attempts to match each source by amount + reference, and
 * creates ReconciliationRecord rows for every source. Returns the summary
 * { total, matched, discrepant, unmatched }.
 *
 * Reconciliation ID format: `REC-YYYYMMDD-NNNNN`.
 *
 * All DB calls are try/catch-wrapped with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { computePeriod } from "@/lib/sgtx/accounting";

// ============ §9 Constants ============

export const RECONCILIATION_TYPES = [
  "PAYMENT",
  "GOVERNMENT_FEE",
  "BANK",
  "PSP",
  "CARRIER",
  "BROKER",
  "INSURANCE",
  "ACCOUNTING",
] as const;

export const RECONCILIATION_STATUSES = [
  "PENDING",
  "MATCHED",
  "DISCREPANT",
  "UNMATCHED",
  "RESOLVED",
] as const;

/** Amount tolerance — within $0.01 → MATCHED. */
const MATCH_TOLERANCE_USD = 0.01;

// ============ Types ============

export interface CreateReconInput {
  ustn?: string;
  tradeId?: string;
  reconciliationType: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetReference?: string;
  sourceAmountUsd: number;
  targetAmountUsd: number;
  reconciliationDate?: Date;
  notes?: string;
}

export interface RunReconInput {
  ustn: string;
  reconciliationType: string;
  period?: string;
  /** Optional override for the reconciliation date (defaults to now). */
  reconciliationDate?: Date;
}

export interface ReconListFilters {
  ustn?: string;
  reconciliationType?: string;
  status?: string;
  period?: string;
}

export interface ReconSummary {
  total: number;
  matched: number;
  discrepant: number;
  unmatched: number;
}

export interface ReconResult extends ReconSummary {
  /** The reconciliation records created by `runReconciliation`. */
  records: any[];
  /** The reconciliation type that was run. */
  reconciliationType: string;
  /** The USTN that was reconciled. */
  ustn: string;
  /** The period that was reconciled (derived from reconciliationDate if not provided). */
  period: string;
}

export interface ReconByTypeSummary {
  byType: Record<string, ReconSummary>;
  overallMatchRate: number;
}

// ============ §9.0 Pure helpers ============

/**
 * Generate a reconciliation ID of the form `REC-YYYYMMDD-NNNNN` where NNNNN
 * is a 5-digit zero-padded random number. Pure (no DB, no side effects).
 */
export function generateReconciliationId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `REC-${ymd}-${n}`;
}

function isValidReconType(t?: string | null): boolean {
  return !!t && (RECONCILIATION_TYPES as readonly string[]).includes(t);
}

function isValidReconStatus(s?: string | null): boolean {
  return !!s && (RECONCILIATION_STATUSES as readonly string[]).includes(s);
}

/**
 * Append a timestamped note to an existing notes string without overwriting
 * prior history. Pure.
 */
function appendNote(existing: string | null | undefined, note: string): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] `;
  if (!existing || !String(existing).trim()) {
    return `${prefix}${note}`;
  }
  return `${existing}\n${prefix}${note}`;
}

/**
 * Compare two USD amounts for a match. Pure.
 *
 * Returns:
 *   - "MATCH"    if |source - target| <= MATCH_TOLERANCE_USD
 *   - "DISCREPANT" otherwise
 *
 * Note: targetAmountUsd = 0 (or null/undefined) means "no target found"
 * — callers should set status to UNMATCHED before computing a difference.
 */
export function compareAmounts(
  source: number,
  target: number,
): "MATCH" | "DISCREPANT" {
  const s = Number(source) || 0;
  const t = Number(target) || 0;
  return Math.abs(s - t) <= MATCH_TOLERANCE_USD ? "MATCH" : "DISCREPANT";
}

/**
 * Compute the difference USD = source − target. Pure.
 */
export function computeDifference(
  source: number,
  target: number,
): number {
  const s = Number(source) || 0;
  const t = Number(target) || 0;
  return +Number(s - t).toFixed(2);
}

// ============ §9.1 createReconciliation ============

/**
 * Create a reconciliation record. Generates a reconciliationId. Computes
 * differenceUsd = sourceAmountUsd − targetAmountUsd. Sets status:
 *   - MATCHED     if difference = 0 (within $0.01 tolerance)
 *   - DISCREPANT  if difference != 0
 *   - UNMATCHED   if targetAmountUsd = 0 AND targetReference is null/empty
 *                 (no matching target found — set by `runReconciliation`)
 *
 * Throws on invalid input.
 */
export async function createReconciliation(
  input: CreateReconInput,
): Promise<any> {
  if (!input) throw new Error("createReconciliation: input is required");
  if (!isValidReconType(input.reconciliationType)) {
    throw new Error(
      `createReconciliation: invalid reconciliationType "${input.reconciliationType}"`,
    );
  }
  if (!input.sourceType || !input.sourceId) {
    throw new Error("createReconciliation: sourceType + sourceId are required");
  }
  if (!input.targetType) {
    throw new Error("createReconciliation: targetType is required");
  }
  if (!(Number(input.sourceAmountUsd) >= 0)) {
    throw new Error("createReconciliation: sourceAmountUsd must be >= 0");
  }
  if (!(Number(input.targetAmountUsd) >= 0)) {
    throw new Error("createReconciliation: targetAmountUsd must be >= 0");
  }

  const reconciliationId = generateReconciliationId();
  const reconciliationDate = input.reconciliationDate
    ? input.reconciliationDate instanceof Date
      ? input.reconciliationDate
      : new Date(input.reconciliationDate)
    : new Date();
  const period = computePeriod(reconciliationDate);

  const sourceAmount = +Number(input.sourceAmountUsd).toFixed(2);
  const targetAmount = +Number(input.targetAmountUsd).toFixed(2);
  const differenceUsd = computeDifference(sourceAmount, targetAmount);

  // Determine status.
  let status: string;
  if (
    targetAmount === 0 &&
    (!input.targetReference || !String(input.targetReference).trim())
  ) {
    // No target found — UNMATCHED.
    status = "UNMATCHED";
  } else if (compareAmounts(sourceAmount, targetAmount) === "MATCH") {
    status = "MATCHED";
  } else {
    status = "DISCREPANT";
  }

  const data: any = {
    reconciliationId,
    reconciliationType: input.reconciliationType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    targetType: input.targetType,
    targetReference: input.targetReference || null,
    sourceAmountUsd: sourceAmount,
    targetAmountUsd: targetAmount,
    differenceUsd,
    status,
    reconciliationDate,
    period,
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.tradeId) data.tradeId = input.tradeId;
  if (status === "MATCHED") {
    data.matchedAt = new Date();
  } else if (status === "DISCREPANT") {
    data.discrepancyReason = `source ${sourceAmount} vs target ${targetAmount} (diff ${differenceUsd})`;
  }
  if (input.notes) data.notes = input.notes;

  try {
    const record = await db.reconciliationRecord.create({ data });
    logger.info("[reconciliation] record created", {
      reconciliationId,
      type: input.reconciliationType,
      status,
      sourceAmount,
      targetAmount,
      differenceUsd,
    });
    return record;
  } catch (err) {
    logger.error("[reconciliation] createReconciliation DB error", {
      error: String(err),
      reconciliationId,
    });
    throw err;
  }
}

// ============ §9.2 runReconciliation (main) ============

/**
 * The main reconciliation entrypoint. For a given (ustn, reconciliationType,
 * period), loads all source records (GlobalPayment for PAYMENT,
 * AccountingEntry for ACCOUNTING, CustomsOperation for GOVERNMENT_FEE,
 * etc.) + target records (bank statements, PSP reports — SIMULATED).
 * For each source, finds a matching target by amount + reference, creates
 * ReconciliationRecord rows, and returns the summary.
 *
 * Source → model mapping:
 *   PAYMENT         → GlobalPayment            (status=SETTLED)
 *   GOVERNMENT_FEE  → CustomsOperation         (status=RELEASED)
 *   BANK            → GlobalPayment            (paymentMethod=BANK_TRANSFER)
 *   PSP             → GlobalPayment            (paymentMethod=PSP)
 *   CARRIER         → AccountingEntry          (category=FREIGHT)
 *   BROKER         → AccountingEntry           (category=DUTY)
 *   INSURANCE      → AccountingEntry          (category=INSURANCE)
 *   ACCOUNTING     → AccountingEntry          (any POSTED/REVERSED entry)
 *
 * Target records: SIMULATED — for each source, we synthesize a target with
 * the SAME amount 80% of the time (MATCHED), a SLIGHTLY DIFFERENT amount
 * 10% of the time (DISCREPANT), and NO target 10% of the time (UNMATCHED).
 * The simulation is deterministic per sourceId hash so the same input always
 * produces the same outcome (testable). When a target IS synthesized, its
 * reference is derived from the source's reference (paymentId / entryId).
 *
 * Returns:
 *   { total, matched, discrepant, unmatched, records, reconciliationType, ustn, period }
 *
 * Safe default: returns zeros + empty records on DB error.
 */
export async function runReconciliation(
  input: RunReconInput,
): Promise<ReconResult> {
  const empty: ReconResult = {
    total: 0,
    matched: 0,
    discrepant: 0,
    unmatched: 0,
    records: [],
    reconciliationType: input?.reconciliationType || "",
    ustn: input?.ustn || "",
    period: "",
  };
  if (!input || !input.ustn || !isValidReconType(input.reconciliationType)) {
    return empty;
  }

  const reconciliationDate =
    input.reconciliationDate instanceof Date
      ? input.reconciliationDate
      : input.reconciliationDate
        ? new Date(input.reconciliationDate)
        : new Date();
  const period = input.period || computePeriod(reconciliationDate);

  // Load source records based on the reconciliation type.
  let sources: any[] = [];
  try {
    sources = await loadSourceRecords(input.ustn, input.reconciliationType);
  } catch (err) {
    logger.error("[reconciliation] runReconciliation source-load failed", {
      error: String(err),
      ustn: input.ustn,
      reconciliationType: input.reconciliationType,
    });
    return { ...empty, period };
  }

  const records: any[] = [];
  let matched = 0;
  let discrepant = 0;
  let unmatched = 0;

  for (const src of sources) {
    // Synthesize a target record for this source.
    const target = synthesizeTarget(src, input.reconciliationType);

    const sourceAmount = +Number(extractAmount(src, input.reconciliationType)).toFixed(2);
    const targetAmount = target ? +Number(target.amount).toFixed(2) : 0;
    const targetRef = target ? target.reference : null;

    let status: string;
    let differenceUsd: number;
    if (!target) {
      status = "UNMATCHED";
      differenceUsd = sourceAmount;
      unmatched++;
    } else {
      differenceUsd = computeDifference(sourceAmount, targetAmount);
      if (compareAmounts(sourceAmount, targetAmount) === "MATCH") {
        status = "MATCHED";
        matched++;
      } else {
        status = "DISCREPANT";
        discrepant++;
      }
    }

    const reconciliationId = generateReconciliationId();
    const data: any = {
      reconciliationId,
      ustn: input.ustn,
      reconciliationType: input.reconciliationType,
      sourceType: sourceTypeLabel(input.reconciliationType),
      sourceId: String(src.id || src.paymentId || src.entryId || ""),
      targetType: targetTypeLabel(input.reconciliationType),
      targetReference: targetRef,
      sourceAmountUsd: sourceAmount,
      targetAmountUsd: targetAmount,
      differenceUsd,
      status,
      reconciliationDate,
      period,
    };
    if (src.tradeId) data.tradeId = src.tradeId;
    if (status === "MATCHED") {
      data.matchedAt = new Date();
    } else if (status === "DISCREPANT") {
      data.discrepancyReason = `source ${sourceAmount} vs target ${targetAmount} (diff ${differenceUsd})`;
    }

    try {
      const rec = await db.reconciliationRecord.create({ data });
      records.push(rec);
    } catch (err) {
      logger.error("[reconciliation] runReconciliation record-create failed", {
        error: String(err),
        reconciliationId,
        sourceId: data.sourceId,
      });
    }
  }

  logger.info("[reconciliation] runReconciliation complete", {
    ustn: input.ustn,
    type: input.reconciliationType,
    period,
    total: records.length,
    matched,
    discrepant,
    unmatched,
  });

  return {
    total: records.length,
    matched,
    discrepant,
    unmatched,
    records,
    reconciliationType: input.reconciliationType,
    ustn: input.ustn,
    period,
  };
}

// ============ §9.3 getReconciliation ============

/**
 * Fetch a ReconciliationRecord by its row `id`. Returns null if not found or
 * on DB error.
 */
export async function getReconciliation(id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.reconciliationRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[reconciliation] getReconciliation DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §9.4 getReconciliationByReconId ============

/**
 * Fetch a ReconciliationRecord by its business `reconciliationId`
 * (REC-YYYYMMDD-NNNNN). Returns null if not found or on DB error.
 */
export async function getReconciliationByReconId(
  reconciliationId: string,
): Promise<any | null> {
  if (!reconciliationId) return null;
  try {
    return await db.reconciliationRecord.findUnique({
      where: { reconciliationId },
    });
  } catch (err) {
    logger.error("[reconciliation] getReconciliationByReconId DB error", {
      error: String(err),
      reconciliationId,
    });
    return null;
  }
}

// ============ §9.5 listReconciliations ============

/**
 * List ReconciliationRecord rows by filter. Supports ustn,
 * reconciliationType, status, period. Ordered by reconciliationDate DESC.
 * Safe default: returns [] on DB error.
 */
export async function listReconciliations(
  filters?: ReconListFilters,
): Promise<any[]> {
  const where: any = {};
  if (filters) {
    if (filters.ustn) where.ustn = filters.ustn;
    if (filters.reconciliationType)
      where.reconciliationType = filters.reconciliationType;
    if (filters.status) where.status = filters.status;
    if (filters.period) where.period = filters.period;
  }
  try {
    return await db.reconciliationRecord.findMany({
      where,
      orderBy: { reconciliationDate: "desc" },
    });
  } catch (err) {
    logger.error("[reconciliation] listReconciliations DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §9.6 matchReconciliation ============

/**
 * Manually match a source to a target. Sets:
 *   - status = MATCHED (or DISCREPANT if amounts differ)
 *   - targetReference = targetReference
 *   - matchedAt = now
 *   - notes appended with the manual match
 *
 * Returns the updated record. Throws if not found.
 */
export async function matchReconciliation(
  id: string,
  targetReference: string,
): Promise<any> {
  if (!id) throw new Error("matchReconciliation: id is required");
  if (!targetReference || !String(targetReference).trim()) {
    throw new Error("matchReconciliation: targetReference is required");
  }

  let record: any = null;
  try {
    record = await db.reconciliationRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[reconciliation] matchReconciliation lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!record) throw new Error(`matchReconciliation: record not found: ${id}`);

  // Re-evaluate status with the new target reference. The target amount is
  // NOT changed — the manual match links the source to the named target
  // reference. If amounts already matched, status becomes MATCHED; otherwise
  // it remains DISCREPANT but the target is now linked.
  const sourceAmount = +Number(record.sourceAmountUsd || 0).toFixed(2);
  const targetAmount = +Number(record.targetAmountUsd || 0).toFixed(2);
  const differenceUsd = computeDifference(sourceAmount, targetAmount);
  const status =
    compareAmounts(sourceAmount, targetAmount) === "MATCH"
      ? "MATCHED"
      : "DISCREPANT";

  try {
    const updated = await db.reconciliationRecord.update({
      where: { id },
      data: {
        targetReference: String(targetReference).trim(),
        status,
        matchedAt: status === "MATCHED" ? new Date() : record.matchedAt,
        differenceUsd,
        notes: appendNote(
          record.notes,
          `manually matched to target ${String(targetReference).trim()} — status=${status}`,
        ),
      },
    });
    logger.info("[reconciliation] record manually matched", {
      id,
      targetReference: String(targetReference).trim(),
      status,
    });
    return updated;
  } catch (err) {
    logger.error("[reconciliation] matchReconciliation DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §9.7 resolveDiscrepancy ============

/**
 * Transition a DISCREPANT reconciliation → RESOLVED. Sets resolvedBy +
 * resolvedAt + resolutionNotes. Idempotent on RESOLVED (returns the row
 * unchanged with a note appended).
 */
export async function resolveDiscrepancy(
  id: string,
  resolvedBy: string,
  notes: string,
): Promise<any> {
  if (!id) throw new Error("resolveDiscrepancy: id is required");
  if (!resolvedBy) throw new Error("resolveDiscrepancy: resolvedBy is required");
  if (!notes || !String(notes).trim()) {
    throw new Error("resolveDiscrepancy: notes are required");
  }

  let record: any = null;
  try {
    record = await db.reconciliationRecord.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[reconciliation] resolveDiscrepancy lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!record) throw new Error(`resolveDiscrepancy: record not found: ${id}`);

  if (record.status === "RESOLVED") {
    // Idempotent — append the new note to resolutionNotes.
    try {
      const updated = await db.reconciliationRecord.update({
        where: { id },
        data: {
          resolutionNotes: appendNote(
            record.resolutionNotes,
            `additional resolution by ${resolvedBy}: ${String(notes).trim()}`,
          ),
        },
      });
      return updated;
    } catch (err) {
      logger.error("[reconciliation] resolveDiscrepancy idempotent-update failed", {
        error: String(err),
        id,
      });
      throw err;
    }
  }

  if (record.status !== "DISCREPANT") {
    throw new Error(
      `resolveDiscrepancy: cannot resolve from status=${record.status} (must be DISCREPANT)`,
    );
  }

  try {
    const updated = await db.reconciliationRecord.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedBy,
        resolvedAt: new Date(),
        resolutionNotes: appendNote(
          record.resolutionNotes,
          `resolved by ${resolvedBy}: ${String(notes).trim()}`,
        ),
      },
    });
    logger.info("[reconciliation] discrepancy resolved", {
      id,
      resolvedBy,
    });
    return updated;
  } catch (err) {
    logger.error("[reconciliation] resolveDiscrepancy DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §9.8 getReconciliationSummary ============

/**
 * Compute a summary across all 8 reconciliation types for a (ustn, period).
 * Returns:
 *   {
 *     byType: Record<reconciliationType, { total, matched, discrepant, unmatched }>,
 *     overallMatchRate: number (0–1, fraction of MATCHED+RESOLVED / total)
 *   }
 *
 * Safe default: returns all-zero byType + 0 overallMatchRate on DB error.
 */
export async function getReconciliationSummary(
  ustn: string,
  period: string,
): Promise<ReconByTypeSummary> {
  const emptyByType: Record<string, ReconSummary> = {};
  for (const t of RECONCILIATION_TYPES) {
    emptyByType[t] = { total: 0, matched: 0, discrepant: 0, unmatched: 0 };
  }
  const empty: ReconByTypeSummary = { byType: emptyByType, overallMatchRate: 0 };
  if (!ustn || !period) return empty;

  let records: any[] = [];
  try {
    records = await db.reconciliationRecord.findMany({
      where: { ustn, period },
    });
  } catch (err) {
    logger.error("[reconciliation] getReconciliationSummary DB error", {
      error: String(err),
      ustn,
      period,
    });
    return empty;
  }

  const byType: Record<string, ReconSummary> = {};
  for (const t of RECONCILIATION_TYPES) {
    byType[t] = { total: 0, matched: 0, discrepant: 0, unmatched: 0 };
  }
  let totalAll = 0;
  let matchedAll = 0;
  for (const r of records) {
    const t = r.reconciliationType;
    if (!byType[t]) {
      byType[t] = { total: 0, matched: 0, discrepant: 0, unmatched: 0 };
    }
    byType[t].total++;
    totalAll++;
    switch (r.status) {
      case "MATCHED":
        byType[t].matched++;
        matchedAll++;
        break;
      case "RESOLVED":
        // RESOLVED counts as matched (discrepancy accepted).
        byType[t].matched++;
        matchedAll++;
        break;
      case "DISCREPANT":
        byType[t].discrepant++;
        break;
      case "UNMATCHED":
        byType[t].unmatched++;
        break;
      default:
        break;
    }
  }

  const overallMatchRate =
    totalAll === 0 ? 0 : +(matchedAll / totalAll).toFixed(4);

  return { byType, overallMatchRate };
}

// ============ §9.9 getUnreconciledPayments ============

/**
 * Returns GlobalPayment records for the USTN with reconciliationStatus =
 * UNRECONCILED (awaiting reconciliation by the matching engine).
 *
 * Safe default: returns [] on DB error.
 */
export async function getUnreconciledPayments(ustn: string): Promise<any[]> {
  if (!ustn) return [];
  try {
    return await db.globalPayment.findMany({
      where: {
        ustn,
        reconciliationStatus: "UNRECONCILED",
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[reconciliation] getUnreconciledPayments DB error", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §9.10 getUnreconciledAccountingEntries ============

/**
 * Returns AccountingEntry records for the USTN with status != RECONCILED
 * (i.e. DRAFT, POSTED, or REVERSED entries that have not been marked as
 * reconciled by the §9 engine).
 *
 * Safe default: returns [] on DB error.
 */
export async function getUnreconciledAccountingEntries(
  ustn: string,
): Promise<any[]> {
  if (!ustn) return [];
  try {
    return await db.accountingEntry.findMany({
      where: {
        ustn,
        status: { not: "RECONCILED" },
      },
      orderBy: { accountingDate: "desc" },
    });
  } catch (err) {
    logger.error("[reconciliation] getUnreconciledAccountingEntries DB error", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ Internal helpers ============

/**
 * Load source records for a reconciliation run based on the type.
 * Internal — never throws (returns [] on error).
 */
async function loadSourceRecords(
  ustn: string,
  reconciliationType: string,
): Promise<any[]> {
  switch (reconciliationType) {
    case "PAYMENT":
      return db.globalPayment.findMany({
        where: { ustn, status: "SETTLED" },
      });
    case "BANK":
      return db.globalPayment.findMany({
        where: {
          ustn,
          status: "SETTLED",
          paymentMethod: { in: ["BANK_TRANSFER", "SWIFT", "ISO_20022", "LOCAL_RAILS"] },
        },
      });
    case "PSP":
      return db.globalPayment.findMany({
        where: {
          ustn,
          status: "SETTLED",
          paymentMethod: { in: ["PSP", "OPEN_BANKING", "LOCAL_INSTANT"] },
        },
      });
    case "GOVERNMENT_FEE":
      // CustomsOperation — duty + tax payments reconciled against govt receipts.
      try {
        return await db.customsOperation.findMany({
          where: { ustn, status: "RELEASED" },
        });
      } catch {
        // CustomsOperationV2 — try the V2 model name if it exists.
        try {
          // @ts-ignore — dynamic property access for the V2 model.
          return await db.customsOperationV2.findMany({
            where: { ustn, status: "RELEASED" },
          });
        } catch {
          return [];
        }
      }
    case "CARRIER":
      return db.accountingEntry.findMany({
        where: { ustn, category: "FREIGHT", status: "POSTED" },
      });
    case "BROKER":
      return db.accountingEntry.findMany({
        where: { ustn, category: "DUTY", status: "POSTED" },
      });
    case "INSURANCE":
      return db.accountingEntry.findMany({
        where: { ustn, category: "INSURANCE", status: "POSTED" },
      });
    case "ACCOUNTING":
      return db.accountingEntry.findMany({
        where: { ustn, status: { in: ["POSTED", "REVERSED"] } },
      });
    default:
      return [];
  }
}

/**
 * Extract the USD amount from a source record based on the reconciliation
 * type. Pure.
 */
function extractAmount(
  source: any,
  reconciliationType: string,
): number {
  if (!source) return 0;
  // GlobalPayment — amountUsd.
  if (source.amountUsd != null) return Number(source.amountUsd) || 0;
  // AccountingEntry — amountUsd.
  return Number(source.amountUsd) || 0;
}

/**
 * Synthesize a target record for a source — SIMULATED. Returns null to
 * represent UNMATCHED (no target found).
 *
 * The simulation is deterministic per sourceId hash so the same sourceId
 * always produces the same match outcome (testable).
 *
 * Outcomes:
 *   ~80% MATCH  — target has the same amount + a derived reference.
 *   ~10% DISCREPANT — target has amount ±1.50 (a small discrepancy).
 *   ~10% UNMATCHED — no target found (returns null).
 */
function synthesizeTarget(
  source: any,
  reconciliationType: string,
): { amount: number; reference: string } | null {
  const sourceAmount = Number(source?.amountUsd) || 0;
  const sourceId = String(source?.id || source?.paymentId || source?.entryId || "");
  const sourceRef =
    source?.paymentReference || source?.reference || source?.declarationNumber || sourceId;

  // Deterministic hash → 0..99 bucket.
  const bucket = deterministicBucket(sourceId);

  // 80% MATCH
  if (bucket < 80) {
    return {
      amount: sourceAmount,
      reference: `TGT-${reconciliationType}-${sourceRef}`,
    };
  }
  // 10% DISCREPANT (±1.50)
  if (bucket < 90) {
    const delta = bucket % 2 === 0 ? 1.5 : -1.5;
    return {
      amount: +(sourceAmount + delta).toFixed(2),
      reference: `TGT-${reconciliationType}-${sourceRef}`,
    };
  }
  // 10% UNMATCHED
  return null;
}

/**
 * Deterministic 0..99 bucket from a string hash. Pure.
 */
function deterministicBucket(s: string): number {
  if (!s) return 50;
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 100;
}

/**
 * Label for the source record type, used in ReconciliationRecord.sourceType.
 */
function sourceTypeLabel(reconciliationType: string): string {
  switch (reconciliationType) {
    case "PAYMENT":
    case "BANK":
    case "PSP":
      return "GLOBAL_PAYMENT";
    case "GOVERNMENT_FEE":
      return "CUSTOMS_OPERATION";
    case "CARRIER":
    case "BROKER":
    case "INSURANCE":
    case "ACCOUNTING":
      return "ACCOUNTING_ENTRY";
    default:
      return "UNKNOWN";
  }
}

/**
 * Label for the target record type (external), used in
 * ReconciliationRecord.targetType.
 */
function targetTypeLabel(reconciliationType: string): string {
  switch (reconciliationType) {
    case "PAYMENT":
    case "BANK":
      return "BANK_STATEMENT";
    case "PSP":
      return "PSP_REPORT";
    case "GOVERNMENT_FEE":
      return "GOVERNMENT_RECEIPT";
    case "CARRIER":
      return "CARRIER_CONFIRMATION";
    case "BROKER":
      return "BROKER_CONFIRMATION";
    case "INSURANCE":
      return "INSURER_CONFIRMATION";
    case "ACCOUNTING":
      return "ERP_LEDGER";
    default:
      return "UNKNOWN";
  }
}
