// POST /api/sgtx/seller/quote/submit — Submit seller quote to buyer
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeRequestId, sellerGtid, quoteData, quoteExpiry } = body;

    if (!tradeRequestId || !sellerGtid) {
      return NextResponse.json({ error: "tradeRequestId and sellerGtid required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { id: tradeRequestId } });
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    if (trade.sellerGtid !== sellerGtid) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    // Create or update the quotation
    const existing = await db.serviceQuotation.findFirst({
      where: { tradeId: tradeRequestId, sellerGtid },
      orderBy: { createdAt: "desc" },
    });

    const quote = await db.serviceQuotation.upsert({
      where: { id: existing?.id || "non-existent" },
      create: {
        tradeId: tradeRequestId,
        sellerGtid,
        status: "SUBMITTED",
        totalCost: quoteData?.totalCost || 0,
        currency: quoteData?.currency || trade.currency || "USD",
      } as any,
      update: existing ? {
        status: "SUBMITTED",
        totalCost: quoteData?.totalCost || 0,
      } : {},
    });

    // Update trade status
    await db.trade.update({
      where: { id: tradeRequestId },
      data: { status: "QUOTE_RECEIVED" },
    });

    // Notify buyer
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        category: "QUOTE_RESPONSE",
        priority: "HIGH",
        title: "New quote received",
        message: `Seller has submitted a quote for ${trade.commodity}.`,
        actionUrl: `/trades/${trade.ustn}`,
        dismissed: false,
      },
    }).catch(() => {});

    logger.info("seller-quote-submitted", { tradeRequestId, quoteId: quote.id });
    return NextResponse.json({ ok: true, quoteId: quote.id, status: "SUBMITTED" });
  } catch (e: any) {
    logger.error("[seller/quote/submit] error:", e);
    return NextResponse.json({ error: "Quote submission failed", detail: e?.message }, { status: 500 });
  }
}
