// @ts-nocheck
/**
 * SGTX v18 §9.27.33 — Fee Anomaly Engine — Anomaly Report retrieval route
 * ============================================================================
 *
 * GET /api/sgtx/fees/[ustn]/anomaly
 *
 * Retrieves the most recent Fee Anomaly Report for a USTN's fee decision.
 *
 * Returns:
 *   {
 *     ustn,
 *     feeDecisionId,
 *     riskLevel,           // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
 *     recommendedAction,   // "PROCEED" | "REVIEW" | "INVESTIGATE" | "BLOCK"
 *     anomalyCount,
 *     generatedAt,
 *     anomalies: [
 *       { checkId, checkName, severity, message, evidence? }
 *     ],
 *     flaggedForReview: boolean,   // true → governor must approve before lock
 *     warning?: string              // present when riskLevel === "CRITICAL"
 *   }
 *
 * 404 if no fee decision or no anomaly report exists for the USTN.
 *
 * PUBLIC route (anonymous callers can GET — tenant scoping by URL ustn).
 * Read-only — no mutations. Rate-limited by the anonymous API bucket
 * (50 req/min per IP) at the middleware layer.
 *
 * Transparency: the fee anomaly report is intentionally public so the trader
 * (or any auditor) can verify why a fee was flagged. The anomaly engine is
 * ADVISORY — it never blocks a fee decision from being computed or locked
 * directly (only the governor can refuse to lock based on FLAGGED_FOR_REVIEW).
 */

import { NextRequest, NextResponse } from "next/server";
import { getFeeAnomalyReportForUstn } from "@/lib/sgtx/fee-engine/anomaly-engine";
import { getFeeDecision } from "@/lib/sgtx/fee-engine";
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

    // Look up the most recent fee decision for the USTN — this gives us the
    // feeDecisionId + the in-memory ANOMALY_* summary fields (if populated).
    const decision = await getFeeDecision(ustnStr);
    if (!decision) {
      return NextResponse.json(
        {
          error: "No Fee Decision found for this USTN",
          ustn: ustnStr,
          hint: "POST /api/sgtx/fees/calculate to compute a new Fee Decision Object (the anomaly engine runs automatically after calculation).",
        },
        { status: 404 },
      );
    }

    // Retrieve the stored anomaly report (keyed by feeDecisionId).
    const stored = await getFeeAnomalyReportForUstn(ustnStr);

    if (!stored) {
      // The fee decision exists but no anomaly report has been stored yet.
      // This happens when the anomaly engine was unable to persist (e.g.
      // DB write failed). Return a 404 with a hint to re-run.
      return NextResponse.json(
        {
          error: "No Fee Anomaly Report stored for this USTN",
          ustn: ustnStr,
          feeDecisionId: decision.FEE_DECISION_ID,
          hint: "POST /api/sgtx/fees/calculate to re-run the Fee Engine (the anomaly engine runs automatically).",
        },
        { status: 404 },
      );
    }

    const { report, feeDecisionId } = stored;

    return NextResponse.json({
      ustn: ustnStr,
      feeDecisionId,
      riskLevel: report.riskLevel,
      recommendedAction: report.recommendedAction,
      anomalyCount: report.anomalies.length,
      generatedAt: report.generatedAt,
      anomalies: report.anomalies,
      // FLAGGED_FOR_REVIEW is true when recommendedAction === "BLOCK" — i.e.
      // CRITICAL + tamper detected. The governor must manually approve the
      // fee lock in that case.
      flaggedForReview: report.recommendedAction === "BLOCK",
      // Inline the warning if CRITICAL so the consumer doesn't have to
      // reconstruct it from the anomalies list.
      warning:
        report.riskLevel === "CRITICAL"
          ? `CRITICAL fee anomaly detected — ${report.anomalies.length} ` +
            `anomalies. Recommended action: ${report.recommendedAction}.`
          : undefined,
      // Echo the in-decision summary fields for cross-checking.
      decisionSummary: {
        finalFee: decision.FINAL_FEE,
        finalRate: decision.FINAL_RATE,
        cfb: decision.CFB,
        primaryClass: decision.PRIMARY_CLASS,
        fairnessScore: decision.FAIRNESS_SCORE,
        tsec: decision.TSEC,
        loomHash: decision.LOOM_HASH,
        locked: decision.LOCKED,
      },
    });
  } catch (err: any) {
    logger.error("[fees/[ustn]/anomaly] unhandled error", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: "Internal server error", detail: err?.message || "Unknown" },
      { status: 500 },
    );
  }
}
