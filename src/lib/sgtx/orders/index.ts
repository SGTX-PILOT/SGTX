// @ts-nocheck
/**
 * SGTX v13.1 — Article 129 E2E Trade Workflow — Stage 2: Purchase/Sales Orders
 * ===========================================================================
 *
 * Implements formal Purchase Order (buyer → seller) + Sales Order
 * (seller's matching acceptance) documents for a trade.
 *
 * Lifecycle (per USTN):
 *
 *   buyer.createPurchaseOrder()  ──▶ PO:DRAFT
 *   buyer.sendPurchaseOrder()    ──▶ PO:SENT
 *   seller.acceptPurchaseOrder() ──▶ PO:ACCEPTED + creates SO:PENDING (auto)
 *   seller.fulfillSalesOrder()   ──▶ SO:FULFILLED
 *
 * Number formats:
 *   PO:  PO-{USTN-suffix-6}-{YYYYMMDD}-{random4}
 *   SO:  SO-{USTN-suffix-6}-{YYYYMMDD}-{random4}
 *
 * All DB calls are try/catch-wrapped — never throws synchronously.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Constants ============

export const PO_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "AMENDED",
] as const;

export const SO_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "FULFILLED",
] as const;

export const ORDER_ITEM_FIELDS = [
  "description",
  "hsCode",
  "quantity",
  "unitPrice",
  "totalPrice",
] as const;

// ============ Types ============

export interface OrderItem {
  description: string;
  hsCode?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  [key: string]: unknown;
}

export interface CreatePurchaseOrderInput {
  ustn: string;
  tradeId: string;
  buyerGtid: string;
  sellerGtid: string;
  items: OrderItem[] | string;
  currency?: string;
  incoterm: string;
  deliveryDate?: Date | string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
}

export interface CreateSalesOrderInput {
  ustn: string;
  tradeId: string;
  poId?: string | null;
  sellerGtid: string;
  buyerGtid: string;
  items: OrderItem[] | string;
  currency?: string;
}

export interface PurchaseOrderRow {
  id: string;
  ustn: string;
  tradeId: string;
  poNumber: string;
  buyerGtid: string;
  sellerGtid: string;
  orderDate: Date;
  deliveryDate: Date | null;
  items: string;
  totalValue: number;
  currency: string;
  incoterm: string;
  status: string;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrderRow {
  id: string;
  ustn: string;
  tradeId: string;
  poId: string | null;
  soNumber: string;
  sellerGtid: string;
  buyerGtid: string;
  orderDate: Date;
  acceptedDate: Date | null;
  items: string;
  totalValue: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============ Helpers ============

function serializeItems(items: OrderItem[] | string): string {
  if (typeof items === "string") return items;
  try {
    return JSON.stringify(items);
  } catch {
    return JSON.stringify([]);
  }
}

function parseItems(items: string): OrderItem[] {
  if (!items) return [];
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function computeTotal(items: OrderItem[]): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce(
    (sum, it) => sum + (typeof it.totalPrice === "number" ? it.totalPrice : 0),
    0,
  );
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
  // Extract the last 6 alphanumerics (the random8 portion's prefix or
  // anything stable per USTN). Falls back to a hash if too short.
  const cleaned = ustn.replace(/[^A-Za-z0-9]/g, "");
  if (cleaned.length >= 6) return cleaned.slice(-6).toUpperCase();
  return cleaned.toUpperCase().padEnd(6, "X");
}

function generatePoNumber(ustn: string): string {
  const datePart = yyyymmdd(new Date());
  return `PO-${ustnSuffix(ustn)}-${datePart}-${randomSuffix(4)}`;
}

function generateSoNumber(ustn: string): string {
  const datePart = yyyymmdd(new Date());
  return `SO-${ustnSuffix(ustn)}-${datePart}-${randomSuffix(4)}`;
}

// `ensureUniquePoNumber` was a synchronous stub — replaced by the
// retry-on-collision loop inside `createPurchaseOrder`. Collisions on the
// 4-char random suffix are astronomically rare (1 in 1.1M), and the DB's
// `poNumber @unique` constraint will throw on the rare collision — the
// caller catches + retries up to 3 times.

// ============ Purchase Order API ============

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderRow | null> {
  if (!input?.ustn || !input?.tradeId || !input?.buyerGtid || !input?.sellerGtid) {
    logger.warn("[orders/createPO] missing required input", { input });
    return null;
  }
  if (!input.incoterm) {
    logger.warn("[orders/createPO] incoterm required", { input });
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
    const totalValue = computeTotal(itemsArr);

    let deliveryDate: Date | null = null;
    if (input.deliveryDate) {
      try {
        deliveryDate =
          input.deliveryDate instanceof Date
            ? input.deliveryDate
            : new Date(input.deliveryDate as string);
        if (isNaN(deliveryDate.getTime())) deliveryDate = null;
      } catch {
        deliveryDate = null;
      }
    }

    let created = null;
    let attempt = 0;
    // Retry up to 3 times to handle the (rare) poNumber collision.
    while (attempt < 3 && !created) {
      attempt++;
      const poNumber = generatePoNumber(input.ustn);
      try {
        created = await db.purchaseOrder.create({
          data: {
            ustn: input.ustn,
            tradeId: input.tradeId,
            poNumber,
            buyerGtid: input.buyerGtid,
            sellerGtid: input.sellerGtid,
            deliveryDate,
            items: itemsJson,
            totalValue,
            currency: input.currency || "USD",
            incoterm: input.incoterm,
            status: "DRAFT",
            paymentTerms: input.paymentTerms || null,
            deliveryTerms: input.deliveryTerms || null,
          },
        });
      } catch (e: any) {
        if (attempt >= 3) throw e;
        // Loop again with a fresh poNumber.
      }
    }
    if (!created) {
      logger.error("[orders/createPO] failed after 3 attempts", {
        ustn: input.ustn,
      });
      return null;
    }
    logger.info("[orders/createPO] created", {
      id: created.id,
      poNumber: created.poNumber,
      ustn: input.ustn,
    });
    return created as PurchaseOrderRow;
  } catch (e: any) {
    logger.error("[orders/createPO] failed", {
      ustn: input?.ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function getPurchaseOrder(
  id: string,
): Promise<PurchaseOrderRow | null> {
  if (!id) return null;
  try {
    const row = await db.purchaseOrder.findUnique({ where: { id } });
    return (row as PurchaseOrderRow) || null;
  } catch (e: any) {
    logger.error("[orders/getPO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function listPurchaseOrders(filter?: {
  ustn?: string;
  buyerGtid?: string;
  sellerGtid?: string;
  status?: string;
}): Promise<PurchaseOrderRow[]> {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.buyerGtid) where.buyerGtid = filter.buyerGtid;
    if (filter?.sellerGtid) where.sellerGtid = filter.sellerGtid;
    if (filter?.status) where.status = filter.status;
    const rows = await db.purchaseOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows || []) as PurchaseOrderRow[];
  } catch (e: any) {
    logger.error("[orders/listPO] failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Flip a DRAFT PO to SENT (buyer transmits to seller).
 */
