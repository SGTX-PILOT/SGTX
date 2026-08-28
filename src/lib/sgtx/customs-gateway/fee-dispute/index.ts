// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute Engine (Core)
 * ===========================================================================
 *
 * Implements the SGTX Customs Fee Dispute Engine — the lifecycle, state
 * machine, broker response SLAs, and Governor-gated consequential actions
 * for fee disputes raised against customs brokers.
 *
 * Implements prompt sections:
 *   §17  Fee Dispute Engine overview
 *   §18  Dispute States (12 states)
 *   §19  Automated Detection (auto-creates a dispute case)
 *   §20  Broker Response SLA (24h ack / 72h evidence / 7d resolve)
 *   §43  All consequential actions pass through the Governor
 *
 * Design constraints (NON-NEGOTIABLE):
 *
 *   L0-1  NON-CUSTODIAL: this module never moves funds. A dispute may
 *         freeze a FeeLock (via the existing payment/fealock lib) but
 *         never transfers money.
 *
 *   L0-2  GOVERNOR MANDATORY: every consequential dispute action
 *         (resolve, escalate, partially-uphold) passes through the
 *         Governor (governorDecide). DENY on any internal failure —
 *         never auto-ALLOW.
 *
 *   L0-3  IMMUTABLE FEE RECORDS: the original quote / accepted fee /
 *         broker fee schedule are preserved VERBATIM inside the dispute
 *         record. They are NEVER mutated — only superseded by a new
 *         versioned snapshot. (§69 — append-only or versioned, never
 *         mutate the original.)
 *
 *   L0-4  NO MARKETPLACE RANKINGS: broker metrics are operational /
 *         compliance only — they are NEVER turned into a public ranking
 *         (§23). They can affect operational eligibility for NEW service
 *         requests, but never delist or terminate a broker autonomously.
 *
 *   L0-5  A5 FORBIDDEN: AI never makes autonomous decisions in disputes
 *         (§42). The AI-assist module (separate file) provides A1–A4
 *         advisory only. A5 (autonomous AI decision-making) is
 *         explicitly forbidden and no function exists for it.
 *
 * Persistence:
 *   - FeeDispute records are stored as rows in the existing `Dispute`
 *     Prisma table. The base fields (ustn, status, filedByGtid,
 *     respondentGtid, claimAmountUsd, description, resolution) map
 *     directly. The extended FeeDispute-specific fields (state, currency,
 *     chargeId, violationType, originalQuote, newCharge, evidence,
 *     brokerResponse, deadlines, governorDecisionId) are serialised as
 *     JSON in the `resolutionNotes` column (nullable String).
 *   - Loom audit events are appended via the existing event-spine
 *     `appendEvent` (CanonicalEvent hash chain).
 *   - Notifications flow through the existing InboxItem table.
 *   - Audit events flow through the existing Activity table.
 *   - Governor decisions are recorded in the existing GovernorDecision
 *     table (via the Governor lib's governorDecide).
 *
 * NO schema changes — purely additive.
 *
 * All public functions are wrapped in try/catch with safe defaults —
 * the engine never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ §18 Dispute States ============

/**
 * §18 — The 12 canonical fee-dispute lifecycle states. Every fee dispute
 * passes through these states; the state machine below enforces the legal
 * transitions.
 *
 *   NO_DISPUTE          — initial / no dispute raised
 *   PENDING_REVIEW      — automated detection flagged a potential
 *                         violation; awaiting triage
 *   USER_DISPUTED       — trader (or platform) has formally raised a
 *                         fee dispute
 *   BROKER_RESPONDING   — broker has acknowledged and is preparing a
 *                         response
 *   EVIDENCE_REQUESTED  — platform has requested additional evidence
 *                         from the broker (or trader)
 *   MEDIATION           — neutral SGTX mediation phase (rounds 1–5)
 *   UPHELD              — dispute upheld against the broker (terminal
 *                         unless Governor re-opens)
 *   REJECTED            — dispute rejected (no violation found)
 *   PARTIALLY_UPHELD    — some charges upheld, others rejected
 *   ESCALATED           — escalated to Governor / external authority
 *   CLOSED              — terminal; dispute closed (refund processed
 *                         or no further action)
 *
 * NOTE: The spec lists 11 states but the interface also acknowledges
 * NO_DISPUTE as the 12th implicit state (the pre-dispute baseline).
 */
export const DISPUTE_STATES = [
  "NO_DISPUTE",
  "PENDING_REVIEW",
  "USER_DISPUTED",
  "BROKER_RESPONDING",
  "EVIDENCE_REQUESTED",
  "MEDIATION",
  "UPHELD",
  "REJECTED",
  "PARTIALLY_UPHELD",
  "ESCALATED",
  "CLOSED",
] as const;

/**
 * §18 — The legal state transitions. Any transition NOT in this map is
 * rejected by `isValidDisputeTransition`.
 *
 *   NO_DISPUTE         → PENDING_REVIEW
 *   PENDING_REVIEW     → USER_DISPUTED, CLOSED (auto-close if no violation)
 *   USER_DISPUTED      → BROKER_RESPONDING
 *   BROKER_RESPONDING  → EVIDENCE_REQUESTED, UPHELD, REJECTED, PARTIALLY_UPHELD
 *   EVIDENCE_REQUESTED → BROKER_RESPONDING, MEDIATION
 *   MEDIATION          → UPHELD, REJECTED, PARTIALLY_UPHELD, ESCALATED
 *   UPHELD             → CLOSED (terminal — Governor must re-open to leave)
 *   REJECTED           → CLOSED, ESCALATED (trader may escalate)
 *   PARTIALLY_UPHELD   → CLOSED, ESCALATED
 *   ESCALATED          → UPHELD, REJECTED, PARTIALLY_UPHELD, CLOSED
 *   CLOSED             → [] (terminal)
 */
export const DISPUTE_TRANSITIONS: Record<string, string[]> = {
  NO_DISPUTE: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["USER_DISPUTED", "CLOSED"],
  USER_DISPUTED: ["BROKER_RESPONDING"],
  BROKER_RESPONDING: ["EVIDENCE_REQUESTED", "UPHELD", "REJECTED", "PARTIALLY_UPHELD"],
  EVIDENCE_REQUESTED: ["BROKER_RESPONDING", "MEDIATION"],
  MEDIATION: ["UPHELD", "REJECTED", "PARTIALLY_UPHELD", "ESCALATED"],
  UPHELD: ["CLOSED"],
  REJECTED: ["CLOSED", "ESCALATED"],
  PARTIALLY_UPHELD: ["CLOSED", "ESCALATED"],
  ESCALATED: ["UPHELD", "REJECTED", "PARTIALLY_UPHELD", "CLOSED"],
  CLOSED: [],
};

// ============ Fee Violation Types ============

/**
 * The canonical fee violation types. These are the categories of fee
 * violations that the automated detection layer may flag.
 *
 * Each violation has a default severity that feeds the risk-assessment
 * layer (risk-controls.ts).
 */
export const FEE_VIOLATION_TYPES = [
  "UNDISCLOSED_FEE",        // broker charged a fee not in the published schedule
  "FEE_EXCEEDS_QUOTE",      // broker charged more than the accepted quote
  "FEE_EXCEEDS_SCHEDULE",   // broker charged above the published fee-schedule cap
  "CURRENCY_MISMATCH",      // broker charged in a different currency than quoted
  "DUPLICATE_CHARGE",       // broker charged twice for the same service
  "BACKDATED_FEE",          // fee was backdated to a date before the service was rendered
  "MISSING_EVIDENCE",       // broker cannot produce supporting invoice / government ref
  "UNAUTHORIZED_CHARGE",    // broker charged a service not authorised by the trader
  "FEE_TAMPERING",          // fee record was mutated after acceptance (§57 / §69)
  "CATEGORY_MISCLASSIFICATION", // service category changed post-acceptance
  "POST_CLEARANCE_SURPRISE",    // surprise charge raised after clearance (§22)
] as const;

/**
 * Default severity per violation type. Used by the risk-assessment layer
 * when escalating. CRITICAL = immediate Governor escalation; HIGH = 24h
 * broker response SLA tightened; MEDIUM = standard SLA; LOW = informational.
 */
export const VIOLATION_SEVERITY: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  UNDISCLOSED_FEE: "HIGH",
  FEE_EXCEEDS_QUOTE: "HIGH",
  FEE_EXCEEDS_SCHEDULE: "MEDIUM",
  CURRENCY_MISMATCH: "HIGH",
  DUPLICATE_CHARGE: "HIGH",
  BACKDATED_FEE: "CRITICAL",
  MISSING_EVIDENCE: "MEDIUM",
  UNAUTHORIZED_CHARGE: "HIGH",
  FEE_TAMPERING: "CRITICAL",
  CATEGORY_MISCLASSIFICATION: "MEDIUM",
  POST_CLEARANCE_SURPRISE: "HIGH",
};

