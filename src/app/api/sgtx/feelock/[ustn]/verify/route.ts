// @ts-nocheck
/**
 * GET /api/sgtx/feelock/[ustn]/verify
 *
 * Verifies that the FeeLock is ACTIVE. Used by the container release API
 * (Part 8.3) to authorise gate-out.
 *
 * CRITICAL: only externally-confirmed payment events produce ACTIVE. Clicking
 * a button does NOT activate the lock (§13.4.9).
 *
 * Returns: { active, lockId, status }
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyFeeLockActive } from "@/lib/sgtx/feelock-nats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await verifyFeeLockActive(ustn);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
