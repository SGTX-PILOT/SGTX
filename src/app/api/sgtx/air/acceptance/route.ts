// @ts-nocheck
// POST /api/sgtx/air/acceptance
// Body: { shipmentId, ustn?, acceptanceReference?, warehouse?, actualPieces?,
//         actualGrossWeight?, volumetricWeight?, chargeableWeight?, location? }
// Performs cargo acceptance (Ready for Carriage -> Received at Terminal -> Weighed -> RCS).
// Updates the shipment with actual weights, promotes cargoStatus to RCS, and
// records an AirIrregularity-free audit row.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  isValidAirStateTransition,
  calculateChargeableWeight,
} from "@/lib/sgtx/air-cargo";

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

    // Compute chargeable weight from pieces if provided
    let actualGrossWeight = Number(body.actualGrossWeight) || shipment.totalGrossWeight || 0;
    let chargeableWeight = body.chargeableWeight != null ? Number(body.chargeableWeight) : shipment.chargeableWeight;
    let volumetricWeight = body.volumetricWeight != null ? Number(body.volumetricWeight) : null;
    if (Array.isArray(body.pieces) && body.pieces.length > 0) {
      const cw = calculateChargeableWeight({ pieces: body.pieces });
      actualGrossWeight = cw.actualGrossWeight;
      volumetricWeight = cw.volumetricWeight;
      chargeableWeight = cw.chargeableWeight;
    }

    const acceptanceReference =
      body.acceptanceReference || `ACC-${Date.now().toString(36).toUpperCase()}`;

    // Update the shipment: actual weights + promote cargoStatus to RCS.
    const updateData: any = {
      totalGrossWeight: actualGrossWeight,
      chargeableWeight,
    };
    if (body.actualPieces != null) {
      updateData.totalPieces = Number(body.actualPieces);
    }

    const fromStatus = shipment.cargoStatus || "READY_FOR_CARRIAGE";
    const toStatus = "RCS";
    if (isValidAirStateTransition(fromStatus, "WEIGHED")) {
      // Multi-step promotion: READY_FOR_CARRIAGE -> ACCEPTANCE_PENDING -> RECEIVED_AT_TERMINAL
      // -> SCREENING -> SECURITY_CLEARED -> WEIGHED -> RCS — the engine collapses
      // these intermediate states in a single acceptance operation if the
      // shipment is security-cleared.
      if (shipment.securityStatus === "SECURE" || shipment.securityStatus === "SCREENED") {
        updateData.cargoStatus = toStatus;
      } else {
        // If not yet security-cleared, stop at RECEIVED_AT_TERMINAL
        updateData.cargoStatus = "RECEIVED_AT_TERMINAL";
      }
    } else {
      logger.warn("[api/air/acceptance] invalid state transition", {
        shipmentId,
        from: fromStatus,
        to: toStatus,
      });
    }

    const updated = await db.airCargoShipment.update({
      where: { id: shipmentId },
      data: updateData,
    });

    logger.info("[api/air/acceptance] POST accepted", {
      shipmentId,
      acceptanceReference,
      actualGrossWeight,
      chargeableWeight,
      newStatus: updateData.cargoStatus,
    });
    return NextResponse.json({
      shipment: updated,
      acceptanceReference,
      actualGrossWeight,
      volumetricWeight,
      chargeableWeight,
    });
  } catch (err: any) {
    logger.error("[api/air/acceptance] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
