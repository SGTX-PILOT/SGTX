// POST /api/sgtx/seller/quote — Seller submits a quote in response to a buyer request
// GET /api/sgtx/seller/quote?tradeId=X — Get seller's quote for a trade

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST: Seller submits a quote
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tradeRequestId, sellerGtid, quoteVersion, quoteData, quoteStatus, quoteExpiry,
    } = body;

    if (!tradeRequestId || !sellerGtid) {
      return NextResponse.json({ error: "tradeRequestId and sellerGtid required" }, { status: 400 });
    }

    // Verify the trade exists and this seller is the counterparty
    const trade = await db.trade.findUnique({ where: { id: tradeRequestId } });
    if (!trade) {
      return NextResponse.json({ error: "Trade request not found" }, { status: 404 });
    }
    if (trade.sellerGtid !== sellerGtid) {
      return NextResponse.json({ error: "Not authorized to quote on this trade" }, { status: 403 });
    }

    // Create or update the quote (ServiceQuotation model)
    const existingQuote = await db.serviceQuotation.findFirst({
      where: { tradeId: tradeRequestId, sellerGtid },
      orderBy: { createdAt: "desc" },
    });

    const quote = await db.serviceQuotation.upsert({
      where: existingQuote ? { id: existingQuote.id } : { id: "non-existent" },
      create: {
        tradeId: tradeRequestId,
        sellerGtid,
        status: quoteStatus || "SUBMITTED",
        // Store quote data as JSON in the existing fields
        totalCost: quoteData?.totalCost || 0,
        currency: quoteData?.currency || trade.currency || "USD",
        // Additional quote details stored as JSON
      } as any,
      update: existingQuote ? {
        status: quoteStatus || "SUBMITTED",
        totalCost: quoteData?.totalCost || 0,
      } : {},
    });

    // Update trade status
    if (trade.status === "PENDING_SELLER_RESPONSE") {
      await db.trade.update({
        where: { id: tradeRequestId },
        data: { status: "QUOTE_RECEIVED" },
      });
    }

    // Create Smart Inbox item for buyer
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        category: "QUOTE_RESPONSE",
        priority: "HIGH",
        title: "New quote received",
        message: `Seller ${sellerGtid} has submitted a quote for ${trade.commodity}.`,
        actionUrl: `/trades/${trade.ustn}`,
        dismissed: false,
      },
    }).catch(() => {/* non-fatal */});

    logger.info("seller-quote-submitted", { tradeRequestId, sellerGtid, quoteId: quote.id });

    return NextResponse.json({ ok: true, quoteId: quote.id, status: quoteStatus || "SUBMITTED" });
  } catch (e: any) {
    logger.error("[seller/quote POST] error:", e);
    return NextResponse.json({ error: "Quote submission failed", detail: e?.message }, { status: 500 });
  }
}

// GET: Get seller's quote for a trade
export async function GET(req: NextRequest) {
  try {
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

    const quote = await db.serviceQuotation.findFirst({
      where: { tradeId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, quote });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch quote" }, { status: 500 });
  }
}
