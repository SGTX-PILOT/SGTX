// @ts-nocheck
// GET /api/sgtx/control-tower/roro — RoRo Control Tower
// v17 §20.122 — RoRo vessel + rolling-cargo tracking. Read-only aggregate.
// Public for observability (demo portal + admin shells have no session cookie).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getRoRoMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [vessels, shipments, portStatuses] = await Promise.all([
      db.roRoVesselSchedule.findMany({ take: 500, orderBy: { etd: "asc" } }),
      db.roRoShipment.findMany({ take: 2000, orderBy: { createdAt: "desc" } }),
      db.portRealtimeStatus.findMany({ take: 200 }),
    ]);

    const m = getRoRoMetrics(vessels, shipments, portStatuses);

    return NextResponse.json({
      active_vessels: m.activeVessels,
      vehicles_in_transit: m.vehiclesInTransit,
      next_departures: m.nextDepartures,
      port_congestion: m.portCongestion,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/roro GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
