// SGTX Reefer Telemetry API — per-shipment summary
// GET /api/sgtx/execution/reefer-telemetry/[shipmentId]
//
// Returns the latest reading + aggregate stats for a shipment. Powers
// the cold-chain dashboard widgets and the "last known state" badge on
// shipment cards.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getLatestTelemetry,
  getTelemetryStats,
} from "@/lib/sgtx/execution/reefer-telemetry";

export const dynamic = "force-dynamic";

/**
 * GET /api/sgtx/execution/reefer-telemetry/[shipmentId]
 * Returns `{ latest, stats }` for the shipment.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ shipmentId: string }> },
) {
  try {
    const { shipmentId } = await context.params;
    if (!shipmentId) {
      return NextResponse.json(
        { error: "shipmentId required" },
        { status: 400 },
      );
    }

    const [latest, stats] = await Promise.all([
      getLatestTelemetry(shipmentId),
      getTelemetryStats(shipmentId),
    ]);

    return NextResponse.json({
      shipmentId,
      latest,
      stats,
    });
  } catch (e: any) {
    logger.error("[reefer-telemetry/[shipmentId] GET]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}
