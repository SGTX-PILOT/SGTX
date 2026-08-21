// @ts-nocheck
// POST /api/sgtx/air/shipments
// Body: { ustn, shipperGtid?, consigneeGtid?, forwarderGtid?, originAirport,
//         destinationAirport, transitAirports?, serviceType?, totalPieces?,
//         totalGrossWeight?, totalVolume?, currency?, plannedDeparture?,
//         plannedArrival?, deliveryWindow?, cargoPieces? }
// Creates a new AirCargoShipment in AIR_DRAFT cargo status + BOOKING_PENDING booking status.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateChargeableWeight } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body?.originAirport || !body?.destinationAirport) {
      return NextResponse.json(
        { error: "originAirport and destinationAirport required" },
        { status: 400 },
      );
    }

    // Compute chargeable weight from cargo pieces if provided.
    let chargeableWeight: number | null = null;
    let totalGrossWeight = Number(body.totalGrossWeight) || 0;
    if (Array.isArray(body.cargoPieces) && body.cargoPieces.length > 0) {
      const cw = calculateChargeableWeight({ pieces: body.cargoPieces });
      totalGrossWeight = cw.actualGrossWeight;
      chargeableWeight = cw.chargeableWeight;
    }

    const shipment = await db.airCargoShipment.create({
      data: {
        ustn: body.ustn,
        shipperGtid: body.shipperGtid || null,
        consigneeGtid: body.consigneeGtid || null,
        forwarderGtid: body.forwarderGtid || null,
        originAirport: String(body.originAirport).toUpperCase(),
        destinationAirport: String(body.destinationAirport).toUpperCase(),
        transitAirports: body.transitAirports ? JSON.stringify(body.transitAirports) : null,
        serviceType: body.serviceType || "STANDARD",
        bookingStatus: "BOOKING_PENDING",
        cargoStatus: "AIR_DRAFT",
        customsStatus: "PENDING",
        securityStatus: "PENDING",
        deliveryStatus: "PENDING",
        totalPieces: Number(body.totalPieces) || (body.cargoPieces?.length || 0),
        totalGrossWeight,
        totalVolume: body.totalVolume != null ? Number(body.totalVolume) : null,
        chargeableWeight,
        currency: body.currency || "USD",
        plannedDeparture: body.plannedDeparture ? new Date(body.plannedDeparture) : null,
        plannedArrival: body.plannedArrival ? new Date(body.plannedArrival) : null,
        deliveryWindow: body.deliveryWindow ? JSON.stringify(body.deliveryWindow) : null,
      },
    });

    // Optionally persist cargo pieces
    if (Array.isArray(body.cargoPieces) && body.cargoPieces.length > 0) {
      for (let i = 0; i < body.cargoPieces.length; i++) {
        const p = body.cargoPieces[i];
        try {
          await db.cargoPiece.create({
            data: {
              shipmentId: shipment.id,
              ustn: body.ustn,
              pieceId: p.pieceId || `P-${i + 1}-${Date.now().toString(36).toUpperCase()}`,
              packageType: p.packageType || null,
              sscc: p.sscc || null,
              length: p.length != null ? Number(p.length) : null,
              width: p.width != null ? Number(p.width) : null,
              height: p.height != null ? Number(p.height) : null,
              actualWeight: p.actualWeight != null ? Number(p.actualWeight) : null,
              commodity: p.commodity || null,
              hsCode: p.hsCode || null,
              dgFlag: Boolean(p.dg || p.dgFlag),
              status: "EXPECTED",
            },
          });
        } catch (e: any) {
          logger.warn("[api/air/shipments] cargoPiece persist failed", {
            error: e?.message,
            index: i,
          });
        }
      }
    }

    logger.info("[api/air/shipments] POST created", {
      shipmentId: shipment.id,
      ustn: body.ustn,
    });
    return NextResponse.json({ shipment });
  } catch (err: any) {
    logger.error("[api/air/shipments] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
