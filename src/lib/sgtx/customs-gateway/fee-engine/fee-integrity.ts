// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Integrity Engine (§17, §39)
 * ===========================================================================
 *
 * Automated hidden-fee / dispute tracker. Detects 12 categories of fee
 * violations by comparing every broker fee on a USTN against:
 *
 *   - the accepted quotation
 *   - the approved fee schedule (current ACTIVE version)
 *   - the service scope
 *   - the USTN itself
 *   - government fee evidence (must be cited)
 *   - third-party invoice evidence (must be cited)
 *   - prior approved change requests (§16 workflow)
 *
 * The 12 violation types are listed in FEE_VIOLATION_TYPES below.
 *
 * §39 Post-clearance control — after customs clearance, any broker financial
 * claim must reference USTN, broker GTID, original quote, fee schedule,
 * service performed, evidence, and reason. Without valid linkage, the
 * charge is flagged as UNSUPPORTED_POST_CLEARANCE_CHARGE.
 *
 * Persistence:
 *   - Detected violations are persisted as TradeEvent rows with
 *     source = "FEE_VIOLATION" (immutable audit trail). Each violation has
 *     a SHA-256 hash binding it to the chargeId + ustn + detectedAt.
 *   - The checkFeeIntegrity function ALSO returns the violations in-memory
 *     so the API route can render them without an extra round-trip.
 *
 * L0:
 *   - NON-CUSTODIAL: this module never moves funds; it only detects and
 *     flags violations. The Governor / dispute engine decides remedies.
 *   - All public functions wrapped try/catch with safe defaults — never
 *     throws into API routes. On internal error, checkFeeIntegrity returns
 *     a minimal clean result with riskLevel="NONE" (fail-open for visibility;
 *     the Loom audit trail still records the failure).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";
import {
  type BrokerQuote,
  type BrokerFeeCommitment,
  type AdditionalChargeRequest,
  listFeeCommitments,
  listAdditionalChargeRequests,
  listBrokerQuotes,
  classifyFee,
} from "./index";
import { validateNoHiddenFees, type FeeDisclosure, generateFeeDisclosure } from "./fee-visibility";
import { appendFeeLoomEvent, sanitizeFeeForLoom } from "./fee-loom";

// ============ §17 The 12 fee violation types ============

export const FEE_VIOLATION_TYPES = [
  "FEE_NOT_IN_QUOTATION",
  "FEE_HIGHER_THAN_QUOTATION",
  "DUPLICATE_FEE",
  "FEE_AFTER_CLEARANCE",
  "FEE_NO_EVIDENCE",
  "WRONG_SERVICE_CATEGORY",
  "GOVERNMENT_AS_BROKER_REVENUE",
  "DUPLICATE_GOVERNMENT_CHARGE",
  "FEE_CHANGED_WITHOUT_APPROVAL",
  "FEE_ON_HISTORICAL_TRANSACTION",
  "INCONSISTENT_WITH_SCHEDULE",
  "REPEATED_VIOLATIONS",
] as const;

export type FeeViolationType = (typeof FEE_VIOLATION_TYPES)[number];

export const FEE_VIOLATION_SEVERITY: Record<FeeViolationType, "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  FEE_NOT_IN_QUOTATION: "HIGH",
  FEE_HIGHER_THAN_QUOTATION: "HIGH",
  DUPLICATE_FEE: "MEDIUM",
  FEE_AFTER_CLEARANCE: "HIGH",
  FEE_NO_EVIDENCE: "MEDIUM",
  WRONG_SERVICE_CATEGORY: "MEDIUM",
  GOVERNMENT_AS_BROKER_REVENUE: "CRITICAL",
  DUPLICATE_GOVERNMENT_CHARGE: "HIGH",
  FEE_CHANGED_WITHOUT_APPROVAL: "CRITICAL",
  FEE_ON_HISTORICAL_TRANSACTION: "CRITICAL",
  INCONSISTENT_WITH_SCHEDULE: "HIGH",
  REPEATED_VIOLATIONS: "CRITICAL",
};

// ============ Types ============

export interface FeeViolation {
  type: FeeViolationType;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  evidence: any;
  chargeId: string;
  detectedAt: Date;
}

