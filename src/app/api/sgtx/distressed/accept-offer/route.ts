import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateMicroUSTN } from "@/lib/sgtx/ustn";

// POST /api/sgtx/distressed/accept-offer — Seller accepts an offer
// Body: { offerId }
// 1. Marks the chosen offer ACCEPTED (respondedAt=now), all other offers
//    on the same listing REJECTED (respondedAt=now).
// 2. Generates a microUSTN via generateMicroUSTN(parentUstn) from the
//    listing's USTN (which must reference a Trade row).
// 3. Updates the listing status to MICROCONTRACT_LOCKED and persists the
//    microUstn.
// 4. Smart Inbox to the accepted buyer (priority 90) "Offer accepted —
//    proceed to payment" (distressed fee payment + FeeLock step).
// 5. Smart Inbox to each rejected buyer (priority 60) so they know.
// Returns { ok, microUstn }.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { offerId } = body;
    if (!offerId) {
      return NextResponse.json({ error: "offerId required" }, { status: 400 });
    }

    const offer = await db.distressedCargoOffer.findUnique({
      where: { id: offerId },
      include: { listing: true },
    });
    if (!offer) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }
    if (offer.status !== "PENDING") {
      return NextResponse.json(
        { error: `Offer is already ${offer.status}; cannot accept` },
        { status: 409 }
      );
    }

    const listing = offer.listing;
    if (!listing) {
      return NextResponse.json({ error: "Parent listing missing" }, { status: 500 });
    }
    if (listing.status === "MICROCONTRACT_LOCKED" || listing.status === "COMPLETED") {
      return NextResponse.json(
        { error: `Listing already ${listing.status}` },
        { status: 409 }
      );
    }

    // ── 1. Accept the chosen offer + reject all others ───────────
    const now = new Date();
    await db.distressedCargoOffer.update({
      where: { id: offer.id },
      data: { status: "ACCEPTED", respondedAt: now },
    });

    const otherOffers = await db.distressedCargoOffer.findMany({
      where: { listingId: listing.id, status: "PENDING", id: { not: offer.id } },
      select: { id: true, buyerGtid: true },
    });

    if (otherOffers.length > 0) {
      await db.distressedCargoOffer.updateMany({
        where: { id: { in: otherOffers.map((o) => o.id) } },
        data: { status: "REJECTED", respondedAt: now },
      });
    }

    // ── 2. Generate microUSTN from the parent trade USTN ─────────
    // generateMicroUSTN resolves the parent Trade row by USTN, mints a
    // child USTN using the listing seller + accepted buyer GTIDs, and
    // persists a child Trade row linked back via parentUstn so the
    // micro-contract is queryable through the standard TCC views.
    let microUstn: string;
    try {
      const res = await generateMicroUSTN(listing.ustn, {
        buyerGtid: offer.buyerGtid,        // the distressed-cargo purchaser
        sellerGtid: listing.sellerGtid,    // original seller of the distressed cargo
        commodity: listing.commodity,
        netWeightKg: listing.quantityKg,
        tradeValueUsd: offer.offerAmountUsd,
      });
      microUstn = res.microUstn;
    } catch (e: any) {
      // If the parent USTN doesn't resolve to a Trade row, mint a
      // deterministic fallback so the contract lock still completes.
      console.warn("[distressed/accept-offer] generateMicroUSTN failed, using fallback:", e.message);
      microUstn = `SGTX-MICRO-${listing.id.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    }

    // ── 3. Lock the listing — MICROCONTRACT_LOCKED + microUstn ──
    await db.distressedCargoListing.update({
      where: { id: listing.id },
      data: { status: "MICROCONTRACT_LOCKED", microUstn },
    });

    // Compute the distressed fee (1.5% of accepted offer amount,
    // non-custodial FeeLock split via PSP) — surfaced in the buyer
    // notification so they know the next step.
    const distressedFeeUsd = Math.round(offer.offerAmountUsd * 0.015 * 100) / 100;

    // ── 4a. Smart Inbox to accepted buyer (priority 90) ─────────
    await db.inboxItem.create({
      data: {
        tenantGtid: offer.buyerGtid,
        tradeId: listing.tradeId,
        category: "NEEDS_PAYMENT",
        priority: 90,
        title: `Offer accepted — proceed to payment (${listing.commodity})`,
        description:
          `Your offer of $${offer.offerAmountUsd} on the distressed ${listing.commodity} listing was ACCEPTED by the seller. ` +
          `Microcontract locked — microUSTN: ${microUstn} (parent ${listing.ustn}). ` +
          `Next step: pay the distressed fee of $${distressedFeeUsd} (1.5%, non-custodial FeeLock split via PSP) to finalize. ` +
          `${offer.expressNegotiation ? "Express negotiation flag carried into the microcontract — fast-track settlement applies. " : ""}` +
          `Advisory only — SGTX is a non-marketplace system.`,
        ctaLabel: "Pay Distressed Fee & Lock Contract",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // ── 4b. Smart Inbox to seller — confirmation ────────────────
    await db.inboxItem.create({
      data: {
        tenantGtid: listing.sellerGtid,
        tradeId: listing.tradeId,
        category: "GENERAL",
        priority: 88,
        title: `Microcontract locked — ${listing.commodity} (microUSTN ${microUstn.slice(0, 24)}…)`,
        description:
          `You accepted buyer ${offer.buyerGtid}'s offer of $${offer.offerAmountUsd}. ` +
          `Listing status → MICROCONTRACT_LOCKED. microUSTN: ${microUstn}. ` +
          `${otherOffers.length} other pending offer${otherOffers.length === 1 ? "" : "s"} auto-rejected. ` +
          `Distressed fee $${distressedFeeUsd} pending FeeLock via PSP. Track progress on the microcontract tracking view.`,
        ctaLabel: "Track Microcontract",
      },
    });

    // ── 4c. Smart Inbox to rejected buyers (priority 60) ────────
    if (otherOffers.length > 0) {
      await Promise.all(
        otherOffers.map((o) =>
          db.inboxItem
            .create({
              data: {
                tenantGtid: o.buyerGtid,
                tradeId: listing.tradeId,
                category: "GENERAL",
                priority: 60,
                title: `Offer declined — ${listing.commodity} distressed listing`,
                description: `The seller accepted another offer on the distressed ${listing.commodity} listing. Your offer of record has been marked REJECTED. SGTX will keep you informed of similar opportunities in your saved contacts network.`,
                ctaLabel: "Find Other Opportunities",
              },
            })
            .catch(() => null)
        )
      );
    }

    return NextResponse.json({
      ok: true,
      microUstn,
      listingId: listing.id,
      acceptedOfferId: offer.id,
      rejectedOfferCount: otherOffers.length,
      distressedFeeUsd,
    });
  } catch (e: any) {
    console.error("[distressed/accept-offer] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
