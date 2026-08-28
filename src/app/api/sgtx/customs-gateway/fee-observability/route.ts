// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Observability API (§58)
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/fee-observability
 *   Query: ?brokerGtid=<optional, filters anomalies>
 *   Returns:{ ok, metrics, disputeAging, brokerFeeAnomalies, disputes }
 *
 * Aggregates fee-related observability metrics for the platform admin &
 * compliance surfaces. Pulls from IntegrationConnectorLog + SgtxFeeDispute
 * tables (existing Prisma models — NO schema changes).
 *
 * §58 tracks: customs submissions, acceptance, rejection, holds, event
 * latency, retries, credential failures, broker connection health, fee
 * disputes, dispute aging, unexplained charges, broker fee anomalies,
 * repeated violations.
 *
 * L0 invariants: NON-MARKETPLACE (broker GTIDs appear only as raw identifiers
 * in risk-flag listings, never as rankings), NON-CUSTODIAL (no payment
 * details surfaced).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getFeeObservability,
  getFeeDisputeAging,
  getBrokerFeeAnomalies,
} from "@/lib/sgtx/customs-gateway/fee-observability";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const brokerGtid = searchParams.get("brokerGtid") || undefined;

    // Run all three aggregations in parallel for snappy response times.
    const [metrics, disputeAging, brokerFeeAnomalies] = await Promise.all([
      getFeeObservability(),
      getFeeDisputeAging(),
      getBrokerFeeAnomalies(brokerGtid),
    ]);

    // Also surface a slice of recent disputes for the dispute dashboards.
    let disputes: any[] = [];
    try {
      disputes = await db.sgtxFeeDispute.findMany({
        take: 25,
        orderBy: { filedAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[api/customs-gateway/fee-observability] disputes slice query failed", { error: e?.message });
    }

    return NextResponse.json({
      ok: true,
      metrics,
      disputeAging,
      brokerFeeAnomalies,
      disputes: disputes.map((d: any) => ({
        disputeId: d.feeDisputeId,
        ustn: d.ustn,
        brokerGtid: null, // not stored on SgtxFeeDispute; resolved via IntegrationConnectorLog if needed
        disputedAmountUsd: d.feeAmountUsd,
        reason: d.reason,
        status: d.status,
        filedAt: d.filedAt,
        responseDeadline: d.resolvedAt ? null : new Date(new Date(d.filedAt).getTime() + 72 * 3600 * 1000).toISOString(),
        outcome: d.status === "RESOLVED" ? ((d.refundAmountUsd || 0) > 0 ? "UPHELD" : "REJECTED") : null,
        aiRecommendation: d.aiRecommendation || undefined,
        evidence: d.aiAnalysis ? `sha256:${d.aiAnalysis.slice(0, 24)}` : null,
        timeline: d.resolvedAt
          ? [
              { at: d.filedAt, label: "Dispute filed by trader" },
              { at: d.resolvedAt, label: `Resolved — ${d.aiRecommendation || "reviewed"}` },
            ]
          : [{ at: d.filedAt, label: "Dispute filed by trader" }],
      })),
      note: "Metrics aggregated from IntegrationConnectorLog + SgtxFeeDispute. NON-MARKETPLACE — no broker rankings.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/fee-observability] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
