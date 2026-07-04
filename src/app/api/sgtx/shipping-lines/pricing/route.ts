import { NextRequest, NextResponse } from "next/server";
import { getAveragePricing } from "@/lib/sgtx/shipping/shipping-lines-db";

// GET /api/sgtx/shipping-lines/pricing?origin=EGALX&destination=DEHAM
// Returns average pricing for dry and reefer containers (20ft/40ft) for the route.
export async function GET(req: NextRequest) {
  try {
    const origin = (req.nextUrl.searchParams.get("origin") || "").toUpperCase();
    const destination = (req.nextUrl.searchParams.get("destination") || "").toUpperCase();
    if (!origin || !destination) return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    const pricing = getAveragePricing(origin, destination);
    return NextResponse.json({ ok: true, origin, destination, ...pricing });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
