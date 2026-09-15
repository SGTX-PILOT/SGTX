// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine — TRACE retrieval route
 * ============================================================================
 *
 * GET /api/sgtx/fees/[ustn]/trace
 *
 * Retrieves the calculation trace (full JSON breakdown of all 7 layers) for
 * the most recent Fee Decision Object stored for a USTN.
 *
 * The trace is the `CALCULATION_TRACE` field of the Fee Decision Object —
 * it includes:
 *   - layer0_constitutional (rate floor / ceiling)
 *   - layer1_cfb (exw + eligible logistics + economic class)
 *   - layer2_cts (cost-to-serve score + factors + weights)
 *   - layer3_risk (risk score + factors + weights)
 *   - layer4_value (value-delivered score + factors + weights)
 *   - layer5_efficiency (efficiency score + factors + weights)
 *   - fairness (formula + components + score)
 *   - base_fair_rate (formula + intercept + slope + rate)
 *   - master_formula (6 steps + constitutional check)
 *   - affordability (estimated gross profit + margin take rate + cap)
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
      fee_decision_id: decision.FEE_DECISION_ID,
      tsec: decision.TSEC,
      loom_hash: decision.LOOM_HASH,
      calculated_at: decision.CALCULATED_AT,
      trace: decision.CALCULATION_TRACE,
      final_fee: decision.FINAL_FEE,
      final_rate: decision.FINAL_RATE,
      cfb: decision.CFB,
      fairness_score: decision.FAIRNESS_SCORE,
      primary_class: decision.PRIMARY_CLASS,
      policy_version: FEE_POLICY_VERSION,
      formula_version: FEE_FORMULA_VERSION,
    });
  } catch (err: any) {
    logger.error("[fees/[ustn]/trace] unhandled error", { error: err?.message });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}
