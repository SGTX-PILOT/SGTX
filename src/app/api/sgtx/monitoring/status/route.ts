import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getStatusPage } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/status — public status page data
//
// Blueprint Part 15.4 — public status page (https://status.sgtx.io).
// Returns:
//   - overall: OPERATIONAL | DEGRADED | OUTAGE
//   - 12 services with per-region status
//   - active incidents with timeline updates
//   - last incident
//   - upcoming scheduled maintenance windows
export async function GET() {
  try {
    const statusPage = await getStatusPage();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...statusPage,
    });
  } catch (e: any) {
    logger.error("[monitoring/status GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch status page" },
      { status: 500 },
    );
  }
}
