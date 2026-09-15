// @ts-nocheck
/**
 * POST /api/sgtx/deferred-payments
 *
 * Body: { ustn, legId, dueDate, triggerMilestone? }
 *
 * Creates a deferred payment (credit terms) — §12.8.1. Registers a
 * future-dated pain.008 instruction at the bank in state GUARANTEE_HELD.
 *
 * Returns: { deferredId, status: 'GUARANTEE_HELD', dueDate, triggerMilestone?, guaranteeExpiry }
 */
import { NextRequest, NextResponse } from "next/server";
import { createDeferredInstruction } from "@/lib/sgtx/deferred-payments";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, legId, dueDate, triggerMilestone } = body;
    if (!ustn || !legId || !dueDate) {
      return NextResponse.json(
        { error: "ustn, legId, dueDate required" },
        { status: 400 },
      );
    }
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) {
      return NextResponse.json(
        { error: "dueDate must be a valid ISO date" },
        { status: 400 },
      );
    }
    const result = await createDeferredInstruction(
      ustn,
      legId,
      due,
      triggerMilestone,
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
