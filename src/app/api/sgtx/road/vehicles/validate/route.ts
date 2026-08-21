// @ts-nocheck
// POST /api/sgtx/road/vehicles/validate
// Body: { vehicleId, country?, dangerousGoods? }
// Delegates to the jurisdiction adapter for the requested country (default: EG).
import { NextRequest, NextResponse } from "next/server";
import { getJurisdictionAdapter } from "@/lib/sgtx/road-corridor/jurisdiction-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.vehicleId) {
      return NextResponse.json({ error: "vehicleId required" }, { status: 400 });
    }
    const country = (body.country || "EG").toUpperCase();
    const adapter = getJurisdictionAdapter(country);
    const result = await adapter.validateVehicle(body);
    return NextResponse.json({
      country,
      adapter: adapter.countryCode,
      ...result,
    });
  } catch (err: any) {
    logger.error("[api/road/vehicles/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
