// SGTX Reefer Telemetry API — collection + query endpoint
// POST  /api/sgtx/execution/reefer-telemetry         — record a single reading
// GET   /api/sgtx/execution/reefer-telemetry         — query by shipmentId (with optional from/to/limit)
//
// Used by Carrier Transicold / Thermo King / Roambee / Tive / Sensitech
// device bridges to ingest continuous reefer telemetry, and by dashboards
// to pull a time-series for a shipment.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  recordTelemetry,
  getTelemetry,
  type RecordTelemetryInput,
} from "@/lib/sgtx/execution/reefer-telemetry";

export const dynamic = "force-dynamic";

/**
 * GET /api/sgtx/execution/reefer-telemetry?shipmentId=...&from=...&to=...&limit=...
 * Returns the time-series for a shipment (oldest → newest).
 */
export async function GET(req: NextRequest) {
  try {
    const shipmentId = req.nextUrl.searchParams.get("shipmentId");
    if (!shipmentId) {
      return NextResponse.json(
        { error: "shipmentId query param required" },
        { status: 400 },
      );
    }
    const fromRaw = req.nextUrl.searchParams.get("from");
    const toRaw = req.nextUrl.searchParams.get("to");
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const readings = await getTelemetry(shipmentId, {
      from,
      to,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return NextResponse.json({
      shipmentId,
      count: readings.length,
      readings,
    });
  } catch (e: any) {
    logger.error("[reefer-telemetry GET]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sgtx/execution/reefer-telemetry
 * Body matches `RecordTelemetryInput` (shipmentId, ustn, actualTempC
 * required; everything else optional). Persists the reading and returns
 * the created row including the auto-detected `tempExcursion` /
 * `powerFailure` flags.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | RecordTelemetryInput
      | null;
    if (!body) {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }
    if (!body.shipmentId || !body.ustn || body.actualTempC == null) {
      return NextResponse.json(
        {
          error:
            "missing required fields (shipmentId, ustn, actualTempC)",
        },
        { status: 400 },
      );
    }
    const reading = await recordTelemetry(body);
    return NextResponse.json({ ok: true, reading }, { status: 201 });
  } catch (e: any) {
    logger.error("[reefer-telemetry POST]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}
