// @ts-nocheck
// POST /api/sgtx/air/uld/build
// Body: { uldId, pieces?, aircraftType?, buildPlan?, operatorId? }
// Runs the ULD Build Optimizer (§17) and updates the UldAssignment row with
// the build plan + utilization. Promotes buildUpState to COMPLETED.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { optimizeUldBuildup, isValidAirStateTransition } from "@/lib/sgtx/air-cargo";

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

    // Pull pieces from the shipment (or accept from body)
    let pieces: any[] = Array.isArray(body.pieces) ? body.pieces : [];
    if (pieces.length === 0) {
      try {
        const cargoPieces = await db.cargoPiece.findMany({
          where: { shipmentId: uld.shipmentId },
        });
        pieces = cargoPieces.map((p: any, i: number) => ({
          id: p.pieceId || p.id,
          weight: p.actualWeight || 0,
          length: p.length || 0,
          width: p.width || 0,
          height: p.height || 0,
          dg: p.dgFlag || false,
          tempControlled: p.temperatureMin != null || p.temperatureMax != null,
        }));
      } catch (e: any) {
        logger.warn("[api/air/uld/build] cargoPiece fetch failed", { error: e?.message });
      }
    }

    // Parse ULD dimensions
    let uldDimensions = body.uldDimensions;
    if (!uldDimensions && uld.dimensions) {
      try {
        uldDimensions = JSON.parse(uld.dimensions);
      } catch {
        uldDimensions = { length: 0, width: 0, height: 0 };
      }
    }
    if (!uldDimensions) {
      uldDimensions = { length: 0, width: 0, height: 0 };
    }

    const result = optimizeUldBuildup({
      pieces,
      uldType: uld.uldType || "AKE",
      uldMaxGross: uld.maxGrossWeight || 0,
      uldTare: uld.tareWeight || 0,
      uldDimensions,
      aircraftType: body.aircraftType,
    });

    // Persist the build plan on the ULD
    const updated = await db.uldAssignment.update({
      where: { id: body.uldId },
      data: {
        buildUpState: result.valid ? "COMPLETED" : "IN_PROGRESS",
        totalPieces: result.assigned.length,
        totalWeight: result.totalWeight,
        utilizationPct: result.utilizationPct,
        buildPlan: JSON.stringify({
          assigned: result.assigned,
          instructions: result.buildInstructions,
          aircraftType: body.aircraftType || null,
          operatorId: body.operatorId || null,
          builtAt: new Date().toISOString(),
        }),
      },
    });

    // Promote shipment cargoStatus: ULD_ASSIGNED -> BUILT_UP
    try {
      const shipment = await db.airCargoShipment.findUnique({
        where: { id: uld.shipmentId },
        select: { id: true, cargoStatus: true },
      });
      if (shipment) {
        const from = shipment.cargoStatus || "ULD_ASSIGNED";
        if (isValidAirStateTransition(from, "BUILT_UP") && result.valid) {
          await db.airCargoShipment.update({
            where: { id: shipment.id },
            data: { cargoStatus: "BUILT_UP" },
          });
        }
      }
    } catch (e: any) {
      logger.warn("[api/air/uld/build] shipment promotion failed", { error: e?.message });
    }

    logger.info("[api/air/uld/build] POST built", {
      uldId: body.uldId,
      assignedPieces: result.assigned.length,
      utilization: result.utilizationPct,
      valid: result.valid,
    });
    return NextResponse.json({ uld: updated, build: result });
  } catch (err: any) {
    logger.error("[api/air/uld/build] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
