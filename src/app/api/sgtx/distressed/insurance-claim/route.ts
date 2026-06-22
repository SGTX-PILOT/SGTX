// 3B.8.11 — Insurance Claim Evidence Package
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { compileInsuranceClaim } from "@/lib/sgtx/distressed";
import { insuranceClaimNarrative } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const { listingId } = await req.json();
    if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });
    const result = await compileInsuranceClaim(listingId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // Generate AI claim narrative
    const listing = await db.distressedCargoListing.findUnique({ where: { id: listingId } });
    let aiNarrative: string | null = null;
    if (listing) {
      try {
        const r = await insuranceClaimNarrative({ commodity: listing.commodity, conditionScore: listing.conditionScore || 0, ustn: listing.ustn, description: listing.description });
        aiNarrative = r.content;
        if (result.claimId) {
          await db.insuranceClaim.update({ where: { claimId: result.claimId }, data: { claimNarrative: aiNarrative } });
        }
      } catch { /* ignore */ }
    }
    return NextResponse.json({ ...result, aiNarrative });
  } catch (e: any) { console.error("[distressed/insurance-claim]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
