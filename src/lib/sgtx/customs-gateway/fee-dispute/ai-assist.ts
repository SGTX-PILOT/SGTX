// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute AI Assist
 * ===========================================================================
 *
 * Implements the AI assistance layer for fee disputes. Per §42, AI in
 * disputes is restricted to four advisory capabilities (A1–A4). The
 * fifth capability (A5 — autonomous AI decision-making) is FORBIDDEN
 * and NO function exists for it.
 *
 * Implements prompt section §42 — AI in fee disputes:
 *
 *   A1  Summarize dispute, explain timeline, create Smart Inbox summary,
 *       translate. (ADVISORY ONLY — never binding.)
 *
 *   A2  Identify discrepancy, compare quote vs charge, identify duplicate,
 *       detect missing evidence, detect anomalous behavior.
 *       (DETECTION ONLY — surfaces issues for human review.)
 *
 *   A3  Escalate high-risk disputes, assist human review. (ASSIST ONLY —
 *       the AI flags disputes that SHOULD be escalated; the actual
 *       escalation passes through the Governor.)
 *
 *   A4  Enforce deterministic fee policy and governance rules. (DETERMINISTIC
 *       ONLY — the AI does not make judgement calls; it applies the policy
 *       as written. Any policy override passes through the Governor.)
 *
 *   A5  FORBIDDEN — no function exists for autonomous AI decision-making.
 *       AI must NEVER:
 *         - decide final legal liability autonomously
 *         - force a refund
 *         - freeze a broker merely because AI says so
 *         - alter the original fee record
 *         - delete dispute evidence
 *
 * Design constraints (NON-NEGOTIABLE):
 *
 *   L0-1  ADVISORY ONLY: every AI output is advisory. A human (mediator,
 *         compliance officer) and/or the Governor MUST make the binding
 *         decision. The AI never has the final word.
 *
 *   L0-2  IMMUTABLE FEE RECORDS: the AI never alters the original fee
 *         record, quote, or evidence. It can READ them and ADVISE on
 *         them, but never WRITE to them.
 *
 *   L0-3  NO AUTONOMOUS ENFORCEMENT: the AI can recommend escalation
 *         or enforcement, but the actual escalation / enforcement
 *         passes through the Governor + human review.
 *
 *   L0-4  A5 FORBIDDEN: this module exposes NO function that makes a
 *         binding decision. Anyone calling these functions receives an
 *         advisory result that they may use to inform a Governor
 *         request or a human review.
 *
 * All public functions are wrapped in try/catch with safe defaults —
 * the engine never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getDispute, listDisputes, VIOLATION_SEVERITY } from "./index";
import { gatherEvidence, verifyFeeIntegrity } from "./evidence";
import { assessBrokerRisk } from "./risk-controls";

// ============ A1: Summarize Dispute ============

/**
 * A1 — Summarize a dispute, explain its timeline, surface key points,
 * and produce a Smart Inbox summary. The AI output is ADVISORY ONLY —
 * it never binds the mediator or the Governor.
 *
 * Returns:
 *   - summary     — plain-language summary of the dispute
 *   - timeline    — chronological list of key events
 *   - keyPoints   — bullet list of facts a human should focus on
 *
 * This function uses deterministic heuristics (no external AI call)
 * so the output is reproducible and auditable. A real LLM call could
 * be plugged in later via the existing orchestrator — but the
 * ADVISORY ONLY constraint remains.
 */
