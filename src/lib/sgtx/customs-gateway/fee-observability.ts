// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Observability (§58)
 * ===========================================================================
 * Aggregates fee-related observability metrics for the platform admin &
 * compliance surfaces. Tracks (per §58):
 *
 *   • customs submissions · acceptance · rejection · holds
 *   • event latency · retries · credential failures
 *   • broker connection health
 *   • fee disputes · dispute aging · unexplained charges
 *   • broker fee anomalies · repeated violations
 *
 * All public functions are wrapped in try/catch with safe defaults so the API
 * layer never receives a thrown error. Every metric falls back to 0 / [] on
 * failure rather than propagating an exception.
 *
 * L0 invariants:
 *   • NO marketplace rankings are surfaced — broker GTIDs appear only as raw
 *     identifiers in risk-flag listings (governance, not commerce).
 *   • NO credential values are exposed — only counts and metadata.
 *   • All data is sourced from existing Prisma tables (IntegrationConnectorLog,
 *     SgtxFeeDispute, CanonicalEvent) — NO schema changes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// ── public types ────────────────────────────────────────────────────────────
export interface FeeObservabilityMetrics {
  totalFeeSchedules: number;
  activeFeeCommitments: number;
  additionalChargeRequests: number;
  pendingDisputes: number;
  upheldDisputes: number;
  rejectedDisputes: number;
  avgDisputeResolutionHours: number;
  unexplainedCharges: number;
  brokerFeeAnomalies: number;
  repeatedViolations: number;
  // §58 customs-event metrics (broader platform view)
  customsSubmissions: number;
  customsAcceptances: number;
  customsRejections: number;
  customsHolds: number;
  credentialFailures: number;
  brokerConnectionHealth: { brokerGtid: string; status: string; lastSeenAt: string | null }[];
  feeRiskFlags: { brokerGtid: string; riskLevel: string; violationCount: number }[];
}

export interface DisputeAgingBucket {
  bucket: string;
  count: number;
}

export interface BrokerFeeAnomaly {
  ustn: string;
  brokerGtid: string;
  anomalyType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detectedAt: string;
  detail?: string;
}

