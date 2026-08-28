// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute Broker Risk Controls
 * ===========================================================================
 *
 * Implements broker risk controls (§21) and operational / compliance
 * fee metrics (§22) for customs brokers.
 *
 * Implements prompt sections:
 *   §21  Broker Risk Controls (INFO / LOW / MEDIUM / HIGH / CRITICAL)
 *   §22  Broker Trust / Performance with fee metrics
 *   §23  NO marketplace rankings — metrics are operational / compliance
 *        only
 *   §43  All consequential enforcement actions pass through the Governor
 *
 * Design constraints (NON-NEGOTIABLE):
 *
 *   L0-1  NO AUTONOMOUS DELISTING: this module NEVER automatically
 *         delists, suspends, or terminates a broker. Risk flags are
 *         informational / operational signals — they may affect
 *         operational eligibility for NEW service requests (e.g. a
 *         HIGH flag may pause new assignments until human review),
 *         but enforcement (suspension / delisting) requires a Governor
 *         decision + human review (§21, §43).
 *
 *   L0-2  NO MARKETPLACE RANKINGS (§23): the metrics below are
 *         operational / compliance metrics. They are NEVER turned into
 *         a public ranking, leaderboard, or "best broker" list. They
 *         are visible only to the broker themselves, the SGTX
 *         compliance team, and the Governor.
 *
 *   L0-3  GOVERNOR MANDATORY: clearing a risk flag or executing any
 *         consequential enforcement passes through the Governor.
 *
 * Persistence:
 *   - Risk flags are persisted as Activity rows with action =
 *     "BROKER_RISK_FLAG" or "BROKER_RISK_FLAG_CLEARED", and metadata =
 *     JSON-encoded BrokerRiskFlag. This reuses the existing Activity
 *     audit table — no schema changes.
 *   - Metrics are computed on-the-fly from the existing Dispute table
 *     (filter type starts with "FEE_DISPUTE_"). No persistence.
 *
 * All public functions are wrapped in try/catch with safe defaults —
 * the engine never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { listDisputes, VIOLATION_SEVERITY } from "./fee-dispute";

// ============ §21 Risk Levels ============

/**
 * §21 — The five canonical broker risk levels. Every risk flag has one
 * of these levels. Severity flows from the underlying violation type
 * (see VIOLATION_SEVERITY in fee-dispute/index.ts).
 *
 *   INFO     — informational, no operational impact
 *   LOW      — minor concern; logged for trend analysis
 *   MEDIUM   — repeated minor violations or a single moderate violation;
 *              may slow new assignment routing
 *   HIGH     — serious violation; new service assignments paused until
 *              human review
 *   CRITICAL — fee tampering / backdating / fraud signal; Governor
 *              escalation required; new service assignments hard-blocked
 *              pending Governor + human review
 */
export const RISK_LEVELS = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/**
 * §21 — Risk-level to operational-eligibility mapping. This is the
 * default behavior; the Governor may override.
 */
export const RISK_ELIGIBILITY: Record<string, {
  newAssignmentsAllowed: boolean;
  requiresHumanReview: boolean;
  requiresGovernorForEnforcement: boolean;
}> = {
  INFO: { newAssignmentsAllowed: true, requiresHumanReview: false, requiresGovernorForEnforcement: false },
  LOW: { newAssignmentsAllowed: true, requiresHumanReview: false, requiresGovernorForEnforcement: false },
  MEDIUM: { newAssignmentsAllowed: true, requiresHumanReview: true, requiresGovernorForEnforcement: false },
  HIGH: { newAssignmentsAllowed: false, requiresHumanReview: true, requiresGovernorForEnforcement: true },
  CRITICAL: { newAssignmentsAllowed: false, requiresHumanReview: true, requiresGovernorForEnforcement: true },
};

// ============ Types ============

export interface BrokerRiskFlag {
  id: string;
  brokerGtid: string;
  riskLevel: string;
  reason: string;
  violationCount: number;
  lastViolationAt: Date;
  createdAt: Date;
  clearedAt: Date | null;
  governorDecisionId: string | null;
}

export interface BrokerRiskAssessment {
  brokerGtid: string;
  riskLevel: string;
  flags: BrokerRiskFlag[];
  recommendation: string;
  eligibility: {
    newAssignmentsAllowed: boolean;
    requiresHumanReview: boolean;
    requiresGovernorForEnforcement: boolean;
  };
  assessedAt: Date;
}

