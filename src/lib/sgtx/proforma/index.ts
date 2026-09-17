// @ts-nocheck
/**
 * SGTX v13.1 — Article 129 E2E Trade Workflow — Stage 3: Proforma Invoice
 * ===========================================================================
 *
 * Implements the seller-issued proforma invoice — a pre-contract document
 * that itemises the offered goods, prices, and terms. The buyer accepts
 * (triggering contract generation) or rejects. Once accepted, the proforma
 * can be converted to a final commercial Invoice.
 *
 * Lifecycle:
 *
 *   seller.createProforma()  ──▶ PROFORMA:DRAFT
 *   seller.sendProforma()    ──▶ PROFORMA:SENT
 *   buyer.acceptProforma()    ──▶ PROFORMA:ACCEPTED (contract gen triggered)
 *   seller.convertToInvoice() ──▶ PROFORMA:CONVERTED + creates Invoice row
 *
 * Number format: PI-{USTN-suffix-6}-{YYYYMMDD}-{random4}
 *
 * All DB calls are try/catch-wrapped.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Constants ============

export const PROFORMA_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
] as const;

// ============ Types ============

export interface ProformaItem {
  description: string;
  hsCode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  taxRate?: number;
  taxAmount?: number;
  [key: string]: unknown;
}

export interface BankDetails {
  bankName?: string;
  swift?: string;
  account?: string;
  iban?: string;
  [key: string]: unknown;
}

export interface CreateProformaInput {
  ustn: string;
  tradeId: string;
  sellerGtid: string;
  buyerGtid: string;
  items: ProformaItem[] | string;
  currency?: string;
  incoterm: string;
  validUntil?: Date | string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  bankDetails?: BankDetails | string | null;
  taxAmount?: number;
}

export interface ProformaRow {
  id: string;
  ustn: string;
  tradeId: string;
  proformaNumber: string;
  sellerGtid: string;
  buyerGtid: string;
  issueDate: Date;
  validUntil: Date | null;
  items: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  incoterm: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  bankDetails: string | null;
  status: string;
  convertedToInvoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Helpers ============

function serializeItems(items: ProformaItem[] | string): string {
  if (typeof items === "string") return items;
  try {
    return JSON.stringify(items);
  } catch {
    return JSON.stringify([]);
  }
}

function parseItems(items: string): ProformaItem[] {
  if (!items) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeSubtotal(items: ProformaItem[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce(
    (sum, it) =>
      sum + (typeof it.totalPrice === "number" ? it.totalPrice : 0),
    0,
  );
}

function computeTax(items: ProformaItem[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, it) => {
    if (typeof it.taxAmount === "number") return sum + it.taxAmount;
    if (typeof it.taxRate === "number" && typeof it.totalPrice === "number") {
      return sum + (it.totalPrice * it.taxRate) / 100;
    }
    return sum;
  }, 0);
}

function serializeBankDetails(
  bankDetails: BankDetails | string | null | undefined,
): string | null {
  if (!bankDetails) return null;
  if (typeof bankDetails === "string") return bankDetails;
  try {
    return JSON.stringify(bankDetails);
  } catch {
    return null;
  }
}

function randomSuffix(len: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function ustnSuffix(ustn: string): string {
  if (!ustn) return "XXXXXX";
  const cleaned = ustn.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length >= 6) return cleaned.slice(-6).toUpperCase();
  return cleaned.toUpperCase().padEnd(6, "X");
}

function generateProformaNumber(ustn: string): string {
  const datePart = yyyymmdd(new Date());
  return `PI-${ustnSuffix(ustn)}-${datePart}-${randomSuffix(4)}`;
}

// ============ Public API ============

export async function createProforma(
  input: CreateProformaInput,
): Promise<ProformaRow | null> {
  if (!input?.ustn || !input?.tradeId || !input?.sellerGtid || !input?.buyerGtid) {
    logger.warn("[proforma/create] missing required input", { input });
    return null;
  }
  if (!input.incoterm) {
    logger.warn("[proforma/create] incoterm required", { input });
    return null;
  }
  try {
    const itemsArr =
      typeof input.items === "string"
        ? parseItems(input.items)
        : Array.isArray(input.items)
          ? input.items
          : [];
    const itemsJson = serializeItems(itemsArr);
    const subtotal = computeSubtotal(itemsArr);
    const taxAmount =
      typeof input.taxAmount === "number"
        ? input.taxAmount
        : computeTax(itemsArr);
    const totalAmount = subtotal + taxAmount;

    let validUntil: Date | null = null;
    if (input.validUntil) {
      try {
        validUntil =
          input.validUntil instanceof Date
            ? input.validUntil
            : new Date(input.validUntil as string);
        if (isNaN(validUntil.getTime())) validUntil = null;
      } catch {
        validUntil = null;
      }
    }

    let created = null;
    let attempt = 0;
    while (attempt < 3 && !created) {
      attempt++;
      const proformaNumber = generateProformaNumber(input.ustn);
      try {
        created = await db.proformaInvoice.create({
          data: {
            ustn: input.ustn,
            tradeId: input.tradeId,
            proformaNumber,
            sellerGtid: input.sellerGtid,
            buyerGtid: input.buyerGtid,
            validUntil,
            items: itemsJson,
            subtotal,
            taxAmount,
            totalAmount,
            currency: input.currency || "USD",
            incoterm: input.incoterm,
            paymentTerms: input.paymentTerms || null,
            deliveryTerms: input.deliveryTerms || null,
            bankDetails: serializeBankDetails(input.bankDetails),
            status: "DRAFT",
            convertedToInvoiceId: null,
          },
        });
      } catch (e: any) {
        if (attempt >= 3) throw e;
      }
    }
    if (!created) {
      logger.error("[proforma/create] failed after 3 attempts", {
        ustn: input.ustn,
      });
      return null;
    }
    logger.info("[proforma/create] created", {
      id: created.id,
      proformaNumber: created.proformaNumber,
    });
    return created as ProformaRow;
  } catch (e: any) {
    logger.error("[proforma/create] failed", {
      ustn: input?.ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function getProforma(id: string): Promise<ProformaRow | null> {
  if (!id) return null;
  try {
    const row = await db.proformaInvoice.findUnique({ where: { id } });
    return (row as ProformaRow) || null;
  } catch (e: any) {
    logger.error("[proforma/get] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function listProformas(filter?: {
  ustn?: string;
  sellerGtid?: string;
  buyerGtid?: string;
  status?: string;
}): Promise<ProformaRow[]> {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.sellerGtid) where.sellerGtid = filter.sellerGtid;
    if (filter?.buyerGtid) where.buyerGtid = filter.buyerGtid;
    if (filter?.status) where.status = filter.status;
    const rows = await db.proformaInvoice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows || []) as ProformaRow[];
  } catch (e: any) {
    logger.error("[proforma/list] failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * DRAFT → SENT (seller transmits to buyer).
 */
