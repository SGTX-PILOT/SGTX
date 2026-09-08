// @ts-nocheck
// GET /api/sgtx/control-tower/road — Road Control Tower
// v17 §20.124 — international road corridor tracking. Read-only aggregate
// over RoadCorridor (+legs), CustomsOperation, RoadIncident. Public for
// observability.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getRoadMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [corridors, customsOps, incidents] = await Promise.all([
      db.roadCorridor.findMany({
        include: { legs: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      db.customsOperation.findMany({
        where: { status: { in: ["HOLD", "INSPECTION", "SUBMITTED", "DRAFT"] } },
        take: 1000,
        orderBy: { createdAt: "desc" },
      }),
      db.roadIncident.findMany({
        where: { status: { not: "RESOLVED" } },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const m = getRoadMetrics(corridors, customsOps, incidents);

    return NextResponse.json({
      active_trips: m.activeTrips,
      trucks_in_transit: m.trucksInTransit,
      border_crossings: m.borderCrossings,
      corridor_status: m.corridorStatus,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/road GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
