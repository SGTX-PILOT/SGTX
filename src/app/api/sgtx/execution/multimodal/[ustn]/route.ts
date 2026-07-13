// SGTX Multimodal Shipment API — chain retrieval
// GET /api/sgtx/execution/multimodal/[ustn]
//
// Returns the full shipment chain for a USTN, ordered by `legSequence`.
// Each leg includes its transport mode + mode-specific fields
// (vesselName/vesselImo for SEA, awbNumber/flightNumber for AIR,
// cmrNumber/truckLicensePlate for ROAD, railConsignmentNote/trainNumber
// for RAIL) so the UI can render a multimodal timeline.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/sgtx/execution/multimodal/[ustn]
 * Returns the shipment chain for a USTN.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await context.params;
    if (!ustn) {
      return NextResponse.json(
        { error: "ustn required" },
        { status: 400 },
      );
    }

    const shipments = await db.shipment.findMany({
      where: { ustn },
      orderBy: [{ legSequence: "asc" }, { sequence: "asc" }],
      include: {
        trade: {
          select: { ustn: true, commodity: true, tradeValueUsd: true, incoterm: true, status: true },
        },
      },
    });

    if (shipments.length === 0) {
      return NextResponse.json(
        { error: "no shipments found for USTN", ustn },
        { status: 404 },
      );
    }

    const chain = shipments.map((s: any) => ({
      id: s.id,
      legSequence: s.legSequence,
      parentShipmentId: s.parentShipmentId,
      sequence: s.sequence,
      transportMode: s.transportMode,
      status: s.status,
      originPort: s.originPort,
      destPort: s.destPort,
      etd: s.etd,
      eta: s.eta,
      departedAt: s.departedAt,
      arrivedAt: s.arrivedAt,
      // SEA
      vesselName: s.vesselName,
      vesselImo: s.vesselImo,
      containerNo: s.containerNo,
      containerCount: s.containerCount,
      // AIR
      awbNumber: s.awbNumber,
      flightNumber: s.flightNumber,
      airportOfDeparture: s.airportOfDeparture,
      airportOfDestination: s.airportOfDestination,
      // ROAD
      cmrNumber: s.cmrNumber,
      truckLicensePlate: s.truckLicensePlate,
      trailerLicensePlate: s.trailerLicensePlate,
      driverName: s.driverName,
      truckNumber: s.truckNumber,
      // RAIL
      railConsignmentNote: s.railConsignmentNote,
      trainNumber: s.trainNumber,
      wagonNumber: s.wagonNumber,
      // Common
      carrierGtid: s.carrierGtid,
      lat: s.lat,
      lng: s.lng,
      createdAt: s.createdAt,
    }));

    return NextResponse.json({
      ustn,
      trade: shipments[0]?.trade || null,
      legCount: chain.length,
      chain,
    });
  } catch (e: any) {
    logger.error("[multimodal/[ustn] GET]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}
