// @ts-nocheck
// GET  /api/sgtx/roro/voyage      — list RoRo voyages (filter by ?status=, ?vesselImo=, ?originPort=)
// POST /api/sgtx/roro/voyage      — create a new RoRoVoyage (Art 60)
//
// Body (POST):
//   { vesselName, vesselImo?, voyageNumber?, operatorGtid?, originPort,
//     destinationPort, transitPorts?: string[], etd?, eta?,
//     actualDeparture?, actualArrival?, bookingCutoff?, documentCutoff?,
//     gateCutoff?, cargoCutoff?, status? }
//
// Returns:
//   GET  → { voyages: [...], count: N }
//   POST → { voyage: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createRoRoVoyage, listRoRoVoyages } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const vesselImo = url.searchParams.get("vesselImo") || undefined;
    const originPort = url.searchParams.get("originPort") || undefined;
    const takeRaw = Number(url.searchParams.get("take") || "50");
    const take = Number.isFinite(takeRaw) ? takeRaw : 50;

    const voyages = await listRoRoVoyages({ status, vesselImo, originPort, take });
    return NextResponse.json({ voyages, count: voyages.length });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/voyage GET] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.vesselName) {
      return NextResponse.json(
        { error: "vesselName is required" },
        { status: 400 },
      );
    }
    if (!body?.originPort || !body?.destinationPort) {
      return NextResponse.json(
        { error: "originPort and destinationPort are required" },
        { status: 400 },
      );
    }
    const voyage = await createRoRoVoyage(body);
    if (!voyage) {
      return NextResponse.json(
        { error: "Failed to create RoRo voyage — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ voyage }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/voyage POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
