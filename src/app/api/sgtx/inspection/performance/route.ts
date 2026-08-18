// GET /api/sgtx/inspection/performance?agencyGtid=X
//
// Returns aggregated inspection agency performance metrics — combining the
// latest InspectionAgencyPerformance row with live accreditation counts.
//
// Query params:
//   ?agencyGtid=GTID-AGENCY-...    (required)
//
// Response:
//   { agencyGtid, totalInspections, acceptanceRate, overrideRate, disputeRate,
//     rating, activeAccreditations, verifiedAccreditations, lastAssessment }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { rollupAgencyPerformance } from "@/lib/sgtx/inspection";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const agencyGtid = url.searchParams.get("agencyGtid");
    if (!agencyGtid) {
      return NextResponse.json({ error: "Missing required query param: agencyGtid" }, { status: 400 });
    }

    const rollup = await rollupAgencyPerformance(agencyGtid);
    return NextResponse.json(rollup);
  } catch (e: any) {
    logger.error("[inspection/performance] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
