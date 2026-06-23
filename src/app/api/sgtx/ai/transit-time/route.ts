import { NextRequest, NextResponse } from "next/server";
import { estimateTransitTime, TRANSIT_TIME_DB, getAllShippingLines, getAllPorts, searchTransitDB } from "@/lib/sgtx/ai/transit-time";

// POST /api/sgtx/ai/transit-time — estimate transit time between ports for a shipping line
// Body: { origin_port, destination_port, shipping_line?, commodity?, container_type? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const originPort = (body?.origin_port || body?.originPort || "").toString().toUpperCase();
    const destinationPort = (body?.destination_port || body?.destinationPort || "").toString().toUpperCase();
    const shippingLine = body?.shipping_line || body?.shippingLine;
    const commodity = body?.commodity;
    const containerType = body?.container_type || body?.containerType;

    if (!originPort || !destinationPort) {
      return NextResponse.json(
        { error: "origin_port and destination_port required (UN/LOCODE, e.g. EGALX, DEHAM)" },
        { status: 400 }
      );
    }

    const result = await estimateTransitTime({
      originPort,
      destinationPort,
      shippingLine,
      commodity,
      containerType,
    });

    return NextResponse.json({
      ok: true,
      route: result,
      alternatives: result.alternatives || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/ai/transit-time?origin=EGALX&destination=DEHAM&line=MAERSK
// GET /api/sgtx/ai/transit-time?lines=true (list all shipping lines)
// GET /api/sgtx/ai/transit-time?ports=true (list all supported ports)
export async function GET(req: NextRequest) {
  const lines = req.nextUrl.searchParams.get("lines");
  const ports = req.nextUrl.searchParams.get("ports");
  if (lines === "true") {
    return NextResponse.json({ ok: true, shipping_lines: getAllShippingLines() });
  }
  if (ports === "true") {
    return NextResponse.json({ ok: true, ports: getAllPorts() });
  }

  const origin = req.nextUrl.searchParams.get("origin") || "";
  const dest = req.nextUrl.searchParams.get("destination") || "";
  const line = req.nextUrl.searchParams.get("line") || undefined;

  if (!origin || !dest) {
    return NextResponse.json({
      ok: true,
      total_db_entries: TRANSIT_TIME_DB.length,
      shipping_lines: getAllShippingLines(),
      ports_count: getAllPorts().length,
    });
  }

  // DB-only quick lookup (no AI)
  const dbMatches = searchTransitDB(origin, dest, line);
  if (dbMatches.length > 0) {
    return NextResponse.json({ ok: true, routes: dbMatches, source: "database" });
  }
  return NextResponse.json({ ok: true, routes: [], source: "database", note: "Use POST for AI estimation" });
}
