import { NextRequest, NextResponse } from "next/server";
import { estimateFreightPricing, CONTAINER_TYPES, searchFreightDB } from "@/lib/sgtx/ai/freight-pricing";

// POST /api/sgtx/ai/freight-pricing — AI-powered freight pricing (sea freight, THC, daily reefer power)
// Body: { origin_port, destination_port, shipping_line?, container_type?, transit_days?, commodity? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const originPort = (body?.origin_port || body?.originPort || "").toString().toUpperCase();
    const destinationPort = (body?.destination_port || body?.destinationPort || "").toString().toUpperCase();
    const shippingLine = body?.shipping_line || body?.shippingLine;
    const containerType = body?.container_type || body?.containerType || "STANDARD";
    const transitDays = body?.transit_days || body?.transitDays;
    const commodity = body?.commodity;

    if (!originPort || !destinationPort) {
      return NextResponse.json({ error: "origin_port and destination_port required" }, { status: 400 });
    }

    const result = await estimateFreightPricing({
      originPort, destinationPort, shippingLine, containerType, transitDays, commodity,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/freight-pricing?container_types=true (list all container types)
// GET /api/sgtx/ai/freight-pricing?origin=EGALX&destination=DEHAM (DB-only quick lookup)
export async function GET(req: NextRequest) {
  const ct = req.nextUrl.searchParams.get("container_types");
  if (ct === "true") {
    return NextResponse.json({ ok: true, container_types: CONTAINER_TYPES });
  }

  const origin = req.nextUrl.searchParams.get("origin") || "";
  const dest = req.nextUrl.searchParams.get("destination") || "";
  const line = req.nextUrl.searchParams.get("line") || undefined;

  if (!origin || !dest) {
    return NextResponse.json({ ok: true, container_types: CONTAINER_TYPES, note: "Pass ?container_types=true for full list, or ?origin=X&destination=Y for DB lookup, or POST for AI estimation" });
  }

  const dbMatches = searchFreightDB(origin, dest, line);
  return NextResponse.json({ ok: true, db_matches: dbMatches, source: "database" });
}
