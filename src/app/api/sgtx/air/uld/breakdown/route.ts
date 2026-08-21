// @ts-nocheck
// POST /api/sgtx/air/uld/breakdown
// Body: { uldId, operatorId?, location? }
// Marks the ULD as broken down (BREAKDOWN_COMPLETE), releases the cargo pieces.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { isValidAirStateTransition } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.uldId) {
      return NextResponse.json({ error: "uldId required" }, { status: 400 });
    }

    const uld = await db.uldAssignment.findUnique({ where: { id: body.uldId } });
    if (!uld) {
      return NextResponse.json({ error: "ULD not found" }, { status: 404 });
    }

    const updated = await db.uldAssignment.update({
      where: { id: body.uldId },
      data: {
        breakdownState: "COMPLETED",
        location: body.location || uld.location,
      },
    });

    // Promote shipment cargoStatus: ARR -> RCF (Recovered at destination)
    try {
      const shipment = await db.airCargoShipment.findUnique({
        where: { id: uld.shipmentId },
        select: { id: true, cargoStatus: true },
      });
      if (shipment) {
        const from = shipment.cargoStatus || "ARR";
        if (isValidAirStateTransition(from, "RCF")) {
          await db.airCargoShipment.update({
            where: { id: shipment.id },
            data: { cargoStatus: "RCF" },
          });
        }
      }
    } catch (e: any) {
      logger.warn("[api/air/uld/breakdown] shipment promotion failed", { error: e?.message });
    }

    logger.info("[api/air/uld/breakdown] POST broken down", { uldId: body.uldId });
    return NextResponse.json({
      uld: updated,
      breakdownAt: new Date().toISOString(),
      operatorId: body.operatorId || null,
    });
  } catch (err: any) {
    logger.error("[api/air/uld/breakdown] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
