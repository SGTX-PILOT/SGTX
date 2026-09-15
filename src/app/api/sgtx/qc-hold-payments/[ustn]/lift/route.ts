// @ts-nocheck
/**
 * POST /api/sgtx/qc-hold-payments/[ustn]/lift
 *
 * Body: { actionPlanId }
 *
 * Lifts the QC hold after the action plan is verified (§12.9.1). Restores
 * frozen legs to PROCESSING and re-activates the FeeLock if a previous
 * external confirmation exists.
 *
 * Pre-conditions:
 *   - QcActionPlan.status === "VERIFIED"
 *   - QcActionPlan.verifiedBy !== null
 *
 * Returns: { releasedLegs, releasedAt }
 */
import { NextRequest, NextResponse } from "next/server";
import { liftQcHold } from "@/lib/sgtx/qc-hold-payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const body = await req.json();
    const { actionPlanId } = body;
    if (!actionPlanId) {
      return NextResponse.json(
        { error: "actionPlanId required" },
        { status: 400 },
      );
    }
    const result = await liftQcHold(ustn, actionPlanId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
