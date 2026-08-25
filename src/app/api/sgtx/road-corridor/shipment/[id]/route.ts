// @ts-nocheck
// GET  /api/sgtx/road-corridor/shipment/[id] — fetch a shipment with corridor + borders + gps
// PATCH /api/sgtx/road-corridor/shipment/[id] — update shipment status
//
// Blueprint v13.1 FINAL — Article 44 multi-country workflow. Status transitions
// follow ROAD_SHIPMENT_TRANSITIONS (PLANNED → IN_TRANSIT → AT_BORDER → CLEARED → DELIVERED).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getRoadShipment,
  updateShipmentStatus,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const shipment = await getRoadShipment(id);
    if (!shipment) {
      return NextResponse.json({ error: "Shipment not found" }, { status: 404 });
    }
    return NextResponse.json({ shipment });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment/[id]] GET failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (!status) {
      return NextResponse.json({ error: "Missing 'status' in body" }, { status: 400 });
    }
    const result = await updateShipmentStatus(id, status);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Transition rejected", allowed: result.allowed },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, shipment: result.shipment });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment/[id]] PATCH failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
