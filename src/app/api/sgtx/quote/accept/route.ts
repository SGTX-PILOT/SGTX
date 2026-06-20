import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/quote/accept - Buyer accepts the seller's quote (Phase 2 -> Phase 3 transition)
// Body: { ustn, deliveryPort? }
// Updates: Trade.status -> "QUOTE_ACCEPTED", phase -> 3 (ready for contracting)
// Creates: Activity log "QUOTE_ACCEPTED" + Smart Inbox to seller (priority 75)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, deliveryPort } = body;

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    // Find the trade
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true, shipments: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    if (trade.status !== "QUOTED" && trade.status !== "NEGOTIATING") {
      return NextResponse.json(
        { error: `Trade status is ${trade.status} - cannot accept quote` },
        { status: 409 },
      );
    }

    // Update trade: status -> QUOTE_ACCEPTED, phase -> 3 (entering contracting)
    const updateData: any = { status: "QUOTE_ACCEPTED", phase: 3 };
    if (deliveryPort) {
      updateData.destPort = deliveryPort;
      // Update destination port on all shipments too
      await db.shipment.updateMany({
        where: { tradeId: trade.id },
        data: { destPort: deliveryPort },
      });
    }

    await db.trade.update({ where: { id: trade.id }, data: updateData });

    // Activity log - QUOTE_ACCEPTED
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: trade.buyerGtid,
        action: "QUOTE_ACCEPTED",
        type: "SUCCESS",
        description: `Buyer ${trade.buyer?.legalName || trade.buyerGtid} accepted quote for USTN ${ustn}.${deliveryPort ? ` Delivery port: ${deliveryPort}.` : ""} Trade moved to contracting phase.`,
      },
    });

    // Timeline event - quote accepted
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 2,
        label: "Quote Accepted",
        description: `Buyer accepted the quote. Proceeding to contract signing.`,
        actorGtid: trade.buyerGtid,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Smart Inbox to seller (priority 75) - seller needs to proceed to contract signing
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.sellerGtid,
        tradeId: trade.id,
        category: "NEW_OFFER",
        priority: 75,
        title: `Quote accepted by ${trade.buyer?.legalName || "buyer"} - ${ustn.slice(0, 24)}...`,
        description: `Buyer accepted your quote for ${trade.commodity}. Proceed to contract signing - sign the digital contract with your passkey to advance to contract lock.`,
        ctaLabel: "Sign Contract",
      },
    });

    // Smart Inbox to buyer (priority 70) - reminder to sign contract on their side
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        tradeId: trade.id,
        category: "NEGOTIATION",
        priority: 70,
        title: `Quote accepted - proceed to contract signing`,
        description: `You accepted the quote for ${trade.commodity}. Sign the contract with your passkey to advance to contract lock.`,
        ctaLabel: "Sign Contract",
      },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: "QUOTE_ACCEPTED",
      message: "Quote accepted - proceed to contract signing",
      deliveryPort: deliveryPort || trade.destPort,
    });
  } catch (e: any) {
    console.error("[quote/accept] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
