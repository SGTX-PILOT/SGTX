// @ts-nocheck
// GET  /api/sgtx/air-cargo/flight — list flights
// POST /api/sgtx/air-cargo/flight — register / update a flight
//
// GET query params:
//   ?airline=MS  ?originAirport=CAI  ?destinationAirport=FRA
//   ?status=SCHEDULED  ?take=100
//
// POST body:
//   { flightNumber: "MS-762", airline: "MS", originAirport: "CAI",
//     destinationAirport: "FRA", scheduledDeparture?: ISO, scheduledArrival?: ISO,
//     aircraftType?: "B777-F", status?: "SCHEDULED" }
//
// Response: GET → { ok, flights, count } · POST → { ok, flight }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listFlights, registerFlight, type RegisterFlightInput } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const airline = url.searchParams.get("airline") || undefined;
    const originAirport = url.searchParams.get("originAirport") || undefined;
    const destinationAirport = url.searchParams.get("destinationAirport") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) || 100 : undefined;

    const result = await listFlights({
      airline, originAirport, destinationAirport, status, take,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, flights: [], count: 0, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      flights: result.flights,
      count: result.count,
    });
  } catch (e: any) {
    logger.error("[air-cargo/flight/list] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, flights: [], count: 0, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterFlightInput;
    if (!body || !body.flightNumber) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: flightNumber" },
        { status: 400 },
      );
    }
    if (!body.airline) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: airline" },
        { status: 400 },
      );
    }
    if (!body.originAirport || !body.destinationAirport) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: originAirport, destinationAirport" },
        { status: 400 },
      );
    }
    const result = await registerFlight(body);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, flight: result.flight });
  } catch (e: any) {
    logger.error("[air-cargo/flight/create] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
