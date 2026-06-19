import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/distressed/listings — list distressed cargo listings
// Query params (all optional):
//   ?sellerGtid=...  — filter to listings created by a specific seller
//   ?status=...      — filter by listing status
//                        (ACTIVE | TRIAGED | OUTREACH |
//                         MICROCONTRACT_LOCKED | COMPLETED | CANCELLED)
//   ?limit=...       — cap result count (default 50, max 200)
//
// Each listing includes its offers ordered by offerAmountUsd desc so the
// frontend can render real-time offer rankings without an extra round-trip.
// Returns { listings }.

const VALID_STATUSES = new Set([
  "ACTIVE",
  "TRIAGED",
  "OUTREACH",
  "MICROCONTRACT_LOCKED",
  "COMPLETED",
  "CANCELLED",
]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sellerGtid = sp.get("sellerGtid");
    const status = sp.get("status");

    const where: any = {};
    if (sellerGtid) where.sellerGtid = sellerGtid;
    if (status) {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json(
          { error: `Invalid status. Valid: ${[...VALID_STATUSES].join(", ")}` },
          { status: 400 }
        );
      }
      where.status = status;
    }

    const limitRaw = Number(sp.get("limit") || "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;

    const listings = await db.distressedCargoListing.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        offers: {
          orderBy: { offerAmountUsd: "desc" },
        },
      },
    });

    // Shape the response — annotate each listing with offer count +
    // highest offer for quick dashboard rendering.
    const shaped = listings.map((l) => {
      const offers = l.offers || [];
      const pendingOffers = offers.filter((o) => o.status === "PENDING");
      const topOffer = offers[0] || null;
      return {
        id: l.id,
        tradeId: l.tradeId,
        ustn: l.ustn,
        sellerGtid: l.sellerGtid,
        commodity: l.commodity,
        quantityKg: l.quantityKg,
        conditionScore: l.conditionScore,
        conditionNotes: l.conditionNotes,
        originalValueUsd: l.originalValueUsd,
        listingPriceUsd: l.listingPriceUsd,
        status: l.status,
        privacyLevel: l.privacyLevel,
        microUstn: l.microUstn,
        createdAt: l.createdAt,
        offerCount: offers.length,
        pendingOfferCount: pendingOffers.length,
        topOfferAmountUsd: topOffer ? topOffer.offerAmountUsd : null,
        topOfferBuyerGtid: topOffer ? topOffer.buyerGtid : null,
        offers: offers.map((o) => ({
          id: o.id,
          buyerGtid: o.buyerGtid,
          offerAmountUsd: o.offerAmountUsd,
          status: o.status,
          expressNegotiation: o.expressNegotiation,
          respondedAt: o.respondedAt,
          createdAt: o.createdAt,
        })),
      };
    });

    return NextResponse.json({ listings: shaped, count: shaped.length });
  } catch (e: any) {
    console.error("[distressed/listings] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
