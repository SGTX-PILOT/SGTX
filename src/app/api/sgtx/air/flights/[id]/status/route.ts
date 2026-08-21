// @ts-nocheck
// POST /api/sgtx/air/flights/{id}/status
// Body: { status, estimatedDeparture?, estimatedArrival?, actualDeparture?,
//         actualArrival?, aircraftType?, cargoCapacity? }
// Updates a flight leg's status. Sets actualDeparture/Arrival timestamps when
// status is DEP / ARR. Also promotes the parent shipment's cargoStatus when
// the flight transitions (DEP -> DEP, ARR -> ARR) per the state machine.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { isValidAirStateTransition } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "flight id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.status) {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }

    const leg = await db.airFlightLeg.findUnique({ where: { id } });
    if (!leg) {
      return NextResponse.json({ error: "flight leg not found" }, { status: 404 });
    }

    const updateData: any = {
      status: String(body.status).toUpperCase(),
    };
    if (body.estimatedDeparture) updateData.estimatedDeparture = new Date(body.estimatedDeparture);
    if (body.estimatedArrival) updateData.estimatedArrival = new Date(body.estimatedArrival);
    if (body.actualDeparture) updateData.actualDeparture = new Date(body.actualDeparture);
    if (body.actualArrival) updateData.actualArrival = new Date(body.actualArrival);
    if (body.aircraftType) updateData.aircraftType = body.aircraftType;
    if (body.cargoCapacity != null) updateData.cargoCapacity = Number(body.cargoCapacity);

    // Set actual timestamps automatically based on status.
    const statusUpper = String(body.status).toUpperCase();
    if (statusUpper === "DEP" && !updateData.actualDeparture) {
      updateData.actualDeparture = new Date();
    }
    if (statusUpper === "ARR" && !updateData.actualArrival) {
      updateData.actualArrival = new Date();
    }

    const updated = await db.airFlightLeg.update({
      where: { id },
      data: updateData,
    });

    // Promote the shipment's cargoStatus when the flight transitions.
    // Map flight status → canonical air state.
    const flightToShipmentStatus: Record<string, string> = {
      DEP: "DEP",
      IN_FLIGHT: "IN_FLIGHT",
      ARR: "ARR",
      TRANSFER: "TRANSFER",
      RCF: "RCF",
    };
    const targetStatus = flightToShipmentStatus[statusUpper];
    if (targetStatus) {
      try {
        const shipment = await db.airCargoShipment.findUnique({
          where: { id: leg.shipmentId },
          select: { id: true, cargoStatus: true },
        });
        if (shipment) {
          const fromStatus = shipment.cargoStatus || "AIR_DRAFT";
          if (isValidAirStateTransition(fromStatus, targetStatus)) {
            await db.airCargoShipment.update({
              where: { id: shipment.id },
              data: { cargoStatus: targetStatus },
            });
          } else {
            logger.warn("[api/air/flights/[id]/status] invalid state transition", {
              shipmentId: shipment.id,
              from: fromStatus,
              to: targetStatus,
            });
          }
        }
      } catch (e: any) {
        logger.warn("[api/air/flights/[id]/status] shipment promotion failed", {
          error: e?.message,
        });
      }
    }

    logger.info("[api/air/flights/[id]/status] updated", {
      legId: id,
      status: statusUpper,
    });
    return NextResponse.json({ leg: updated });
  } catch (err: any) {
    logger.error("[api/air/flights/[id]/status] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
