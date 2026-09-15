// @ts-nocheck
/**
 * SGTX v18 §9.27 — Dynamic Fee Engine — VALIDATE route (Fee Sanity Gate)
 * ============================================================================
 *
 * POST /api/sgtx/fees/validate
 *
 * Body:
 *   { fee_decision_id: string }   (required — the Fee Decision ID to validate)
 *
 * Returns:
 *   {
 *     fee_decision_id:   string
 *     valid:             boolean
 *     errors:            string[]     (blocking — at least one error → valid=false)
 *     warnings:          string[]    (non-blocking observations)
 *     checks:            { id, label, passed, detail }[]  (16 checks)
 *   }
 *
 * The 16 checks (Fee Sanity Gate) cover constitutional bounds, score ranges,
 * discount monotonicity, cap binding presence, and audit-trail integrity.
 *
 * PUBLIC route (anonymous callers can POST — validation is read-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateFeeDecision } from "@/lib/sgtx/fee-engine";
import type { FeeDecisionObject } from "@/lib/sgtx/fee-engine";
import {
  FEE_POLICY_VERSION,
  FEE_FORMULA_VERSION,
} from "@/lib/sgtx/fee-engine/constants";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const feeDecisionId = String(body?.fee_decision_id || "").trim();

    if (!feeDecisionId) {
      return NextResponse.json(
        { error: "fee_decision_id is required" },
        { status: 400 },
      );
    }

    // Look up the FeeCalculation row whose decision JSON contains this ID.
    const rows = await db.feeCalculation.findMany({
      where: { stage: "V18_DYNAMIC_ENGINE" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    let matched: FeeDecisionObject | null = null;
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.providerFeesJson || "{}") as FeeDecisionObject;
        if (parsed.FEE_DECISION_ID === feeDecisionId) {
          matched = parsed;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!matched) {
      return NextResponse.json(
        {
          error: "Fee Decision not found",
          fee_decision_id: feeDecisionId,
          hint: "POST /api/sgtx/fees/calculate to compute a new Fee Decision Object first.",
        },
        { status: 404 },
      );
    }

    const result = validateFeeDecision(matched);

    return NextResponse.json({
      fee_decision_id: feeDecisionId,
      ustn: matched.USTN,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      checks: result.checks,
      final_fee: matched.FINAL_FEE,
      final_rate: matched.FINAL_RATE,
      cfb: matched.CFB,
      policy_version: FEE_POLICY_VERSION,
      formula_version: FEE_FORMULA_VERSION,
    });
  } catch (err: any) {
    logger.error("[fees/validate] unhandled error", { error: err?.message });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/sgtx/fees/validate",
    method: "POST",
    description: "Fee Sanity Gate — 16 deterministic checks on a Fee Decision Object.",
    body_shape: { fee_decision_id: "string (required)" },
    returns: {
      valid: "boolean",
      errors: "string[]",
      warnings: "string[]",
      checks: "{ id, label, passed, detail }[]",
    },
    checks: [
      "C01 — FINAL_FEE non-negative",
      "C02 — FINAL_FEE ≤ constitutional ceiling (1.50% × CFB)",
      "C03 — FINAL_RATE ≥ RATE_FLOOR (0.03%)",
      "C04 — FINAL_RATE ≤ RATE_CEILING (1.50%)",
      "C05 — CFB ≥ EXW_VALUE",
      "C06 — CFB ≥ ELIGIBLE_LOGISTICS",
      "C07 — CTS_SCORE in [0, 100]",
      "C08 — RISK_SCORE in [0, 100]",
      "C09 — VALUE_SCORE in [0, 100]",
      "C10 — EFFICIENCY_SCORE in [0, 100]",
      "C11 — FAIRNESS_SCORE in [0, 100]",
      "C12 — BASE_FAIR_RATE in [0.03%, 1.50%]",
      "C13 — MARGIN_TAKE_RATE in [10%, 35%]",
      "C14 — DISCOUNTED_RATE ≤ CLASS_ADJUSTED_RATE",
      "C15 — at least one binding cap in CAPS_APPLIED",
      "C16 — TSEC + LOOM_HASH present (audit trail)",
    ],
    formula_version: FEE_FORMULA_VERSION,
    policy_version: FEE_POLICY_VERSION,
  });
}
