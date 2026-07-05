// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getTradeRoute } from "@/lib/sgtx/geo/mapbox";

// GET /api/sgtx/trade-route?origin=Alexandria&destination=Hamburg
// Returns: { originCoords, destCoords, distanceKm, estimatedTransitDays, routeGeometry }
export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.searchParams.get("origin");
    const destination = req.nextUrl.searchParams.get("destination");

    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    }

    const result = await getTradeRoute(origin, destination);
    return NextResponse.json({ ok: true, origin, destination, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
