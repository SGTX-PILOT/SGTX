import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/distressed/outreach — Start accelerated outreach to the
// seller's saved contacts. Advisory only — SGTX is a NON-MARKETPLACE system,
// so this is a private broadcast to contacts the seller has explicitly saved,
// NOT a public market listing.
//
// Body: { listingId, privacyLevel }
// - Queries seller's SavedContact list
// - Creates a Smart Inbox item to each contact (priority 85) describing the
//   listing (anonymous or disclosed depending on privacyLevel)
// - Updates listing status to OUTREACH and persists privacyLevel
// - Returns { ok, contactedCount }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { listingId, privacyLevel } = body;
    if (!listingId) {
      return NextResponse.json({ error: "listingId required" }, { status: 400 });
    }

    const listing = await db.distressedCargoListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      return NextResponse.json({ error: "Distressed cargo listing not found" }, { status: 404 });
    }
    if (listing.status === "MICROCONTRACT_LOCKED" || listing.status === "COMPLETED") {
      return NextResponse.json(
        { error: `Listing already ${listing.status}; cannot start outreach` },
        { status: 409 }
      );
    }

    const privacy = privacyLevel === "DISCLOSED" ? "DISCLOSED" : "ANONYMOUS";

    // ── Pull seller's saved contacts (advisory audience) ─────────
    const contacts = await db.savedContact.findMany({
      where: { ownerGtid: listing.sellerGtid },
    });

    if (contacts.length === 0) {
      // Still flip status so the seller can see the dashboard state, but
      // surface that no contacts were available.
      await db.distressedCargoListing.update({
        where: { id: listing.id },
        data: { status: "OUTREACH", privacyLevel: privacy },
      });
      // Notify seller that they have no saved contacts to broadcast to.
      await db.inboxItem.create({
        data: {
          tenantGtid: listing.sellerGtid,
          tradeId: listing.tradeId,
          category: "GENERAL",
          priority: 80,
          title: "Distressed outreach — no saved contacts",
          description: `You attempted accelerated outreach for ${listing.commodity} (${listing.quantityKg} kg, condition ${listing.conditionScore}/100) but have no saved contacts yet. Add counterparties to your Saved Contacts list, then retry outreach.`,
          ctaLabel: "Manage Contacts",
        },
      });
      return NextResponse.json({ ok: true, contactedCount: 0, reason: "NO_SAVED_CONTACTS" });
    }

    // ── Build the broadcast message ──────────────────────────────
    // ANONYMOUS: hide seller identity + USTN; show only commodity,
    //   quantity, condition, and asking price.
    // DISCLOSED: include seller GTID + USTN for direct response.
    const askingPrice = listing.listingPriceUsd ?? listing.originalValueUsd;
    const commonDesc =
      `Commodity: ${listing.commodity}. ` +
      `Quantity: ${listing.quantityKg} kg. ` +
      `Condition score: ${listing.conditionScore}/100. ` +
      `Asking price: $${askingPrice}. ` +
      `Notes: ${listing.conditionNotes || "(none)"}.`;

    const title =
      privacy === "ANONYMOUS"
        ? `Anonymous distressed cargo opportunity — ${listing.commodity}`
        : `Distressed cargo opportunity from ${listing.sellerGtid} — ${listing.commodity}`;

    const description =
      privacy === "ANONYMOUS"
        ? `A seller in your saved contacts network has declared distressed cargo and is soliciting accelerated offers. ${commonDesc} Seller identity is concealed (ANONYMOUS). If interested, submit an offer; the seller's identity will be revealed upon acceptance. Advisory only — SGTX is a non-marketplace system.`
        : `Seller ${listing.sellerGtid} has declared distressed cargo and is soliciting accelerated offers via direct outreach. ${commonDesc} Parent USTN: ${listing.ustn}. Advisory only — SGTX is a non-marketplace system.`;

    // ── Fan-out Smart Inbox items to each contact (priority 85) ──
    // Include a privacy notice so recipients understand the advisory nature.
    const created = await Promise.all(
      contacts.map((c) =>
        db.inboxItem.create({
          data: {
            tenantGtid: c.contactGtid,
            tradeId: listing.tradeId,
            category: "NEW_OFFER",
            priority: 85,
            title,
            description,
            ctaLabel: "View Listing & Submit Offer",
            deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
          },
        }).catch(() => null) // skip contacts whose GTID isn't a real Tenant row
      )
    );

    const contactedCount = created.filter(Boolean).length;

    // ── Update listing status to OUTREACH + persist privacyLevel ─
    await db.distressedCargoListing.update({
      where: { id: listing.id },
      data: { status: "OUTREACH", privacyLevel: privacy },
    });

    // ── Notify seller that outreach has started ──────────────────
    await db.inboxItem.create({
      data: {
        tenantGtid: listing.sellerGtid,
        tradeId: listing.tradeId,
        category: "GENERAL",
        priority: 80,
        title: `Accelerated outreach started — ${contactedCount} contact${contactedCount === 1 ? "" : "s"} notified`,
        description: `Distressed cargo broadcast (${privacy}) sent to ${contactedCount} of your saved contacts for ${listing.commodity}. Privacy notice: SGTX is a non-marketplace system — this is advisory outreach only, not a public market listing. Incoming offers will appear in real-time on your triage dashboard.`,
        ctaLabel: "View Offer Rankings",
      },
    });

    return NextResponse.json({
      ok: true,
      contactedCount,
      privacyLevel: privacy,
    });
  } catch (e: any) {
    console.error("[distressed/outreach] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
