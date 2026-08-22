// @ts-nocheck
/**
 * SGTX Add-On 20 — Trade Finance Documentation (documents layer)
 * ===========================================================================
 *
 * Manages trade-finance documents attached to a shipment (USTN): Letters of
 * Credit, Bank Guarantees, Bills of Exchange, Promissory Notes, Bills of
 * Lading (finance-grade), etc. Documents are issued by a bank
 * (issuingBankGtid) in favour of a beneficiary (beneficiaryGtid) and may
 * cover a financing agreement (financingAgreementId).
 *
 * Lifecycle (status):
 *   PENDING   → document created, awaiting bank/beneficiary submission
 *   SUBMITTED → issuer submitted, awaiting verification
 *   VERIFIED  → document cryptographically + structurally verified
 *   REJECTED  → verification failed (issuer notified)
 *
 * Verification is intentionally lightweight here: structural validation of
 * required fields + a (future) cryptographic signature check. Real SWIFT
 * MT7xx message parsing and signature verification is delegated to the
 * financing module's adapter layer when wired.
 *
 * Models:
 *   db.tradeFinanceDocument — single table
 *
 * NOTE: This module was previously `trade-finance/index.ts`. The Phase 6
 * trade-finance CASE lifecycle now lives in `./index.ts` (TradeFinanceCase
 * model). This file preserves the trade-finance DOCUMENT functionality.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type TradeFinanceDocumentType =
  | "LETTER_OF_CREDIT"
  | "BANK_GUARANTEE"
  | "BILL_OF_EXCHANGE"
  | "PROMISSORY_NOTE"
  | "STANDBY_LC"
  | "DOCUMENTARY_COLLECTION"
  | "BILL_OF_LADING_FINANCE"
  | "AVALISED_INVOICE"
  | "OTHER";

export type TradeFinanceDocumentStatus =
  | "PENDING"
  | "SUBMITTED"
  | "VERIFIED"
  | "REJECTED";

export interface CreateTradeFinanceDocumentInput {
  ustn?: string | null;
  financingAgreementId?: string | null;
  documentType: string;
  documentReference?: string | null;
  issuingBankGtid?: string | null;
  beneficiaryGtid?: string | null;
  amount?: number | null;
  currency?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  documentUrl?: string | null;
  status?: string;
}

export interface VerifyDocumentInput {
  documentId: string;
  /** Optional override status — defaults to VERIFIED. Use 'REJECTED' to mark
   *  verification failure. */
  newStatus?: "VERIFIED" | "REJECTED";
  /** Optional note explaining the verification outcome. */
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Create a trade-finance document row. Throws on validation / DB failure. */
export async function createTradeFinanceDocument(input: CreateTradeFinanceDocumentInput) {
  if (!input.documentType?.trim()) {
    throw new Error("documentType is required");
  }

  const data: any = {
    documentType: input.documentType.trim(),
    status: input.status || "PENDING",
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.financingAgreementId) data.financingAgreementId = input.financingAgreementId;
  if (input.documentReference) data.documentReference = input.documentReference;
  if (input.issuingBankGtid) data.issuingBankGtid = input.issuingBankGtid;
  if (input.beneficiaryGtid) data.beneficiaryGtid = input.beneficiaryGtid;
  if (input.amount != null && !isNaN(Number(input.amount))) {
    data.amount = +Number(input.amount).toFixed(2);
  }
  if (input.currency) data.currency = input.currency;
  if (input.validFrom) data.validFrom = new Date(input.validFrom);
  if (input.validTo) data.validTo = new Date(input.validTo);
  if (input.documentUrl) data.documentUrl = input.documentUrl;

  try {
    const doc = await (db as any).tradeFinanceDocument.create({ data });
    logger.info("[trade-finance-doc] document created", {
      docId: doc.id,
      documentType: data.documentType,
      ustn: input.ustn || null,
    });
    return doc;
  } catch (err) {
    logger.error("[trade-finance-doc] create failed", {
      error: String(err),
      documentType: data.documentType,
    });
    throw err;
  }
}

/** List trade-finance documents attached to a shipment (by USTN). */
export async function listTradeFinanceDocuments(ustn: string) {
  if (!ustn) return [];
  try {
    const rows = await (db as any).tradeFinanceDocument.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return rows || [];
  } catch (err) {
    logger.error("[trade-finance-doc] list failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/** Verify (or reject) a trade-finance document. Returns the updated row or
 *  throws if the document is not found or is already in a terminal state. */
export async function verifyTradeFinanceDocument(input: VerifyDocumentInput) {
  if (!input.documentId) {
    throw new Error("documentId is required");
  }
  const newStatus: string = input.newStatus || "VERIFIED";
  if (newStatus !== "VERIFIED" && newStatus !== "REJECTED") {
    throw new Error(`Invalid newStatus: ${newStatus}`);
  }

  let existing: any = null;
  try {
    existing = await (db as any).tradeFinanceDocument.findUnique({
      where: { id: input.documentId },
    });
  } catch (err) {
    logger.error("[trade-finance-doc] lookup failed", {
      error: String(err),
      documentId: input.documentId,
    });
    throw err;
  }

  if (!existing) {
    throw new Error(`document not found: ${input.documentId}`);
  }

  // Idempotency: re-verifying a VERIFIED doc is a no-op (returns current row).
  if (existing.status === newStatus) {
    return existing;
  }

  try {
    const updated = await (db as any).tradeFinanceDocument.update({
      where: { id: input.documentId },
      data: { status: newStatus },
    });
    logger.info("[trade-finance-doc] document verified", {
      docId: input.documentId,
      newStatus,
      note: input.note || null,
    });
    return updated;
  } catch (err) {
    logger.error("[trade-finance-doc] update failed", {
      error: String(err),
      documentId: input.documentId,
    });
    throw err;
  }
}
