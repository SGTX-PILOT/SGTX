// @ts-nocheck
// GET  /api/sgtx/road-corridor/shipment/[id]/gps — list GPS pings for a shipment
// POST /api/sgtx/road-corridor/shipment/[id]/gps — record a GPS ping (lat/lon/speed/heading)
//
// Blueprint v13.1 FINAL — Article 43 (GPS entity). The GPS trail drives the
// real-time map view in the portal. Side-effect: the first ping after a
// shipment is PLANNED auto-transitions the shipment to IN_TRANSIT.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  recordGpsPing,
  listGpsPings,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }
    const url = new URL(req.url);
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) : undefined;
    const pings = await listGpsPings(id, { take });
    return NextResponse.json({ pings, count: pings.length });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment/[id]/gps] GET failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const { latitude, longitude, speed, heading } = body || {};
    if (latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "latitude and longitude are required" },
        { status: 400 },
      );
    }
    const ping = await recordGpsPing(id, latitude, longitude, speed, heading);
    if (!ping) {
      return NextResponse.json(
        { error: "Failed to record GPS ping (invalid lat/lon or DB error)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, ping }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment/[id]/gps] POST failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
