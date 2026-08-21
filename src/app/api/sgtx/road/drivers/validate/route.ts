// @ts-nocheck
// POST /api/sgtx/road/drivers/validate
// Body: { driverId, country?, dangerousGoods? }
// Delegates to the jurisdiction adapter for the requested country (default: EG).
import { NextRequest, NextResponse } from "next/server";
import { getJurisdictionAdapter } from "@/lib/sgtx/road-corridor/jurisdiction-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.driverId) {
      return NextResponse.json({ error: "driverId required" }, { status: 400 });
    }
    const country = (body.country || "EG").toUpperCase();
    const adapter = getJurisdictionAdapter(country);
    const result = await adapter.validateDriver(body);
    return NextResponse.json({
      country,
      adapter: adapter.countryCode,
      ...result,
    });
  } catch (err: any) {
    logger.error("[api/road/drivers/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
