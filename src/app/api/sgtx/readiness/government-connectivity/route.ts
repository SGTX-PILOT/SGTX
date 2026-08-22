// @ts-nocheck
// §4 Government Connectivity — verify all active connectors (11 checks each).
// POST /api/sgtx/readiness/government-connectivity
//      → verifyGovernmentConnectivity() → returns GovConnectivityResult[].
import { NextResponse } from "next/server";
import { verifyGovernmentConnectivity } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await verifyGovernmentConnectivity();
    return NextResponse.json({ results, count: results.length });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/government-connectivity] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
