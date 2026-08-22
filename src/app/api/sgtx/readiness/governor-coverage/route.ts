// @ts-nocheck
// §9 Governor Coverage — verify every state-changing domain has a Governor gate.
// POST /api/sgtx/readiness/governor-coverage
//      → verifyGovernorCoverage() → returns GovernorVerificationResult.
import { NextResponse } from "next/server";
import { verifyGovernorCoverage } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await verifyGovernorCoverage();
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/governor-coverage] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
