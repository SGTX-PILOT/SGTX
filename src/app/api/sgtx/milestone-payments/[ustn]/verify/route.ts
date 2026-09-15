// @ts-nocheck
/**
 * POST /api/sgtx/milestone-payments/[ustn]/verify
 *
 * Body: { milestone }
 * Verifies that the milestone is ready to fire its payment legs (§12.7 +
 * §12.9):
 *   - Milestone VERIFIED
 *   - No active QC hold (§12.9)
 *   - FeeLock not CANCELLED
 *
 * Returns: { verified, evidence, blockingFactors }
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyMilestoneBeforePayment } from "@/lib/sgtx/milestone-payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    const body = await req.json();
    const { milestone } = body;
    if (!ustn || !milestone) {
      return NextResponse.json(
        { error: "ustn and milestone required" },
        { status: 400 },
      );
    }
    const result = await verifyMilestoneBeforePayment(ustn, milestone);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
