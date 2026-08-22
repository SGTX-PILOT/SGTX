// @ts-nocheck
// §2 Claims — by claimId
// GET /api/sgtx/completion/claims/by-claim-id/[claimId]
import { NextResponse } from "next/server";
import { getClaimByClaimId } from "@/lib/sgtx/claim";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ claimId: string }> },
) {
  try {
    const { claimId } = await params;
    if (!claimId) {
      return NextResponse.json({ error: "claimId required" }, { status: 400 });
    }
    const claim = await getClaimByClaimId(claimId);
    if (!claim) {
      return NextResponse.json({ error: "claim not found" }, { status: 404 });
    }
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/by-claim-id] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
