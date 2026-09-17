// @ts-nocheck
/**
 * POST /api/sgtx/deferred-payments/[id]/escalate
 *
 * Body: { step: 1 | 2 | 3 }
 *
 * Escalates a deferred payment through the three-step ladder (§13.4.12):
 *   Step 1 (7d before): reminder InboxItem.
 *   Step 2 (1d before): alert + "Pay Now" CTA.
 *   Step 3 (expiry): auto-charge or block.
 *
 * Returns: { escalated, step, action, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { escalateDeferredPayment } from "@/lib/sgtx/deferred-payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    const { step } = body;
    if (step !== 1 && step !== 2 && step !== 3) {
      return NextResponse.json(
        { error: "step must be 1, 2, or 3" },
        { status: 400 },
      );
    }
    const result = await escalateDeferredPayment(id, step);
    if (!result.escalated) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
