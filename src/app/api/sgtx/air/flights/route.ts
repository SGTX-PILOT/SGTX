// @ts-nocheck
// POST /api/sgtx/air/flights
// Body: { shipmentId, ustn, sequence, flightNumber?, operatingAirline?,
//         marketingAirline?, originAirport, destinationAirport,
//         scheduledDeparture?, scheduledArrival?, estimatedDeparture?,
//         estimatedArrival?, aircraftType?, cargoCapacity?, allocatedWeight?,
//         allocatedVolume?, bookingReference? }
// Creates an AirFlightLeg row.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

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
    if (!body?.originAirport || !body?.destinationAirport) {
      return NextResponse.json(
        { error: "originAirport and destinationAirport required" },
        { status: 400 },
      );
    }

    let shipmentId = body.shipmentId;
    let ustn = body.ustn;
    if (!shipmentId && ustn) {
      const sh = await db.airCargoShipment.findFirst({ where: { ustn } });
      shipmentId = sh?.id;
    }
    if (!shipmentId) {
      return NextResponse.json({ error: "shipment not found" }, { status: 404 });
    }

    const leg = await db.airFlightLeg.create({
      data: {
        shipmentId,
        ustn,
        sequence: Number(body.sequence) || 1,
        flightNumber: body.flightNumber || null,
        operatingAirline: body.operatingAirline || null,
        marketingAirline: body.marketingAirline || null,
        originAirport: String(body.originAirport).toUpperCase(),
        destinationAirport: String(body.destinationAirport).toUpperCase(),
        scheduledDeparture: body.scheduledDeparture ? new Date(body.scheduledDeparture) : null,
        scheduledArrival: body.scheduledArrival ? new Date(body.scheduledArrival) : null,
        estimatedDeparture: body.estimatedDeparture ? new Date(body.estimatedDeparture) : null,
        estimatedArrival: body.estimatedArrival ? new Date(body.estimatedArrival) : null,
        aircraftType: body.aircraftType || null,
        cargoCapacity: body.cargoCapacity != null ? Number(body.cargoCapacity) : null,
        allocatedWeight: body.allocatedWeight != null ? Number(body.allocatedWeight) : null,
        allocatedVolume: body.allocatedVolume != null ? Number(body.allocatedVolume) : null,
        bookingReference: body.bookingReference || null,
        status: "SCHEDULED",
      },
    });

    logger.info("[api/air/flights] POST created", { legId: leg.id, ustn });
    return NextResponse.json({ leg });
  } catch (err: any) {
    logger.error("[api/air/flights] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