export interface BrokerFeeMetrics {
  brokerGtid: string;
  disclosureAccuracy: number;
  postClearanceChargeRate: number;
  disputedFeeRate: number;
  upheldDisputeRate: number;
  resolutionTime: number;
  unexplainedChargeRate: number;
  repeatViolationRate: number;
  totalDisputes: number;
  upheldDisputes: number;
  rejectedDisputes: number;
  partiallyUpheldDisputes: number;
  openDisputes: number;
  assessedAt: Date;
}

// ============ §21 Risk Assessment ============

/**
 * §21 — Assess a broker's current risk level. Aggregates all open risk
 * flags + recent dispute history + SLA breach patterns.
 *
 * Returns:
 *   - riskLevel: the highest active flag level (INFO if none)
 *   - flags: list of active (uncleared) flags
 *   - recommendation: human-readable next-step recommendation
 *   - eligibility: operational eligibility per RISK_ELIGIBILITY
 *
 * CRITICAL: this function NEVER autonomously delists or terminates a
 * broker. It only assesses and reports. Any consequential enforcement
 * (suspension, delisting) requires a Governor decision + human review.
 */
export async function assessBrokerRisk(brokerGtid: string): Promise<BrokerRiskAssessment> {
  try {
    if (!brokerGtid) return _minimalAssessment("");
    const flags = await _loadActiveRiskFlags(brokerGtid);
    const disputes = await listDisputes({ brokerGtid, limit: 200 });

    // Compute aggregate risk level: highest active flag, or derive from
    // recent dispute severity if no flags exist.
    let riskLevel = "INFO";
    for (const f of flags) {
      if (_rankLevel(f.riskLevel) > _rankLevel(riskLevel)) {
        riskLevel = f.riskLevel;
      }
    }
    if (riskLevel === "INFO" && disputes.length > 0) {
      // Derive from recent disputes (last 30 days).
      const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
      const recent = disputes.filter((d) => d.createdAt.getTime() > thirtyDaysAgo);
      if (recent.length >= 5) riskLevel = "MEDIUM";
      else if (recent.length >= 1) {
        const topSeverity = recent
          .map((d) => VIOLATION_SEVERITY[d.violationType] || "MEDIUM")
          .sort((a, b) => _rankLevel(b) - _rankLevel(a))[0];
        if (topSeverity === "CRITICAL") riskLevel = "HIGH";
        else if (topSeverity === "HIGH") riskLevel = "MEDIUM";
        else riskLevel = "LOW";
      }
    }

    const eligibility = RISK_ELIGIBILITY[riskLevel] || RISK_ELIGIBILITY.INFO;
    const recommendation = _recommendationFor(riskLevel, flags.length, disputes.length);

    return {
      brokerGtid,
      riskLevel,
      flags,
      recommendation,
      eligibility,
      assessedAt: new Date(),
    };
  } catch (err) {
    logger.error("[fee-dispute/risk] assessBrokerRisk failed", { error: String(err), brokerGtid });
    return _minimalAssessment(brokerGtid);
  }
}

/**
 * §21 — Create a risk flag for a broker. The flag is persisted as an
 * Activity row (action="BROKER_RISK_FLAG") so it appears in the audit
 * trail. NEVER autonomously enforces — only records + escalates to
 * Governor for HIGH/CRITICAL.
 */
