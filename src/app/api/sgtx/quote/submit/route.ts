import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/quote/submit — seller submits quote to buyer (Phase 2 completion)
// Creates: Trade status → QUOTED, quote data stored on Trade, Smart Inbox to buyer (priority 75), Activity log
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn, sellerGtid, exwPrice, priceUnit, loadingCountry, loadingPort,
      packingLayers, totalCartons, logisticsModeA, incoterm,
      exwTotal, logisticsTotal, sgtxFee, totalQuote, carbonFootprint,
    } = body;

    if (!ustn || !sellerGtid) {
      return NextResponse.json({ error: "ustn and sellerGtid required" }, { status: 400 });
    }

    // Find the trade
    const trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } });
    if (!trade) return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    if (trade.status !== "INITIATED") {
      return NextResponse.json({ error: `Trade already ${trade.status} — cannot submit quote` }, { status: 409 });
    }

    const quoteId = `SQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

    // Update trade status to QUOTED + store quote data
    await db.trade.update({
      where: { id: trade.id },
      data: {
        status: "QUOTED",
        phase: 2,
        sgtxFeeUsd: sgtxFee,
        originPort: loadingPort,
        originCountry: loadingCountry,
      },
    });

    // Store packing plan as a document
    await db.document.create({
      data: {
        tradeId: trade.id,
        uploadedBy: sellerGtid,
        type: "PACKING_PLAN",
        title: `Packing Plan — ${ustn}`,
        hashSha256: `${ustn}-packing-${Date.now()}`,
        status: "VERIFIED",
      },
    });

    // Smart Inbox to buyer (priority 75)
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        tradeId: trade.id,
        category: "NEW_OFFER",
        priority: 75,
        title: `Quote received from ${trade.seller?.legalName || sellerGtid}`,
        description: `${trade.commodity} · EXW $${exwPrice}/${priceUnit} · ${totalCartons} cartons · Total: $${totalQuote.toLocaleString()} (incl. $${sgtxFee} SGTX fee). Incoterm: ${incoterm}. Review and accept/modify/reject.`,
        ctaLabel: "Review Quote",
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: sellerGtid,
        action: "QUOTE_SUBMITTED",
        type: "SUCCESS",
        description: `Seller ${trade.seller?.legalName || sellerGtid} submitted quote ${quoteId}. EXW $${exwPrice}/${priceUnit}. Total: $${totalQuote.toLocaleString()} (fee: $${sgtxFee}). Packing: ${totalCartons} cartons, ${packingLayers?.length || 0} layer patterns.`,
      },
    });

    return NextResponse.json({
      ok: true,
      quoteId,
      tradeStatus: "QUOTED",
      message: `Quote submitted to ${trade.buyer?.legalName || "buyer"}. Trade status updated to QUOTED.`,
      totals: { exwTotal, logisticsTotal, sgtxFee, totalQuote },
    });
  } catch (e: any) {
    console.error("[quote/submit] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
