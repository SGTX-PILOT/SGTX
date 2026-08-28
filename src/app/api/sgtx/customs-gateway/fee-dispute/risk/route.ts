// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute Broker Risk API
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/fee-dispute/risk
 *   Query: ?brokerGtid=<GTID>&metrics=1
 *   Returns: { ok, assessment, metrics? } — broker risk assessment (§21)
 *   + optional fee metrics (§22).
 *
 * L0: NO marketplace rankings (§23). Metrics are operational / compliance
 * only — visible to the broker themselves, the SGTX compliance team,
 * and the Governor. NEVER exposed as a public ranking.
 *
 * L0: NO autonomous delisting. Risk flags may affect operational
 * eligibility for NEW service requests, but consequential enforcement
 * (suspension / delisting) requires a Governor decision + human review.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assessBrokerRisk,
  calculateBrokerFeeMetrics,
  RISK_LEVELS,
} from "@/lib/sgtx/customs-gateway/fee-dispute/risk-controls";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid");
    if (!brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid is required", riskLevels: RISK_LEVELS },
        { status: 400 },
      );
    }
    const includeMetrics = searchParams.get("metrics") === "1";
    const assessment = await assessBrokerRisk(brokerGtid);
    const response: any = {
      ok: true,
      assessment,
      riskLevels: RISK_LEVELS,
      // §23 reminder — never turn these into a public marketplace ranking.
      _notice: "Operational / compliance metrics only. NOT a marketplace ranking (§23).",
    };
    if (includeMetrics) {
      response.metrics = await calculateBrokerFeeMetrics(brokerGtid);
    }
    return NextResponse.json(response);
  } catch (err: any) {
    logger.error("[api/fee-dispute/risk] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
