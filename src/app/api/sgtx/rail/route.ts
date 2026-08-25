// @ts-nocheck
// GET  /api/sgtx/rail         — list rail bookings (filter: ?ustn= | ?carrierGtid= | ?status= | ?originTerminal= | ?destinationTerminal= | ?limit=)
// POST /api/sgtx/rail         — create a rail booking (with optional initial consignment note)
//
// Per RAIL-ENGINE task spec — wraps the lib in src/lib/sgtx/rail. Defensive
// try/catch on every request; missing-table runtime errors are surfaced as
// 500 JSON (the lib itself returns [] / null on failure, so the response is
// always a valid JSON shape).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createRailBooking, listRailBookings } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const filter = {
      ustn: url.searchParams.get("ustn") || undefined,
      carrierGtid: url.searchParams.get("carrierGtid") || undefined,
      status: url.searchParams.get("status") || undefined,
      originTerminal: url.searchParams.get("originTerminal") || undefined,
      destinationTerminal: url.searchParams.get("destinationTerminal") || undefined,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : undefined,
    };
    const bookings = await listRailBookings(filter);
    return NextResponse.json({ ok: true, bookings, count: bookings.length, filter });
  } catch (e: any) {
    logger.error("[rail/GET] list failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error", bookings: [], count: 0 }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await createRailBooking(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/POST] create failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}
