// SGTX Part 32 — Add-On 10: Broker Liability & Insurance
//
// Tracks broker professional-liability insurance policies, declaration errors,
// and aggregate performance metrics (acceptance rate, error rate, rating).
//
// This module exposes pure helpers (status derivation, coverage gap detection,
// performance rollup) and a thin persistence layer for the API routes under
// /api/sgtx/broker-liability/*. The Prisma models BrokerLiabilityInsurance,
// BrokerDeclarationError, and BrokerPerformanceMetric already exist — this
// module is additive only; no schema changes.
//
// Constitutional notes:
//   - No Governor gate is wired here. A future G2U22 hook may require an
//     ACTIVE+verified liability policy before a broker can file a declaration.
//   - All DB calls are defensive (try/catch) — failures return null/empty and
//     log via the shared SGTX logger; they never crash the calling route.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface BrokerLiabilityInsuranceInput {
  brokerGtid: string;
  insurer: string;
  policyNumber: string;
  coverageAmount: number;
  currency?: string;
  validFrom?: Date | string;
  validTo?: Date | string;
  certificateUrl?: string;
  verified?: boolean;
  status?: string;
}

export interface BrokerPerformanceRollup {
  brokerGtid: string;
  totalDeclarations: number;
  totalErrors: number;
  acceptanceRate: number | null;
  errorRate: number | null;
  rating: number | null;
  activePolicies: number;
  verifiedPolicies: number;
  coverageTotal: number;
  coverageCurrency: string;
  hasCoverageGap: boolean;
  lastAssessment: Date | null;
}

// Policy status values (defensive — accept any string but normalise the common ones).
export const POLICY_STATUS = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
} as const;

// Thresholds (configurable via env in a follow-up; constants for now).
const MIN_COVERAGE_EGP = 500_000; // minimum acceptable coverage per policy
const COVERAGE_GAP_DAYS = 30; // a policy expiring within 30 days is flagged as a gap risk

// ============ Pure helpers ============

/**
 * Derive the effective status of a policy based on its dates.
 *
 *  - If status is explicitly CANCELLED → CANCELLED wins.
 *  - If validTo is in the past → EXPIRED.
 *  - Otherwise → whatever status was supplied (default ACTIVE).
 */
export function derivePolicyStatus(
  validTo: Date | string | null | undefined,
  explicitStatus: string,
  asOf: Date = new Date(),
): string {
  if (explicitStatus === POLICY_STATUS.CANCELLED) return POLICY_STATUS.CANCELLED;
  if (validTo) {
    const d = typeof validTo === "string" ? new Date(validTo) : validTo;
    if (!isNaN(d.getTime())) {
      if (d.getTime() <= asOf.getTime()) return POLICY_STATUS.EXPIRED;
    }
  }
  return explicitStatus || POLICY_STATUS.ACTIVE;
}

/**
 * Check whether a broker has a coverage gap (no ACTIVE verified policy with
 * sufficient coverage). Returns a structured result so the route can surface
 * actionable advice.
 */
export function detectCoverageGap(
  policies: Array<{
    status: string;
    verified: boolean;
    coverageAmount: number;
    validTo?: Date | string | null;
  }>,
  asOf: Date = new Date(),
): { hasGap: boolean; reason: string; activeVerifiedCount: number } {
  const now = asOf.getTime();
  const activeVerified = policies.filter((p) => {
    if (p.status !== POLICY_STATUS.ACTIVE) return false;
    if (!p.verified) return false;
    if (p.coverageAmount < MIN_COVERAGE_EGP) return false;
    if (p.validTo) {
      const d = typeof p.validTo === "string" ? new Date(p.validTo) : p.validTo;
      if (!isNaN(d.getTime()) && d.getTime() <= now) return false;
    }
    return true;
  });
  if (activeVerified.length === 0) {
    return {
      hasGap: true,
      reason: "No active+verified policy meeting minimum coverage threshold",
      activeVerifiedCount: 0,
    };
  }
  // Check if any active policy is expiring within 30 days.
  const soonExpiring = activeVerified.some((p) => {
    if (!p.validTo) return false;
    const d = typeof p.validTo === "string" ? new Date(p.validTo) : p.validTo;
    if (isNaN(d.getTime())) return false;
    const daysToExpiry = (d.getTime() - now) / 86_400_000;
    return daysToExpiry <= COVERAGE_GAP_DAYS;
  });
  return {
    hasGap: false,
    reason: soonExpiring ? "Coverage active but a policy expires within 30 days" : "Coverage active",
    activeVerifiedCount: activeVerified.length,
  };
}

// ============ Persistence (thin wrappers) ============

/**
 * Create a BrokerLiabilityInsurance row. Defensive — returns null on failure.
 */
