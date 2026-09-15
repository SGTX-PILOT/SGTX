// @ts-nocheck
/**
 * POST /api/sgtx/milestone-payments/trigger
 *
 * Body: { ustn, milestone }
 * Triggers the payment legs associated with the milestone (§12.7).
 *
 * Returns: { triggeredLegs, camt054Expected, skippedReason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { triggerMilestonePayments } from "@/lib/sgtx/milestone-payments";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, milestone } = body;
    if (!ustn || !milestone) {
      return NextResponse.json(
        { error: "ustn and milestone required" },
        { status: 400 },
      );
    }
    const validMilestones = [
      "LOADED",
      "CUSTOMS_SUBMITTED",
      "DEPARTED",
      "ARRIVED",
      "CUSTOMS_IMPORT",
      "DELIVERED",
    ];
    if (!validMilestones.includes(milestone)) {
      return NextResponse.json(
        { error: `milestone must be one of: ${validMilestones.join(", ")}` },
        { status: 400 },
      );
    }
    const result = await triggerMilestonePayments(ustn, milestone);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
