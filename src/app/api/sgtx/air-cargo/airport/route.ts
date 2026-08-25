// @ts-nocheck
// GET  /api/sgtx/air-cargo/airport — list airports
// POST /api/sgtx/air-cargo/airport — register / update an airport
//
// GET query params:
//   ?country=EG  ?city=Cairo  ?iataCode=CAI  ?isOrigin=true  ?isDestination=true  ?take=200
//
// POST body:
//   { iataCode: "CAI", icaoCode?: "HECA", name: "Cairo International",
//     city?: "Cairo", country: "EG", timezone?: "Africa/Cairo",
//     isOrigin?: bool, isDestination?: bool }
//
// Response: GET → { ok, airports, count } · POST → { ok, airport }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listAirports, registerAirport, type RegisterAirportInput } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || undefined;
    const city = url.searchParams.get("city") || undefined;
    const iataCode = url.searchParams.get("iataCode") || undefined;
    const isOrigin = url.searchParams.get("isOrigin") === "true" ? true : undefined;
    const isDestination = url.searchParams.get("isDestination") === "true" ? true : undefined;
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) || 200 : undefined;

    const result = await listAirports({ country, city, iataCode, isOrigin, isDestination, take });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, airports: [], count: 0, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({
      ok: true,
      airports: result.airports,
      count: result.count,
    });
  } catch (e: any) {
    logger.error("[air-cargo/airport/list] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, airports: [], count: 0, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterAirportInput;
    if (!body || !body.iataCode) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: iataCode" },
        { status: 400 },
      );
    }
    if (!body.name) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: name" },
        { status: 400 },
      );
    }
    if (!body.country) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: country" },
        { status: 400 },
      );
    }
    const result = await registerAirport(body);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, airport: result.airport });
  } catch (e: any) {
    logger.error("[air-cargo/airport/create] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
