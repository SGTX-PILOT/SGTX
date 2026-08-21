// @ts-nocheck
// POST /api/sgtx/air/pod
// Body: { shipmentId, ustn?, signedBy, signatureHash?, location?, timestamp?,
//         photoHashes?, notes?, receiverName?, receiverContact? }
// Records proof of delivery. Stores as an AirIrregularity of type DAMAGE? no —
// store as a low-severity incident prefixed with [POD] (mirrors road module's
// approach since the schema has no dedicated AirPOD model). Promotes
// shipment cargoStatus: READY_FOR_DELIVERY -> DLV -> COMPLETED (if valid).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { isValidAirStateTransition } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.signedBy) {
      return NextResponse.json({ error: "signedBy required" }, { status: 400 });
    }
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }

    let shipmentId = body.shipmentId;
    let shipment: any = null;
    if (body.ustn && !shipmentId) {
      shipment = await db.airCargoShipment.findFirst({ where: { ustn: body.ustn } });
      shipmentId = shipment?.id;
    } else if (shipmentId) {
      shipment = await db.airCargoShipment.findUnique({ where: { id: shipmentId } });
    }
    if (!shipment || !shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Persist as an AirIrregularity (no dedicated AirPOD model in schema).
    const incident = await db.airIrregularity.create({
      data: {
        shipmentId,
        ustn: shipment.ustn,
        irregularityType: "DELAY", // closest type — description carries [POD] prefix
        description: `[POD] Signed by ${body.signedBy}${
          body.receiverName ? ` (receiver: ${body.receiverName})` : ""
        }${body.notes ? ` — ${body.notes}` : ""}`,
        severity: "LOW",
        status: "RESOLVED",
        resolvedAt: new Date(),
        airport: body.location || shipment.destinationAirport,
      },
    });

    // Promote shipment cargoStatus: READY_FOR_DELIVERY -> DLV -> COMPLETED.
    try {
      const from = shipment.cargoStatus || "READY_FOR_DELIVERY";
      if (isValidAirStateTransition(from, "DLV")) {
        await db.airCargoShipment.update({
          where: { id: shipmentId },
          data: { cargoStatus: "DLV", deliveryStatus: "DELIVERED" },
        });
        // DLV -> COMPLETED is the final transition
        if (isValidAirStateTransition("DLV", "COMPLETED")) {
          await db.airCargoShipment.update({
            where: { id: shipmentId },
            data: { cargoStatus: "COMPLETED" },
          });
        }
      } else if (from === "DLV" && isValidAirStateTransition("DLV", "COMPLETED")) {
        await db.airCargoShipment.update({
          where: { id: shipmentId },
          data: { cargoStatus: "COMPLETED", deliveryStatus: "DELIVERED" },
        });
      }
    } catch (e: any) {
      logger.warn("[api/air/pod] shipment promotion failed", { error: e?.message });
    }

    logger.info("[api/air/pod] POST created", {
      podId: incident.id,
      shipmentId,
      signedBy: body.signedBy,
    });
    return NextResponse.json({
      ok: true,
      podId: incident.id,
      signedBy: body.signedBy,
      signedAt: new Date().toISOString(),
      shipmentId,
      ustn: shipment.ustn,
    });
  } catch (err: any) {
    logger.error("[api/air/pod] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
