// @ts-nocheck
// SGTX Quote Engine — dedicated first-class Quote entity (REC-P0 #1)
// Replaces the JSON-stuffed-in-Trade.globalNotes tech debt.
import { db } from "@/lib/db";

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"] as const;
export const PRICE_UNITS = ["CARTON", "PALLET", "KG", "CONTAINER", "UNIT"] as const;

function genQuoteNumber(ustn: string): string {
  const suffix = ustn.replace(/[^A-Z0-9]/gi, "").slice(-6).toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `Q-${suffix}-${date}-${rand}`;
}

export async function createQuote(data: {
  ustn: string; tradeId: string; sellerGtid: string; buyerGtid: string;
  totalQuote: number; exwPrice: number; sgtxFee: number; exwTotal: number;
  logisticsTotal?: number; totalCartons?: number; priceUnit?: string;
  currency?: string; incoterm: string; lineItems: any[]; packingPlan?: any;
  validityDays?: number;
}) {
  try {
    const quote = await db.quote.create({
      data: {
        quoteNumber: genQuoteNumber(data.ustn),
        ustn: data.ustn, tradeId: data.tradeId,
        sellerGtid: data.sellerGtid, buyerGtid: data.buyerGtid,
        totalQuote: data.totalQuote, exwPrice: data.exwPrice,
        sgtxFee: data.sgxFee, exwTotal: data.exwTotal,
        logisticsTotal: data.logisticsTotal || 0,
        totalCartons: data.totalCartons || 0,
        priceUnit: data.priceUnit || "CARTON",
        currency: data.currency || "USD",
        incoterm: data.incoterm,
        lineItems: JSON.stringify(data.lineItems || []),
        packingPlan: data.packingPlan ? JSON.stringify(data.packingPlan) : null,
        validityDays: data.validityDays || 14,
      },
    });
    return quote;
  } catch (e) { return null; }
}

export async function getQuote(id: string) {
  try { return await db.quote.findUnique({ where: { id } }); }
  catch { return null; }
}

export async function listQuotes(filter?: { ustn?: string; sellerGtid?: string; buyerGtid?: string; status?: string }) {
  try {
    const where: any = {};
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.sellerGtid) where.sellerGtid = filter.sellerGtid;
    if (filter?.buyerGtid) where.buyerGtid = filter.buyerGtid;
    if (filter?.status) where.status = filter.status;
    return await db.quote.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  } catch { return []; }
}

export async function sendQuote(id: string) {
  try {
    const q = await db.quote.findUnique({ where: { id } });
    if (!q || q.status !== "DRAFT") return null;
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + q.validityDays);
    return await db.quote.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), validUntil } });
  } catch { return null; }
}

export async function acceptQuote(id: string) {
  try {
    const q = await db.quote.findUnique({ where: { id } });
    if (!q || q.status !== "SENT") return null;
    return await db.quote.update({ where: { id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  } catch { return null; }
}

export async function rejectQuote(id: string, reason?: string) {
  try {
    const q = await db.quote.findUnique({ where: { id } });
    if (!q || q.status !== "SENT") return null;
    return await db.quote.update({ where: { id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectedReason: reason || null } });
  } catch { return null; }
}

export async function getQuoteByUSTN(ustn: string) {
  try {
    return await db.quote.findFirst({ where: { ustn }, orderBy: { createdAt: "desc" } });
  } catch { return null; }
}

export async function expireStaleQuotes() {
  try {
    return await db.quote.updateMany({
      where: { status: "SENT", validUntil: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
  } catch { return { count: 0 }; }
}
