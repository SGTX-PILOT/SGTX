// @ts-nocheck
// §9 Trade Lane Readiness — list
// GET /api/sgtx/integrations/trade-lanes?originCountry=X&destinationCountry=Y&transportMode=Z&hs6=W
import { NextResponse } from "next/server";
import { listTradeLaneReadiness } from "@/lib/sgtx/trade-lane-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const originCountry = url.searchParams.get("originCountry") || undefined;
    const destinationCountry = url.searchParams.get("destinationCountry") || undefined;
    const transportMode = url.searchParams.get("transportMode") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    if (originCountry) filters.originCountry = originCountry;
    if (destinationCountry) filters.destinationCountry = destinationCountry;
    if (transportMode) filters.transportMode = transportMode;
    if (hs6) filters.hs6 = hs6;
    const lanes = await listTradeLaneReadiness(filters);
    return NextResponse.json({ lanes });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/trade-lanes] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
