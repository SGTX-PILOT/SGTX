// @ts-nocheck
// POST /api/sgtx/roro/unit/[id]/gate — record a gate-in / gate-out event (Art 65).
//
// Body:
//   { shipmentId, eventType: "GATE_IN"|"GATE_OUT", gateType: "ORIGIN"|"DESTINATION",
//     terminalGtid?, vinScan?, customsStatus?, inspectorName?, gateReference? }
//
// The route also accepts the legacy signature where shipmentId is passed
// via the path; we fall back to looking up the unit's shipmentId when needed.
//
// Returns:
//   { event: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { recordGateEvent } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing unit id" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const eventType = String(body.eventType || "").toUpperCase();
    const gateType = String(body.gateType || "").toUpperCase();
    if (!eventType || !gateType) {
      return NextResponse.json(
        { error: "eventType and gateType are required" },
        { status: 400 },
      );
    }

    // Resolve shipmentId — either from body or by looking up the unit.
    let shipmentId = body.shipmentId;
    if (!shipmentId) {
      try {
        const unit = await (db as any).roRoUnit.findUnique({
          where: { id },
          select: { shipmentId: true },
        });
        if (!unit) {
          return NextResponse.json(
            { error: "Unit not found" },
            { status: 404 },
          );
        }
        shipmentId = unit.shipmentId;
      } catch (lookupErr: any) {
        logger.warn("[api/sgtx/roro/unit/[id]/gate POST] shipment lookup failed", {
          unitId: id,
          error: lookupErr?.message,
        });
        return NextResponse.json(
          { error: "Unit not found" },
          { status: 404 },
        );
      }
    }

    const event = await recordGateEvent(
      shipmentId,
      id,
      eventType,
      gateType,
      body.terminalGtid,
      body.vinScan,
      body.customsStatus,
      body.inspectorName,
      body.gateReference,
    );
    if (!event) {
      return NextResponse.json(
        { error: "Failed to record gate event — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ event }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/unit/[id]/gate POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
