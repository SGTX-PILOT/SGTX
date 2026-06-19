import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/distressed/offer — Buyer submits an offer on a distressed listing
// Body: { listingId, buyerGtid, offerAmountUsd, expressNegotiation }
// Creates a DistressedCargoOffer (status=PENDING), posts a Smart Inbox item
// to the seller (priority 85) "New offer on distressed cargo", and returns
// { ok, offerId }. Real-time rankings are derived from DistressedCargoOffer
// rows ordered by offerAmountUsd desc (frontend can poll or subscribe).

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId, buyerGtid, offerAmountUsd, expressNegotiation } = body;

    // ── Validate required fields ─────────────────────────────────
    const missing: string[] = [];
    if (!listingId) missing.push("listingId");
    if (!buyerGtid) missing.push("buyerGtid");
    if (offerAmountUsd == null) missing.push("offerAmountUsd");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const amount = Number(offerAmountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "offerAmountUsd must be a positive number" },
        { status: 400 }
      );
    }

    const listing = await db.distressedCargoListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      return NextResponse.json({ error: "Distressed cargo listing not found" }, { status: 404 });
    }

    // Listing must be in an outreach-active state to accept offers
    const offerableStatuses = ["ACTIVE", "TRIAGED", "OUTREACH"];
    if (!offerableStatuses.includes(listing.status)) {
      return NextResponse.json(
        { error: `Listing is ${listing.status}; not accepting new offers` },
        { status: 409 }
      );
    }

    // Prevent duplicate pending offers from the same buyer
    const existingPending = await db.distressedCargoOffer.findFirst({
      where: { listingId, buyerGtid, status: "PENDING" },
    });
    if (existingPending) {
      return NextResponse.json(
        {
          error: "You already have a pending offer on this listing. Wait for the seller to respond, or withdraw it first.",
          existingOfferId: existingPending.id,
        },
        { status: 409 }
      );
    }

    const express = Boolean(expressNegotiation);

    // ── Create the offer ─────────────────────────────────────────
    const offer = await db.distressedCargoOffer.create({
      data: {
        listingId,
        buyerGtid,
        offerAmountUsd: Math.round(amount * 100) / 100,
        status: "PENDING",
        expressNegotiation: express,
      },
    });

    // ── Smart Inbox to seller — "New offer on distressed cargo" ─
    const askingPrice = listing.listingPriceUsd ?? listing.originalValueUsd;
    const deltaPct = askingPrice > 0
      ? Math.round(((amount - askingPrice) / askingPrice) * 1000) / 10
      : 0;

    await db.inboxItem.create({
      data: {
        tenantGtid: listing.sellerGtid,
        tradeId: listing.tradeId,
        category: "NEW_OFFER",
        priority: 85,
        title: `New offer on distressed cargo — ${listing.commodity} ($${amount})`,
        description:
          `Buyer ${buyerGtid} submitted an offer of $${amount} on your distressed listing ` +
          `(${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs asking $${askingPrice}). ` +
          `${express ? "Flagged as EXPRESS NEGOTIATION — buyer requests fast turnaround. " : ""}` +
          `Review the offer rankings on your triage dashboard and accept to lock a microcontract (microUSTN + distressed fee + FeeLock).`,
        ctaLabel: "View Offer Rankings",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({
      ok: true,
      offerId: offer.id,
      status: offer.status,
      expressNegotiation: offer.expressNegotiation,
    });
  } catch (e: any) {
    console.error("[distressed/offer] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
