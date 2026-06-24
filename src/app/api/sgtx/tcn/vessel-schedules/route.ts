import { NextRequest, NextResponse } from "next/server";
import { listSchedules, seedVesselSchedules } from "@/lib/sgtx/tcn/vessel-schedule";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/vessel-schedules
 *   ?corridor=EGY-ITA-RORO-001  (optional filter)
 *   ?seed=true                   (idempotent seed of demo schedules)
 *
 * Returns the list of RoRo vessel schedules. Each schedule includes vessel
 * name, IMO, ETD/ETA, transit days, RoRo capacity (trailer/vehicle/reefer),
 * LOA/beam/ramp limits, booking status, and available slots.
 */
export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const corridor = req.nextUrl.searchParams.get("corridor") || undefined;
    const shouldSeed = req.nextUrl.searchParams.get("seed") === "true";
    if (shouldSeed) {
      await seedVesselSchedules();
    }
    const schedules = await listSchedules(corridor);
    return NextResponse.json({ ok: true, schedules, total: schedules.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
