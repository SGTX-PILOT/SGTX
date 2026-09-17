// @ts-nocheck
/**
 * SGTX Phase 6 — §1 Global Payment Engine
 * ===========================================================================
 *
 * 12 payment methods covering every SGTX settlement path:
 *
 *   BANK_TRANSFER          — classic inter-bank credit transfer
 *   LOCAL_RAILS            — domestic ACH/RTGS/local rail (e.g. EG-ACH, US-FedACH)
 *   PSP                    — payment-service-provider card/wallet (Stripe/CargoX)
 *   OPEN_BANKING           — regulated open-banking API (EU PSD2, UK OBIE)
 *   SWIFT                  — SWIFT MT103 cross-border
 *   ISO_20022              — pacs.008 / pacs.009 structured CBPR+
 *   LOCAL_INSTANT          — instant domestic rails (UPI, Pix, PromptPay, IAP)
 *   DOCUMENTARY_COLLECTION — D/P, D/A trade-finance documentary flow
 *   LC                     — Letter of Credit settlement (sight/usance)
 *   BANK_GUARANTEE         — demand guarantee invocation
 *   STANDBY                — standby LC drawdown
 *   APPROVED_DEFERRED      — deferred-payment guarantee against approved buyer
 *
 * Lifecycle:
 *   PENDING → SUBMITTED → PROCESSING → SETTLED
 *                                  ↘ FAILED
 *                           ↗ CANCELLED (from PENDING/SUBMITTED only)
 *   SETTLED → REVERSED
 *   Any prior SETTLED with the same idempotencyKey → returned as DUPLICATE
 *
 * §10 duplicate detection: `initiatePayment` first calls
 * `detectDuplicatePayment(idempotencyKey)`. If a prior SETTLED payment exists
 * with the same key, the prior result is returned with `status: DUPLICATE`
 * (no new row created).
 *
 * All DB calls are try/catch-wrapped with safe defaults so the engine never
 * throws synchronously into API routes. Link references to existing models
 * (FeeLock, SettlementInstruction, PaymentAttempt) are preserved as string
 * fields — the new GlobalPayment layer BUILDS ON TOP of those, never
 * replaces them.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Constants ============

export const PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "LOCAL_RAILS",
  "PSP",
  "OPEN_BANKING",
  "SWIFT",
  "ISO_20022",
  "LOCAL_INSTANT",
  "DOCUMENTARY_COLLECTION",
  "LC",
  "BANK_GUARANTEE",
  "STANDBY",
  "APPROVED_DEFERRED",
] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "PROCESSING",
  "SETTLED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
  "DUPLICATE",
] as const;

export const RECONCILIATION_STATUSES = [
  "UNRECONCILED",
  "RECONCILED",
  "DISCREPANT",
] as const;

// ============ Types ============

export interface PaymentInput {
  ustn?: string;
  tradeId?: string;
  payerGtid: string;
  payeeGtid: string;
  paymentMethod: string;
  amountUsd: number;
  currency?: string;
  fxRate?: number;
  amountLocal?: number;
  payerBankBic?: string;
  payerAccount?: string;
  payeeBankBic?: string;
  payeeAccount?: string;
  pspName?: string;
  settlementStructure?: string;
  feeLockId?: string;
  settlementInstructionId?: string;
  /** Optional PaymentAttempt (legacy) link */
  paymentAttemptId?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface PaymentResult {
  ok: boolean;
  payment?: any;
  error?: string;
  /** true when initiatePayment detected an existing SETTLED duplicate */
  duplicate?: boolean;
}

export interface SplitPaymentInput {
  ustn?: string;
  tradeId?: string;
  payerGtid: string;
  totalAmountUsd: number;
  currency?: string;
  parts: Array<{
    payeeGtid: string;
    amountUsd: number;
    paymentMethod: string;
    description?: string;
  }>;
  idempotencyKey?: string;
}

// ============ §1.0 Pure helpers ============

/**
 * Generate a payment ID of the form `GP-YYYYMMDD-NNNNN` where NNNNN is a
 * 5-digit zero-padded random number. Pure (no DB, no side effects).
 */
export function generatePaymentId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `GP-${ymd}-${n}`;
}

