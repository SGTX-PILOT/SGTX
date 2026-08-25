// @ts-nocheck
// GET /api/sgtx/rail/[id] — fetch a rail booking with all relations
// (train + wagons + consignments + transit segments + status events)
//
// Returns 404 if the booking is not found OR the rail tables are missing.
// Defensive try/catch on every request.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRailBooking } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id path parameter" }, { status: 400 });
    }
    const booking = await getRailBooking(id);
    if (!booking) {
      return NextResponse.json({ ok: false, error: "Rail booking not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, booking });
  } catch (e: any) {
    logger.error("[rail/[id]/GET] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}
