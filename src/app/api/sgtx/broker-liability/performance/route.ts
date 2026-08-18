// GET /api/sgtx/broker-liability/performance?brokerGtid=X
//
// Returns aggregated broker performance metrics — combining the latest
// BrokerPerformanceMetric row, live BrokerDeclarationError counts, and
// active+verified BrokerLiabilityInsurance rollups (coverage total, gap flag).
//
// Query params:
//   ?brokerGtid=GTID-BROKER-...    (required)
//
// Response:
//   { brokerGtid, totalDeclarations, totalErrors, acceptanceRate, errorRate,
//     rating, activePolicies, verifiedPolicies, coverageTotal, coverageCurrency,
//     hasCoverageGap, lastAssessment }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { rollupBrokerPerformance } from "@/lib/sgtx/broker-liability";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const brokerGtid = url.searchParams.get("brokerGtid");
    if (!brokerGtid) {
      return NextResponse.json({ error: "Missing required query param: brokerGtid" }, { status: 400 });
    }

    const rollup = await rollupBrokerPerformance(brokerGtid);
    return NextResponse.json(rollup);
  } catch (e: any) {
    logger.error("[broker-liability/performance] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
