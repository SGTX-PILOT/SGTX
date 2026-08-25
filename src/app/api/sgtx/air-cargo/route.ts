// @ts-nocheck
// GET  /api/sgtx/air-cargo         — list air bookings
// POST /api/sgtx/air-cargo         — create a new air booking
//
// GET query params:
//   ?ustn=X                filter by USTN
//   ?carrierGtid=X         filter by carrier GTID
//   ?status=BOOKED         filter by status
//   ?originAirport=CAI     filter by origin IATA code
//   ?destinationAirport=FRA filter by destination IATA code
//   ?take=100              limit (default 100, max 500)
//
// POST body: see CreateAirBookingInput in src/lib/sgtx/air-cargo/index.ts
// Response: { ok, booking, pieces?, ulds?, error? }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  createAirBooking,
  listAirBookings,
  type CreateAirBookingInput,
} from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const carrierGtid = url.searchParams.get("carrierGtid") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const originAirport = url.searchParams.get("originAirport") || undefined;
    const destinationAirport = url.searchParams.get("destinationAirport") || undefined;
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) || 100 : undefined;

    const result = await listAirBookings({
      ustn, carrierGtid, status, originAirport, destinationAirport, take,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, bookings: [], count: 0, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      bookings: result.bookings,
      count: result.count,
    });
  } catch (e: any) {
    logger.error("[air-cargo/list] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, bookings: [], count: 0, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateAirBookingInput;
    if (!body || !body.ustn) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: ustn" },
        { status: 400 },
      );
    }
    if (!body.originAirport || !body.destinationAirport) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: originAirport, destinationAirport" },
        { status: 400 },
      );
    }
    const result = await createAirBooking(body);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      booking: result.booking,
      pieces: result.pieces,
      ulds: result.ulds,
    });
  } catch (e: any) {
    logger.error("[air-cargo/create] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
