// SGTX Add-On 25 — Payment Guarantee Confirmation
// ===========================================================================
//
// Manages bank-issued payment guarantees attached to a shipment: bank
// guarantees, standby LCs, advance payment guarantees, performance bonds,
// etc. Each guarantee is issued by a bank (issuingBankGtid) in favour of the
// shipment's beneficiary, covers a specified amount + currency, and has an
// optional validity window.
//
// Lifecycle:
//   1. create    → row created with confirmed=false (default status "ISSUED")
//   2. confirm   → bank confirmation received (MT760 / MT799 / SWIFT
//                  acknowledgement); confirmed=true, confirmedAt=now,
//                  confirmationMethod + confirmationReference recorded.
//
// Guarantees that are NOT confirmed by their validTo date are considered
// lapsed — a separate cron (out of scope here) sweeps the table.
//
// Models:
//   db.paymentGuarantee — single table

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentGuaranteeType =
  | "ADVANCE_PAYMENT_GUARANTEE"
  | "PERFORMANCE_BOND"
  | "STANDBY_LC"
  | "BANK_GUARANTEE"
  | "WARRANTY_GUARANTEE"
  | "RETENTION_GUARANTEE"
  | "OTHER";

export interface CreatePaymentGuaranteeInput {
  ustn?: string | null;
  guaranteeType: string;
  guaranteeReference?: string | null;
  issuingBankGtid?: string | null;
  amount: number;
  currency?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
}

export interface ConfirmPaymentGuaranteeInput {
  guaranteeId: string;
  confirmationMethod?: string;
  confirmationReference?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Create a payment guarantee row. Throws on validation failure. */
export async function createPaymentGuarantee(input: CreatePaymentGuaranteeInput) {
  if (!input.guaranteeType?.trim()) {
    throw new Error("guaranteeType is required");
  }
  const amount = Number(input.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  const data: any = {
    guaranteeType: input.guaranteeType.trim(),
    amount: +amount.toFixed(2),
    confirmed: false,
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.guaranteeReference) data.guaranteeReference = input.guaranteeReference;
  if (input.issuingBankGtid) data.issuingBankGtid = input.issuingBankGtid;
  if (input.currency) data.currency = input.currency;
  if (input.validFrom) data.validFrom = new Date(input.validFrom);
  if (input.validTo) data.validTo = new Date(input.validTo);

  const guarantee = await (db as any).paymentGuarantee.create({ data });
  logger.info("[payment-guarantee] created", {
    guaranteeId: guarantee.id,
    guaranteeType: data.guaranteeType,
    ustn: input.ustn || null,
    amount: data.amount,
  });
  return guarantee;
}

/** Confirm a payment guarantee (confirmed=true, confirmedAt=now).
 *  - Idempotent: re-confirming an already-confirmed guarantee is a no-op.
 *  - Throws if the guarantee is not found. */
export async function confirmPaymentGuarantee(input: ConfirmPaymentGuaranteeInput) {
  if (!input.guaranteeId) {
    throw new Error("guaranteeId is required");
  }

  const existing = await (db as any).paymentGuarantee.findUnique({
    where: { id: input.guaranteeId },
  });
  if (!existing) {
    throw new Error(`payment guarantee not found: ${input.guaranteeId}`);
  }

  if (existing.confirmed) {
    return { ...existing, idempotent: true };
  }

  const data: any = {
    confirmed: true,
    confirmedAt: new Date(),
  };
  if (input.confirmationMethod) data.confirmationMethod = input.confirmationMethod;
  if (input.confirmationReference) data.confirmationReference = input.confirmationReference;

  const updated = await (db as any).paymentGuarantee.update({
    where: { id: input.guaranteeId },
    data,
  });

  logger.info("[payment-guarantee] confirmed", {
    guaranteeId: input.guaranteeId,
    method: input.confirmationMethod || null,
  });
  return updated;
}

/** Get the latest payment guarantee status for a shipment (by USTN).
 *  Returns { guarantees, count, latestConfirmedAt }. */
export async function getPaymentGuaranteeStatus(ustn: string) {
  if (!ustn) return { guarantees: [], count: 0, latestConfirmedAt: null };
  const rows = await (db as any).paymentGuarantee.findMany({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  });
  const confirmed = (rows || []).filter((r: any) => r.confirmed && r.confirmedAt);
  const latestConfirmedAt =
    confirmed.length > 0
      ? confirmed
          .map((r: any) => (r.confirmedAt instanceof Date ? r.confirmedAt.toISOString() : r.confirmedAt))
          .sort()
          .reverse()[0]
      : null;
  return {
    guarantees: rows || [],
    count: (rows || []).length,
    latestConfirmedAt,
  };
}
