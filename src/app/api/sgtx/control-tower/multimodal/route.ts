// @ts-nocheck
// GET /api/sgtx/control-tower/multimodal — Multimodal Control Tower
// v17 §20.126 — multimodal shipment tracking. Read-only aggregate over
// Shipment rows with transportMode='MULTIMODAL' or parentShipmentId set.
// Derives mode transitions from the leg chain + identifies bottlenecks at
// ports where cargo has arrived but not yet released.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getMultimodalMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const shipments = await db.shipment.findMany({
      where: {
        OR: [
          { transportMode: "MULTIMODAL" },
          { parentShipmentId: { not: null } },
        ],
      },
      take: 5000,
      orderBy: { createdAt: "desc" },
    });

    const m = getMultimodalMetrics(shipments);

    return NextResponse.json({
      active_shipments: m.activeShipments,
      mode_transitions: m.modeTransitions,
      bottlenecks: m.bottlenecks,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/multimodal GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