export async function sendPurchaseOrder(
  id: string,
): Promise<PurchaseOrderRow | null> {
  if (!id) return null;
  try {
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      logger.warn("[orders/sendPO] not found", { id });
      return null;
    }
    if (existing.status !== "DRAFT") {
      logger.warn("[orders/sendPO] not in DRAFT", {
        id,
        status: existing.status,
      });
      return existing as PurchaseOrderRow;
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "SENT" },
    });
    logger.info("[orders/sendPO] sent", { id, poNumber: updated.poNumber });
    return updated as PurchaseOrderRow;
  } catch (e: any) {
    logger.error("[orders/sendPO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Seller accepts a SENT PO. This also auto-creates a matching SalesOrder
 * (status PENDING) and links it back via SalesOrder.poId. If a SalesOrder
 * already exists for this PO, the existing SO is returned instead.
 */
export async function acceptPurchaseOrder(
  id: string,
): Promise<{ purchaseOrder: PurchaseOrderRow | null; salesOrder: SalesOrderRow | null }> {
  if (!id) return { purchaseOrder: null, salesOrder: null };
  try {
    const po = await db.purchaseOrder.findUnique({ where: { id } });
    if (!po) {
      logger.warn("[orders/acceptPO] not found", { id });
      return { purchaseOrder: null, salesOrder: null };
    }
    if (po.status !== "SENT") {
      logger.warn("[orders/acceptPO] not in SENT", {
        id,
        status: po.status,
      });
      return { purchaseOrder: po as PurchaseOrderRow, salesOrder: null };
    }

    // Idempotency: if a SO already exists for this PO, return it.
    let so: any = null;
    try {
      so = await db.salesOrder.findFirst({
        where: { poId: id },
      });
    } catch (e: any) {
      logger.warn("[orders/acceptPO] SO lookup failed (table missing?)", {
        id,
        error: e?.message,
      });
    }

    const updatedPo = await db.purchaseOrder.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });
    logger.info("[orders/acceptPO] accepted", {
      id,
      poNumber: updatedPo.poNumber,
    });

    if (so) {
      return {
        purchaseOrder: updatedPo as PurchaseOrderRow,
        salesOrder: so as SalesOrderRow,
      };
    }

    // Create the matching SalesOrder.
    const soNumber = generateSoNumber(po.ustn);
    try {
      const newSo = await db.salesOrder.create({
        data: {
          ustn: po.ustn,
          tradeId: po.tradeId,
          poId: po.id,
          soNumber,
          sellerGtid: po.sellerGtid,
          buyerGtid: po.buyerGtid,
          items: po.items,
          totalValue: po.totalValue,
          currency: po.currency,
          status: "PENDING",
        },
      });
      return {
        purchaseOrder: updatedPo as PurchaseOrderRow,
        salesOrder: newSo as SalesOrderRow,
      };
    } catch (e: any) {
      logger.error("[orders/acceptPO] SO creation failed", {
        id,
        error: e?.message,
      });
      return {
        purchaseOrder: updatedPo as PurchaseOrderRow,
        salesOrder: null,
      };
    }
  } catch (e: any) {
    logger.error("[orders/acceptPO] failed", {
      id,
      error: e?.message || String(e),
    });
    return { purchaseOrder: null, salesOrder: null };
  }
}

