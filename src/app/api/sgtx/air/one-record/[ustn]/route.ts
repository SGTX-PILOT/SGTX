// @ts-nocheck
// GET /api/sgtx/air/one-record/{ustn} — return a ONE Record snapshot for a shipment.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const shipment = await db.airCargoShipment.findFirst({
      where: { ustn },
      include: {
        waybills: true,
        cargoPieces: true,
        uldAssignments: true,
        securityRecords: { orderBy: { createdAt: "desc" }, take: 5 },
        dgRecords: { orderBy: { createdAt: "desc" }, take: 5 },
        customsOps: { orderBy: { createdAt: "desc" }, take: 5 },
        flightLegs: { orderBy: { sequence: "asc" } },
        irregularities: { orderBy: { createdAt: "desc" }, take: 10 },
        iotEvents: { orderBy: { recordedAt: "desc" }, take: 10 },
      },
    });
    if (!shipment) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    // Build a ONE Record LogisticsObject snapshot
    const snapshot = {
      "@context": "https://onerecord.iata.org/api/v2",
      version: "2.0",
      logisticsObject: {
        shipmentId: shipment.id,
        ustn: shipment.ustn,
        origin: shipment.originAirport,
        destination: shipment.destinationAirport,
        serviceType: shipment.serviceType,
        totalPieces: shipment.totalPieces,
        totalGrossWeight: shipment.totalGrossWeight,
        chargeableWeight: shipment.chargeableWeight,
        currency: shipment.currency,
        cargoStatus: shipment.cargoStatus,
        customsStatus: shipment.customsStatus,
        securityStatus: shipment.securityStatus,
        deliveryStatus: shipment.deliveryStatus,
        plannedDeparture: shipment.plannedDeparture,
        plannedArrival: shipment.plannedArrival,
      },
      waybills: shipment.waybills,
      cargoPieces: shipment.cargoPieces,
      uldAssignments: shipment.uldAssignments,
      securityRecords: shipment.securityRecords,
      dgRecords: shipment.dgRecords,
      customsOps: shipment.customsOps,
      flightLegs: shipment.flightLegs,
      irregularities: shipment.irregularities,
      iotEvents: shipment.iotEvents,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ oneRecord: snapshot });
  } catch (err: any) {
    logger.error("[api/air/one-record/[ustn]] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
