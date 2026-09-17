// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine — CALCULATE route (full 7-layer)
 * ============================================================================
 *
 * POST /api/sgtx/fees/calculate
 *
 * Body:
 *   { ustn: string }   (required — the trade to calculate the fee for)
 *
 * Returns:
 *   {
 *     fee_decision_id:    string
 *     ustn:               string
 *     final_fee:          number
 *     final_rate:         number
 *     cfb:                number
 *     fairness_score:     number
 *     primary_class:      string
 *     economic_classes:   string[]
 *     calculation_trace:  CalculationTrace
 *     tsec:               string
 *     calculated_at:      string
 *     policy_version:     string
 *     formula_version:    string
 *   }
 *
 * The full Fee Decision Object is persisted in FeeCalculation.providerFeesJson
 * and the Trade.sgtxFeeUsd column is updated.
 *
 * PUBLIC route (anonymous callers can POST — tenant scoping by body ustn).
 */

import { NextRequest, NextResponse } from "next/server";
import { calculateFee } from "@/lib/sgtx/fee-engine";
import {
  FEE_POLICY_VERSION,
  FEE_FORMULA_VERSION,
} from "@/lib/sgtx/fee-engine/constants";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const ustn = String(body?.ustn || "").trim();

    if (!ustn) {
      return NextResponse.json(
        { error: "ustn is required" },
        { status: 400 },
      );
    }

    const decision = await calculateFee(ustn);

    if (!decision) {
      return NextResponse.json(
        { error: "Trade not found or fee calculation failed", ustn },
        { status: 404 },
      );
    }

    return NextResponse.json({
      fee_decision_id: decision.FEE_DECISION_ID,
      ustn: decision.USTN,
      final_fee: decision.FINAL_FEE,
      final_rate: decision.FINAL_RATE,
      cfb: decision.CFB,
      exw_value: decision.EXW_VALUE,
      eligible_logistics: decision.ELIGIBLE_LOGISTICS,
      fairness_score: decision.FAIRNESS_SCORE,
      layer_scores: {
        cts: decision.CTS_SCORE,
        risk: decision.RISK_SCORE,
        value: decision.VALUE_SCORE,
        efficiency: decision.EFFICIENCY_SCORE,
      },
      base_fair_rate: decision.BASE_FAIR_RATE,
      class_adjusted_rate: decision.CLASS_ADJUSTED_RATE,
      discounted_rate: decision.DISCOUNTED_RATE,
      raw_fee: decision.RAW_FEE,
      pre_cap_fee: decision.PRE_CAP_FEE,
      affordability_cap: decision.AFFORDABILITY_CAP,
      cost_to_serve_floor: decision.COST_TO_SERVE_FLOOR,
      primary_class: decision.PRIMARY_CLASS,
      economic_classes: decision.ECONOMIC_CLASSES,
      class_factor: decision.CLASS_FACTOR,
      discounts_applied: decision.DISCOUNTS_APPLIED,
      caps_applied: decision.CAPS_APPLIED,
      margin_take_rate: decision.MARGIN_TAKE_RATE,
      estimated_gross_profit: decision.ESTIMATED_GROSS_PROFIT,
      calculation_trace: decision.CALCULATION_TRACE,
      tsec: decision.TSEC,
      loom_hash: decision.LOOM_HASH,
      locked: decision.LOCKED,
      governor_decision_id: decision.GOVERNOR_DECISION_ID,
      calculated_at: decision.CALCULATED_AT,
      policy_version: FEE_POLICY_VERSION,
      formula_version: FEE_FORMULA_VERSION,
    });
  } catch (err: any) {
    logger.error("[fees/calculate] unhandled error", { error: err?.message });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/sgtx/fees/calculate",
    method: "POST",
    description: "Dynamic Fee Engine — full 7-layer calculation producing a Fee Decision Object.",
    body_shape: { ustn: "string (required)" },
    returns: {
      fee_decision_id: "string",
      final_fee: "number",
      final_rate: "number",
      calculation_trace: "CalculationTrace (full JSON breakdown of all 7 layers)",
      tsec: "string (deterministic Trade-Specific Execution Code)",
    },
    formula_version: FEE_FORMULA_VERSION,
    policy_version: FEE_POLICY_VERSION,
  });
}
