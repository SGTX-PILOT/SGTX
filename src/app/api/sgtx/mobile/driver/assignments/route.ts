// @ts-nocheck
// SGTX v17 §16.8.12 — LSP Driver App · assignments endpoint
// GET /api/sgtx/mobile/driver/assignments?driverGtid=<gtid>
//   → 200 { ok, assignments: DriverAssignment[] }

import { NextRequest, NextResponse } from "next/server";
import { getDriverAssignments } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const driverGtid = searchParams.get("driverGtid");
    if (!driverGtid) {
      return NextResponse.json(
        { ok: false, error: "driverGtid required" },
        { status: 400 },
      );
    }
    const result = await getDriverAssignments(driverGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.driver.assignments.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 500 });
  }
}
