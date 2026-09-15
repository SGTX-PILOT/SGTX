// @ts-nocheck
/**
 * POST /api/sgtx/qc-hold-payments/freeze
 *
 * Body: { ustn, actionPlanId }
 *
 * Freezes all payment legs for a USTN due to a CONDITIONAL_PASS QC verdict
 * (§12.9). Creates a ShipmentHold(holdType='QC_CONDITIONAL'), updates each
 * non-SETTLED leg to legState='FROZEN', transitions FeeLock to DISPUTED.
 *
 * Returns: { frozenLegs: [{ legId, previousStatus, newStatus }], holdId }
 */
import { NextRequest, NextResponse } from "next/server";
import { freezePaymentsOnQcHold } from "@/lib/sgtx/qc-hold-payments";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, actionPlanId } = body;
    if (!ustn || !actionPlanId) {
      return NextResponse.json(
        { error: "ustn and actionPlanId required" },
        { status: 400 },
      );
    }
    const result = await freezePaymentsOnQcHold(ustn, actionPlanId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
