// @ts-nocheck
/**
 * GET /api/sgtx/qc-hold-payments/[ustn]/status
 *
 * Returns the current QC hold status for a USTN (§12.9.2).
 *
 * Returns: { active, actionPlanId, deadline, frozenLegs: [{ legId,
 * beneficiaryName, amount, currency, status }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getQcHoldStatus } from "@/lib/sgtx/qc-hold-payments";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await getQcHoldStatus(ustn);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
