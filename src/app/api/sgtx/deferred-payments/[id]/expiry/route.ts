// @ts-nocheck
/**
 * POST /api/sgtx/deferred-payments/[id]/expiry
 *
 * Processes the time-triggered expiry of a deferred instruction (§12.8.3).
 * Called by a daily cron on the guarantee expiry date. If
 * autoChargeAuthorised=true → bank auto-charges (SETTLED); else → EXPIRED.
 *
 * Returns: { action: 'AUTO_CHARGED' | 'EXPIRED' | 'NO_ACTION', reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { processDeferredExpiry } from "@/lib/sgtx/deferred-payments";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const result = await processDeferredExpiry(id);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