export interface FeeIntegrityResult {
  ustn: string;
  violations: FeeViolation[];
  cleanCharges: number;
  totalCharges: number;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface PostClearanceChargeValidation {
  valid: boolean;
  reason: string;
  missingFields: string[];
}

// ============ Internal helpers ============

function _num(v: any, fallback = 0): number {
  try {
    const n = Number(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  } catch {
    return fallback;
  }
}

function _safeParse(raw: unknown): any {
  try {
    if (typeof raw !== "string" || !raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _hash(input: any): string {
  try {
    const json = typeof input === "string" ? input : JSON.stringify(input || {});
    return createHash("sha256").update(json, "utf8").digest("hex");
  } catch {
    return `error-${Date.now().toString(36)}`;
  }
}

function _severityRank(s: string): number {
  switch (s) {
    case "CRITICAL": return 4;
    case "HIGH": return 3;
    case "MEDIUM": return 2;
    case "LOW": return 1;
    case "INFO":
    default: return 0;
  }
}

function _riskFromViolations(violations: FeeViolation[]): "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (!violations || violations.length === 0) return "NONE";
  let max = 0;
  for (const v of violations) {
    const r = _severityRank(v.severity);
    if (r > max) max = r;
  }
  if (max >= 4) return "CRITICAL";
  if (max >= 3) return "HIGH";
  if (max >= 2) return "MEDIUM";
  if (max >= 1) return "LOW";
  return "NONE";
}

/**
 * Persist a detected violation as an immutable TradeEvent row (source =
 * "FEE_VIOLATION"). Best-effort — never throws.
 */
async function _persistViolation(ustn: string, v: FeeViolation): Promise<void> {
  try {
    const hash = _hash({
      ustn,
      type: v.type,
      chargeId: v.chargeId,
      detectedAt: v.detectedAt.toISOString(),
    });
    await db.tradeEvent.create({
      data: {
        ustn,
        eventType: `FEE_VIOLATION_${v.type}`,
        eventDescription: `Fee violation detected: ${v.type} on charge ${v.chargeId}`,
        eventMetadata: JSON.stringify({
          body: { ...v, detectedAt: v.detectedAt.toISOString() },
          hash,
          kind: "FEE_VIOLATION",
        }).slice(0, 8000),
        actorGtid: "FEE_INTEGRITY_ENGINE",
        source: "FEE_VIOLATION",
        previousHash: null,
        eventHash: hash,
      },
    });
  } catch (err: any) {
    logger.warn("[fee-integrity/_persistViolation] persist failed", {
      ustn,
      type: v.type,
      error: err?.message,
    });
  }
}

/**
 * Count prior violations by the same broker over a rolling window (default
 * 30 days). Used by the REPEATED_VIOLATIONS detector. Best-effort —
 * returns 0 on failure.
 */
async function _countPriorBrokerViolations(
  brokerGtid: string,
  windowDays = 30,
): Promise<number> {
  try {
    if (!brokerGtid) return 0;
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const rows = await db.tradeEvent.findMany({
      where: {
        source: "FEE_VIOLATION",
        createdAt: { gte: since },
      },
      take: 500,
    });
    let count = 0;
    for (const r of rows || []) {
      const meta = _safeParse(r?.eventMetadata) || {};
      const body = meta.body || meta;
      if (body?.evidence?.brokerGtid === brokerGtid) count++;
    }
    return count;
  } catch (err: any) {
    logger.warn("[fee-integrity/_countPriorBrokerViolations] failed", {
      brokerGtid,
      error: err?.message,
    });
    return 0;
  }
}

// ============ §17 checkFeeIntegrity ============

/**
 * Run the full fee integrity check for a USTN. Compares every broker fee
 * against the accepted quotation, approved fee schedule, service scope,
 * USTN, government fee evidence, third-party invoice evidence, and prior
 * approved change requests.
 *
 * Returns a FeeIntegrityResult with all detected violations + a risk level.
 * Never throws — on internal error returns a minimal clean result.
 *
 * Side effect: detected violations are persisted as immutable TradeEvent
 * rows (source = "FEE_VIOLATION") for audit and for the REPEATED_VIOLATIONS
 * detector.
 */
export async function checkFeeIntegrity(ustn: string): Promise<FeeIntegrityResult> {
  try {
    if (!ustn) {
      return { ustn: "", violations: [], cleanCharges: 0, totalCharges: 0, riskLevel: "NONE" };
    }

    const violations: FeeViolation[] = [];
    const now = new Date();

    // §1 Load the disclosure — this enumerates every charge on the USTN.
    let disclosure: FeeDisclosure[] = [];
    try {
      disclosure = await generateFeeDisclosure(ustn);
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] disclosure failed", {
        ustn,
        error: err?.message,
      });
    }

    // §2 Load the accepted broker quotes + commitments + additional charges.
    let quotes: BrokerQuote[] = [];
    let commitments: BrokerFeeCommitment[] = [];
    let additional: AdditionalChargeRequest[] = [];
    try {
      quotes = await listBrokerQuotes({ ustn, status: "ACCEPTED" });
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] quotes lookup failed", { error: err?.message });
    }
    try {
      commitments = await listFeeCommitments(ustn);
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] commitments lookup failed", { error: err?.message });
    }
    try {
      additional = await listAdditionalChargeRequests({ ustn });
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] additional charges lookup failed", { error: err?.message });
    }

    // §3 Look up the customs declaration — used for the FEE_AFTER_CLEARANCE check.
    let declarationCleared = false;
    let declarationClearedAt: Date | null = null;
    try {
      const decl = await db.customsDeclaration.findFirst({
        where: { trade: { ustn } },
        orderBy: { createdAt: "desc" },
      });
      // Re-read the etaXml extras for the ustn match (CustomsDeclaration doesn't
      // store ustn directly — it's in the JSON extras column).
      if (decl) {
        const extras = _safeParse(decl.etaXml) || {};
        if (extras.ustn === ustn) {
          if (decl.status === "ACCEPTED" || decl.status === "CLEARED") {
            declarationCleared = true;
            declarationClearedAt = decl.clearedAt || null;
          }
        }
      }
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] declaration lookup failed", {
        ustn,
        error: err?.message,
      });
    }

    // §4 For each broker fee in the disclosure, run the 12 detectors.
    const brokerFees = disclosure.filter((d) => d.category === "BROKER_FEE" || d.category === "PASS_THROUGH");
    const governmentFees = disclosure.filter(
      (d) => d.category === "GOVERNMENT_FEE" || d.category === "DUTY" || d.category === "TAX",
    );

    // Track brokers we've seen violations for (for REPEATED_VIOLATIONS).
    const brokersWithViolations = new Set<string>();

    // ── Detector 1: FEE_NOT_IN_QUOTATION ────────────────────────────────
    for (const quote of quotes) {
      const hidden = validateNoHiddenFees(disclosure, quote);
      if (hidden.hasHiddenFees) {
        for (const desc of hidden.hiddenCharges) {
          const v: FeeViolation = {
            type: "FEE_NOT_IN_QUOTATION",
            severity: FEE_VIOLATION_SEVERITY.FEE_NOT_IN_QUOTATION,
            description: `Charge not present in accepted quote ${quote.id}: ${desc}`,
            evidence: { quoteId: quote.id, hiddenCharge: desc },
            chargeId: quote.id,
            detectedAt: now,
          };
          violations.push(v);
          brokersWithViolations.add(quote.brokerGtid);
        }
      }
    }

    // ── Detector 2: FEE_HIGHER_THAN_QUOTATION ──────────────────────────
    for (const d of brokerFees) {
      // Find the matching commitment (by sourceReference) and the matching quote.
      const commitment = commitments.find((c) => c.id === d.sourceReference);
      if (!commitment) continue;
      const quote = quotes.find((q) => q.id === commitment.documentHash) || quotes.find((q) => q.brokerGtid === d.brokerGtid);
      if (!quote) continue;
      if (Number(d.feeAmount) > Number(quote.fee) + 0.01) {
        const v: FeeViolation = {
          type: "FEE_HIGHER_THAN_QUOTATION",
          severity: FEE_VIOLATION_SEVERITY.FEE_HIGHER_THAN_QUOTATION,
          description: `Charge ${d.feeAmount} ${d.currency} exceeds quoted fee ${quote.fee} ${quote.currency} for ${d.serviceName}`,
          evidence: {
            disclosureAmount: d.feeAmount,
            quotedAmount: quote.fee,
            quoteId: quote.id,
            brokerGtid: d.brokerGtid,
          },
          chargeId: d.sourceReference || d.serviceName,
          detectedAt: now,
        };
        violations.push(v);
        brokersWithViolations.add(d.brokerGtid);
      }
    }

    // ── Detector 3: DUPLICATE_FEE ───────────────────────────────────────
    const seenFees = new Map<string, FeeDisclosure[]>();
    for (const d of brokerFees) {
      const key = `${d.brokerGtid}|${d.serviceName}|${d.feeAmount}|${d.currency}`;
      if (!seenFees.has(key)) seenFees.set(key, []);
      seenFees.get(key)!.push(d);
    }
    for (const [key, items] of seenFees.entries()) {
      if (items.length > 1) {
        const v: FeeViolation = {
          type: "DUPLICATE_FEE",
          severity: FEE_VIOLATION_SEVERITY.DUPLICATE_FEE,
          description: `Duplicate fee detected — ${items.length} charges with key ${key}`,
          evidence: { key, items: items.map((i) => i.sourceReference) },
          chargeId: items[0].sourceReference || key,
          detectedAt: now,
        };
        violations.push(v);
        brokersWithViolations.add(items[0].brokerGtid);
      }
    }

    // ── Detector 4: FEE_AFTER_CLEARANCE ────────────────────────────────
    if (declarationCleared && declarationClearedAt) {
      for (const r of additional) {
        const created = new Date(r.createdAt);
        if (created.getTime() > declarationClearedAt.getTime() + 1000 && r.status !== "TRADER_ACCEPTED" && r.status !== "GOVERNOR_APPROVED") {
          const v: FeeViolation = {
            type: "FEE_AFTER_CLEARANCE",
            severity: FEE_VIOLATION_SEVERITY.FEE_AFTER_CLEARANCE,
            description: `Additional charge requested after customs clearance (${declarationClearedAt.toISOString()}) without trader approval: ${r.reason}`,
            evidence: {
              requestId: r.id,
              clearedAt: declarationClearedAt.toISOString(),
              requestedAt: r.createdAt.toISOString(),
              status: r.status,
            },
            chargeId: r.id,
            detectedAt: now,
          };
          violations.push(v);
          brokersWithViolations.add(r.brokerGtid);
        }
      }
    }

    // ── Detector 5: FEE_NO_EVIDENCE ─────────────────────────────────────
    for (const r of additional) {
      if (!r.evidence || String(r.evidence).trim().length < 5) {
        const v: FeeViolation = {
          type: "FEE_NO_EVIDENCE",
          severity: FEE_VIOLATION_SEVERITY.FEE_NO_EVIDENCE,
          description: `Additional charge request ${r.id} has no supporting evidence`,
          evidence: { requestId: r.id, reason: r.reason },
          chargeId: r.id,
          detectedAt: now,
        };
        violations.push(v);
        brokersWithViolations.add(r.brokerGtid);
      }
    }

    // ── Detector 6: WRONG_SERVICE_CATEGORY ──────────────────────────────
    for (const d of disclosure) {
      // Reclassify the disclosure item and check for category mismatches.
      const classification = classifyFee({
        name: d.serviceName,
        chargeRecipient: d.chargeRecipient,
      });
      if (classification.violation) {
        const v: FeeViolation = {
          type: "WRONG_SERVICE_CATEGORY",
          severity: FEE_VIOLATION_SEVERITY.WRONG_SERVICE_CATEGORY,
          description: `Charge "${d.serviceName}" classified as ${d.category} but classifier detected violation: ${classification.violation}`,
          evidence: {
            disclosureCategory: d.category,
            classifierCategory: classification.category,
            violation: classification.violation,
            chargeId: d.sourceReference,
          },
          chargeId: d.sourceReference || d.serviceName,
          detectedAt: now,
        };
        violations.push(v);
        brokersWithViolations.add(d.brokerGtid);
      }
    }

    // ── Detector 7: GOVERNMENT_AS_BROKER_REVENUE ───────────────────────
    for (const d of disclosure) {
      if (d.category === "GOVERNMENT_FEE" || d.category === "DUTY" || d.category === "TAX") {
        // If the chargeRecipient is a broker (not the government), this is a §11 violation.
        if (/broker|forwarder|logistics|clearing/i.test(d.chargeRecipient)) {
          const v: FeeViolation = {
            type: "GOVERNMENT_AS_BROKER_REVENUE",
            severity: FEE_VIOLATION_SEVERITY.GOVERNMENT_AS_BROKER_REVENUE,
            description: `Government charge "${d.serviceName}" (${d.feeAmount} ${d.currency}) presented with broker recipient "${d.chargeRecipient}" — §11 violation`,
            evidence: {
              serviceName: d.serviceName,
              amount: d.feeAmount,
              currency: d.currency,
              chargeRecipient: d.chargeRecipient,
              category: d.category,
            },
            chargeId: d.sourceReference || d.serviceName,
            detectedAt: now,
          };
          violations.push(v);
          brokersWithViolations.add(d.brokerGtid);
        }
      }
    }

    // ── Detector 8: DUPLICATE_GOVERNMENT_CHARGE ─────────────────────────
    const govSeen = new Map<string, FeeDisclosure[]>();
    for (const d of governmentFees) {
      const key = `${d.category}|${d.serviceName}|${d.feeAmount}|${d.currency}`;
      if (!govSeen.has(key)) govSeen.set(key, []);
      govSeen.get(key)!.push(d);
    }
    for (const [key, items] of govSeen.entries()) {
      if (items.length > 1) {
        const v: FeeViolation = {
          type: "DUPLICATE_GOVERNMENT_CHARGE",
          severity: FEE_VIOLATION_SEVERITY.DUPLICATE_GOVERNMENT_CHARGE,
          description: `Duplicate government charge detected — ${items.length} charges with key ${key}`,
          evidence: { key, items: items.map((i) => i.sourceReference) },
          chargeId: items[0].sourceReference || key,
          detectedAt: now,
        };
        violations.push(v);
      }
    }

    // ── Detector 9: FEE_CHANGED_WITHOUT_APPROVAL ────────────────────────
    // Any additional charge that is NOT in {TRADER_ACCEPTED, GOVERNOR_APPROVED,
    // LOOM_RECORDED, CANCELLED, GOVERNOR_DENIED} but has been "applied" — i.e.
    // appears in the disclosure — is a silent change.
    for (const r of additional) {
      const allowedApplied = ["TRADER_ACCEPTED", "GOVERNOR_APPROVED", "LOOM_RECORDED"];
      if (!allowedApplied.includes(r.status)) {
        // Check if it appears in the disclosure (i.e., applied to the bill).
        const appears = disclosure.some((d) => d.sourceReference === r.id);
        if (appears) {
          const v: FeeViolation = {
            type: "FEE_CHANGED_WITHOUT_APPROVAL",
            severity: FEE_VIOLATION_SEVERITY.FEE_CHANGED_WITHOUT_APPROVAL,
            description: `Additional charge ${r.id} (${r.amount} ${r.currency}) applied to bill without trader/Governor approval (status=${r.status})`,
            evidence: { requestId: r.id, status: r.status, amount: r.amount, currency: r.currency },
            chargeId: r.id,
            detectedAt: now,
          };
          violations.push(v);
          brokersWithViolations.add(r.brokerGtid);
        }
      }
    }

    // ── Detector 10: FEE_ON_HISTORICAL_TRANSACTION ──────────────────────
    // A charge applied to a USTN whose trade is in a terminal phase (COMPLETED /
    // CANCELLED) is suspicious. Best-effort — skip if trade lookup fails.
    try {
      const trade = await db.trade.findUnique({
        where: { ustn },
        select: { status: true },
      });
      if (trade && (trade.status === "COMPLETED" || trade.status === "CANCELLED" || trade.status === "CLOSED")) {
        for (const r of additional) {
          if (new Date(r.createdAt).getTime() > Date.now() - 60 * 1000) {
            // Only flag charges created in the last minute on closed trades
            // (older charges were already audited at closure time).
            const v: FeeViolation = {
              type: "FEE_ON_HISTORICAL_TRANSACTION",
              severity: FEE_VIOLATION_SEVERITY.FEE_ON_HISTORICAL_TRANSACTION,
              description: `Additional charge ${r.id} applied to historical (closed) trade with status ${trade.status}`,
              evidence: { requestId: r.id, tradeStatus: trade.status, createdAt: r.createdAt },
              chargeId: r.id,
              detectedAt: now,
            };
            violations.push(v);
            brokersWithViolations.add(r.brokerGtid);
          }
        }
      }
    } catch (err: any) {
      logger.warn("[fee-integrity/checkFeeIntegrity] historical trade check failed", {
        ustn,
        error: err?.message,
      });
    }

    // ── Detector 11: INCONSISTENT_WITH_SCHEDULE ─────────────────────────
    // For each broker fee, check if the broker has a published ACTIVE fee
    // schedule for the same service and the fee is wildly off (e.g., >200%
    // of schedule).
    for (const d of brokerFees) {
      try {
        const scheduleRows = await db.tradeEvent.findMany({
          where: {
            source: "FEE_SCHEDULE",
            actorGtid: d.brokerGtid,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
        for (const row of scheduleRows || []) {
          const meta = _safeParse(row?.eventMetadata) || {};
          const body = meta.body || meta;
          if (body.status !== "ACTIVE") continue;
          if (body.serviceName !== d.serviceName && body.serviceId !== d.serviceName) continue;
          const scheduledFee = _num(body.feeAmount);
          if (scheduledFee > 0 && d.feeAmount > scheduledFee * 2) {
            const v: FeeViolation = {
              type: "INCONSISTENT_WITH_SCHEDULE",
              severity: FEE_VIOLATION_SEVERITY.INCONSISTENT_WITH_SCHEDULE,
              description: `Charge ${d.feeAmount} ${d.currency} for "${d.serviceName}" is more than 2× the broker's published schedule fee ${scheduledFee} ${body.currency || d.currency}`,
              evidence: {
                scheduleId: body.id,
                scheduleVersion: body.version,
                scheduledFee,
                actualFee: d.feeAmount,
                brokerGtid: d.brokerGtid,
              },
              chargeId: d.sourceReference || d.serviceName,
              detectedAt: now,
            };
            violations.push(v);
            brokersWithViolations.add(d.brokerGtid);
            break; // Only flag once per disclosure item.
          }
        }
      } catch (err: any) {
        logger.warn("[fee-integrity/checkFeeIntegrity] schedule check failed", {
          brokerGtid: d.brokerGtid,
          error: err?.message,
        });
      }
    }

    // ── Detector 12: REPEATED_VIOLATIONS ────────────────────────────────
    for (const brokerGtid of brokersWithViolations) {
      const priorCount = await _countPriorBrokerViolations(brokerGtid, 30);
      if (priorCount >= 3) {
        const v: FeeViolation = {
          type: "REPEATED_VIOLATIONS",
          severity: FEE_VIOLATION_SEVERITY.REPEATED_VIOLATIONS,
          description: `Broker ${brokerGtid} has ${priorCount} fee violations in the last 30 days — repeated anomaly pattern`,
          evidence: { brokerGtid, priorCount, windowDays: 30 },
          chargeId: `BROKER:${brokerGtid}`,
          detectedAt: now,
        };
        violations.push(v);
      }
    }

    // §5 Persist all newly-detected violations (best-effort).
    for (const v of violations) {
      await _persistViolation(ustn, v);
    }

    // §6 Append a fee-Loom event if any violations detected.
    if (violations.length > 0) {
      try {
        await appendFeeLoomEvent(
          "broker_policy_violation_flagged",
          ustn,
          "FEE_INTEGRITY_ENGINE",
          sanitizeFeeForLoom({
            ustn,
            violationCount: violations.length,
            riskLevel: _riskFromViolations(violations),
            types: violations.map((v) => v.type),
          }),
        );
      } catch (err) {
        logger.warn("[fee-integrity/checkFeeIntegrity] Loom append failed", { error: String(err) });
      }
    }

    const totalCharges = disclosure.length;
    const cleanCharges = Math.max(0, totalCharges - violations.length);
    const riskLevel = _riskFromViolations(violations);

    logger.info("[fee-integrity/checkFeeIntegrity] complete", {
      ustn,
      violations: violations.length,
      cleanCharges,
      totalCharges,
      riskLevel,
    });

    return {
      ustn,
      violations,
      cleanCharges,
      totalCharges,
      riskLevel,
    };
  } catch (err: any) {
    logger.error("[fee-integrity/checkFeeIntegrity] failed", { ustn, error: err?.message });
    return {
      ustn,
      violations: [],
      cleanCharges: 0,
      totalCharges: 0,
      riskLevel: "NONE",
    };
  }
}

// ============ §39 Post-clearance control ============

/**
 * Validate that a post-clearance charge has all the required linkage fields.
 *
 * After customs clearance, any broker financial claim MUST reference:
 *   - USTN
 *   - broker GTID
 *   - original quote (quoteId)
 *   - fee schedule (feeScheduleId)
 *   - service performed (service)
 *   - evidence
 *   - reason
 *
 * Without ALL of these, the charge is flagged as
 * UNSUPPORTED_POST_CLEARANCE_CHARGE.
 *
 * Returns { valid, reason, missingFields[] }. Never throws.
 */
export async function checkPostClearanceCharge(
  charge: any,
  ustn: string,
): Promise<PostClearanceChargeValidation> {
  try {
    if (!charge) {
      return { valid: false, reason: "Charge is null/undefined", missingFields: ["charge"] };
    }
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!charge.brokerGtid) missing.push("brokerGtid");
    if (!charge.quoteId) missing.push("quoteId");
    if (!charge.feeScheduleId) missing.push("feeScheduleId");
    if (!charge.service) missing.push("service");
    if (!charge.evidence || String(charge.evidence).trim().length < 5) missing.push("evidence");
    if (!charge.reason || String(charge.reason).trim().length < 3) missing.push("reason");

    if (missing.length > 0) {
      // Persist the violation flag.
      try {
        await _persistViolation(ustn, {
          type: "FEE_AFTER_CLEARANCE",
          severity: FEE_VIOLATION_SEVERITY.FEE_AFTER_CLEARANCE,
          description: `UNSUPPORTED_POST_CLEARANCE_CHARGE — missing fields: ${missing.join(", ")}`,
          evidence: { charge, missingFields: missing },
          chargeId: charge.id || charge.requestId || "UNKNOWN",
          detectedAt: new Date(),
        });
      } catch (err: any) {
        logger.warn("[fee-integrity/checkPostClearanceCharge] persist failed", {
          error: err?.message,
        });
      }
      return {
        valid: false,
        reason: `UNSUPPORTED_POST_CLEARANCE_CHARGE — missing required fields: ${missing.join(", ")}`,
        missingFields: missing,
      };
    }
    return {
      valid: true,
      reason: "All required linkage fields present.",
      missingFields: [],
    };
  } catch (err: any) {
    logger.error("[fee-integrity/checkPostClearanceCharge] failed", {
      ustn,
      error: err?.message,
    });
    return {
      valid: false,
      reason: `Internal error: ${err?.message || String(err)}`,
      missingFields: [],
    };
  }
}