export async function createPolicy(input: BrokerLiabilityInsuranceInput): Promise<{ id: string } | null> {
  try {
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (validFrom && isNaN(validFrom.getTime())) return null;
    if (validTo && isNaN(validTo.getTime())) return null;

    const created = await db.brokerLiabilityInsurance.create({
      data: {
        brokerGtid: input.brokerGtid,
        insurer: input.insurer,
        policyNumber: input.policyNumber,
        coverageAmount: input.coverageAmount,
        currency: input.currency || "EGP",
        validFrom,
        validTo,
        certificateUrl: input.certificateUrl || null,
        verified: input.verified ?? false,
        status: input.status || POLICY_STATUS.ACTIVE,
      },
    });
    logger.info("[broker-liability/createPolicy] created", {
      id: created.id, brokerGtid: input.brokerGtid, insurer: input.insurer,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[broker-liability/createPolicy] failed", {
      brokerGtid: input.brokerGtid, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Mark a policy as verified. Defensive — returns the updated row or null.
 */
export async function verifyPolicy(policyId: string): Promise<{ id: string; verified: boolean } | null> {
  try {
    const updated = await db.brokerLiabilityInsurance.update({
      where: { id: policyId },
      data: { verified: true, verifiedAt: new Date() },
    });
    logger.info("[broker-liability/verifyPolicy] verified", { id: policyId });
    return { id: updated.id, verified: updated.verified };
  } catch (e: any) {
    logger.error("[broker-liability/verifyPolicy] failed", {
      policyId, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * List all liability insurance policies for a broker, with computed status.
 */
export async function listPolicies(brokerGtid: string): Promise<any[]> {
  try {
    const rows = await db.brokerLiabilityInsurance.findMany({
      where: { brokerGtid },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Normalise status based on dates (defensive — does not mutate DB).
    return rows.map((r: any) => ({
      ...r,
      effectiveStatus: derivePolicyStatus(r.validTo, r.status),
    }));
  } catch (e: any) {
    logger.error("[broker-liability/listPolicies] failed", {
      brokerGtid, error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Roll up broker performance metrics by combining BrokerPerformanceMetric,
 * BrokerDeclarationError counts, and active BrokerLiabilityInsurance rows.
 *
 * If no BrokerPerformanceMetric row exists yet, the rollup is computed live
 * from the error table (defensive — returns zeroed rollup on failure).
 */
export async function rollupBrokerPerformance(
  brokerGtid: string,
): Promise<BrokerPerformanceRollup> {
  const empty: BrokerPerformanceRollup = {
    brokerGtid,
    totalDeclarations: 0,
    totalErrors: 0,
    acceptanceRate: null,
    errorRate: null,
    rating: null,
    activePolicies: 0,
    verifiedPolicies: 0,
    coverageTotal: 0,
    coverageCurrency: "EGP",
    hasCoverageGap: true,
    lastAssessment: null,
  };

  try {
    // Load the most recent performance metric row (if any).
    const metric = await db.brokerPerformanceMetric.findFirst({
      where: { brokerGtid },
      orderBy: { createdAt: "desc" },
    });

    // Count declaration errors (defensive — separate try block).
    let totalErrors = 0;
    try {
      totalErrors = await db.brokerDeclarationError.count({ where: { brokerGtid } });
    } catch (e: any) {
      logger.warn("[broker-liability/rollup] error count failed", {
        brokerGtid, error: e?.message,
      });
    }

    // Load policies to compute coverage gap.
    const policies = await listPolicies(brokerGtid);
    const activePolicies = policies.filter((p: any) => p.effectiveStatus === POLICY_STATUS.ACTIVE);
    const verifiedPolicies = activePolicies.filter((p: any) => p.verified);
    const coverageTotal = verifiedPolicies.reduce((sum: number, p: any) => sum + (p.coverageAmount || 0), 0);
    const coverageCurrency = verifiedPolicies[0]?.currency || "EGP";

    const gap = detectCoverageGap(policies);

    const totalDeclarations = metric?.totalDeclarations ?? 0;
    const acceptanceRate = metric?.acceptanceRate ?? null;
    const errorRate = metric?.errorRate ?? (totalDeclarations > 0 ? (totalErrors / totalDeclarations) * 100 : null);
    const rating = metric?.rating ?? null;
    const lastAssessment = metric?.lastAssessment ?? null;

    return {
      brokerGtid,
      totalDeclarations,
      totalErrors,
      acceptanceRate,
      errorRate,
      rating,
      activePolicies: activePolicies.length,
      verifiedPolicies: verifiedPolicies.length,
      coverageTotal,
      coverageCurrency,
      hasCoverageGap: gap.hasGap,
      lastAssessment,
    };
  } catch (e: any) {
    logger.error("[broker-liability/rollup] failed", {
      brokerGtid, error: e?.message || String(e),
    });
    return empty;
  }
}

/**
 * Record a declaration error for a broker. Used by the trade lifecycle when
 * a broker declaration is rejected by customs. Defensive — returns null on failure.
 */
export async function recordDeclarationError(input: {
  brokerGtid: string;
  ustn?: string;
  errorType: string;
  errorDescription?: string;
  penaltyAmount?: number;
  currency?: string;
}): Promise<{ id: string } | null> {
  try {
    const created = await db.brokerDeclarationError.create({
      data: {
        brokerGtid: input.brokerGtid,
        ustn: input.ustn || null,
        errorType: input.errorType,
        errorDescription: input.errorDescription || null,
        penaltyAmount: input.penaltyAmount ?? null,
        currency: input.currency || "EGP",
      },
    });
    logger.info("[broker-liability/recordDeclarationError] recorded", {
      id: created.id, brokerGtid: input.brokerGtid, errorType: input.errorType,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[broker-liability/recordDeclarationError] failed", {
      brokerGtid: input.brokerGtid, error: e?.message || String(e),
    });
    return null;
  }
}