/**
 * Generate a SWIFT MT103 / ISO 20022 pacs.008 style reference. Pure.
 * Format: `{MT|PACS}-{8 hex chars}-{6 base62}`.
 */
function generateRailReference(paymentMethod: string): string | null {
  if (paymentMethod === "SWIFT") {
    const hex = Math.random().toString(16).slice(2, 10).toUpperCase();
    const b62 = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();
    return `MT103-${hex}-${b62}`;
  }
  if (paymentMethod === "ISO_20022") {
    const hex = Math.random().toString(16).slice(2, 10).toUpperCase();
    const b62 = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();
    return `PACS008-${hex}-${b62}`;
  }
  return null;
}

function isValidPaymentMethod(m?: string | null): boolean {
  return !!m && (PAYMENT_METHODS as readonly string[]).includes(m);
}

/**
 * Compute processing fees per payment method. Pure (no DB, no side effects).
 *
 * Returns:
 *   processingFee — flat per-rail fee in USD
 *   fxSpread      — estimated FX spread cost in USD (0 if same-currency)
 *   totalFee      — processingFee + fxSpread
 *
 * Approximate schedule:
 *   SWIFT               ~$25  flat + 0.10% amount
 *   ISO_20022           ~$15  flat + 0.10% amount
 *   BANK_TRANSFER       ~$10  flat + 0.05% amount
 *   LOCAL_RAILS         ~$5   flat + 0.05% amount
 *   PSP                 ~2.9% + $0.30
 *   OPEN_BANKING        ~$1   flat + 0.05% amount
 *   LOCAL_INSTANT       ~$0.50 flat
 *   DOCUMENTARY_COLLECTION ~$75 flat + 0.05% amount
 *   LC                  ~0.125% of amount (min $100)
 *   BANK_GUARANTEE      ~0.10% of amount (min $50)
 *   STANDBY             ~0.10% of amount (min $75)
 *   APPROVED_DEFERRED   ~0.25% of amount (min $25)
 */
export function computePaymentFees(
  amountUsd: number,
  paymentMethod: string,
): { processingFee: number; fxSpread: number; totalFee: number } {
  const amt = Number(amountUsd) || 0;
  if (!isValidPaymentMethod(paymentMethod)) {
    return { processingFee: 0, fxSpread: 0, totalFee: 0 };
  }
  let processingFee = 0;
  let fxSpread = 0;
  switch (paymentMethod) {
    case "SWIFT":
      processingFee = 25 + amt * 0.001;
      fxSpread = amt * 0.003; // 0.3% FX spread on cross-border
      break;
    case "ISO_20022":
      processingFee = 15 + amt * 0.001;
      fxSpread = amt * 0.002;
      break;
    case "BANK_TRANSFER":
      processingFee = 10 + amt * 0.0005;
      fxSpread = amt * 0.0025;
      break;
    case "LOCAL_RAILS":
      processingFee = 5 + amt * 0.0005;
      fxSpread = 0; // local currency
      break;
    case "PSP":
      processingFee = 0.3 + amt * 0.029;
      fxSpread = 0;
      break;
    case "OPEN_BANKING":
      processingFee = 1 + amt * 0.0005;
      fxSpread = 0;
      break;
    case "LOCAL_INSTANT":
      processingFee = 0.5;
      fxSpread = 0;
      break;
    case "DOCUMENTARY_COLLECTION":
      processingFee = 75 + amt * 0.0005;
      fxSpread = amt * 0.0025;
      break;
    case "LC":
      processingFee = Math.max(100, amt * 0.00125);
      fxSpread = amt * 0.0025;
      break;
    case "BANK_GUARANTEE":
      processingFee = Math.max(50, amt * 0.001);
      fxSpread = 0;
      break;
    case "STANDBY":
      processingFee = Math.max(75, amt * 0.001);
      fxSpread = 0;
      break;
    case "APPROVED_DEFERRED":
      processingFee = Math.max(25, amt * 0.0025);
      fxSpread = 0;
      break;
    default:
      processingFee = 0;
      fxSpread = 0;
  }
  processingFee = +processingFee.toFixed(2);
  fxSpread = +fxSpread.toFixed(2);
  const totalFee = +(processingFee + fxSpread).toFixed(2);
  return { processingFee, fxSpread, totalFee };
}

