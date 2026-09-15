// @ts-nocheck
/**
 * POST /api/sgtx/deferred-payments/[id]/release
 *
 * Body: { triggerMilestone }
 *
 * Releases a deferred payment via event-trigger (§12.8.2). The trigger
 * milestone must be VERIFIED for the release to succeed.
 *
 * Returns: { released, settledAt, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { releaseDeferredPayment } from "@/lib/sgtx/deferred-payments";

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
    const { triggerMilestone } = body;
    if (!triggerMilestone) {
      return NextResponse.json(
        { error: "triggerMilestone required" },
        { status: 400 },
      );
    }
    const result = await releaseDeferredPayment(id, triggerMilestone);
    if (!result.released) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
