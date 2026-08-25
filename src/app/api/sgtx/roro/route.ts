// @ts-nocheck
// GET  /api/sgtx/roro            — list RoRo shipments (filter by ?ustn=, ?status=, ?shipperGtid=)
// POST /api/sgtx/roro            — create a new RoRoShipment under a USTN (Art 56)
//
// Body (POST):
//   { ustn, shipmentReference?, shipperGtid?, consigneeGtid?, originPort,
//     destinationPort, transitPorts?: string[], incoterm?, units?: [...] }
//
// Returns:
//   GET  → { shipments: [...], count: N }
//   POST → { shipment: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  createRoRoShipment,
  listRoRoShipments,
} from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const shipperGtid = url.searchParams.get("shipperGtid") || undefined;
    const takeRaw = Number(url.searchParams.get("take") || "50");
    const take = Number.isFinite(takeRaw) ? takeRaw : 50;

    const shipments = await listRoRoShipments({ ustn, status, shipperGtid, take });
    return NextResponse.json({ shipments, count: shipments.length });
  } catch (e: any) {
    logger.error("[api/sgtx/roro GET] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json(
        { error: "ustn is required" },
        { status: 400 },
      );
    }
    if (!body?.originPort || !body?.destinationPort) {
      return NextResponse.json(
        { error: "originPort and destinationPort are required" },
        { status: 400 },
      );
    }

    const shipment = await createRoRoShipment({
      ustn: body.ustn,
      shipmentReference: body.shipmentReference,
      shipperGtid: body.shipperGtid,
      consigneeGtid: body.consigneeGtid,
      originPort: body.originPort,
      destinationPort: body.destinationPort,
      transitPorts: Array.isArray(body.transitPorts) ? body.transitPorts : [],
      incoterm: body.incoterm,
      units: Array.isArray(body.units) ? body.units : [],
    });

    if (!shipment) {
      return NextResponse.json(
        { error: "Failed to create RoRo shipment — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro POST] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