// ============ §1.1 initiatePayment (with §10 duplicate detection) ============

/**
 * Initiate a payment. If `idempotencyKey` is provided AND a prior SETTLED
 * GlobalPayment with the same key exists, the prior row is returned with
 * `duplicate: true` (and a synthetic `status: DUPLICATE` in the result
 * envelope) — NO new row is created. Otherwise a new GlobalPayment row is
 * created with status=PENDING + initiatedAt=now.
 */
export async function initiatePayment(
  input: PaymentInput,
): Promise<PaymentResult> {
  if (!input?.payerGtid || !input?.payeeGtid) {
    return { ok: false, error: "payerGtid and payeeGtid are required" };
  }
  if (!isValidPaymentMethod(input.paymentMethod)) {
    return {
      ok: false,
      error: `Invalid paymentMethod: ${input.paymentMethod}`,
    };
  }
  if (!(Number(input.amountUsd) > 0)) {
    return { ok: false, error: "amountUsd must be positive" };
  }

  // §10 duplicate detection — if a prior SETTLED payment with the same
  // idempotencyKey exists, return the prior result without creating a new row.
  if (input.idempotencyKey) {
    try {
      const prior = await detectDuplicatePayment(input.idempotencyKey);
      if (prior) {
        logger.info("[payment-engine] duplicate detected (§10)", {
          idempotencyKey: input.idempotencyKey,
          priorPaymentId: prior.paymentId,
        });
        // Mark the returned row with DUPLICATE for caller transparency while
        // preserving the original row's underlying SETTLED status.
        const dupView = { ...prior, status: "DUPLICATE" };
        return { ok: true, payment: dupView, duplicate: true };
      }
    } catch (err) {
      logger.warn("[payment-engine] duplicate-check failed; continuing", {
        error: String(err),
        idempotencyKey: input.idempotencyKey,
      });
    }
  }

  const paymentId = generatePaymentId();
  const now = new Date();
  const data: any = {
    paymentId,
    payerGtid: input.payerGtid,
    payeeGtid: input.payeeGtid,
    paymentMethod: input.paymentMethod,
    amountUsd: +Number(input.amountUsd).toFixed(2),
    currency: input.currency || "USD",
    status: "PENDING",
    initiatedAt: now,
    reconciliationStatus: "UNRECONCILED",
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.tradeId) data.tradeId = input.tradeId;
  if (input.fxRate != null) data.fxRate = +Number(input.fxRate).toFixed(6);
  if (input.amountLocal != null)
    data.amountLocal = +Number(input.amountLocal).toFixed(2);
  if (input.payerBankBic) data.payerBankBic = input.payerBankBic;
  if (input.payerAccount) data.payerAccount = input.payerAccount;
  if (input.payeeBankBic) data.payeeBankBic = input.payeeBankBic;
  if (input.payeeAccount) data.payeeAccount = input.payeeAccount;
  if (input.pspName) data.pspName = input.pspName;
  if (input.settlementStructure)
    data.settlementStructure = input.settlementStructure;
  if (input.feeLockId) data.feeLockId = input.feeLockId;
  if (input.settlementInstructionId)
    data.settlementInstructionId = input.settlementInstructionId;
  if (input.paymentAttemptId) data.paymentAttemptId = input.paymentAttemptId;
  if (input.idempotencyKey) data.idempotencyKey = input.idempotencyKey;
  if (input.notes) data.notes = input.notes;

  try {
    const payment = await db.globalPayment.create({ data });
    logger.info("[payment-engine] payment initiated", {
      paymentId,
      method: input.paymentMethod,
      amount: data.amountUsd,
      payerGtid: input.payerGtid,
      payeeGtid: input.payeeGtid,
      ustn: input.ustn || null,
    });
    return { ok: true, payment, duplicate: false };
  } catch (err) {
    logger.error("[payment-engine] initiatePayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.2 submitPayment ============

/**
 * Transition a payment PENDING → SUBMITTED. For SWIFT/ISO_20022 methods,
 * generates a MT103 / pacs.008 reference and stores it in `paymentReference`.
 * Sets submittedAt=now.
 */
export async function submitPayment(
  paymentId: string,
): Promise<PaymentResult> {
  if (!paymentId) return { ok: false, error: "paymentId is required" };

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] submit lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (payment.status !== "PENDING") {
    return {
      ok: false,
      error: `cannot submit from status=${payment.status}`,
    };
  }

  const updateData: any = {
    status: "SUBMITTED",
    submittedAt: new Date(),
  };

  // SWIFT/ISO_20022 — generate rail reference (MT103 / pacs.008).
  if (payment.paymentMethod === "SWIFT" || payment.paymentMethod === "ISO_20022") {
    const ref = generateRailReference(payment.paymentMethod);
    if (ref) updateData.paymentReference = ref;
  }

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: updateData,
    });
    logger.info("[payment-engine] payment submitted", {
      paymentId,
      method: payment.paymentMethod,
      railReference: updateData.paymentReference || null,
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] submitPayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.3 processPayment ============

/**
 * Transition a payment SUBMITTED → PROCESSING. The rail has accepted the
 * message and is executing the debit/credit cycle.
 */
export async function processPayment(
  paymentId: string,
): Promise<PaymentResult> {
  if (!paymentId) return { ok: false, error: "paymentId is required" };

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] process lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (payment.status !== "SUBMITTED") {
    return {
      ok: false,
      error: `cannot process from status=${payment.status}`,
    };
  }

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: { status: "PROCESSING" },
    });
    logger.info("[payment-engine] payment processing", {
      paymentId,
      method: payment.paymentMethod,
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] processPayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.4 settlePayment ============

/**
 * Transition a payment PROCESSING → SETTLED. Sets settledAt + paymentReference
 * (the bank/PSP reference number from the rail). Sets reconciliationStatus to
 * UNRECONCILED (awaiting reconciliation by the matching engine).
 */
export async function settlePayment(
  paymentId: string,
  paymentReference: string,
): Promise<PaymentResult> {
  if (!paymentId)
    return { ok: false, error: "paymentId is required" };
  if (!paymentReference || !String(paymentReference).trim()) {
    return { ok: false, error: "paymentReference is required" };
  }

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] settle lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (payment.status !== "PROCESSING") {
    return {
      ok: false,
      error: `cannot settle from status=${payment.status}`,
    };
  }

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: {
        status: "SETTLED",
        settledAt: new Date(),
        paymentReference: String(paymentReference).trim(),
        reconciliationStatus: "UNRECONCILED",
      },
    });
    logger.info("[payment-engine] payment settled", {
      paymentId,
      method: payment.paymentMethod,
      paymentReference: String(paymentReference).trim(),
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] settlePayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.5 failPayment ============

/**
 * Transition a payment → FAILED. Sets failedAt + failureCode + failureReason.
 * Allowed from PENDING / SUBMITTED / PROCESSING (any pre-settlement state).
 */
export async function failPayment(
  paymentId: string,
  failureCode: string,
  failureReason: string,
): Promise<PaymentResult> {
  if (!paymentId) return { ok: false, error: "paymentId is required" };
  if (!failureCode) return { ok: false, error: "failureCode is required" };

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] fail lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (!["PENDING", "SUBMITTED", "PROCESSING"].includes(payment.status)) {
    return {
      ok: false,
      error: `cannot fail from status=${payment.status}`,
    };
  }

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureCode: failureCode.trim(),
        failureReason: failureReason || null,
      },
    });
    logger.info("[payment-engine] payment failed", {
      paymentId,
      failureCode,
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] failPayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.6 cancelPayment ============

/**
 * Transition a payment → CANCELLED. Allowed from PENDING or SUBMITTED only.
 * Once a payment has been PROCESSING or SETTLED it cannot be cancelled — it
 * must be reversed or disputed instead.
 */
export async function cancelPayment(
  paymentId: string,
  reason: string,
): Promise<PaymentResult> {
  if (!paymentId) return { ok: false, error: "paymentId is required" };

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] cancel lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (!["PENDING", "SUBMITTED"].includes(payment.status)) {
    return {
      ok: false,
      error: `cannot cancel from status=${payment.status}`,
    };
  }

  const existingNotes = payment.notes || "";
  const cancelNote = `[CANCELLED ${new Date().toISOString()}] ${reason || ""}`;
  const mergedNotes = existingNotes
    ? `${existingNotes}\n${cancelNote}`
    : cancelNote;

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: {
        status: "CANCELLED",
        failedAt: new Date(),
        failureReason: reason || null,
        failureCode: "CANCELLED",
        notes: mergedNotes,
      },
    });
    logger.info("[payment-engine] payment cancelled", {
      paymentId,
      reason: reason || null,
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] cancelPayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.7 reversePayment ============

/**
 * Reverse a SETTLED payment. Sets status=REVERSED + records the reversal
 * reason in notes (with timestamp). Allowed only from SETTLED — partial
 * reversals are not supported at this layer (handled by the reconciliation
 * engine if needed).
 */
export async function reversePayment(
  paymentId: string,
  reason: string,
): Promise<PaymentResult> {
  if (!paymentId) return { ok: false, error: "paymentId is required" };

  let payment: any = null;
  try {
    payment = await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] reverse lookup failed", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
  if (!payment) return { ok: false, error: `payment not found: ${paymentId}` };

  if (payment.status !== "SETTLED") {
    return {
      ok: false,
      error: `can only reverse SETTLED payments; current status=${payment.status}`,
    };
  }

  const existingNotes = payment.notes || "";
  const reverseNote = `[REVERSED ${new Date().toISOString()}] ${reason || ""}`;
  const mergedNotes = existingNotes
    ? `${existingNotes}\n${reverseNote}`
    : reverseNote;

  try {
    const updated = await db.globalPayment.update({
      where: { paymentId },
      data: {
        status: "REVERSED",
        reconciliationStatus: "DISCREPANT",
        notes: mergedNotes,
      },
    });
    logger.info("[payment-engine] payment reversed", {
      paymentId,
      reason: reason || null,
    });
    return { ok: true, payment: updated };
  } catch (err) {
    logger.error("[payment-engine] reversePayment DB error", {
      error: String(err),
      paymentId,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §1.8 / §1.9 getters ============

/** Get a GlobalPayment row by its database id. */
export async function getPayment(id: string): Promise<any | null> {
  if (!id) return null;
  try {
    return await db.globalPayment.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[payment-engine] getPayment failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

/** Get a GlobalPayment row by its business paymentId (GP-YYYYMMDD-NNNNN). */
export async function getPaymentByPaymentId(
  paymentId: string,
): Promise<any | null> {
  if (!paymentId) return null;
  try {
    return await db.globalPayment.findUnique({ where: { paymentId } });
  } catch (err) {
    logger.error("[payment-engine] getPaymentByPaymentId failed", {
      error: String(err),
      paymentId,
    });
    return null;
  }
}

// ============ §1.10 listPayments ============

/**
 * List payments with optional filters. Returns an array (empty on error).
 */
export async function listPayments(filters?: {
  ustn?: string;
  payerGtid?: string;
  payeeGtid?: string;
  paymentMethod?: string;
  status?: string;
  reconciliationStatus?: string;
}): Promise<any[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.payerGtid) where.payerGtid = filters.payerGtid;
  if (filters?.payeeGtid) where.payeeGtid = filters.payeeGtid;
  if (filters?.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters?.status) where.status = filters.status;
  if (filters?.reconciliationStatus)
    where.reconciliationStatus = filters.reconciliationStatus;

  try {
    const rows = await db.globalPayment.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return rows || [];
  } catch (err) {
    logger.error("[payment-engine] listPayments failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §1.11 detectDuplicatePayment ============

/**
 * §10 duplicate detection. Returns the prior SETTLED GlobalPayment with the
 * given idempotencyKey, or null if none exists.
 *
 * NOTE: only SETTLED payments are considered duplicates. A PENDING or
 * PROCESSING payment with the same key is NOT a duplicate (caller should
 * retrieve and continue the existing flow instead).
 */
export async function detectDuplicatePayment(
  idempotencyKey: string,
): Promise<any | null> {
  if (!idempotencyKey) return null;
  try {
    const prior = await db.globalPayment.findFirst({
      where: {
        idempotencyKey,
        status: "SETTLED",
      },
      orderBy: { settledAt: "desc" },
    });
    return prior || null;
  } catch (err) {
    logger.error("[payment-engine] detectDuplicatePayment failed", {
      error: String(err),
      idempotencyKey,
    });
    return null;
  }
}

// ============ §1.12 getPaymentsByUstn ============

/** All GlobalPayment rows linked to a given USTN. */
export async function getPaymentsByUstn(ustn: string): Promise<any[]> {
  if (!ustn) return [];
  try {
    return await db.globalPayment.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
  } catch (err) {
    logger.error("[payment-engine] getPaymentsByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §1.14 splitPayment ============

/**
 * Split one logical payment into N parts (e.g. 50% seller / 30% broker /
 * 20% carrier). Each part gets its own GlobalPayment row with its own
 * paymentId but shares the same `ustn` + a split-correlation envelope
 * stored in `notes` (JSON) so the parts can be reconstructed later.
 *
 * Returns a PaymentResult per part. If any part fails, the corresponding
 * result entry has `ok: false`.
 */
export async function splitPayment(
  input: SplitPaymentInput,
): Promise<PaymentResult[]> {
  if (!input?.payerGtid) {
    return [{ ok: false, error: "payerGtid is required" }];
  }
  if (!Array.isArray(input.parts) || input.parts.length === 0) {
    return [{ ok: false, error: "parts must be a non-empty array" }];
  }

  // Sanity check: total of parts should equal totalAmountUsd (warn if not).
  const partsTotal = input.parts.reduce(
    (s, p) => s + (Number(p.amountUsd) || 0),
    0,
  );
  if (input.totalAmountUsd > 0) {
    const drift = Math.abs(partsTotal - input.totalAmountUsd);
    if (drift > 0.01) {
      logger.warn("[payment-engine] splitPayment total drift", {
        totalAmountUsd: input.totalAmountUsd,
        partsTotal,
        drift,
      });
    }
  }

  // Parts are linked by a shared correlation token stored in the notes JSON
  // envelope of every part row. We synthesize a parentPaymentId reference by
  // pointing each part's notes at the correlationId — no separate parent
  // row is created (the spec explicitly allows `notes` JSON for the parent
  // link).
  const correlationId = `SPLIT-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
  const results: PaymentResult[] = [];

  for (let i = 0; i < input.parts.length; i++) {
    const part = input.parts[i];
    if (!isValidPaymentMethod(part.paymentMethod)) {
      results.push({
        ok: false,
        error: `Invalid paymentMethod for part ${i + 1}: ${part.paymentMethod}`,
      });
      continue;
    }
    if (!(Number(part.amountUsd) > 0)) {
      results.push({
        ok: false,
        error: `Part ${i + 1} amountUsd must be positive`,
      });
      continue;
    }

    const notesEnvelope: any = {
      parentPaymentId: correlationId,
      splitCorrelationId: correlationId,
      splitIndex: i + 1,
      splitTotalParts: input.parts.length,
      splitTotalAmountUsd: +Number(input.totalAmountUsd || partsTotal).toFixed(2),
      description: part.description || null,
    };
    const notesJson = JSON.stringify(notesEnvelope);

    const partInput: PaymentInput = {
      ustn: input.ustn,
      tradeId: input.tradeId,
      payerGtid: input.payerGtid,
      payeeGtid: part.payeeGtid,
      paymentMethod: part.paymentMethod,
      amountUsd: part.amountUsd,
      currency: input.currency,
      notes: notesJson,
      idempotencyKey: input.idempotencyKey
        ? `${input.idempotencyKey}#${i + 1}`
        : undefined,
    };

    try {
      const res = await initiatePayment(partInput);
      results.push(res);
    } catch (err) {
      logger.error("[payment-engine] splitPayment part failed", {
        error: String(err),
        index: i + 1,
        payeeGtid: part.payeeGtid,
      });
      results.push({ ok: false, error: String(err) });
    }
  }

  logger.info("[payment-engine] splitPayment complete", {
    correlationId,
    partCount: input.parts.length,
    okCount: results.filter((r) => r.ok).length,
  });

  return results;
}