// ── main entry — getFeeObservability ────────────────────────────────────────
export async function getFeeObservability(): Promise<FeeObservabilityMetrics> {
  const empty: FeeObservabilityMetrics = {
    totalFeeSchedules: 0,
    activeFeeCommitments: 0,
    additionalChargeRequests: 0,
    pendingDisputes: 0,
    upheldDisputes: 0,
    rejectedDisputes: 0,
    avgDisputeResolutionHours: 0,
    unexplainedCharges: 0,
    brokerFeeAnomalies: 0,
    repeatedViolations: 0,
    customsSubmissions: 0,
    customsAcceptances: 0,
    customsRejections: 0,
    customsHolds: 0,
    credentialFailures: 0,
    brokerConnectionHealth: [],
    feeRiskFlags: [],
  };
  try {
    // Query IntegrationConnectorLog for all fee/customs rows. We use apiName
    // prefix matching to scope the query without a schema change.
    let feeLogs: any[] = [];
    let customsLogs: any[] = [];
    let disputes: any[] = [];
    try {
      feeLogs = await db.integrationConnectorLog.findMany({
        where: { OR: [
          { apiName: { startsWith: "customs-fee:" } },
          { apiName: { startsWith: "customs-gateway:" } },
        ] },
        take: 500,
        orderBy: { createdAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[fee-observability] feeLogs query failed", { error: e?.message });
    }
    try {
      customsLogs = await db.integrationConnectorLog.findMany({
        where: { apiName: { contains: "customs" } },
        take: 500,
        orderBy: { createdAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[fee-observability] customsLogs query failed", { error: e?.message });
    }
    try {
      disputes = await db.sgtxFeeDispute.findMany({ take: 500, orderBy: { filedAt: "desc" } });
    } catch (e: any) {
      logger.warn("[fee-observability] disputes query failed", { error: e?.message });
    }

    const parsed = feeLogs.map(parseLogPayload).filter(Boolean);
    const schedules = parsed.filter(p => p.kind === "FEE_SCHEDULE");
    const commitments = parsed.filter(p => p.kind === "FEE_COMMITMENT");
    const acrs = parsed.filter(p => p.kind === "ADDITIONAL_CHARGE_REQUEST");
    const riskFlags = parsed.filter(p => p.kind === "BROKER_FEE_RISK_FLAG");
    const anomalies = parsed.filter(p => p.kind === "FEE_ANOMALY");

    // Customs event metrics from customsLogs (SUCCESS = acceptance, FAILED/ERROR = rejection)
    const customsSubmissions = customsLogs.filter(l => (l.apiName || "").includes("submit")).length;
    const customsAcceptances = customsLogs.filter(l => l.status === "SUCCESS").length;
    const customsRejections = customsLogs.filter(l => l.status === "FAILED" || l.status === "ERROR").length;
    const customsHolds = customsLogs.filter(l => (l.responseBody || "").includes("HOLD") || (l.responseBody || "").includes("PGA_HOLD")).length;
    const credentialFailures = customsLogs.filter(l => (l.apiName || "").includes("credential") && l.status !== "SUCCESS").length;

    // Broker connection health — derive from most-recent log per broker
    const brokerMap = new Map<string, { status: string; lastSeenAt: string | null }>();
    for (const l of customsLogs) {
      try {
        const body = JSON.parse(l.requestBody || "{}");
        const bg = body.brokerGtid || body.broker;
        if (!bg) continue;
        if (!brokerMap.has(bg) || (l.updatedAt && (!brokerMap.get(bg)!.lastSeenAt || new Date(l.updatedAt) > new Date(brokerMap.get(bg)!.lastSeenAt!)))) {
          brokerMap.set(bg, {
            status: l.status === "SUCCESS" ? "OPERATIONAL" : l.status === "PENDING" ? "DEGRADED" : "OUTAGE",
            lastSeenAt: l.updatedAt ? new Date(l.updatedAt).toISOString() : null,
          });
        }
      } catch { /* skip unparseable */ }
    }

    // Dispute metrics
    const pendingDisputes = disputes.filter(d => (d.status || "").toUpperCase() === "FILED" || (d.status || "").toUpperCase() === "AWAITING_RESPONSE").length;
    const resolvedDisputes = disputes.filter(d => (d.status || "").toUpperCase() === "RESOLVED");
    const upheldDisputes = resolvedDisputes.filter(d => (d.aiRecommendation || "").toUpperCase() === "UPHOLD" || (d.refundAmountUsd || 0) > 0).length;
    const rejectedDisputes = resolvedDisputes.filter(d => (d.aiRecommendation || "").toUpperCase() === "REJECT" || (d.refundAmountUsd || 0) === 0).length;
    const avgResolutionHours = avg(resolvedDisputes.map(d => {
      if (!d.resolvedAt || !d.filedAt) return null;
      return (new Date(d.resolvedAt).getTime() - new Date(d.filedAt).getTime()) / 3600000;
    }).filter((x: number | null): x is number => x != null));

    // Repeated violations = brokers with >=3 risk-flag entries
    const violationCounts = new Map<string, number>();
    for (const rf of riskFlags) {
      const bg = rf.brokerGtid;
      if (!bg) continue;
      violationCounts.set(bg, (violationCounts.get(bg) || 0) + 1);
    }
    const repeatedViolations = Array.from(violationCounts.values()).filter(c => c >= 3).length;

    return {
      totalFeeSchedules: schedules.length,
      activeFeeCommitments: commitments.length,
      additionalChargeRequests: acrs.length,
      pendingDisputes,
      upheldDisputes,
      rejectedDisputes,
      avgDisputeResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      unexplainedCharges: anomalies.filter(a => a.anomalyType === "UNEXPLAINED_CHARGE").length,
      brokerFeeAnomalies: anomalies.length,
      repeatedViolations,
      customsSubmissions,
      customsAcceptances,
      customsRejections,
      customsHolds,
      credentialFailures,
      brokerConnectionHealth: Array.from(brokerMap.entries()).map(([brokerGtid, v]) => ({ brokerGtid, ...v })).slice(0, 50),
      feeRiskFlags: riskFlags
        .map(rf => ({ brokerGtid: rf.brokerGtid, riskLevel: rf.riskLevel || "MEDIUM", violationCount: rf.violationCount || 1 }))
        .slice(0, 50),
    };
  } catch (err: any) {
    logger.error("[fee-observability] getFeeObservability failed (top-level catch)", { error: err?.message });
    return empty;
  }
}

// ── dispute aging buckets (§58) ─────────────────────────────────────────────
export async function getFeeDisputeAging(): Promise<DisputeAgingBucket[]> {
  const empty: DisputeAgingBucket[] = [
    { bucket: "< 24h", count: 0 },
    { bucket: "24–72h", count: 0 },
    { bucket: "3–7 days", count: 0 },
    { bucket: "7–14 days", count: 0 },
    { bucket: "> 14 days", count: 0 },
  ];
  try {
    let disputes: any[] = [];
    try {
      disputes = await db.sgtxFeeDispute.findMany({
        where: { status: { not: "RESOLVED" } },
        take: 500,
      });
    } catch (e: any) {
      logger.warn("[fee-observability] aging query failed", { error: e?.message });
      return empty;
    }
    const now = Date.now();
    const buckets = [
      { bucket: "< 24h", max: 24 * 3600 * 1000, count: 0 },
      { bucket: "24–72h", max: 72 * 3600 * 1000, count: 0 },
      { bucket: "3–7 days", max: 7 * 24 * 3600 * 1000, count: 0 },
      { bucket: "7–14 days", max: 14 * 24 * 3600 * 1000, count: 0 },
      { bucket: "> 14 days", max: Infinity, count: 0 },
    ];
    for (const d of disputes) {
      const filedAt = d.filedAt ? new Date(d.filedAt).getTime() : now;
      const age = now - filedAt;
      for (const b of buckets) {
        if (age <= b.max) { b.count++; break; }
      }
    }
    return buckets.map(({ bucket, count }) => ({ bucket, count }));
  } catch (err: any) {
    logger.error("[fee-observability] aging failed (top-level catch)", { error: err?.message });
    return empty;
  }
}

// ── broker fee anomalies ────────────────────────────────────────────────────
export async function getBrokerFeeAnomalies(brokerGtid?: string): Promise<BrokerFeeAnomaly[]> {
  try {
    let logs: any[] = [];
    try {
      logs = await db.integrationConnectorLog.findMany({
        where: {
          AND: [
            { OR: [
              { apiName: { startsWith: "customs-fee:" } },
              { apiName: { startsWith: "customs-gateway:" } },
            ] },
            { OR: [
              { status: "FAILED" },
              { status: "ERROR" },
              { requestBody: { contains: "FEE_NOT_IN_QUOTATION" } },
              { requestBody: { contains: "DUPLICATE_CHARGE" } },
              { requestBody: { contains: "UNEXPLAINED_CHARGE" } },
              { requestBody: { contains: "FEE_ANOMALY" } },
            ] },
          ],
        },
        take: 200,
        orderBy: { createdAt: "desc" },
      });
    } catch (e: any) {
      logger.warn("[fee-observability] anomalies query failed", { error: e?.message });
      return [];
    }
    const out: BrokerFeeAnomaly[] = [];
    for (const l of logs) {
      const p = parseLogPayload(l);
      if (!p) continue;
      if (brokerGtid && p.brokerGtid !== brokerGtid) continue;
      const anomalyType = p.anomalyType || p.kind || "UNKNOWN";
      if (anomalyType === "FEE_SCHEDULE" || anomalyType === "FEE_COMMITMENT") continue; // not anomalies
      out.push({
        ustn: p.ustn || l.ustn || "—",
        brokerGtid: p.brokerGtid || "—",
        anomalyType,
        severity: inferSeverity(anomalyType),
        detectedAt: l.createdAt ? new Date(l.createdAt).toISOString() : new Date().toISOString(),
        detail: p.reason || p.detail || undefined,
      });
    }
    return out.slice(0, 100);
  } catch (err: any) {
    logger.error("[fee-observability] anomalies failed (top-level catch)", { error: err?.message });
    return [];
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
function parseLogPayload(log: any): any | null {
  try {
    if (!log?.requestBody) return null;
    const p = JSON.parse(log.requestBody);
    return p;
  } catch {
    return null;
  }
}

function inferSeverity(anomalyType: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const v = (anomalyType || "").toUpperCase();
  if (v.includes("FEE_NOT_IN_QUOTATION") || v.includes("HIDDEN")) return "CRITICAL";
  if (v.includes("DUPLICATE") || v.includes("UNEXPLAINED")) return "HIGH";
  if (v.includes("ANOMALY") || v.includes("VIOLATION")) return "MEDIUM";
  return "LOW";
}

function avg(arr: number[]): number {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + (Number(b) || 0), 0) / arr.length;
}