export async function sendProforma(id: string): Promise<ProformaRow | null> {
  if (!id) return null;
  try {
    const existing = await db.proformaInvoice.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "DRAFT") {
      return existing as ProformaRow;
    }
    const updated = await db.proformaInvoice.update({
      where: { id },
      data: { status: "SENT" },
    });
    logger.info("[proforma/send] sent", {
      id,
      proformaNumber: updated.proformaNumber,
    });
    return updated as ProformaRow;
  } catch (e: any) {
    logger.error("[proforma/send] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * SENT → ACCEPTED (buyer accepts; this is the formal trigger for
 * contract generation downstream). The trade's status is NOT mutated
 * here — that's the contract generator's responsibility.
 */
export async function acceptProforma(id: string): Promise<ProformaRow | null> {
  if (!id) return null;
  try {
    const existing = await db.proformaInvoice.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "SENT") {
      return existing as ProformaRow;
    }
    const updated = await db.proformaInvoice.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });
    logger.info("[proforma/accept] accepted", {
      id,
      proformaNumber: updated.proformaNumber,
    });
    return updated as ProformaRow;
  } catch (e: any) {
    logger.error("[proforma/accept] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Reject a SENT proforma.
 */
export async function rejectProforma(id: string): Promise<ProformaRow | null> {
  if (!id) return null;
  try {
    const existing = await db.proformaInvoice.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "SENT") {
      return existing as ProformaRow;
    }
    const updated = await db.proformaInvoice.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return updated as ProformaRow;
  } catch (e: any) {
    logger.error("[proforma/reject] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * ACCEPTED → CONVERTED. Creates a matching final Invoice row and links
 * the proforma to it via `convertedToInvoiceId`. Defensive — if the
 * Invoice table is missing or the create fails, the proforma stays in
 * ACCEPTED and `convertedToInvoiceId` remains null.
 */
export async function convertToInvoice(
  id: string,
): Promise<{ proforma: ProformaRow | null; invoice: any | null }> {
  if (!id) return { proforma: null, invoice: null };
  try {
    const existing = await db.proformaInvoice.findUnique({ where: { id } });
    if (!existing) {
      logger.warn("[proforma/convert] not found", { id });
      return { proforma: null, invoice: null };
    }
    if (existing.status !== "ACCEPTED") {
      logger.warn("[proforma/convert] not in ACCEPTED", {
        id,
        status: existing.status,
      });
      return { proforma: existing as ProformaRow, invoice: null };
    }
    if (existing.convertedToInvoiceId) {
      // Idempotent — already converted. Fetch + return the existing Invoice.
      try {
        const existingInvoice = await db.invoice.findUnique({
          where: { id: existing.convertedToInvoiceId },
        });
        if (existingInvoice) {
          return {
            proforma: existing as ProformaRow,
            invoice: existingInvoice,
          };
        }
      } catch {
        // fall through + try to create a new Invoice
      }
    }

    // Generate the final Invoice number.
    const invoiceNumber = `INV-${existing.proformaNumber}`;
    let invoice: any = null;
    try {
      invoice = await db.invoice.create({
        data: {
          tradeId: existing.tradeId,
          type: "COMMERCIAL",
          number: invoiceNumber,
          invoiceNumber,
          amountUsd: existing.totalAmount,
          currency: existing.currency,
          status: "PENDING",
          payerGtid: existing.buyerGtid,
          payeeGtid: existing.sellerGtid,
          dueDate: existing.validUntil,
        },
      });
    } catch (e: any) {
      logger.error("[proforma/convert] invoice creation failed", {
        id,
        error: e?.message,
      });
      return { proforma: existing as ProformaRow, invoice: null };
    }

    const updated = await db.proformaInvoice.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedToInvoiceId: invoice.id,
      },
    });
    logger.info("[proforma/convert] converted", {
      id,
      proformaNumber: updated.proformaNumber,
      invoiceId: invoice.id,
    });
    return { proforma: updated as ProformaRow, invoice };
  } catch (e: any) {
    logger.error("[proforma/convert] failed", {
      id,
      error: e?.message || String(e),
    });
    return { proforma: null, invoice: null };
  }
}
