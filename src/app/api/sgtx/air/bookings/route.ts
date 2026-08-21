// @ts-nocheck
// POST /api/sgtx/air/bookings
// Body: { ustn, shipmentId?, airlineGtid?, forwarderGtid?, originAirport,
//         destinationAirport, flightNumber?, flightDate?, serviceLevel?,
//         totalPieces?, totalWeight?, totalVolume?, chargeableWeight?,
//         dgFlag?, pharmaFlag?, temperatureSetPoint?, specialHandling?,
//         deliveryWindow? }
// Creates an AirCargoBooking row in REQUESTED status. Returns MANUAL_REQUIRED
// if the airline adapter cannot file automatically.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getAirlineAdapter } from "@/lib/sgtx/air-cargo/adapters";

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

    const booking = await db.airCargoBooking.create({
      data: {
        ustn: body.ustn,
        shipmentId: body.shipmentId || null,
        airlineGtid: body.airlineGtid || null,
        forwarderGtid: body.forwarderGtid || null,
        originAirport: String(body.originAirport).toUpperCase(),
        destinationAirport: String(body.destinationAirport).toUpperCase(),
        flightNumber: body.flightNumber || null,
        flightDate: body.flightDate ? new Date(body.flightDate) : null,
        serviceLevel: body.serviceLevel || "STANDARD",
        totalPieces: Number(body.totalPieces) || 0,
        totalWeight: Number(body.totalWeight) || 0,
        totalVolume: body.totalVolume != null ? Number(body.totalVolume) : null,
        chargeableWeight: body.chargeableWeight != null ? Number(body.chargeableWeight) : null,
        dgFlag: Boolean(body.dgFlag),
        pharmaFlag: Boolean(body.pharmaFlag),
        temperatureSetPoint: body.temperatureSetPoint != null ? Number(body.temperatureSetPoint) : null,
        specialHandling: body.specialHandling ? JSON.stringify(body.specialHandling) : null,
        deliveryWindow: body.deliveryWindow ? JSON.stringify(body.deliveryWindow) : null,
        status: "REQUESTED",
      },
    });

    // Attempt to file via airline adapter (if airlineGtid set)
    let adapterResult: any = null;
    if (body.airlineGtid) {
      try {
        const adapter = getAirlineAdapter(body.airlineGtid);
        adapterResult = await adapter.requestBooking({
          ustn: body.ustn,
          flightNumber: body.flightNumber,
          flightDate: body.flightDate,
          serviceLevel: body.serviceLevel,
          cargoType: body.dgFlag ? "DG" : (body.pharmaFlag ? "PHARMA" : "GENERAL"),
        });
      } catch (e: any) {
        logger.warn("[api/air/bookings] adapter call failed", { error: e?.message });
      }
    }

    logger.info("[api/air/bookings] POST created", {
      bookingId: booking.id,
      ustn: body.ustn,
      adapterStatus: adapterResult?.status,
    });
    return NextResponse.json({
      booking,
      adapter: adapterResult,
    });
  } catch (err: any) {
    logger.error("[api/air/bookings] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
