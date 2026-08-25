// @ts-nocheck
// GET  /api/sgtx/road-corridor/shipment — list shipments (filter by ustn, carrierGtid, status)
// POST /api/sgtx/road-corridor/shipment — create a shipment linked to a corridor
//
// Blueprint v13.1 FINAL — Article 44 (multi-country workflow). A shipment
// moves through a corridor (PLANNED → IN_TRANSIT → AT_BORDER → CLEARED → DELIVERED).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  createRoadShipment,
  listRoadShipments,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const carrierGtid = url.searchParams.get("carrierGtid") || undefined;
    const vehicleId = url.searchParams.get("vehicleId") || undefined;
    const driverId = url.searchParams.get("driverId") || undefined;
    const corridorId = url.searchParams.get("corridorId") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? parseInt(takeParam, 10) : undefined;

    const shipments = await listRoadShipments({
      ustn,
      carrierGtid,
      vehicleId,
      driverId,
      corridorId,
      status,
      take,
    });
    return NextResponse.json({ shipments, count: shipments.length });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment] GET list failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const shipment = await createRoadShipment(body || {});
    if (!shipment) {
      return NextResponse.json(
        { error: "Failed to create shipment (check required fields: ustn, corridorId)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, shipment }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment] POST create failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