export async function summarizeDispute(disputeId: string): Promise<{
  summary: string;
  timeline: string[];
  keyPoints: string[];
}> {
  try {
    const dispute = await getDispute(disputeId);
    if (!dispute) {
      return { summary: "Dispute not found.", timeline: [], keyPoints: [] };
    }
    const evidence = await gatherEvidence(disputeId);
    const timeline: string[] = [];
    timeline.push(`[${_fmt(dispute.createdAt)}] Dispute created — ${dispute.violationType} (${dispute.state})`);
    if (dispute.originalQuote?.acceptedAt) {
      timeline.push(`[${_fmt(new Date(dispute.originalQuote.acceptedAt))}] Original quote accepted — ${dispute.currency} ${Number(dispute.originalQuote.feeUsd || 0).toFixed(2)}`);
    }
    if (dispute.acknowledgedAt) {
      timeline.push(`[${_fmt(dispute.acknowledgedAt)}] Broker acknowledged`);
    }
    if (dispute.brokerResponseAt) {
      timeline.push(`[${_fmt(dispute.brokerResponseAt)}] Broker submitted response (${(dispute.brokerResponse || "").length} chars)`);
    }
    if (dispute.resolvedAt) {
      timeline.push(`[${_fmt(dispute.resolvedAt)}] Resolved — ${dispute.state}${dispute.governorDecisionId ? ` (Governor ${dispute.governorDecisionId})` : ""}`);
    }
    if (dispute.evidenceDeadline) {
      timeline.push(`[${_fmt(dispute.evidenceDeadline)}] Evidence deadline${dispute.evidenceDeadline.getTime() < Date.now() ? " (PASSED)" : ""}`);
    }
    if (dispute.resolutionDeadline) {
      timeline.push(`[${_fmt(dispute.resolutionDeadline)}] Resolution deadline${dispute.resolutionDeadline.getTime() < Date.now() ? " (PASSED)" : ""}`);
    }

    const keyPoints: string[] = [];
    keyPoints.push(`Violation type: ${dispute.violationType} (severity ${VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM"})`);
    keyPoints.push(`Disputed amount: ${dispute.currency} ${dispute.disputedAmount.toFixed(2)}`);
    keyPoints.push(`Current state: ${dispute.state}`);
    if (dispute.originalQuote && dispute.newCharge) {
      const origFee = Number(dispute.originalQuote.feeUsd || 0);
      const newFee = Number(dispute.newCharge.feeUsd || (Array.isArray(dispute.newCharge) ? dispute.newCharge[0]?.feeUsd : 0) || 0);
      if (newFee > origFee) {
        keyPoints.push(`Fee delta: +${dispute.currency} ${(newFee - origFee).toFixed(2)} (increase)`);
      } else if (newFee < origFee) {
        keyPoints.push(`Fee delta: -${dispute.currency} ${(origFee - newFee).toFixed(2)} (decrease)`);
      }
    }
    if ((dispute.evidence || []).length === 0) {
      keyPoints.push("⚠ No evidence attached — broker should submit supporting documentation");
    } else {
      keyPoints.push(`Evidence items: ${(dispute.evidence || []).length}`);
    }
    if (dispute.governorDecisionId) {
      keyPoints.push(`Governor decision recorded: ${dispute.governorDecisionId}`);
    }
    if ((evidence.governorDecisions || []).length > 0) {
      keyPoints.push(`Total Governor decisions on this USTN: ${(evidence.governorDecisions || []).length}`);
    }
    if ((evidence.loomHashes || []).length > 0) {
      keyPoints.push(`Loom chain: ${(evidence.loomHashes || []).length} events hash-chained`);
    }

    const summary =
      `Fee dispute ${dispute.id} concerns a ${dispute.violationType} violation by broker ` +
      `${dispute.brokerGtid.slice(-8)} on trade ${dispute.ustn}. The disputed amount is ` +
      `${dispute.currency} ${dispute.disputedAmount.toFixed(2)}. The dispute is currently ` +
      `in state ${dispute.state}. ${dispute.brokerResponse ? "The broker has responded. " : "The broker has not yet responded. "}` +
      `${dispute.resolvedAt ? `It was resolved on ${_fmt(dispute.resolvedAt)} as ${dispute.state}.` : "It is not yet resolved."} ` +
      `This summary is ADVISORY ONLY (§42 A1) — the mediator and Governor make the binding decision.`;

    return { summary, timeline, keyPoints };
  } catch (err) {
    logger.error("[fee-dispute/ai] summarizeDispute failed", { error: String(err), disputeId });
    return { summary: "Summary unavailable — internal error.", timeline: [], keyPoints: [] };
  }
}

// ============ A2: Analyze Fee Discrepancy ============

/**
 * A2 — Identify discrepancies between the original quote and the
 * charged fee. Detects:
 *   - quote-vs-charge amount mismatches
 *   - duplicate charges (same serviceType charged twice)
 *   - missing evidence (no supporting invoices / government refs)
 *   - anomalous behavior (backdated fees, currency switches,
 *     post-clearance surprises)
 *
 * Returns structured detection results. This is DETECTION ONLY — the
 * AI surfaces issues for human review. The actual dispute creation
 * (if not already present) passes through createDisputeCase, and any
 * consequential action passes through the Governor.
 */