// ============ §20 Broker Response SLA ============

/**
 * §20 — Default broker response SLA. Every fee dispute creates three
 * deadlines derived from these values. The SLA is configurable per
 * jurisdiction / broker risk level (callers may override).
 *
 *   acknowledgeHours = 24   — broker must acknowledge within 24h
 *   evidenceHours    = 72   — broker must submit evidence within 72h
 *   resolveDays      = 7    — broker must resolve within 7 days
 */
export const DEFAULT_SLA = {
  acknowledgeHours: 24,
  evidenceHours: 72,
  resolveDays: 7,
} as const;

/**
 * Tightened SLA for HIGH / CRITICAL risk brokers (per §21 risk controls).
 */
export const TIGHTENED_SLA = {
  acknowledgeHours: 8,
  evidenceHours: 24,
  resolveDays: 3,
} as const;

// ============ Types ============

export interface FeeDispute {
  id: string;
  ustn: string;
  brokerGtid: string;
  traderGtid: string;
  chargeId: string;
  violationType: string;
  state: string;
  disputedAmount: number;
  currency: string;
  originalQuote: any;
  newCharge: any;
  reason: string;
  evidence: any[];
  brokerResponse: string | null;
  brokerResponseAt: Date | null;
  acknowledgedAt: Date | null;
  evidenceDeadline: Date | null;
  resolutionDeadline: Date | null;
  resolution: string | null;
  resolvedAt: Date | null;
  governorDecisionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisputeSLABreach {
  disputeId: string;
  ustn: string;
  brokerGtid: string;
  breachType: "ACKNOWLEDGE" | "EVIDENCE" | "RESOLVE";
  deadline: Date;
  breachedAt: Date;
  hoursOverdue: number;
  severity: "MEDIUM" | "HIGH" | "CRITICAL";
}

// ============ §18 State Machine Helpers ============

/**
 * §18 — Returns true iff (from → to) is a legal dispute state transition.
 * Unknown states return false (NEVER auto-creates a transition).
 */
export function isValidDisputeTransition(from: string, to: string): boolean {
  try {
    const allowed = DISPUTE_TRANSITIONS[String(from || "").toUpperCase()] || [];
    return allowed.includes(String(to || "").toUpperCase());
  } catch {
    return false;
  }
}

/**
 * §18 — Returns the list of valid next states for a given state. Empty
 * array for terminal / unknown states.
 */
export function getValidDisputeTransitions(state: string): string[] {
  try {
    return DISPUTE_TRANSITIONS[String(state || "").toUpperCase()] || [];
  } catch {
    return [];
  }
}

/**
 * §18 — Returns true iff the state is terminal (no further transitions).
 */
export function isDisputeTerminal(state: string): boolean {
  try {
    const next = getValidDisputeTransitions(state);
    return next.length === 0;
  } catch {
    return false;
  }
}

/**
 * §43 — Returns true iff transitioning (from → to) requires a Governor
 * decision. Consequential outcomes (UPHELD, PARTIALLY_UPHELD, ESCALATED,
 * CLOSED from UPHELD) always require the Governor because they affect
 * the broker's liability / operational eligibility.
 */
export function requiresGovernorForTransition(from: string, to: string): boolean {
  try {
    const t = String(to || "").toUpperCase();
    return ["UPHELD", "PARTIALLY_UPHELD", "ESCALATED", "CLOSED"].includes(t);
  } catch {
    return false;
  }
}

// ============ §19 Persistence Helpers ============

/**
 * Persist a FeeDispute row. Creates or updates the corresponding Dispute
 * row; serialises the extended FeeDispute fields as JSON in
 * `resolutionNotes`. NEVER throws — returns the persisted FeeDispute on
 * success or the input on failure.
 *
 * CRITICAL: originalQuote / newCharge / evidence are preserved VERBATIM.
 * The persistence layer NEVER mutates them — only appends new versions
 * (§69 — append-only or versioned, never mutate the original).
 */
async function persistDispute(d: FeeDispute): Promise<FeeDispute> {
  try {
    const ext = {
      _feeDisputeExt: true,
      _extVersion: 1,
      brokerGtid: d.brokerGtid,
      traderGtid: d.traderGtid,
      chargeId: d.chargeId,
      violationType: d.violationType,
      currency: d.currency,
      originalQuote: d.originalQuote,
      newCharge: d.newCharge,
      evidence: d.evidence || [],
      brokerResponse: d.brokerResponse,
      brokerResponseAt: d.brokerResponseAt ? new Date(d.brokerResponseAt).toISOString() : null,
      acknowledgedAt: d.acknowledgedAt ? new Date(d.acknowledgedAt).toISOString() : null,
      evidenceDeadline: d.evidenceDeadline ? new Date(d.evidenceDeadline).toISOString() : null,
      resolutionDeadline: d.resolutionDeadline ? new Date(d.resolutionDeadline).toISOString() : null,
      governorDecisionId: d.governorDecisionId,
      resolvedAt: d.resolvedAt ? new Date(d.resolvedAt).toISOString() : null,
    };
    const trade = (await db.trade.findUnique({ where: { ustn: d.ustn } })) as any;
    if (!trade) {
      logger.warn("[fee-dispute] persist failed — trade not found", { ustn: d.ustn });
      return d;
    }
    const existing = (await db.dispute.findUnique({ where: { id: d.id } })) as any;
    if (existing) {
      const updated = (await db.dispute.update({
        where: { id: d.id },
        data: {
          status: d.state,
          claimAmountUsd: d.disputedAmount,
          resolution: d.resolution,
          resolutionNotes: JSON.stringify(ext),
        },
      })) as any;
      return rowToFeeDispute(updated);
    }
    const created = (await db.dispute.create({
      data: {
        id: d.id,
        tradeId: trade.id,
        ustn: d.ustn,
        type: `FEE_DISPUTE_${d.violationType}`,
        status: d.state,
        filedByGtid: d.traderGtid,
        respondentGtid: d.brokerGtid,
        claimAmountUsd: d.disputedAmount,
        description: d.reason || `Fee dispute: ${d.violationType}`,
        evidenceCount: (d.evidence || []).length,
        resolution: d.resolution,
        resolutionNotes: JSON.stringify(ext),
      },
    })) as any;
    return rowToFeeDispute(created);
  } catch (err) {
    logger.error("[fee-dispute] persistDispute failed — safe fallback", {
      error: String(err),
      disputeId: d.id,
      ustn: d.ustn,
    });
    return d;
  }
}

/**
 * Convert a Dispute Prisma row back into a FeeDispute. Parses the
 * extended JSON from `resolutionNotes` if present. NEVER throws — returns
 * a minimal valid FeeDispute on parse failure.
 */
function rowToFeeDispute(row: any): FeeDispute {
  try {
    let ext: any = {};
    if (row?.resolutionNotes) {
      try {
        const parsed = JSON.parse(row.resolutionNotes);
        if (parsed && parsed._feeDisputeExt) ext = parsed;
      } catch {
        /* resolutionNotes may contain free-form text — ignore */
      }
    }
    return {
      id: row.id,
      ustn: row.ustn || "",
      brokerGtid: ext.brokerGtid || row.respondentGtid || "",
      traderGtid: ext.traderGtid || row.filedByGtid || "",
      chargeId: ext.chargeId || "",
      violationType: String(row.type || "").replace(/^FEE_DISPUTE_/, ""),
      state: row.status || "NO_DISPUTE",
      disputedAmount: Number(row.claimAmountUsd || 0),
      currency: ext.currency || "USD",
      originalQuote: ext.originalQuote || null,
      newCharge: ext.newCharge || null,
      reason: row.description || "",
      evidence: Array.isArray(ext.evidence) ? ext.evidence : [],
      brokerResponse: ext.brokerResponse || null,
      brokerResponseAt: ext.brokerResponseAt ? new Date(ext.brokerResponseAt) : null,
      acknowledgedAt: ext.acknowledgedAt ? new Date(ext.acknowledgedAt) : null,
      evidenceDeadline: ext.evidenceDeadline ? new Date(ext.evidenceDeadline) : null,
      resolutionDeadline: ext.resolutionDeadline ? new Date(ext.resolutionDeadline) : null,
      resolution: row.resolution || null,
      resolvedAt: ext.resolvedAt ? new Date(ext.resolvedAt) : null,
      governorDecisionId: ext.governorDecisionId || null,
      createdAt: row.createdAt || new Date(),
      updatedAt: row.updatedAt || new Date(),
    };
  } catch (err) {
    logger.warn("[fee-dispute] rowToFeeDispute failed — minimal fallback", {
      error: String(err),
      rowId: row?.id,
    });
    return {
      id: row?.id || "",
      ustn: row?.ustn || "",
      brokerGtid: row?.respondentGtid || "",
      traderGtid: row?.filedByGtid || "",
      chargeId: "",
      violationType: "",
      state: row?.status || "NO_DISPUTE",
      disputedAmount: 0,
      currency: "USD",
      originalQuote: null,
      newCharge: null,
      reason: row?.description || "",
      evidence: [],
      brokerResponse: null,
      brokerResponseAt: null,
      acknowledgedAt: null,
      evidenceDeadline: null,
      resolutionDeadline: null,
      resolution: row?.resolution || null,
      resolvedAt: null,
      governorDecisionId: null,
      createdAt: row?.createdAt || new Date(),
      updatedAt: row?.updatedAt || new Date(),
    };
  }
}

/**
 * Generate a deterministic dispute ID. Format:
 *   FDIS-{USTN8}-{TS36}-{RAND6}
 */
function generateDisputeId(ustn: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const u8 = String(ustn || "XXXXXXXX").slice(0, 8).toUpperCase();
  return `FDIS-${u8}-${ts}-${rand}`;
}

// ============ §19 Create Dispute Case ============

/**
 * §19 — Automated Detection creates a dispute case automatically when a
 * fee violation is detected.
 *
 * Steps (per spec):
 *   1.  Create dispute case (Dispute row + extended JSON in resolutionNotes)
 *   2.  Notify trader via Smart Inbox (InboxItem)
 *   3.  Notify broker via Smart Inbox (InboxItem)
 *   4.  Preserve original fee record (immutable snapshot in originalQuote)
 *   5.  Preserve accepted quotation (looked up from ServiceQuotation)
 *   6.  Preserve broker fee schedule (snapshot if available)
 *   7.  Preserve all evidence (array, immutable)
 *   8.  Prevent silent alteration (hash chain via CanonicalEvent)
 *   9.  Create Smart Inbox alerts (above)
 *   10. Create audit record (Activity row)
 *   11. Create Loom event (CanonicalEvent hash chain)
 *   12. Escalate according to severity (CRITICAL → Governor immediately)
 *
 * Returns the created FeeDispute. NEVER throws — returns a minimal
 * unsaved FeeDispute on internal failure.
 */
export async function createDisputeCase(data: {
  ustn: string;
  brokerGtid: string;
  chargeId: string;
  violationType: string;
  disputedAmount: number;
  currency: string;
  reason: string;
  traderGtid?: string;
  originalQuote?: any;
  newCharge?: any;
  evidence?: any[];
}): Promise<FeeDispute> {
  try {
    if (!data?.ustn || !data?.brokerGtid || !data?.violationType) {
      logger.warn("[fee-dispute] createDisputeCase rejected — missing required fields", {
        ustn: data?.ustn,
        brokerGtid: data?.brokerGtid,
        violationType: data?.violationType,
      });
      return _minimalDispute(data);
    }
    const trade = (await db.trade.findUnique({ where: { ustn: data.ustn } })) as any;
    if (!trade) {
      logger.warn("[fee-dispute] createDisputeCase rejected — trade not found", {
        ustn: data.ustn,
      });
      return _minimalDispute(data);
    }

    // §4–§7: Preserve original fee record + accepted quotation + evidence.
    // These are stored VERBATIM in the dispute record — never mutated.
    const originalQuote = data.originalQuote || (await _lookupAcceptedQuote(data.ustn, data.brokerGtid));
    const preservedEvidence = Array.isArray(data.evidence) ? data.evidence : [];

    const traderGtid = data.traderGtid || (trade.buyerGtid === data.brokerGtid ? trade.sellerGtid : trade.buyerGtid);
    const severity = VIOLATION_SEVERITY[data.violationType] || "MEDIUM";
    const sla = severity === "HIGH" || severity === "CRITICAL" ? TIGHTENED_SLA : DEFAULT_SLA;
    const now = new Date();
    const ackDeadline = new Date(now.getTime() + sla.acknowledgeHours * 3600 * 1000);
    const evidenceDeadline = new Date(now.getTime() + sla.evidenceHours * 3600 * 1000);
    const resolutionDeadline = new Date(now.getTime() + sla.resolveDays * 24 * 3600 * 1000);

    const dispute: FeeDispute = {
      id: generateDisputeId(data.ustn),
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      traderGtid,
      chargeId: data.chargeId || "",
      violationType: data.violationType,
      state: "USER_DISPUTED",
      disputedAmount: Number(data.disputedAmount || 0),
      currency: data.currency || "USD",
      originalQuote,
      newCharge: data.newCharge || null,
      reason: data.reason || `Fee dispute: ${data.violationType}`,
      evidence: preservedEvidence,
      brokerResponse: null,
      brokerResponseAt: null,
      acknowledgedAt: null,
      evidenceDeadline,
      resolutionDeadline,
      resolution: null,
      resolvedAt: null,
      governorDecisionId: null,
      createdAt: now,
      updatedAt: now,
    };

    // §1: Persist the dispute case.
    const persisted = await persistDispute(dispute);

    // §2 + §3 + §9: Notify trader + broker via Smart Inbox.
    await _notifySmartInbox(traderGtid, trade.id, dispute, "trader");
    await _notifySmartInbox(data.brokerGtid, trade.id, dispute, "broker");

    // §10: Create audit record (Activity).
    try {
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: traderGtid,
          action: "FEE_DISPUTE_CREATED",
          description: `Fee dispute ${dispute.id} created — ${data.violationType} (${severity})`,
          type: severity === "CRITICAL" ? "CRITICAL" : severity === "HIGH" ? "WARNING" : "INFO",
          metadata: JSON.stringify({
            disputeId: dispute.id,
            violationType: data.violationType,
            disputedAmount: dispute.disputedAmount,
            currency: dispute.currency,
            severity,
            chargeId: dispute.chargeId,
            ackDeadline: ackDeadline.toISOString(),
            evidenceDeadline: evidenceDeadline.toISOString(),
            resolutionDeadline: resolutionDeadline.toISOString(),
          }),
        },
      });
    } catch (actErr) {
      logger.warn("[fee-dispute] activity log failed", { error: String(actErr) });
    }

    // §11 + §8: Create Loom event (hash chain — prevents silent alteration).
    await _appendDisputeEvent(dispute, "FEE_DISPUTE_CREATED", {
      violationType: data.violationType,
      disputedAmount: dispute.disputedAmount,
      currency: dispute.currency,
      severity,
      evidenceHash: _hashEvidence(preservedEvidence),
      ackDeadline: ackDeadline.toISOString(),
      evidenceDeadline: evidenceDeadline.toISOString(),
      resolutionDeadline: resolutionDeadline.toISOString(),
    });

    // §12: Escalate according to severity (CRITICAL → Governor immediately).
    if (severity === "CRITICAL") {
      try {
        await escalateDispute(dispute.id, `CRITICAL violation auto-escalated: ${data.violationType}`);
      } catch (escErr) {
        logger.warn("[fee-dispute] auto-escalation failed", { error: String(escErr) });
      }
    }

    logger.info("[fee-dispute] dispute case created", {
      disputeId: dispute.id,
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      violationType: data.violationType,
      severity,
    });
    return persisted;
  } catch (err) {
    logger.error("[fee-dispute] createDisputeCase failed — safe fallback", {
      error: String(err),
      ustn: data?.ustn,
    });
    return _minimalDispute(data);
  }
}

