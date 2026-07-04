import { NextRequest, NextResponse } from "next/server";
import { getNextVesselSchedules } from "@/lib/sgtx/shipping/shipping-lines-db";

// GET /api/sgtx/shipping-lines/schedules?origin=EGALX&destination=DEHAM&line=MAERSK&weeks=4
// Returns next N weeks of vessel schedules for the specified route + shipping line.
export async function GET(req: NextRequest) {
  try {
    const origin = (req.nextUrl.searchParams.get("origin") || "").toUpperCase();
    const destination = (req.nextUrl.searchParams.get("destination") || "").toUpperCase();
    const line = (req.nextUrl.searchParams.get("line") || "MAERSK").toUpperCase();
    const weeks = parseInt(req.nextUrl.searchParams.get("weeks") || "4");
    if (!origin || !destination) return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    const schedules = getNextVesselSchedules(origin, destination, line, weeks);
    return NextResponse.json({ ok: true, origin, destination, shippingLine: line, schedules, count: schedules.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
