// GET /api/sgtx/broker-liability/list?brokerGtid=X
//
// Returns all liability insurance policies for a broker, with computed
// `effectiveStatus` (ACTIVE / EXPIRED / CANCELLED) and a coverage-gap flag.
//
// Query params:
//   ?brokerGtid=GTID-BROKER-...    (required)
//
// Response:
//   { brokerGtid, policies: [...], count, coverageGap: { hasGap, reason, activeVerifiedCount } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listPolicies, detectCoverageGap } from "@/lib/sgtx/broker-liability";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const brokerGtid = url.searchParams.get("brokerGtid");
    if (!brokerGtid) {
      return NextResponse.json({ error: "Missing required query param: brokerGtid" }, { status: 400 });
    }

    const policies = await listPolicies(brokerGtid);
    const coverageGap = detectCoverageGap(policies);

    return NextResponse.json({
      brokerGtid,
      policies,
      count: policies.length,
      coverageGap,
    });
  } catch (e: any) {
    logger.error("[broker-liability/list] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