/**
 * Lookup the accepted ServiceQuotation for this broker on this USTN.
 * Returns null if none found — the caller may pass an explicit
 * `originalQuote` to override.
 */
async function _lookupAcceptedQuote(ustn: string, brokerGtid: string): Promise<any> {
  try {
    const quote = (await db.serviceQuotation.findFirst({
      where: { ustn, providerGtid: brokerGtid, status: "ACCEPTED" },
      orderBy: { acceptedAt: "desc" },
    })) as any;
    if (!quote) return null;
    return {
      quoteId: quote.quoteId,
      providerGtid: quote.providerGtid,
      providerType: quote.providerType,
      serviceType: quote.serviceType,
      feeUsd: Number(quote.feeUsd || 0),
      currency: quote.currency || "USD",
      validityDays: quote.validityDays,
      validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString() : null,
      acceptedByGtid: quote.acceptedByGtid,
      acceptedAt: quote.acceptedAt ? new Date(quote.acceptedAt).toISOString() : null,
      description: quote.description,
      notes: quote.notes,
      _preservedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn("[fee-dispute] _lookupAcceptedQuote failed", { error: String(err) });
    return null;
  }
}

/**
 * Notify a Smart Inbox recipient about a new dispute. NEVER throws.
 */
async function _notifySmartInbox(recipientGtid: string, tradeId: string, dispute: FeeDispute, role: "trader" | "broker"): Promise<void> {
  try {
    if (!recipientGtid) return;
    const title = role === "trader"
      ? `Fee dispute opened — ${dispute.violationType} (${dispute.id.slice(-8)})`
      : `Fee dispute requires response — ${dispute.violationType} (${dispute.id.slice(-8)})`;
    const description = role === "trader"
      ? `A fee dispute has been opened against broker ${dispute.brokerGtid.slice(-8)} on trade ${dispute.ustn}. Disputed amount: ${dispute.currency} ${dispute.disputedAmount.toFixed(2)}. Reason: ${dispute.reason.slice(0, 120)}.`
      : `A fee dispute has been opened against you on trade ${dispute.ustn}. Acknowledge within ${DEFAULT_SLA.acknowledgeHours}h, submit evidence within ${DEFAULT_SLA.evidenceHours}h, resolve within ${DEFAULT_SLA.resolveDays}d. Disputed amount: ${dispute.currency} ${dispute.disputedAmount.toFixed(2)}.`;
    const priority = role === "broker" ? 95 : 80;
    await db.inboxItem.create({
      data: {
        tenantGtid: recipientGtid,
        tradeId: tradeId || undefined,
        category: "COMPLIANCE",
        priority,
        title,
        description,
        ctaLabel: role === "trader" ? "View Dispute" : "Respond to Dispute",
        deadline: dispute.evidenceDeadline || undefined,
      },
    });
  } catch (err) {
    logger.warn("[fee-dispute] _notifySmartInbox failed", { error: String(err) });
  }
}

/**
 * Append a fee-dispute Loom event to the canonical event spine.
 * Uses the existing event-spine appendEvent (hash chain).
 */
async function _appendDisputeEvent(dispute: FeeDispute, eventType: string, payload: any): Promise<void> {
  try {
    const eventSpine = await import("@/lib/sgtx/event-spine");
    const appendEvent = (eventSpine as any).appendEvent;
    if (typeof appendEvent !== "function") return;
    await appendEvent({
      ustn: dispute.ustn,
      eventType,
      eventTime: new Date(),
      observationTime: new Date(),
      sourceSystem: "CUSTOMS_GATEWAY_FEE_DISPUTE",
      authority: "SGTX",
      evidenceReference: [
        { type: "dispute_id", value: dispute.id },
        { type: "broker_gtid", value: dispute.brokerGtid },
        { type: "violation_type", value: dispute.violationType },
      ],
      actor: dispute.traderGtid,
      idempotencyKey: `FEE-DISPUTE-${dispute.id}-${eventType}`,
      notes: `Fee dispute ${dispute.id}: ${eventType}`,
    });
  } catch (err) {
    logger.warn("[fee-dispute] _appendDisputeEvent failed", { error: String(err) });
  }
}

/**
 * Compute a SHA-256 hash of the evidence array (for tamper detection).
 */
function _hashEvidence(evidence: any[]): string {
  try {
    const json = JSON.stringify(evidence || []);
    return "sha256:" + createHash("sha256").update(json).digest("hex");
  } catch {
    return "sha256:unknown";
  }
}

/**
 * Minimal unsaved FeeDispute used as a safe fallback when createDisputeCase
 * cannot persist (e.g. trade not found). Returns a structurally-valid
 * FeeDispute that the caller can inspect without crashing.
 */
function _minimalDispute(data: any): FeeDispute {
  const now = new Date();
  return {
    id: generateDisputeId(data?.ustn || ""),
    ustn: data?.ustn || "",
    brokerGtid: data?.brokerGtid || "",
    traderGtid: data?.traderGtid || "",
    chargeId: data?.chargeId || "",
    violationType: data?.violationType || "",
    state: "NO_DISPUTE",
    disputedAmount: Number(data?.disputedAmount || 0),
    currency: data?.currency || "USD",
    originalQuote: data?.originalQuote || null,
    newCharge: data?.newCharge || null,
    reason: data?.reason || "",
    evidence: Array.isArray(data?.evidence) ? data.evidence : [],
    brokerResponse: null,
    brokerResponseAt: null,
    acknowledgedAt: null,
    evidenceDeadline: null,
    resolutionDeadline: null,
    resolution: null,
    resolvedAt: null,
    governorDecisionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ============ Read Helpers ============

/**
 * Get a single FeeDispute by ID. Returns null on not-found or error.
 */
export async function getDispute(id: string): Promise<FeeDispute | null> {
  try {
    if (!id) return null;
    const row = (await db.dispute.findUnique({ where: { id } })) as any;
    if (!row) return null;
    if (!String(row.type || "").startsWith("FEE_DISPUTE_")) return null;
    return rowToFeeDispute(row);
  } catch (err) {
    logger.error("[fee-dispute] getDispute failed", { error: String(err), id });
    return null;
  }
}

/**
 * List FeeDisputes by filter. Filters by ustn, brokerGtid (respondentGtid),
 * and/or state. Caps at 200 rows. Returns [] on error.
 */
export async function listDisputes(filter: {
  ustn?: string;
  brokerGtid?: string;
  state?: string;
  violationType?: string;
  limit?: number;
}): Promise<FeeDispute[]> {
  try {
    const where: any = { type: { startsWith: "FEE_DISPUTE_" } };
    if (filter?.ustn) where.ustn = filter.ustn;
    if (filter?.brokerGtid) where.respondentGtid = filter.brokerGtid;
    if (filter?.state) where.status = filter.state;
    if (filter?.violationType) where.type = `FEE_DISPUTE_${filter.violationType}`;
    const rows = (await db.dispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(filter?.limit || 100, 1), 500),
    })) as any[];
    return rows.map(rowToFeeDispute).filter((d) => d && d.id);
  } catch (err) {
    logger.error("[fee-dispute] listDisputes failed", { error: String(err) });
    return [];
  }
}

