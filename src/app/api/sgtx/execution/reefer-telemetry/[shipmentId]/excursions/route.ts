// SGTX Reefer Telemetry API — excursion detection
// GET /api/sgtx/execution/reefer-telemetry/[shipmentId]/excursions
//
// Returns an array of contiguous temperature-excursion windows for a
// shipment. Each event reports start/end timestamps, peak temperature,
// max deviation from setpoint, and duration in minutes. Used by the
// cold-chain quality dashboard and the shelf-life prediction engine.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { detectExcursions } from "@/lib/sgtx/execution/reefer-telemetry";

export const dynamic = "force-dynamic";

/**
 * GET /api/sgtx/execution/reefer-telemetry/[shipmentId]/excursions
 * Returns `{ excursions, count }`.
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

    const excursions = await detectExcursions(shipmentId);
    return NextResponse.json({
      shipmentId,
      count: excursions.length,
      excursions,
    });
  } catch (e: any) {
    logger.error("[reefer-telemetry/[shipmentId]/excursions GET]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}
