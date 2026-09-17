// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine — DECISION retrieval route
 * ============================================================================
 *
 * GET /api/sgtx/fees/[ustn]/decision
 *
 * Retrieves the most recent Fee Decision Object stored for a USTN.
 *
 * Returns the full Fee Decision Object (35+ fields per §9.27.21) if found,
 * else 404.
 *
 * PUBLIC route (anonymous callers can GET — tenant scoping by URL ustn).
 */

import { NextRequest, NextResponse } from "next/server";
import { getFeeDecision } from "@/lib/sgtx/fee-engine";
import {
  FEE_POLICY_VERSION,
  FEE_FORMULA_VERSION,
} from "@/lib/sgtx/fee-engine/constants";
import { logger } from "@/lib/sgtx/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    const ustnStr = String(ustn || "").trim();

    if (!ustnStr) {
      return NextResponse.json(
        { error: "ustn path segment is required" },
        { status: 400 },
      );
    }

    const decision = await getFeeDecision(ustnStr);

    if (!decision) {
      return NextResponse.json(
        {
          error: "No Fee Decision found for this USTN",
          ustn: ustnStr,
          hint: "POST /api/sgtx/fees/calculate to compute a new Fee Decision Object.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ustn: ustnStr,
      fee_decision: decision,
      policy_version: FEE_POLICY_VERSION,
      formula_version: FEE_FORMULA_VERSION,
    });
  } catch (err: any) {
    logger.error("[fees/[ustn]/decision] unhandled error", { error: err?.message });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}