export async function analyzeFeeDiscrepancy(ustn: string): Promise<{
  discrepancies: { type: string; description: string; severity: string }[];
  duplicateCharges: string[];
  missingEvidence: string[];
  anomalousBehavior: string[];
}> {
  try {
    if (!ustn) return _emptyAnalysis();
    const disputes = await listDisputes({ ustn, limit: 50 });
    const discrepancies: { type: string; description: string; severity: string }[] = [];
    const duplicateCharges: string[] = [];
    const missingEvidence: string[] = [];
    const anomalousBehavior: string[] = [];

    // Pull all ServiceQuotation rows for this USTN to detect duplicates
    // and amount mismatches.
    let quotes: any[] = [];
    try {
      quotes = (await db.serviceQuotation.findMany({
        where: { ustn },
        orderBy: { createdAt: "asc" },
      })) as any[];
    } catch (qErr) {
      logger.warn("[fee-dispute/ai] ServiceQuotation lookup failed", { error: String(qErr) });
    }

    // Duplicate detection — same serviceType charged more than once.
    const byServiceType: Record<string, any[]> = {};
    for (const q of quotes) {
      const key = String(q.serviceType || "UNKNOWN");
      if (!byServiceType[key]) byServiceType[key] = [];
      byServiceType[key].push(q);
    }
    for (const [serviceType, group] of Object.entries(byServiceType)) {
      if (group.length > 1) {
        duplicateCharges.push(`${serviceType} charged ${group.length} times (quoteIds: ${group.map((q) => q.quoteId).join(", ")})`);
      }
    }

    // Per-dispute discrepancy analysis.
    for (const d of disputes) {
      if (d.originalQuote && d.newCharge) {
        const origFee = Number(d.originalQuote.feeUsd || 0);
        const newFee = Number(
          Array.isArray(d.newCharge) ? (d.newCharge[0]?.feeUsd || 0) : (d.newCharge.feeUsd || 0)
        );
        if (newFee > origFee + 0.001) {
          discrepancies.push({
            type: "AMOUNT_MISMATCH",
            description: `Dispute ${d.id}: charged ${d.currency} ${newFee.toFixed(2)} vs quoted ${origFee.toFixed(2)} (+${(newFee - origFee).toFixed(2)})`,
            severity: "HIGH",
          });
        }
        const origCurrency = String(d.originalQuote.currency || "USD");
        const newCurrency = String(
          Array.isArray(d.newCharge) ? (d.newCharge[0]?.currency || "USD") : (d.newCharge.currency || "USD")
        );
        if (origCurrency !== newCurrency) {
          discrepancies.push({
            type: "CURRENCY_MISMATCH",
            description: `Dispute ${d.id}: charged in ${newCurrency} vs quoted in ${origCurrency}`,
            severity: "HIGH",
          });
          anomalousBehavior.push(`Currency switched from ${origCurrency} to ${newCurrency} on dispute ${d.id}`);
        }
      }
      if (d.violationType === "BACKDATED_FEE") {
        anomalousBehavior.push(`Backdated fee detected on dispute ${d.id}`);
      }
      if (d.violationType === "POST_CLEARANCE_SURPRISE") {
        anomalousBehavior.push(`Post-clearance surprise charge on dispute ${d.id}`);
      }
      if (d.violationType === "FEE_TAMPERING") {
        anomalousBehavior.push(`Fee tampering detected on dispute ${d.id} (CRITICAL)`);
      }
      if ((d.evidence || []).length === 0) {
        missingEvidence.push(`Dispute ${d.id} has no evidence attached`);
      }
    }

    // Run fee-integrity verification for additional tampering signals.
    try {
      const integrity = await verifyFeeIntegrity(ustn);
      for (const attempt of integrity.tamperingAttempts) {
        anomalousBehavior.push(`Tampering signal: ${attempt}`);
      }
    } catch (intErr) {
      logger.warn("[fee-dispute/ai] integrity check failed", { error: String(intErr) });
    }

    return { discrepancies, duplicateCharges, missingEvidence, anomalousBehavior };
  } catch (err) {
    logger.error("[fee-dispute/ai] analyzeFeeDiscrepancy failed", { error: String(err), ustn });
    return _emptyAnalysis();
  }
}

