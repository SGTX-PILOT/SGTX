// @ts-nocheck
// GET /api/sgtx/control-tower/air — Air Control Tower
// v17 §20.123 — air cargo tracking. Read-only aggregate over AirFlightLeg,
// AirCargoShipment, AirIrregularity. Public for observability.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getAirMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [flightLegs, shipments, irregularities] = await Promise.all([
      db.airFlightLeg.findMany({ take: 2000, orderBy: { scheduledDeparture: "asc" } }),
      db.airCargoShipment.findMany({ take: 2000, orderBy: { createdAt: "desc" } }),
      db.airIrregularity.findMany({
        where: { status: { not: "RESOLVED" } },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const m = getAirMetrics(flightLegs, shipments, irregularities);

    return NextResponse.json({
      active_flights: m.activeFlights,
      cargo_in_transit: m.cargoInTransit,
      airport_congestion: m.airportCongestion,
      next_departures: m.nextDepartures,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/air GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
