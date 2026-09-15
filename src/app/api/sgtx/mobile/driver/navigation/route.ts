// @ts-nocheck
// SGTX v17 §16.8.12 — LSP Driver App · voice navigation endpoint
// GET /api/sgtx/mobile/driver/navigation?shipmentId=<id>
//   → 200 {
//        ok,
//        turnByTurn: [{ instruction, distanceMeters, durationSeconds, modifier?, lng, lat }],
//        totalDistanceMeters, totalDurationSeconds,
//        offlineAvailable: boolean,
//        polylineGeoJson?: string,
//        simulated: boolean
//      }
//
// OSRM-style turn-by-turn navigation. Real OSRM would return 50-200 turns;
// here we return 4-8 deterministic pseudo-turns so the mobile app's
// turn-by-turn UI is fully exercisable.

import { NextRequest, NextResponse } from "next/server";
import { getVoiceNavigation } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shipmentId = searchParams.get("shipmentId");
    if (!shipmentId) {
      return NextResponse.json({ ok: false, error: "shipmentId required" }, { status: 400 });
    }
    const result = await getVoiceNavigation(shipmentId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.driver.navigation.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 500 });
  }
}