// ============ A3: Escalate High-Risk Disputes ============

/**
 * A3 — Identify disputes that SHOULD be escalated. The AI flags them;
 * the actual escalation passes through the Governor (escalateDispute
 * in fee-dispute/index.ts).
 *
 * Triggers for recommendation:
 *   - violation severity = CRITICAL
 *   - SLA breach on resolve deadline
 *   - broker has 3+ open disputes
 *   - fee tampering detected
 *   - broker risk level = HIGH or CRITICAL
 *
 * Returns a list of { disputeId, reason } recommendations. This is
 * ASSIST ONLY — the caller (human / Governor) decides whether to
 * actually escalate.
 */
export async function escalateHighRiskDisputes(): Promise<{ escalated: string[]; reason: string }[]> {
  try {
    const all = await listDisputes({ limit: 500 });
    const recommendations: { escalated: string[]; reason: string }[] = [];
    const open = all.filter((d) =>
      ["USER_DISPUTED", "BROKER_RESPONDING", "EVIDENCE_REQUESTED", "MEDIATION", "PENDING_REVIEW"].includes(d.state)
    );
    // Group by broker to detect repeat offenders.
    const byBroker: Record<string, typeof open> = {};
    for (const d of open) {
      if (!byBroker[d.brokerGtid]) byBroker[d.brokerGtid] = [];
      byBroker[d.brokerGtid].push(d);
    }

    for (const d of open) {
      const severity = VIOLATION_SEVERITY[d.violationType] || "MEDIUM";
      const reasons: string[] = [];
      if (severity === "CRITICAL") {
        reasons.push(`CRITICAL violation type (${d.violationType})`);
      }
      if (d.resolutionDeadline && d.resolutionDeadline.getTime() < Date.now() && !d.resolvedAt) {
        reasons.push("Resolution deadline breached");
      }
      if (d.violationType === "FEE_TAMPERING") {
        reasons.push("Fee tampering detected (§57)");
      }
      const brokerOpenCount = (byBroker[d.brokerGtid] || []).length;
      if (brokerOpenCount >= 3) {
        reasons.push(`Broker has ${brokerOpenCount} open disputes`);
      }
      // Check broker risk level.
      try {
        const risk = await assessBrokerRisk(d.brokerGtid);
        if (risk.riskLevel === "HIGH" || risk.riskLevel === "CRITICAL") {
          reasons.push(`Broker risk level is ${risk.riskLevel}`);
        }
      } catch {
        /* risk assessment unavailable */
      }
      if (reasons.length > 0) {
        recommendations.push({
          escalated: [d.id],
          reason: `Recommend escalation: ${reasons.join("; ")}. (§42 A3 — ASSIST ONLY; escalation passes through Governor.)`,
        });
      }
    }
    return recommendations;
  } catch (err) {
    logger.error("[fee-dispute/ai] escalateHighRiskDisputes failed", { error: String(err) });
    return [];
  }
}

// ============ A4: Enforce Deterministic Fee Policy ============

/**
 * A4 — Enforce deterministic fee policy. The AI applies the policy as
 * written — no judgement calls. Any policy override or exemption passes
 * through the Governor.
 *
 * Deterministic rules evaluated:
 *   - if violationType is FEE_TAMPERING → action: "REQUIRE_GOVERNOR_ESCALATION"
 *   - if violationType is BACKDATED_FEE → action: "REQUIRE_GOVERNOR_ESCALATION"
 *   - if disputedAmount > 10_000 USD → action: "REQUIRE_GOVERNOR_REVIEW"
 *   - if broker risk = CRITICAL → action: "BLOCK_NEW_ASSIGNMENTS"
 *   - if dispute state is terminal → action: "NO_ACTION"
 *   - otherwise → action: "PROCEED_STANDARD_SLA"
 *
 * Returns { action, reason, governorRequired }. The caller uses this to
 * decide next steps. This is DETERMINISTIC ONLY — the AI does not
 * interpret context or exercise discretion.
 */
