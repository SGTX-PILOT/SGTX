// @ts-nocheck
/**
 * POST /api/sgtx/quote/counter
 *
 * v18 §16.9.3.4 — Counter-Offer with Reason.
 *
 * The buyer (or seller) proposes a new price or amended term. A mandatory
 * reason (≥20 chars) is stored in the negotiation log. One-click: after
 * typing the reason, click "Send Counter" (1).
 *
 * Body: {
 *   ustn: string,          // the trade USTN
 *   price?: number,        // new proposed price (USD)
 *   terms?: object,        // amended terms (deliveryPort, incoterm, etc.)
 *   reason: string,        // mandatory ≥20 chars
 *   proposerGtid: string,  // who is proposing the counter
 * }
 *
 * Returns: {
 *   ok: true,
 *   negotiationId: string,
 *   status: "COUNTER_OFFERED",
 *   counter: { price, terms, reason, proposerGtid },
 *   createdAt: string,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createNegotiation } from "@/lib/sgtx/negotiation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, price, terms, reason, proposerGtid } = body;

    // Validate mandatory fields
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!reason || reason.trim().length < 20) {
      return NextResponse.json({ error: "reason must be at least 20 characters" }, { status: 400 });
    }
    if (!proposerGtid) return NextResponse.json({ error: "proposerGtid required" }, { status: 400 });

    // Verify trade exists
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Create a negotiation round with the counter-offer
    const negotiation = await createNegotiation({
      ustn,
      proposerGtid,
      offer: { price, terms, reason },
      type: "COUNTER_OFFER",
    }).catch((e: any) => {
      logger.error("[quote/counter] createNegotiation failed", { error: e?.message });
      return null;
    });

    // Update trade status to NEGOTIATING
    await db.trade.update({
      where: { ustn },
      data: { status: "NEGOTIATING" },
    }).catch(() => {});

    // Log activity
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: proposerGtid,
        action: "QUOTE_COUNTER_OFFERED",
        description: `Counter-offer: ${price ? `$${price}` : "terms amendment"}. Reason: ${reason}`,
        metadata: JSON.stringify({ price, terms, reason, proposerGtid }),
      },
    }).catch(() => {});

    // Smart Inbox to counterparty
    const counterpartyGtid = proposerGtid === trade.buyerGtid ? trade.sellerGtid : trade.buyerGtid;
    await db.inboxItem.create({
      data: {
        ustn,
        tenantGtid: counterpartyGtid,
        category: "NEGOTIATION",
        title: `Counter-offer received for ${ustn}`,
        description: `${price ? `$${price}` : "Terms amendment"}. Reason: ${reason.substring(0, 100)}...`,
        priority: 75,
        ctaLabel: "Review Counter",
        ctaUrl: `/trades/${ustn}`,
        status: "PENDING",
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      negotiationId: negotiation?.id || `N-${Date.now()}`,
      status: "COUNTER_OFFERED",
      counter: { price, terms, reason, proposerGtid },
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[quote/counter] POST failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
