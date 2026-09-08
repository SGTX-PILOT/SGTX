// @ts-nocheck
// GET /api/sgtx/control-tower/ocean — Ocean Container Control Tower
// v17 §20.125 — ocean container tracking. Read-only aggregate over
// ShippingSchedule, Shipment (sea), PortRealtimeStatus. Public for
// observability.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getOceanMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [schedules, shipments, portStatuses] = await Promise.all([
      db.shippingSchedule.findMany({ take: 1000, orderBy: { etd: "asc" } }),
      db.shipment.findMany({
        where: { transportMode: "SEA" },
        take: 5000,
        orderBy: { createdAt: "desc" },
      }),
      db.portRealtimeStatus.findMany({ take: 200 }),
    ]);

    const m = getOceanMetrics(schedules, shipments, portStatuses);

    return NextResponse.json({
      active_vessels: m.activeVessels,
      containers_in_transit: m.containersInTransit,
      port_congestion: m.portCongestion,
      vessel_schedule: m.vesselSchedule,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/ocean GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
