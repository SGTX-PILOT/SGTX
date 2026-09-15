// @ts-nocheck
// SGTX v17 §16.8.12 — QC Inspector App · jobs endpoint
// GET /api/sgtx/mobile/inspector/jobs?inspectorGtid=<gtid>
//   → 200 { ok, jobs: InspectionJob[] }

import { NextRequest, NextResponse } from "next/server";
import { getInspectionJobs } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const inspectorGtid = searchParams.get("inspectorGtid");
    if (!inspectorGtid) {
      return NextResponse.json(
        { ok: false, error: "inspectorGtid required" },
        { status: 400 },
      );
    }
    const result = await getInspectionJobs(inspectorGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.inspector.jobs.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 500 });
  }
}
