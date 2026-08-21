// @ts-nocheck
// POST /api/sgtx/air/uld
// Body: { shipmentId, ustn?, uldId?, uldOwner?, uldType, uldSerial?, tareWeight?,
//         maxGrossWeight, dimensions?, aircraftCompatible?, condition? }
// Assigns a ULD to a shipment (creates a UldAssignment row).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { generateUldId, isValidAirStateTransition } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }
    if (!body?.uldType && !body?.uldId) {
      return NextResponse.json(
        { error: "uldType or uldId required" },
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

    // Generate ULD ID if not provided
    let uldId = body.uldId;
    if (!uldId) {
      uldId = generateUldId(body.uldType || "AKE", body.uldOwner || "CX");
    }

    const uld = await db.uldAssignment.create({
      data: {
        shipmentId,
        ustn: shipment.ustn,
        uldId,
        uldOwner: body.uldOwner || null,
        uldType: body.uldType || (uldId.slice(0, 3)),
        uldSerial: body.uldSerial || (uldId.slice(3, 8)),
        tareWeight: body.tareWeight != null ? Number(body.tareWeight) : null,
        maxGrossWeight: Number(body.maxGrossWeight) || 0,
        dimensions: body.dimensions ? JSON.stringify(body.dimensions) : null,
        aircraftCompatible: body.aircraftCompatible ? JSON.stringify(body.aircraftCompatible) : null,
        condition: body.condition || "SERVICEABLE",
        location: body.location || null,
        buildUpState: "NOT_STARTED",
        breakdownState: "NOT_STARTED",
      },
    });

    // Promote shipment cargoStatus: BUILDUP_PENDING -> ULD_ASSIGNED (if applicable)
    const fromStatus = shipment.cargoStatus || "BUILDUP_PENDING";
    if (isValidAirStateTransition(fromStatus, "ULD_ASSIGNED")) {
      try {
        await db.airCargoShipment.update({
          where: { id: shipmentId },
          data: { cargoStatus: "ULD_ASSIGNED" },
        });
      } catch (e: any) {
        logger.warn("[api/air/uld] cargoStatus promotion failed", { error: e?.message });
      }
    }

    logger.info("[api/air/uld] POST assigned", { uldId: uld.id, shipmentId });
    return NextResponse.json({ uld });
  } catch (err: any) {
    logger.error("[api/air/uld] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
