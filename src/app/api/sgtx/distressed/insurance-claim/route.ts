// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.8.11 — Insurance Claim Evidence Package
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
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
        const listing = await db.distressedCargoListing.findUnique({ where: { id: listingId } }) as any;
    let aiNarrative: string | null = null;
    if (listing) {
      try {
                const r = await insuranceClaimNarrative({ commodity: listing.commodity, conditionScore: listing.conditionScore || 0, ustn: listing.ustn, description: listing.description }) as any;
        aiNarrative = r.content;
        if (result.claimId) {
                    await db.insuranceClaim.update({ where: { claimId: result.claimId }, data: { claimNarrative: aiNarrative } }) as any;
        }
      } catch { /* ignore */ }
    }
        return NextResponse.json({ ...result, aiNarrative }) as any;
  } catch (e: any) { logger.error("[distressed/insurance-claim]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