export async function enforceFeePolicy(disputeId: string): Promise<{
  action: string;
  reason: string;
  governorRequired: boolean;
}> {
  try {
    const dispute = await getDispute(disputeId);
    if (!dispute) {
      return {
        action: "NO_ACTION",
        reason: "Dispute not found — no policy applied.",
        governorRequired: false,
      };
    }
    // Terminal states require no further action.
    if (["CLOSED", "UPHELD", "REJECTED", "PARTIALLY_UPHELD"].includes(dispute.state)) {
      return {
        action: "NO_ACTION",
        reason: `Dispute is in terminal state ${dispute.state}.`,
        governorRequired: false,
      };
    }
    // CRITICAL violations require Governor escalation.
    const severity = VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM";
    if (severity === "CRITICAL") {
      return {
        action: "REQUIRE_GOVERNOR_ESCALATION",
        reason: `Violation ${dispute.violationType} is CRITICAL — Governor escalation required (§42 A4 deterministic rule).`,
        governorRequired: true,
      };
    }
    // High-value disputes require Governor review.
    if (dispute.disputedAmount > 10000) {
      return {
        action: "REQUIRE_GOVERNOR_REVIEW",
        reason: `Disputed amount ${dispute.currency} ${dispute.disputedAmount.toFixed(2)} exceeds 10,000 threshold — Governor review required.`,
        governorRequired: true,
      };
    }
    // Broker risk = CRITICAL blocks new assignments.
    try {
      const risk = await assessBrokerRisk(dispute.brokerGtid);
      if (risk.riskLevel === "CRITICAL") {
        return {
          action: "BLOCK_NEW_ASSIGNMENTS",
          reason: `Broker risk level is CRITICAL — new service assignments blocked pending Governor + human review.`,
          governorRequired: true,
        };
      }
    } catch {
      /* risk check unavailable — fall through */
    }
    // Standard SLA path.
    return {
      action: "PROCEED_STANDARD_SLA",
      reason: `Dispute follows standard SLA (acknowledge ${_slaHours(dispute)}h, evidence ${_slaEvidenceHours(dispute)}h, resolve ${_slaResolveDays(dispute)}d). No Governor action required at this stage.`,
      governorRequired: false,
    };
  } catch (err) {
    logger.error("[fee-dispute/ai] enforceFeePolicy failed", { error: String(err), disputeId });
    return {
      action: "NO_ACTION",
      reason: `Internal error — no policy applied. ${String(err).slice(0, 200)}`,
      governorRequired: false,
    };
  }
}

// ============ A5: FORBIDDEN ============

/**
 * A5 — FORBIDDEN.
 *
 * Per §42, AI in disputes is restricted to A1–A4. The fifth capability
 * (A5 — autonomous AI decision-making) is FORBIDDEN. AI must NEVER:
 *
 *   - decide final legal liability autonomously
 *   - force a refund
 *   - freeze a broker merely because AI says so
 *   - alter the original fee record
 *   - delete dispute evidence
 *
 * This comment block is the ONLY artefact in this module that mentions
 * A5. No function exists for it. Any caller that tries to invoke an
 * "autonomous AI decision" must be rejected at the API layer — there
 * is no entry point here.
 *
 * If a future requirement emerges for an "AI-driven enforcement"
 * capability, it MUST be implemented as:
 *   1.  An A3-style recommendation (escalateHighRiskDisputes)
 *   2.  Routed through the Governor via escalateDispute / resolveDispute
 *   3.  Reviewed by a human before any binding action
 *
 * The Governor + human review are the ONLY entities that can take
 * consequential action. The AI never has the final word.
 */

// ============ Helpers ============

function _fmt(d: Date | string | null): string {
  try {
    if (!d) return "N/A";
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().slice(0, 19).replace("T", " ") + "Z";
  } catch {
    return "N/A";
  }
}

function _slaHours(dispute: any): number {
  const sev = VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM";
  return sev === "HIGH" || sev === "CRITICAL" ? 8 : 24;
}

function _slaEvidenceHours(dispute: any): number {
  const sev = VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM";
  return sev === "HIGH" || sev === "CRITICAL" ? 24 : 72;
}

function _slaResolveDays(dispute: any): number {
  const sev = VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM";
  return sev === "HIGH" || sev === "CRITICAL" ? 3 : 7;
}

function _emptyAnalysis() {
  return {
    discrepancies: [],
    duplicateCharges: [],
    missingEvidence: [],
    anomalousBehavior: [],
  };
}