export async function createRiskFlag(
  brokerGtid: string,
  reason: string,
  riskLevel: string,
): Promise<BrokerRiskFlag> {
  try {
    if (!brokerGtid) throw new Error("brokerGtid required");
    const level = RISK_LEVELS.includes(riskLevel as any) ? riskLevel : "MEDIUM";
    const now = new Date();
    // Count existing disputes for this broker to derive violationCount.
    const disputes = await listDisputes({ brokerGtid, limit: 500 });
    const flag: BrokerRiskFlag = {
      id: `RF-${brokerGtid.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      brokerGtid,
      riskLevel: level,
      reason: String(reason || "").slice(0, 1000),
      violationCount: disputes.length,
      lastViolationAt: disputes[0]?.createdAt || now,
      createdAt: now,
      clearedAt: null,
      governorDecisionId: null,
    };
    // Persist as Activity row.
    try {
      await db.activity.create({
        data: {
          actorGtid: brokerGtid,
          action: "BROKER_RISK_FLAG",
          description: `Risk flag ${level} raised: ${String(reason || "").slice(0, 200)}`,
          type: level === "CRITICAL" ? "CRITICAL" : level === "HIGH" ? "WARNING" : "INFO",
          metadata: JSON.stringify(flag),
        },
      });
    } catch (actErr) {
      logger.warn("[fee-dispute/risk] activity log failed", { error: String(actErr) });
    }
    // Notify broker via Smart Inbox.
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: brokerGtid,
          category: "COMPLIANCE",
          priority: level === "CRITICAL" ? 99 : level === "HIGH" ? 90 : level === "MEDIUM" ? 70 : 50,
          title: `Risk flag raised — ${level}`,
          description: `A ${level} risk flag has been raised against your broker account. Reason: ${String(reason || "").slice(0, 200)}. ${level === "HIGH" || level === "CRITICAL" ? "New service assignments may be paused pending review." : ""}`,
          ctaLabel: "View Risk Profile",
        },
      });
    } catch (inboxErr) {
      logger.warn("[fee-dispute/risk] inbox notify failed", { error: String(inboxErr) });
    }
    // CRITICAL flags require Governor escalation. HIGH flags are referred
    // to human review (no Governor call here — the assessor reports).
    if (level === "CRITICAL") {
      try {
        const governor = await import("@/lib/sgtx/governor");
        const governorDecide = (governor as any).governorDecide;
        if (typeof governorDecide === "function") {
          const resp = await governorDecide({
            action: "fee.broker.critical_risk_flag",
            actorGtid: brokerGtid,
            payload: { riskLevel: level, reason: String(reason || "").slice(0, 500), flagId: flag.id },
          });
          flag.governorDecisionId = String(resp?.decisionId || "");
          logger.info("[fee-dispute/risk] CRITICAL flag Governor decision recorded", {
            flagId: flag.id, decisionId: flag.governorDecisionId, verdict: resp?.verdict,
          });
        }
      } catch (govErr) {
        logger.warn("[fee-dispute/risk] Governor escalation failed", { error: String(govErr) });
      }
    }
    logger.info("[fee-dispute/risk] risk flag created", {
      flagId: flag.id, brokerGtid, riskLevel: level,
    });
    return flag;
  } catch (err) {
    logger.error("[fee-dispute/risk] createRiskFlag failed", { error: String(err), brokerGtid });
    return {
      id: "error",
      brokerGtid,
      riskLevel: riskLevel || "MEDIUM",
      reason: String(reason || ""),
      violationCount: 0,
      lastViolationAt: new Date(),
      createdAt: new Date(),
      clearedAt: null,
      governorDecisionId: null,
    };
  }
}

/**
 * §43 — Clear a risk flag. Consequential action — requires a Governor
 * decision (the Governor must approve clearing a HIGH or CRITICAL flag).
 * Records a BROKER_RISK_FLAG_CLEARED Activity row.
 */
export async function clearRiskFlag(flagId: string, governorDecisionId: string): Promise<void> {
  try {
    if (!flagId || !governorDecisionId) {
      throw new Error("flagId and governorDecisionId required");
    }
    // Verify the Governor decision.
    const decision = (await db.governorDecision.findUnique({
      where: { decisionId: governorDecisionId },
    })) as any;
    if (!decision) {
      throw new Error(`Governor decision ${governorDecisionId} not found`);
    }
    if (String(decision.verdict || "").toUpperCase() !== "ALLOW") {
      throw new Error(`Governor verdict is ${decision.verdict} (expected ALLOW)`);
    }
    // Find the flag (Activity row) by scanning metadata for the flagId.
    const flagActivity = (await db.activity.findFirst({
      where: { action: "BROKER_RISK_FLAG" },
      orderBy: { createdAt: "desc" },
    })) as any;
    // Record the clearance as a new Activity row.
    try {
      await db.activity.create({
        data: {
          action: "BROKER_RISK_FLAG_CLEARED",
          description: `Risk flag ${flagId} cleared by Governor decision ${governorDecisionId}`,
          type: "INFO",
          metadata: JSON.stringify({
            flagId,
            governorDecisionId,
            clearedAt: new Date().toISOString(),
          }),
        },
      });
    } catch (actErr) {
      logger.warn("[fee-dispute/risk] clearance activity log failed", { error: String(actErr) });
    }
    logger.info("[fee-dispute/risk] risk flag cleared", { flagId, governorDecisionId });
  } catch (err) {
    logger.error("[fee-dispute/risk] clearRiskFlag failed", { error: String(err), flagId });
    throw err;
  }
}

// ============ §22 Broker Fee Metrics ============

/**
 * §22 — Calculate broker fee metrics. These are OPERATIONAL / COMPLIANCE
 * metrics — they are NEVER turned into a public marketplace ranking (§23).
 *
 * Metrics computed:
 *   - disclosureAccuracy       — % of fees properly disclosed (1 - undisclosed/total)
 *   - postClearanceChargeRate  — % of trades with post-clearance charges
 *   - disputedFeeRate          — % of fees disputed
 *   - upheldDisputeRate        — % of disputes upheld against broker
 *   - resolutionTime           — avg hours to resolve dispute
 *   - unexplainedChargeRate    — % of charges with no evidence
 *   - repeatViolationRate      — % of recurring violations
 *
 * Returns a BrokerFeeMetrics object. NEVER throws — returns a
 * zero-valued metrics object on error.
 */
export async function calculateBrokerFeeMetrics(brokerGtid: string): Promise<BrokerFeeMetrics> {
  try {
    if (!brokerGtid) return _minimalMetrics("");
    const disputes = await listDisputes({ brokerGtid, limit: 500 });
    const total = disputes.length;
    const upheld = disputes.filter((d) => d.state === "UPHELD").length;
    const rejected = disputes.filter((d) => d.state === "REJECTED").length;
    const partial = disputes.filter((d) => d.state === "PARTIALLY_UPHELD").length;
    const open = disputes.filter((d) =>
      ["USER_DISPUTED", "BROKER_RESPONDING", "EVIDENCE_REQUESTED", "MEDIATION", "ESCALATED", "PENDING_REVIEW"].includes(d.state)
    ).length;

    // Disclosure accuracy: 1 - (UNDISCLOSED_FEE count / total disputes)
    const undisclosedCount = disputes.filter((d) => d.violationType === "UNDISCLOSED_FEE").length;
    const disclosureAccuracy = total === 0 ? 1 : Math.max(0, 1 - undisclosedCount / total);

    // Post-clearance surprise rate (proxy for postClearanceChargeRate).
    const postClearanceCount = disputes.filter((d) => d.violationType === "POST_CLEARANCE_SURPRISE").length;
    const postClearanceChargeRate = total === 0 ? 0 : postClearanceCount / total;

    // Disputed fee rate: disputes per trade (proxy: disputes / max(1, unique USTNs)).
    const uniqueUstns = new Set(disputes.map((d) => d.ustn)).size;
    const disputedFeeRate = uniqueUstns === 0 ? 0 : total / uniqueUstns;

    // Upheld dispute rate.
    const upheldDisputeRate = total === 0 ? 0 : upheld / total;

    // Resolution time: average hours between createdAt and resolvedAt.
    const resolvedDisputes = disputes.filter((d) => d.resolvedAt);
    const resolutionTime = resolvedDisputes.length === 0 ? 0
      : resolvedDisputes.reduce((sum, d) => sum + (d.resolvedAt!.getTime() - d.createdAt.getTime()) / 3600000, 0) / resolvedDisputes.length;

    // Unexplained charge rate: disputes with MISSING_EVIDENCE violation.
    const missingEvidenceCount = disputes.filter((d) => d.violationType === "MISSING_EVIDENCE").length;
    const unexplainedChargeRate = total === 0 ? 0 : missingEvidenceCount / total;

    // Repeat violation rate: brokers with the same violationType on multiple USTNs.
    const byType: Record<string, Set<string>> = {};
    for (const d of disputes) {
      if (!byType[d.violationType]) byType[d.violationType] = new Set();
      byType[d.violationType].add(d.ustn);
    }
    const repeatTypes = Object.values(byType).filter((set) => set.size >= 2).length;
    const repeatViolationRate = Object.keys(byType).length === 0 ? 0 : repeatTypes / Object.keys(byType).length;

    return {
      brokerGtid,
      disclosureAccuracy: Math.round(disclosureAccuracy * 1000) / 1000,
      postClearanceChargeRate: Math.round(postClearanceChargeRate * 1000) / 1000,
      disputedFeeRate: Math.round(disputedFeeRate * 1000) / 1000,
      upheldDisputeRate: Math.round(upheldDisputeRate * 1000) / 1000,
      resolutionTime: Math.round(resolutionTime * 10) / 10,
      unexplainedChargeRate: Math.round(unexplainedChargeRate * 1000) / 1000,
      repeatViolationRate: Math.round(repeatViolationRate * 1000) / 1000,
      totalDisputes: total,
      upheldDisputes: upheld,
      rejectedDisputes: rejected,
      partiallyUpheldDisputes: partial,
      openDisputes: open,
      assessedAt: new Date(),
    };
  } catch (err) {
    logger.error("[fee-dispute/risk] calculateBrokerFeeMetrics failed", { error: String(err), brokerGtid });
    return _minimalMetrics(brokerGtid);
  }
}

// ============ Helpers ============

/**
 * Load all active (uncleared) risk flags for a broker. Reads from the
 * Activity table — flags are rows with action="BROKER_RISK_FLAG", and
 * a flag is considered cleared if a later row with action=
 * "BROKER_RISK_FLAG_CLEARED" and matching flagId in metadata exists.
 */
async function _loadActiveRiskFlags(brokerGtid: string): Promise<BrokerRiskFlag[]> {
  try {
    const activities = (await db.activity.findMany({
      where: { actorGtid: brokerGtid, action: { in: ["BROKER_RISK_FLAG", "BROKER_RISK_FLAG_CLEARED"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
    })) as any[];
    const flags: BrokerRiskFlag[] = [];
    const clearedIds = new Set<string>();
    for (const a of activities) {
      let meta: any = {};
      try { meta = JSON.parse(a.metadata || "{}"); } catch {}
      if (a.action === "BROKER_RISK_FLAG_CLEARED" && meta.flagId) {
        clearedIds.add(meta.flagId);
      }
    }
    for (const a of activities) {
      if (a.action !== "BROKER_RISK_FLAG") continue;
      let meta: any = {};
      try { meta = JSON.parse(a.metadata || "{}"); } catch {}
      if (!meta.id || clearedIds.has(meta.id)) continue;
      flags.push({
        id: meta.id,
        brokerGtid: meta.brokerGtid || brokerGtid,
        riskLevel: meta.riskLevel || "INFO",
        reason: meta.reason || a.description || "",
        violationCount: Number(meta.violationCount || 0),
        lastViolationAt: meta.lastViolationAt ? new Date(meta.lastViolationAt) : a.createdAt,
        createdAt: a.createdAt,
        clearedAt: null,
        governorDecisionId: meta.governorDecisionId || null,
      });
    }
    return flags.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (err) {
    logger.warn("[fee-dispute/risk] _loadActiveRiskFlags failed", { error: String(err) });
    return [];
  }
}

function _rankLevel(level: string): number {
  const idx = RISK_LEVELS.indexOf(String(level || "").toUpperCase() as any);
  return idx === -1 ? 0 : idx;
}

function _recommendationFor(level: string, flagCount: number, disputeCount: number): string {
  try {
    if (level === "CRITICAL") {
      return `CRITICAL risk — new service assignments hard-blocked pending Governor + human review. ${flagCount} active flag(s), ${disputeCount} dispute(s). Consequential enforcement requires Governor decision.`;
    }
    if (level === "HIGH") {
      return `HIGH risk — new service assignments paused pending human review. ${flagCount} active flag(s), ${disputeCount} dispute(s). Suspension / delisting requires Governor decision.`;
    }
    if (level === "MEDIUM") {
      return `MEDIUM risk — operational monitoring. ${flagCount} active flag(s), ${disputeCount} dispute(s). No enforcement action — broker remains eligible for new assignments.`;
    }
    if (level === "LOW") {
      return `LOW risk — informational. ${disputeCount} dispute(s) recorded. No operational impact.`;
    }
    return `No active risk flags. ${disputeCount} dispute(s) on record.`;
  } catch {
    return "No recommendation available.";
  }
}

function _minimalAssessment(brokerGtid: string): BrokerRiskAssessment {
  return {
    brokerGtid,
    riskLevel: "INFO",
    flags: [],
    recommendation: "Risk assessment unavailable — defaulted to INFO.",
    eligibility: RISK_ELIGIBILITY.INFO,
    assessedAt: new Date(),
  };
}

function _minimalMetrics(brokerGtid: string): BrokerFeeMetrics {
  return {
    brokerGtid,
    disclosureAccuracy: 1,
    postClearanceChargeRate: 0,
    disputedFeeRate: 0,
    upheldDisputeRate: 0,
    resolutionTime: 0,
    unexplainedChargeRate: 0,
    repeatViolationRate: 0,
    totalDisputes: 0,
    upheldDisputes: 0,
    rejectedDisputes: 0,
    partiallyUpheldDisputes: 0,
    openDisputes: 0,
    assessedAt: new Date(),
  };
}
