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

// ── REC-P0 #1 — Migration from Trade.globalNotes JSON to Quote model ──
// Non-destructive: reads Trades where globalNotes contains quote JSON,
// creates Quote rows, but NEVER modifies or deletes the original globalNotes.
export async function migrateQuotesFromGlobalNotes(): Promise<{
  ok: boolean;
  scanned: number;
  migrated: number;
  skipped: number;
  errors: number;
  quoteIds: string[];
  details: string[];
}> {
  const result = {
    ok: true, scanned: 0, migrated: 0, skipped: 0, errors: 0,
    quoteIds: [] as string[], details: [] as string[],
  };
  try {
    const trades = await db.trade.findMany({ take: 500 });
    result.scanned = trades.length;
    for (const trade of trades) {
      try {
        if (!trade.globalNotes) continue;
        // Check if globalNotes contains quote JSON (look for totalQuote key)
        if (!trade.globalNotes.includes('"totalQuote"') && !trade.globalNotes.includes("'totalQuote'")) continue;
        let quoteData: any = null;
        try { quoteData = JSON.parse(trade.globalNotes); } catch { continue; }
        if (!quoteData || !quoteData.totalQuote) continue;
        // Check if a Quote already exists for this USTN (idempotent)
        const existing = await db.quote.findFirst({ where: { ustn: trade.ustn } });
        if (existing) { result.skipped++; continue; }
        // Create a Quote row from the migrated data
        const quote = await db.quote.create({
          data: {
            quoteNumber: genQuoteNumber(trade.ustn),
            ustn: trade.ustn, tradeId: trade.id,
            sellerGtid: trade.sellerGtid, buyerGtid: trade.buyerGtid,
            totalQuote: Number(quoteData.totalQuote) || 0,
            exwPrice: Number(quoteData.exwPrice) || Number(quoteData.totalQuote) || 0,
            sgtxFee: Number(quoteData.sgtxFee) || 0,
            exwTotal: Number(quoteData.exwTotal) || Number(quoteData.totalQuote) || 0,
            logisticsTotal: Number(quoteData.logisticsTotal) || 0,
            totalCartons: Number(quoteData.totalCartons) || 0,
            priceUnit: quoteData.priceUnit || "CARTON",
            currency: quoteData.currency || trade.currency || "USD",
            incoterm: trade.incoterm || "FOB",
            lineItems: JSON.stringify(quoteData.lineItems || []),
            packingPlan: quoteData.packingPlan ? JSON.stringify(quoteData.packingPlan) : null,
            status: "ACCEPTED", // migrated quotes are already accepted
            sentAt: trade.createdAt,
            acceptedAt: trade.updatedAt,
          },
        });
        result.migrated++;
        result.quoteIds.push(quote.id);
        result.details.push(`Migrated quote for USTN ${trade.ustn} → Quote ${quote.quoteNumber}`);
      } catch (e: any) {
        result.errors++;
        result.details.push(`Error on USTN ${trade.ustn}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.ok = false;
    result.errors++;
    result.details.push(`Migration error: ${e.message}`);
  }
  return result;
}
