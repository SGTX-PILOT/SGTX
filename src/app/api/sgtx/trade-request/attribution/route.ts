import { NextRequest, NextResponse } from "next/server";

// GET /api/sgtx/trade-request/attribution?buyerGtid=...&sellerGtid=...
// Checks if this buyer-seller pair was first connected via a marketplace partner.
// Returns { found: false } when no attribution exists (the normal case).
export async function GET(req: NextRequest) {
  const buyerGtid = req.nextUrl.searchParams.get("buyerGtid");
  const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
  if (!buyerGtid || !sellerGtid) {
    return NextResponse.json({ found: false });
  }

  // No PartnerLeadAttribution model exists in the schema yet.
  // When marketplace partner integration (Part 7) is implemented, this will query:
  //   db.partnerLeadAttribution.findFirst({ where: { buyerGtid, sellerGtid, status: "ACTIVE" } })
  // For now, return not-found so the frontend attribution banner stays hidden.
  return NextResponse.json({ found: false });
}
