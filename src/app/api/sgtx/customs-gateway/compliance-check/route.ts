// @ts-nocheck
/**
 * SGTX Customs Gateway — Customs Compliance Check API (§81)
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/compliance-check?ustn=<USTN>
 *   Returns: { ok, result }
 *
 * L0: A `passed: true` result is NOT a customs authority clearance
 * (§113). It is an internal SGTX compliance verification. The customs
 * authority issues clearance independently after an actual filing.
 */

import { NextRequest, NextResponse } from "next/server";
import { runCustomsComplianceCheck, COMPLIANCE_CHECK_TYPES } from "@/lib/sgtx/customs-gateway/customs-compliance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn is required", checkTypes: COMPLIANCE_CHECK_TYPES },
        { status: 400 },
      );
    }
    const result = await runCustomsComplianceCheck(ustn);
    return NextResponse.json({
      ok: true,
      result,
      checkTypes: COMPLIANCE_CHECK_TYPES,
      // §113 reminder — internal verification, not government clearance.
      _notice:
        "A passed=true result is an internal SGTX compliance verification, NOT a customs authority clearance (§113). The customs authority issues clearance independently after an actual filing.",
    });
  } catch (err: any) {
    logger.error("[api/compliance-check] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
