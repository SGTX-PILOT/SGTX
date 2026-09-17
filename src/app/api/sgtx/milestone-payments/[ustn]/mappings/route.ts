// @ts-nocheck
/**
 * GET /api/sgtx/milestone-payments/[ustn]/mappings
 *
 * Returns the milestone→payment mappings for a USTN (§12.7).
 * Includes both fired legs (status=SUBMITTED/SETTLED) and planned legs
 * (status=PLANNED).
 */
import { NextRequest, NextResponse } from "next/server";
import { getMilestonePaymentMappings } from "@/lib/sgtx/milestone-payments";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }
    const result = await getMilestonePaymentMappings(ustn);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