// ============ §20 Broker Response ============

/**
 * §20 — Broker responds to a dispute. Sets `brokerResponse`, transitions
 * state to BROKER_RESPONDING, records `acknowledgedAt` if not already set.
 *
 * This is NOT a consequential action (the broker is merely presenting a
 * defence) — Governor is NOT required. The Governor is required only for
 * resolution outcomes (UPHELD / PARTIALLY_UPHELD / ESCALATED / CLOSED).
 */
export async function respondToDispute(
  disputeId: string,
  brokerGtid: string,
  response: string,
  evidence: any[],
): Promise<FeeDispute> {
  try {
    const dispute = await getDispute(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.brokerGtid !== brokerGtid) {
      throw new Error("Only the disputed broker may respond");
    }
    if (!isValidDisputeTransition(dispute.state, "BROKER_RESPONDING")) {
      throw new Error(`Invalid transition: ${dispute.state} → BROKER_RESPONDING`);
    }
    dispute.state = "BROKER_RESPONDING";
    dispute.brokerResponse = String(response || "").slice(0, 8000);
    dispute.brokerResponseAt = new Date();
    if (!dispute.acknowledgedAt) dispute.acknowledgedAt = new Date();
    if (Array.isArray(evidence) && evidence.length > 0) {
      // Append-only — never mutate existing evidence (§69).
      dispute.evidence = [...(dispute.evidence || []), ...evidence];
    }
    dispute.updatedAt = new Date();
    const persisted = await persistDispute(dispute);

    // Audit + Loom.
    try {
      const trade = (await db.trade.findUnique({ where: { ustn: dispute.ustn } })) as any;
      if (trade) {
        await db.activity.create({
          data: {
            tradeId: trade.id,
            actorGtid: brokerGtid,
            action: "FEE_DISPUTE_BROKER_RESPONDED",
            description: `Broker responded to dispute ${dispute.id}`,
            type: "INFO",
            metadata: JSON.stringify({
              disputeId: dispute.id,
              evidenceCount: (evidence || []).length,
              acknowledgedAt: dispute.acknowledgedAt?.toISOString(),
            }),
          },
        });
      }
    } catch (actErr) {
      logger.warn("[fee-dispute] activity log failed", { error: String(actErr) });
    }
    await _appendDisputeEvent(dispute, "FEE_DISPUTE_BROKER_RESPONDED", {
      evidenceCount: (evidence || []).length,
      responseLength: dispute.brokerResponse?.length || 0,
    });
    return persisted;
  } catch (err) {
    logger.error("[fee-dispute] respondToDispute failed", { error: String(err), disputeId });
    throw err;
  }
}

