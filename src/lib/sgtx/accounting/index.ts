// @ts-nocheck
/**
 * SGTX Phase 6 — §7 Accounting Engine
 * ===========================================================================
 *
 * The double-entry accounting ledger for SGTX. Every economic event in the
 * platform (a payment, a customs duty, a freight invoice, an insurance
 * premium, a settlement, an FX revaluation, an inventory receipt, a COGS
 * recognition) creates ONE AccountingEntry row with a (debitAccount,
 * creditAccount) pair — the classic double-entry primitive.
 *
 * 13 accounting categories (§7):
 *   AP            — Accounts Payable
 *   AR            — Accounts Receivable
 *   LANDED_COST   — Landed cost capitalization
 *   FREIGHT       — Freight (transport service)
 *   DUTY          — Customs duty
 *   TAX           — VAT / GST / sales tax
 *   INSURANCE     — Cargo / liability insurance premium
 *   ACCRUAL       — Period accruals (earned but not yet invoiced)
 *   SETTLEMENT    — Settlement against a payment / payout
 *   REFUND        — Refund issuance / receipt
 *   FX            — Foreign-exchange gain / loss revaluation
 *   INVENTORY     — Inventory receipt / release
 *   COGS          — Cost of goods sold recognition
 *
 * Lifecycle:
 *   DRAFT → POSTED → REVERSED
 *                 ↘ RECONCILED (set by the §9 reconciliation engine)
 *
 * Period: derived from `accountingDate` as `YYYY-MM` via the pure helper
 * `computePeriod`. Every entry is bucketed into a period so the trial
 * balance + P&L aggregations are deterministic per period.
 *
 * Entry ID format: `AE-YYYYMMDD-NNNNN` (5-digit zero-padded random suffix).
 *
 * Reversal: `reverseEntry` creates a NEW entry (its own row + entryId) with
 * debit/credit SWAPPED and `status=REVERSED` flag on the original. This is
 * the canonical "storno" pattern — never mutate the original posted entry.
 *
 * Link to source records: the AccountingEntry model carries `sourceType`
 * (PAYMENT | INVOICE | CUSTOMS | FREIGHT | MANUAL) + `sourceId`. The
 * `linkToPayment` + `linkToCustoms` helpers store the cross-reference via
 * (sourceType, sourceId) so a single accounting entry can be traced back to
 * its originating GlobalPayment or CustomsOperation.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §7 Constants ============

/**
 * The 13 accounting categories (§7).
 *
 * NOTE: the spec heading says "12 categories" but enumerates 13. All 13 are
 * implemented here (AP, AR, LANDED_COST, FREIGHT, DUTY, TAX, INSURANCE,
 * ACCRUAL, SETTLEMENT, REFUND, FX, INVENTORY, COGS).
 */
export const ACCOUNTING_CATEGORIES = [
  "AP",
  "AR",
  "LANDED_COST",
  "FREIGHT",
  "DUTY",
  "TAX",
  "INSURANCE",
  "ACCRUAL",
  "SETTLEMENT",
  "REFUND",
  "FX",
  "INVENTORY",
  "COGS",
] as const;

export const ACCOUNTING_STATUSES = [
  "DRAFT",
  "POSTED",
  "REVERSED",
  "RECONCILED",
] as const;

export const ACCOUNTING_SOURCE_TYPES = [
  "PAYMENT",
  "INVOICE",
  "CUSTOMS",
  "FREIGHT",
  "MANUAL",
] as const;

// ============ Types ============

export interface CreateEntryInput {
  ustn?: string;
  tradeId?: string;
  category: string;
  debitAccount: string;
  creditAccount: string;
  amountUsd: number;
  currency?: string;
  fxRate?: number;
  amountLocal?: number;
  description?: string;
  reference?: string;
  accountingDate?: Date;
  sourceType?: string;
  sourceId?: string;
  notes?: string;
}

