// @ts-nocheck
// §9 Trade Lane Readiness — non-ready lanes (overallReadiness < 0.5)
// GET /api/sgtx/integrations/trade-lanes/non-ready
import { NextResponse } from "next/server";
import { getNonReadyLanes } from "@/lib/sgtx/trade-lane-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lanes = await getNonReadyLanes();
    return NextResponse.json({ lanes, count: lanes.length });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/trade-lanes/non-ready] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
