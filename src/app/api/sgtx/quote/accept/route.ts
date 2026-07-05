import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/quote/accept - Buyer accepts the seller's quote (Phase 2 -> Phase 3 transition)
// Body: { ustn, deliveryPort?, buyerSubmission? (optional payload to persist with the accept) }
// Updates: Trade.status -> "QUOTE_ACCEPTED" (or "BUYER_SUBMITTED" if buyerSubmission payload given), phase -> 3 (ready for contracting)
// Creates: Activity log "QUOTE_ACCEPTED" + Smart Inbox to seller (priority 75) + BuyerSubmission record (if payload)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, deliveryPort, buyerSubmission } = body;

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

    if (trade.status !== "QUOTED" && trade.status !== "NEGOTIATING" && trade.status !== "QUOTE_ACCEPTED" && trade.status !== "BUYER_SUBMITTED") {
      return NextResponse.json(
        { error: `Trade status is ${trade.status} - cannot accept quote` },
        { status: 409 },
      );
    }

    // If buyerSubmission payload is included, persist it before transitioning status
    let submissionId: string | null = null;
    if (buyerSubmission) {
      const bs = buyerSubmission;
      if (!bs.notifyParties || bs.notifyParties.length === 0) {
        return NextResponse.json(
          { error: "At least one notify party is required" },
          { status: 400 },
        );
      }
      if (!bs.documentDispatchAddresses || bs.documentDispatchAddresses.length === 0) {
        return NextResponse.json(
          { error: "At least one document dispatch address is required" },
          { status: 400 },
        );
      }
      if (!bs.consigneeSameAsBuyer && (!bs.consignee || !bs.consignee.name || !bs.consignee.address)) {
        return NextResponse.json(
          { error: "Consignee name and address are required (or check 'same as buyer')" },
          { status: 400 },
        );
      }

      const buyerTenant = trade.buyer;
      const buyerLegalName = buyerTenant?.legalName || trade.buyerGtid;
      const buyerCountry = buyerTenant?.country || "";
      const buyerCity = buyerTenant?.city || "";
      const buyerAddress = buyerTenant?.city
        ? `${buyerTenant.city}, ${buyerTenant.country}`
        : buyerTenant?.country || "";
      const buyerTaxId = buyerTenant?.gtid || "";

      const resolvedConsignee = bs.consigneeSameAsBuyer
        ? {
            name: buyerLegalName,
            address: buyerAddress,
            country: buyerCountry,
            city: buyerCity,
            postalCode: "",
            phone: "",
            email: "",
            taxId: buyerTaxId,
          }
        : bs.consignee;

      const today = new Date();
      const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
      const countToday = await db.buyerSubmission.count({
        where: { submissionId: { startsWith: `BS-${ymd}-` } },
      });
      submissionId = `BS-${ymd}-${String(countToday + 1).padStart(3, "0")}`;

      await db.buyerSubmission.create({
        data: {
          submissionId,
          tradeId: trade.id,
          ustn,
          buyerGtid: trade.buyerGtid,
          buyerLegalName,
          buyerCountry,
          buyerCity,
          buyerAddress,
          buyerTaxId,
          consigneeSameAsBuyer: !!bs.consigneeSameAsBuyer,
          consigneeJson: JSON.stringify(resolvedConsignee),
          notifyPartiesJson: JSON.stringify(bs.notifyParties),
          documentDispatchAddressesJson: JSON.stringify(bs.documentDispatchAddresses),
          status: "SUBMITTED",
        },
      });
    }

    // Update trade: status -> BUYER_SUBMITTED (if submission included) or QUOTE_ACCEPTED, phase -> 3 (entering contracting)
    const newStatus = buyerSubmission ? "BUYER_SUBMITTED" : "QUOTE_ACCEPTED";
    const updateData: any = { status: newStatus, phase: 3 };
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
        action: buyerSubmission ? "BUYER_SUBMISSION_SUBMITTED" : "QUOTE_ACCEPTED",
        type: "SUCCESS",
        description: buyerSubmission
          ? `Buyer ${trade.buyer?.legalName || trade.buyerGtid} accepted quote and submitted buyer details (consignee, ${buyerSubmission.notifyParties?.length || 0} notify parties, ${buyerSubmission.documentDispatchAddresses?.length || 0} document dispatch addresses) for USTN ${ustn}. Submission ID: ${submissionId}. Trade moved to contracting phase.`
          : `Buyer ${trade.buyer?.legalName || trade.buyerGtid} accepted quote for USTN ${ustn}.${deliveryPort ? ` Delivery port: ${deliveryPort}.` : ""} Trade moved to contracting phase.`,
      },
    });

    // Timeline event - quote accepted
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 2,
        label: buyerSubmission ? "Buyer Submission Received" : "Quote Accepted",
        description: buyerSubmission
          ? `Buyer accepted the quote and submitted consignee + notify parties + document dispatch addresses. Submission ID: ${submissionId}. Proceeding to contract signing.`
          : `Buyer accepted the quote. Proceeding to contract signing.`,
        actorGtid: trade.buyerGtid,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Smart Inbox to seller (priority 80 if submission included, else 75)
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.sellerGtid,
        tradeId: trade.id,
        category: "NEW_OFFER",
        priority: buyerSubmission ? 80 : 75,
        title: buyerSubmission
          ? `Buyer submission received — ${ustn.slice(0, 24)}...`
          : `Quote accepted by ${trade.buyer?.legalName || "buyer"} - ${ustn.slice(0, 24)}...`,
        description: buyerSubmission
          ? `Buyer ${trade.buyer?.legalName || "buyer"} accepted your quote and submitted all required details (consignee ${buyerSubmission.consigneeSameAsBuyer ? "= buyer" : "different"}, ${buyerSubmission.notifyParties?.length || 0} notify parties, ${buyerSubmission.documentDispatchAddresses?.length || 0} document dispatch addresses). Submission ID: ${submissionId}. All information needed to draft the contract is now available — proceed to sign the digital contract.`
          : `Buyer accepted your quote for ${trade.commodity}. Proceed to contract signing - sign the digital contract with your passkey to advance to contract lock.`,
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
        title: buyerSubmission
          ? `Submission received — proceed to contract signing`
          : `Quote accepted - proceed to contract signing`,
        description: buyerSubmission
          ? `Your buyer submission (${submissionId}) was recorded and the seller has been notified. Sign the contract with your passkey to advance to contract lock.`
          : `You accepted the quote for ${trade.commodity}. Sign the contract with your passkey to advance to contract lock.`,
        ctaLabel: "Sign Contract",
      },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: newStatus,
      submissionId,
      message: buyerSubmission
        ? "Buyer submission received and quote accepted — proceed to contract signing"
        : "Quote accepted - proceed to contract signing",
      deliveryPort: deliveryPort || trade.destPort,
    });
  } catch (e: any) {
    logger.error("[quote/accept] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