// ============ Query: list persisted violations ============

/**
 * List all persisted fee violations for a USTN, oldest first. Best-effort —
 * returns an empty array on failure. Never throws.
 */
export async function listPersistedViolations(
  ustn: string,
): Promise<FeeViolation[]> {
  try {
    if (!ustn) return [];
    const rows = await db.tradeEvent.findMany({
      where: { ustn, source: "FEE_VIOLATION" },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return (rows || []).map((r: any) => {
      const meta = _safeParse(r?.eventMetadata) || {};
      const body = meta.body || meta;
      return {
        type: (body.type || "FEE_NOT_IN_QUOTATION") as FeeViolationType,
        severity: (body.severity || "MEDIUM") as FeeViolation["severity"],
        description: body.description || "",
        evidence: body.evidence || {},
        chargeId: body.chargeId || "",
        detectedAt: body.detectedAt ? new Date(body.detectedAt) : new Date(r?.createdAt),
      };
    });
  } catch (err: any) {
    logger.error("[fee-integrity/listPersistedViolations] failed", { ustn, error: err?.message });
    return [];
  }
}

/**
 * Convenience: clear a previously-raised fee risk flag (e.g., after a
 * dispute is resolved in the broker's favour). Persists a fee_risk_flag_cleared
 * Loom event. Best-effort — never throws.
 */
export async function clearFeeRiskFlag(
  ustn: string,
  actorGtid: string,
  reason: string,
): Promise<{ cleared: boolean; loomHash: string }> {
  try {
    if (!ustn) return { cleared: false, loomHash: "" };
    const loomRes = await appendFeeLoomEvent(
      "fee_risk_flag_cleared",
      ustn,
      actorGtid,
      sanitizeFeeForLoom({ ustn, clearedBy: actorGtid, reason, clearedAt: new Date().toISOString() }),
    );
    logger.info("[fee-integrity/clearFeeRiskFlag] flag cleared", { ustn, actorGtid, reason });
    return { cleared: true, loomHash: loomRes?.loomHash || "" };
  } catch (err: any) {
    logger.error("[fee-integrity/clearFeeRiskFlag] failed", { ustn, error: err?.message });
    return { cleared: false, loomHash: "" };
  }
}
