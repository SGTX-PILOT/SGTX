import { NextRequest, NextResponse } from "next/server";
import { checkRouteAvailability, getAveragePricing } from "@/lib/sgtx/shipping/shipping-lines-db";

// GET /api/sgtx/shipping-lines/route-check?origin=EGALX&destination=DEHAM
// POST /api/sgtx/shipping-lines/route-check { origin, destination }
//
// Checks if a shipping route is available between two ports, returns:
// - available: boolean
// - commonLines: shipping lines that serve both origin and destination countries
// - pricing: average pricing for dry and reefer containers (20ft/40ft)
// - route info: origin/destination country names

export async function GET(req: NextRequest) {
  try {
    const origin = (req.nextUrl.searchParams.get("origin") || "").toUpperCase();
    const destination = (req.nextUrl.searchParams.get("destination") || "").toUpperCase();
    if (!origin || !destination) {
      return NextResponse.json({ error: "origin and destination required (UN/LOCODE, e.g. EGALX, DEHAM)" }, { status: 400 });
    }
    const route = checkRouteAvailability(origin, destination);
    const pricing = getAveragePricing(origin, destination);
    return NextResponse.json({ ok: true, origin, destination, ...route, pricing });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { origin, destination } = await req.json();
    if (!origin || !destination) return NextResponse.json({ error: "origin and destination required" }, { status: 400 });
    const route = checkRouteAvailability(origin.toUpperCase(), destination.toUpperCase());
    const pricing = getAveragePricing(origin.toUpperCase(), destination.toUpperCase());
    return NextResponse.json({ ok: true, origin: origin.toUpperCase(), destination: destination.toUpperCase(), ...route, pricing });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
