// @ts-nocheck
// GET /api/sgtx/air-cargo/[id] — fetch a single air booking with all relations
//
// Returns: { ok, booking } with nested waybills, pieces, ulds, statusEvents,
// chargeableWeight. Defensive: if the AirBooking table is missing the route
// returns { ok: false, error } with HTTP 200 so the UI can render an empty
// state instead of crashing.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getAirBooking } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing id path parameter" },
        { status: 400 },
      );
    }
    const result = await getAirBooking(id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, booking: result.booking });
  } catch (e: any) {
    logger.error("[air-cargo/[id]] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