/**
 * Reject a SENT PO (seller declines).
 */
export async function rejectPurchaseOrder(
  id: string,
): Promise<PurchaseOrderRow | null> {
  if (!id) return null;
  try {
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "SENT") {
      return existing as PurchaseOrderRow;
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return updated as PurchaseOrderRow;
  } catch (e: any) {
    logger.error("[orders/rejectPO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Sales Order API ============

export async function createSalesOrder(
  input: CreateSalesOrderInput,
): Promise<SalesOrderRow | null> {
  if (!input?.ustn || !input?.tradeId || !input?.sellerGtid || !input?.buyerGtid) {
    logger.warn("[orders/createSO] missing required input", { input });
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
    const totalValue = computeTotal(itemsArr);

    let created = null;
    let attempt = 0;
    while (attempt < 3 && !created) {
      attempt++;
      const soNumber = generateSoNumber(input.ustn);
      try {
        created = await db.salesOrder.create({
          data: {
            ustn: input.ustn,
            tradeId: input.tradeId,
            poId: input.poId || null,
            soNumber,
            sellerGtid: input.sellerGtid,
            buyerGtid: input.buyerGtid,
            items: itemsJson,
            totalValue,
            currency: input.currency || "USD",
            status: "PENDING",
          },
        });
      } catch (e: any) {
        if (attempt >= 3) throw e;
      }
    }
    if (!created) return null;
    logger.info("[orders/createSO] created", {
      id: created.id,
      soNumber: created.soNumber,
    });
    return created as SalesOrderRow;
  } catch (e: any) {
    logger.error("[orders/createSO] failed", {
      ustn: input?.ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function getSalesOrder(
  id: string,
): Promise<SalesOrderRow | null> {
  if (!id) return null;
  try {
    const row = await db.salesOrder.findUnique({ where: { id } });
    return (row as SalesOrderRow) || null;
  } catch (e: any) {
    logger.error("[orders/getSO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function listSalesOrders(filter?: {
  ustn?: string;
  sellerGtid?: string;
  buyerGtid?: string;
  status?: string;
}): Promise<SalesOrderRow[]> {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.sellerGtid) where.sellerGtid = filter.sellerGtid;
    if (filter?.buyerGtid) where.buyerGtid = filter.buyerGtid;
    if (filter?.status) where.status = filter.status;
    const rows = await db.salesOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
    });
    return (rows || []) as SalesOrderRow[];
  } catch (e: any) {
    logger.error("[orders/listSO] failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Accept a PENDING SO (seller confirms fulfilment).
 */
export async function acceptSalesOrder(
  id: string,
): Promise<SalesOrderRow | null> {
  if (!id) return null;
  try {
    const existing = await db.salesOrder.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "PENDING") {
      return existing as SalesOrderRow;
    }
    const updated = await db.salesOrder.update({
      where: { id },
      data: { status: "ACCEPTED", acceptedDate: new Date() },
    });
    return updated as SalesOrderRow;
  } catch (e: any) {
    logger.error("[orders/acceptSO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Mark an ACCEPTED SO as FULFILLED (delivery + acceptance complete).
 */
export async function fulfillSalesOrder(
  id: string,
): Promise<SalesOrderRow | null> {
  if (!id) return null;
  try {
    const existing = await db.salesOrder.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.status !== "ACCEPTED") {
      return existing as SalesOrderRow;
    }
    const updated = await db.salesOrder.update({
      where: { id },
      data: { status: "FULFILLED" },
    });
    return updated as SalesOrderRow;
  } catch (e: any) {
    logger.error("[orders/fulfillSO] failed", {
      id,
      error: e?.message || String(e),
    });
    return null;
  }
}