export interface EntryListFilters {
  ustn?: string;
  category?: string;
  status?: string;
  period?: string;
  accountingDateFrom?: Date;
  accountingDateTo?: Date;
}

export interface TrialBalanceRow {
  account: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface PnlResult {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
}

// ============ §7.0 Pure helpers ============

/**
 * Generate an accounting entry ID of the form `AE-YYYYMMDD-NNNNN` where
 * NNNNN is a 5-digit zero-padded random number. Pure (no DB, no side effects).
 */
export function generateEntryId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `AE-${ymd}-${n}`;
}

/**
 * Compute the accounting period (`YYYY-MM`) from a Date. Pure.
 * Returns the period in UTC to avoid timezone drift.
 */
export function computePeriod(date: Date): string {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function isValidCategory(c?: string | null): boolean {
  return !!c && (ACCOUNTING_CATEGORIES as readonly string[]).includes(c);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (ACCOUNTING_STATUSES as readonly string[]).includes(s);
}

function isValidSourceType(s?: string | null): boolean {
  return !!s && (ACCOUNTING_SOURCE_TYPES as readonly string[]).includes(s);
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

// ============ §7.1 createEntry ============

/**
 * Create a double-entry accounting record (debit + credit). Generates an
 * entryId (`AE-YYYYMMDD-NNNNN`) and derives `period` from `accountingDate`
 * via the pure `computePeriod` helper. The entry is created in DRAFT status
 * — call `postEntry` to transition it to POSTED.
 *
 * Validation:
 *   - category MUST be one of the 13 §7 categories.
 *   - debitAccount + creditAccount MUST both be non-empty.
 *   - amountUsd MUST be > 0.
 *   - debitAccount MUST differ from creditAccount (no zero-net entry).
 */
export async function createEntry(input: CreateEntryInput): Promise<any> {
  if (!input) {
    throw new Error("createEntry: input is required");
  }
  if (!isValidCategory(input.category)) {
    throw new Error(`createEntry: invalid category "${input.category}"`);
  }
  if (!input.debitAccount || !String(input.debitAccount).trim()) {
    throw new Error("createEntry: debitAccount is required");
  }
  if (!input.creditAccount || !String(input.creditAccount).trim()) {
    throw new Error("createEntry: creditAccount is required");
  }
  if (String(input.debitAccount).trim() === String(input.creditAccount).trim()) {
    throw new Error(
      "createEntry: debitAccount and creditAccount must differ (no zero-net entry)",
    );
  }
  if (!(Number(input.amountUsd) > 0)) {
    throw new Error("createEntry: amountUsd must be positive");
  }

  const entryId = generateEntryId();
  const accountingDate = input.accountingDate
    ? input.accountingDate instanceof Date
      ? input.accountingDate
      : new Date(input.accountingDate)
    : new Date();
  const period = computePeriod(accountingDate);

  const data: any = {
    entryId,
    category: input.category,
    debitAccount: String(input.debitAccount).trim(),
    creditAccount: String(input.creditAccount).trim(),
    amountUsd: +Number(input.amountUsd).toFixed(2),
    currency: input.currency || "USD",
    accountingDate,
    period,
    status: "DRAFT",
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.tradeId) data.tradeId = input.tradeId;
  if (input.fxRate != null) data.fxRate = +Number(input.fxRate).toFixed(6);
  if (input.amountLocal != null)
    data.amountLocal = +Number(input.amountLocal).toFixed(2);
  if (input.description) data.description = input.description;
  if (input.reference) data.reference = input.reference;
  if (input.sourceType && isValidSourceType(input.sourceType)) {
    data.sourceType = input.sourceType;
  } else if (input.sourceType) {
    // Unknown sourceType — default to MANUAL and surface via notes.
    data.sourceType = "MANUAL";
    data.notes = appendNote(
      input.notes,
      `sourceType "${input.sourceType}" not recognized — defaulted to MANUAL`,
    );
  } else {
    data.sourceType = "MANUAL";
  }
  if (input.sourceId) data.sourceId = input.sourceId;
  if (input.notes && !data.notes) data.notes = input.notes;

  try {
    const entry = await db.accountingEntry.create({ data });
    logger.info("[accounting] entry created", {
      entryId,
      category: input.category,
      amount: data.amountUsd,
      debit: data.debitAccount,
      credit: data.creditAccount,
      period,
      ustn: input.ustn || null,
    });
    return entry;
  } catch (err) {
    logger.error("[accounting] createEntry DB error", {
      error: String(err),
      entryId,
    });
    throw err;
  }
}

// ============ §7.2 postEntry ============

/**
 * Transition an entry DRAFT → POSTED. Sets postedAt + postedBy. A POSTED
 * entry is "locked" — to amend, create a reversal via `reverseEntry`.
 */
export async function postEntry(id: string, postedBy: string): Promise<any> {
  if (!id) throw new Error("postEntry: id is required");
  if (!postedBy) throw new Error("postEntry: postedBy is required");

  let entry: any = null;
  try {
    entry = await db.accountingEntry.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[accounting] postEntry lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!entry) throw new Error(`postEntry: entry not found: ${id}`);
  if (entry.status !== "DRAFT") {
    throw new Error(
      `postEntry: cannot post from status=${entry.status} (must be DRAFT)`,
    );
  }

  try {
    const updated = await db.accountingEntry.update({
      where: { id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedBy,
      },
    });
    logger.info("[accounting] entry posted", {
      entryId: entry.entryId,
      postedBy,
    });
    return updated;
  } catch (err) {
    logger.error("[accounting] postEntry DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §7.3 reverseEntry ============

/**
 * Reverse a POSTED entry. Creates a NEW AccountingEntry row (its own entryId)
 * with debitAccount + creditAccount SWAPPED, then sets the ORIGINAL entry's
 * status to REVERSED. This is the canonical "storno" pattern — the original
 * posted entry is never mutated apart from the status flag.
 *
 * The reversal entry inherits ustn, tradeId, category, currency, reference,
 * and source linkage from the original. Its description notes the reason
 * + the original entryId.
 */
export async function reverseEntry(id: string, reason: string): Promise<any> {
  if (!id) throw new Error("reverseEntry: id is required");
  if (!reason || !String(reason).trim()) {
    throw new Error("reverseEntry: reason is required");
  }

  let original: any = null;
  try {
    original = await db.accountingEntry.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[accounting] reverseEntry lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!original) throw new Error(`reverseEntry: entry not found: ${id}`);
  if (original.status !== "POSTED") {
    throw new Error(
      `reverseEntry: cannot reverse from status=${original.status} (must be POSTED)`,
    );
  }

  const reversalId = generateEntryId();
  const reversalDate = new Date();
  const reversalPeriod = computePeriod(reversalDate);

  // Build the reversal entry — swap debit/credit, negative-amount semantics
  // are NOT used (storno keeps the same positive amount on the swapped
  // accounts; the swap itself expresses the reversal).
  const reversalData: any = {
    entryId: reversalId,
    ustn: original.ustn,
    tradeId: original.tradeId,
    category: original.category,
    debitAccount: original.creditAccount, // swapped
    creditAccount: original.debitAccount, // swapped
    amountUsd: +Number(original.amountUsd).toFixed(2),
    currency: original.currency || "USD",
    fxRate: original.fxRate ?? null,
    amountLocal: original.amountLocal ?? null,
    description: `REVERSAL of ${original.entryId} — ${String(reason).trim()}`,
    reference: original.reference,
    accountingDate: reversalDate,
    period: reversalPeriod,
    status: "POSTED", // reversal entries are POSTED at creation (immediately effective)
    postedAt: reversalDate,
    postedBy: "system-reversal",
    sourceType: original.sourceType || "MANUAL",
    sourceId: original.sourceId,
    notes: appendNote(
      null,
      `reversal of entry ${original.entryId} — reason: ${String(reason).trim()}`,
    ),
  };

  try {
    // Create the reversal entry first; then flip the original's status.
    const reversal = await db.accountingEntry.create({
      data: reversalData,
    });
    const updated = await db.accountingEntry.update({
      where: { id },
      data: {
        status: "REVERSED",
        notes: appendNote(
          original.notes,
          `REVERSED by reversal entry ${reversalId} — reason: ${String(reason).trim()}`,
        ),
      },
    });
    logger.info("[accounting] entry reversed", {
      originalEntryId: original.entryId,
      reversalEntryId: reversalId,
      reason: String(reason).trim(),
    });
    return updated;
  } catch (err) {
    logger.error("[accounting] reverseEntry DB error", {
      error: String(err),
      id,
      reversalId,
    });
    throw err;
  }
}

// ============ §7.4 getEntry ============

/**
 * Fetch an AccountingEntry by its row `id` (cuid). Returns null if not found
 * or on DB error (safe default).
 */
export async function getEntry(id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.accountingEntry.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[accounting] getEntry DB error", { error: String(err), id });
    return null;
  }
}

// ============ §7.5 getEntryByEntryId ============

/**
 * Fetch an AccountingEntry by its business `entryId` (AE-YYYYMMDD-NNNNN).
 * Returns null if not found or on DB error (safe default).
 */
export async function getEntryByEntryId(entryId: string): Promise<any | null> {
  if (!entryId) return null;
  try {
    return await db.accountingEntry.findUnique({ where: { entryId } });
  } catch (err) {
    logger.error("[accounting] getEntryByEntryId DB error", {
      error: String(err),
      entryId,
    });
    return null;
  }
}

// ============ §7.6 listEntries ============

/**
 * List AccountingEntry rows by filter. Supports ustn, category, status,
 * period, and an accounting-date range. Ordered by accountingDate DESC.
 *
 * Safe default: returns [] on DB error.
 */
export async function listEntries(
  filters?: EntryListFilters,
): Promise<any[]> {
  const where: any = {};
  if (filters) {
    if (filters.ustn) where.ustn = filters.ustn;
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;
    if (filters.period) where.period = filters.period;
    if (filters.accountingDateFrom || filters.accountingDateTo) {
      where.accountingDate = {};
      if (filters.accountingDateFrom) {
        where.accountingDate.gte =
          filters.accountingDateFrom instanceof Date
            ? filters.accountingDateFrom
            : new Date(filters.accountingDateFrom);
      }
      if (filters.accountingDateTo) {
        where.accountingDate.lte =
          filters.accountingDateTo instanceof Date
            ? filters.accountingDateTo
            : new Date(filters.accountingDateTo);
      }
    }
  }
  try {
    return await db.accountingEntry.findMany({
      where,
      orderBy: { accountingDate: "desc" },
    });
  } catch (err) {
    logger.error("[accounting] listEntries DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §7.7 getEntriesByUstn ============

/**
 * Convenience: all accounting entries for a USTN, ordered by accountingDate.
 */
export async function getEntriesByUstn(ustn: string): Promise<any[]> {
  if (!ustn) return [];
  return listEntries({ ustn });
}

// ============ §7.8 getEntriesByPeriod ============

/**
 * Convenience: all accounting entries for a period (YYYY-MM), ordered by
 * accountingDate.
 */
export async function getEntriesByPeriod(period: string): Promise<any[]> {
  if (!period) return [];
  return listEntries({ period });
}

// ============ §7.9 getTrialBalance ============

/**
 * Compute the trial balance for a period. Aggregates all POSTED + REVERSED
 * entries for the period by account, summing debits and credits separately.
 *
 * Implementation note: an entry contributes `amountUsd` to the DEBIT side of
 * `debitAccount` AND to the CREDIT side of `creditAccount`. So for each
 * entry:
 *   - debitAccount.debitTotal  += amountUsd
 *   - creditAccount.creditTotal += amountUsd
 *
 * Balance = debitTotal − creditTotal. A balanced ledger should have a total
 * balance of 0 across all accounts.
 *
 * Safe default: returns [] on DB error.
 */
export async function getTrialBalance(
  period: string,
): Promise<TrialBalanceRow[]> {
  if (!period) return [];
  let entries: any[] = [];
  try {
    entries = await db.accountingEntry.findMany({
      where: {
        period,
        status: { in: ["POSTED", "REVERSED"] },
      },
    });
  } catch (err) {
    logger.error("[accounting] getTrialBalance DB error", {
      error: String(err),
      period,
    });
    return [];
  }

  const map = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    const amt = +Number(e.amountUsd || 0).toFixed(2);
    const d = e.debitAccount;
    const c = e.creditAccount;
    if (d) {
      const cur = map.get(d) || { debit: 0, credit: 0 };
      cur.debit = +(cur.debit + amt).toFixed(2);
      map.set(d, cur);
    }
    if (c) {
      const cur = map.get(c) || { debit: 0, credit: 0 };
      cur.credit = +(cur.credit + amt).toFixed(2);
      map.set(c, cur);
    }
  }

  const rows: TrialBalanceRow[] = [];
  for (const [account, { debit, credit }] of map.entries()) {
    rows.push({
      account,
      debitTotal: +debit.toFixed(2),
      creditTotal: +credit.toFixed(2),
      balance: +(debit - credit).toFixed(2),
    });
  }
  // Sort accounts alphabetically for deterministic output.
  rows.sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  return rows;
}

// ============ §7.10 getPnl ============

/**
 * Compute a simple P&L for a period from POSTED + REVERSED accounting
 * entries.
 *
 * The P&L maps the §7 categories to P&L lines:
 *
 *   revenue           = sum(amountUsd) for AR + REFUND (credit-side revenue)
 *   cogs              = sum(amountUsd) for COGS + LANDED_COST + DUTY + TAX
 *   grossProfit       = revenue − cogs
 *   operatingExpenses = sum(amountUsd) for FREIGHT + INSURANCE + ACCRUAL + FX
 *   netProfit         = grossProfit − operatingExpenses
 *
 * Inventory (INVENTORY) and Settlement (SETTLEMENT) are balance-sheet items
 * — they do NOT appear on the P&L.
 *
 * The sign convention: for revenue categories (AR, REFUND), the credit side
 * is revenue; we take amountUsd as positive revenue. For expense categories
 * (COGS, FREIGHT, etc.), the debit side is the expense; we take amountUsd as
 * a positive expense (subtracted from revenue).
 *
 * Safe default: returns all zeros on DB error.
 */
export async function getPnl(period: string): Promise<PnlResult> {
  if (!period) {
    return {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      netProfit: 0,
    };
  }
  let entries: any[] = [];
  try {
    entries = await db.accountingEntry.findMany({
      where: {
        period,
        status: { in: ["POSTED", "REVERSED"] },
      },
    });
  } catch (err) {
    logger.error("[accounting] getPnl DB error", {
      error: String(err),
      period,
    });
    return {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      netProfit: 0,
    };
  }

  let revenue = 0;
  let cogs = 0;
  let operatingExpenses = 0;

  for (const e of entries) {
    const amt = +Number(e.amountUsd || 0).toFixed(2);
    switch (e.category) {
      case "AR":
      case "REFUND":
        revenue += amt;
        break;
      case "COGS":
      case "LANDED_COST":
      case "DUTY":
      case "TAX":
        cogs += amt;
        break;
      case "FREIGHT":
      case "INSURANCE":
      case "ACCRUAL":
      case "FX":
        operatingExpenses += amt;
        break;
      // INVENTORY, SETTLEMENT, AP — balance-sheet items, not on P&L.
      default:
        break;
    }
  }

  revenue = +revenue.toFixed(2);
  cogs = +cogs.toFixed(2);
  const grossProfit = +(revenue - cogs).toFixed(2);
  operatingExpenses = +operatingExpenses.toFixed(2);
  const netProfit = +(grossProfit - operatingExpenses).toFixed(2);

  return { revenue, cogs, grossProfit, operatingExpenses, netProfit };
}

// ============ §7.11 linkToPayment ============

/**
 * Link an accounting entry to a GlobalPayment record. Stores the link via
 * `sourceType=PAYMENT` + `sourceId=paymentId` and appends a timestamped note.
 *
 * Idempotent: if the entry is already linked to the same paymentId, returns
 * the row unchanged.
 *
 * Returns the updated entry (or throws if not found).
 */
export async function linkToPayment(
  entryId: string,
  paymentId: string,
): Promise<any> {
  if (!entryId) throw new Error("linkToPayment: entryId is required");
  if (!paymentId) throw new Error("linkToPayment: paymentId is required");

  let entry: any = null;
  try {
    entry = await db.accountingEntry.findUnique({ where: { id: entryId } });
  } catch (err) {
    logger.error("[accounting] linkToPayment lookup failed", {
      error: String(err),
      entryId,
    });
    throw err;
  }
  if (!entry) throw new Error(`linkToPayment: entry not found: ${entryId}`);

  // Idempotent check.
  if (
    entry.sourceType === "PAYMENT" &&
    entry.sourceId === paymentId
  ) {
    return entry;
  }

  try {
    const updated = await db.accountingEntry.update({
      where: { id: entryId },
      data: {
        sourceType: "PAYMENT",
        sourceId: paymentId,
        notes: appendNote(
          entry.notes,
          `linked to GlobalPayment ${paymentId}`,
        ),
      },
    });
    logger.info("[accounting] entry linked to payment", {
      entryId: entry.entryId,
      paymentId,
    });
    return updated;
  } catch (err) {
    logger.error("[accounting] linkToPayment DB error", {
      error: String(err),
      entryId,
      paymentId,
    });
    throw err;
  }
}

// ============ §7.12 linkToCustoms ============

/**
 * Link an accounting entry to a CustomsOperation (V2) record. Stores the link
 * via `sourceType=CUSTOMS` + `sourceId=customsOperationId` and appends a
 * timestamped note.
 *
 * Idempotent: if the entry is already linked to the same customsOperationId,
 * returns the row unchanged.
 *
 * Returns the updated entry (or throws if not found).
 */
export async function linkToCustoms(
  entryId: string,
  customsOperationId: string,
): Promise<any> {
  if (!entryId) throw new Error("linkToCustoms: entryId is required");
  if (!customsOperationId)
    throw new Error("linkToCustoms: customsOperationId is required");

  let entry: any = null;
  try {
    entry = await db.accountingEntry.findUnique({ where: { id: entryId } });
  } catch (err) {
    logger.error("[accounting] linkToCustoms lookup failed", {
      error: String(err),
      entryId,
    });
    throw err;
  }
  if (!entry) throw new Error(`linkToCustoms: entry not found: ${entryId}`);

  // Idempotent check.
  if (
    entry.sourceType === "CUSTOMS" &&
    entry.sourceId === customsOperationId
  ) {
    return entry;
  }

  try {
    const updated = await db.accountingEntry.update({
      where: { id: entryId },
      data: {
        sourceType: "CUSTOMS",
        sourceId: customsOperationId,
        notes: appendNote(
          entry.notes,
          `linked to CustomsOperation ${customsOperationId}`,
        ),
      },
    });
    logger.info("[accounting] entry linked to customs operation", {
      entryId: entry.entryId,
      customsOperationId,
    });
    return updated;
  } catch (err) {
    logger.error("[accounting] linkToCustoms DB error", {
      error: String(err),
      entryId,
      customsOperationId,
    });
    throw err;
  }
}