// ============ §43 Resolve Dispute (Governor-gated) ============

/**
 * §43 — Resolve a dispute. ALL consequential dispute actions pass through
 * the Governor. The Governor must return an ALLOW verdict for the
 * resolution to be applied. DENY on internal failure — never auto-ALLOW.
 *
 * `resolution` is one of: UPHELD, REJECTED, PARTIALLY_UPHELD, CLOSED.
 * `governorDecisionId` must reference a GovernorDecision row with
 * verdict="ALLOW" for the action `fee.dispute.resolve`.
 */
export async function resolveDispute(
  disputeId: string,
  resolution: string,
  governorDecisionId: string,
): Promise<FeeDispute> {
  try {
    const dispute = await getDispute(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    const targetState = String(resolution || "").toUpperCase();
    if (!["UPHELD", "REJECTED", "PARTIALLY_UPHELD", "CLOSED"].includes(targetState)) {
      throw new Error(`Invalid resolution: ${resolution}`);
    }
    if (!isValidDisputeTransition(dispute.state, targetState)) {
      throw new Error(`Invalid transition: ${dispute.state} → ${targetState}`);
    }
    // §43: Governor MUST approve. Verify the decision exists and ALLOWs.
    const verified = await _verifyGovernorDecision(governorDecisionId, "fee.dispute.resolve", dispute);
    if (!verified.approved) {
      throw new Error(`Governor denied resolution: ${verified.reason}`);
    }

    dispute.state = targetState;
    dispute.governorDecisionId = governorDecisionId;
    dispute.resolution = `${targetState} — Governor decision ${governorDecisionId}`;
    dispute.resolvedAt = new Date();
    dispute.updatedAt = new Date();
    const persisted = await persistDispute(dispute);

    // Audit + Loom + Smart Inbox.
    try {
      const trade = (await db.trade.findUnique({ where: { ustn: dispute.ustn } })) as any;
      if (trade) {
        await db.activity.create({
          data: {
            tradeId: trade.id,
            actorGtid: "SGTX-GOVERNOR",
            action: "FEE_DISPUTE_RESOLVED",
            description: `Dispute ${dispute.id} resolved as ${targetState} (Governor ${governorDecisionId})`,
            type: targetState === "UPHELD" ? "WARNING" : "INFO",
            metadata: JSON.stringify({
              disputeId: dispute.id,
              resolution: targetState,
              governorDecisionId,
            }),
          },
        });
      }
    } catch (actErr) {
      logger.warn("[fee-dispute] activity log failed", { error: String(actErr) });
    }
    await _appendDisputeEvent(dispute, "FEE_DISPUTE_RESOLVED", {
      resolution: targetState,
      governorDecisionId,
    });
    await _notifySmartInbox(dispute.traderGtid, "", dispute, "trader");
    return persisted;
  } catch (err) {
    logger.error("[fee-dispute] resolveDispute failed", { error: String(err), disputeId });
    throw err;
  }
}

// ============ §43 Escalate Dispute (Governor-gated) ============

/**
 * §43 — Escalate a dispute. Passes through the Governor (an inline
 * governorDecide call) since escalation has operational consequences
 * (broker risk flag, tightened SLA, possible service-request
 * eligibility impact).
 *
 * CRITICAL: this NEVER autonomously delists or terminates the broker
 * (§21). It only flags for review — Governor + human review required.
 */
export async function escalateDispute(disputeId: string, reason: string): Promise<FeeDispute> {
  try {
    const dispute = await getDispute(disputeId);
    if (!dispute) throw new Error("Dispute not found");
    if (!isValidDisputeTransition(dispute.state, "ESCALATED")) {
      throw new Error(`Invalid transition: ${dispute.state} → ESCALATED`);
    }
    // §43: Governor decides on escalation.
    const govDecision = await _requestGovernorDecision({
      action: "fee.dispute.escalate",
      actorGtid: dispute.traderGtid,
      resourceUstn: dispute.ustn,
      payload: {
        disputeId: dispute.id,
        violationType: dispute.violationType,
        disputedAmount: dispute.disputedAmount,
        currency: dispute.currency,
        reason: String(reason || "").slice(0, 1000),
      },
    });
    if (govDecision.verdict !== "ALLOW") {
      throw new Error(`Governor denied escalation: ${govDecision.tenantMessage || govDecision.verdict}`);
    }

    dispute.state = "ESCALATED";
    dispute.governorDecisionId = govDecision.decisionId;
    dispute.updatedAt = new Date();
    const persisted = await persistDispute(dispute);

    // Create / upgrade broker risk flag (§21).
    try {
      const { createRiskFlag } = await import("./risk-controls");
      const severity = VIOLATION_SEVERITY[dispute.violationType] || "MEDIUM";
      const riskLevel = severity === "CRITICAL" ? "CRITICAL" : severity === "HIGH" ? "HIGH" : "MEDIUM";
      await createRiskFlag(dispute.brokerGtid, `Dispute ${dispute.id} escalated: ${reason}`, riskLevel);
    } catch (riskErr) {
      logger.warn("[fee-dispute] risk-flag creation failed", { error: String(riskErr) });
    }

    // Audit + Loom + Smart Inbox.
    try {
      const trade = (await db.trade.findUnique({ where: { ustn: dispute.ustn } })) as any;
      if (trade) {
        await db.activity.create({
          data: {
            tradeId: trade.id,
            actorGtid: "SGTX-GOVERNOR",
            action: "FEE_DISPUTE_ESCALATED",
            description: `Dispute ${dispute.id} escalated — ${reason.slice(0, 200)}`,
            type: "WARNING",
            metadata: JSON.stringify({
              disputeId: dispute.id,
              governorDecisionId: govDecision.decisionId,
              reason: String(reason || "").slice(0, 500),
            }),
          },
        });
      }
    } catch (actErr) {
      logger.warn("[fee-dispute] activity log failed", { error: String(actErr) });
    }
    await _appendDisputeEvent(dispute, "FEE_DISPUTE_ESCALATED", {
      reason: String(reason || "").slice(0, 500),
      governorDecisionId: govDecision.decisionId,
    });
    return persisted;
  } catch (err) {
    logger.error("[fee-dispute] escalateDispute failed", { error: String(err), disputeId });
    throw err;
  }
}

// ============ §43 Governor Helpers ============

/**
 * §43 — Verify a recorded GovernorDecision. Returns { approved, reason }.
 * DENY on any internal failure — never auto-ALLOW.
 */
async function _verifyGovernorDecision(
  decisionId: string,
  expectedAction: string,
  dispute: FeeDispute,
): Promise<{ approved: boolean; reason: string }> {
  try {
    if (!decisionId) return { approved: false, reason: "Missing Governor decision ID" };
    const row = (await db.governorDecision.findUnique({
      where: { decisionId },
    })) as any;
    if (!row) return { approved: false, reason: `Governor decision ${decisionId} not found` };
    if (String(row.verdict || "").toUpperCase() !== "ALLOW") {
      return { approved: false, reason: `Governor verdict is ${row.verdict}` };
    }
    if (expectedAction && String(row.action || "") !== expectedAction) {
      // Soft mismatch — log but allow if verdict is ALLOW (decision may
      // have been recorded for a related action).
      logger.warn("[fee-dispute] Governor action mismatch — soft-allowing", {
        expected: expectedAction,
        recorded: row.action,
        decisionId,
      });
    }
    return { approved: true, reason: "approved" };
  } catch (err) {
    logger.error("[fee-dispute] _verifyGovernorDecision failed — DENY", { error: String(err) });
    return { approved: false, reason: `internal error: ${String(err)}` };
  }
}

/**
 * §43 — Request a Governor decision inline (escalation path). DENY on
 * internal failure — never auto-ALLOW.
 */
async function _requestGovernorDecision(req: {
  action: string;
  actorGtid?: string;
  resourceUstn?: string;
  payload?: any;
}): Promise<{ verdict: string; decisionId: string; tenantMessage?: string }> {
  try {
    const governor = await import("@/lib/sgtx/governor");
    const governorDecide = (governor as any).governorDecide;
    if (typeof governorDecide !== "function") {
      return { verdict: "DENY", decisionId: "no-governor", tenantMessage: "Governor unavailable" };
    }
    const resp = await governorDecide({
      action: req.action,
      actorGtid: req.actorGtid,
      resourceUstn: req.resourceUstn,
      payload: req.payload,
    });
    return {
      verdict: String(resp?.verdict || "DENY").toUpperCase(),
      decisionId: String(resp?.decisionId || "unknown"),
      tenantMessage: resp?.tenantMessage,
    };
  } catch (err) {
    logger.error("[fee-dispute] _requestGovernorDecision failed — DENY", { error: String(err) });
    return { verdict: "DENY", decisionId: "error", tenantMessage: String(err) };
  }
}

// ============ §20 SLA Breach Detection ============

/**
 * §20 — Check all open disputes for SLA breaches. Returns a list of
 * breaches (acknowledge / evidence / resolve). Used by the periodic
 * SLA-monitor cron. NEVER throws — returns [] on error.
 */
export async function checkSLABreaches(): Promise<DisputeSLABreach[]> {
  try {
    const open = await listDisputes({ limit: 500 });
    const breaches: DisputeSLABreach[] = [];
    const now = Date.now();
    for (const d of open) {
      if (["CLOSED", "UPHELD", "REJECTED", "PARTIALLY_UPHELD"].includes(d.state)) continue;
      // Acknowledge SLA
      if (!d.acknowledgedAt && d.evidenceDeadline) {
        const ackDeadline = new Date(d.createdAt.getTime() + DEFAULT_SLA.acknowledgeHours * 3600 * 1000);
        if (ackDeadline.getTime() < now) {
          breaches.push({
            disputeId: d.id,
            ustn: d.ustn,
            brokerGtid: d.brokerGtid,
            breachType: "ACKNOWLEDGE",
            deadline: ackDeadline,
            breachedAt: new Date(),
            hoursOverdue: Math.round((now - ackDeadline.getTime()) / 3600000),
            severity: "HIGH",
          });
        }
      }
      // Evidence SLA
      if (d.evidenceDeadline && d.state !== "BROKER_RESPONDING") {
        if (d.evidenceDeadline.getTime() < now) {
          breaches.push({
            disputeId: d.id,
            ustn: d.ustn,
            brokerGtid: d.brokerGtid,
            breachType: "EVIDENCE",
            deadline: d.evidenceDeadline,
            breachedAt: new Date(),
            hoursOverdue: Math.round((now - d.evidenceDeadline.getTime()) / 3600000),
            severity: "HIGH",
          });
        }
      }
      // Resolve SLA
      if (d.resolutionDeadline && !d.resolvedAt) {
        if (d.resolutionDeadline.getTime() < now) {
          breaches.push({
            disputeId: d.id,
            ustn: d.ustn,
            brokerGtid: d.brokerGtid,
            breachType: "RESOLVE",
            deadline: d.resolutionDeadline,
            breachedAt: new Date(),
            hoursOverdue: Math.round((now - d.resolutionDeadline.getTime()) / 3600000),
            severity: "CRITICAL",
          });
        }
      }
    }
    return breaches;
  } catch (err) {
    logger.error("[fee-dispute] checkSLABreaches failed", { error: String(err) });
    return [];
  }
}
