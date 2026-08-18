// SGTX Part 32 — Add-On 13: Inspection Agency Accreditation
//
// Tracks third-party inspection agency accreditations (ISO 17020, ISO 17065,
// country-specific schemes like EG-GOEIC, SA-SASO, etc.) and aggregate
// performance metrics (acceptance rate, override rate, dispute rate, rating).
//
// Constitutional notes:
//   - No Governor gate wired here. A future G2U22 hook may require an active
//     accreditation before an inspection agency's reports are accepted on
//     a declaration.
//   - All DB calls are defensive (try/catch) — failures return null/empty and
//     log via the shared SGTX logger.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface AccreditationInput {
  agencyGtid: string;
  accreditationStandard: string;
  accreditationBody: string;
  certificateNumber: string;
  validFrom?: Date | string;
  validTo?: Date | string;
  scopeOfAccreditation?: string[] | string; // array or pre-serialised JSON
  verified?: boolean;
  status?: string;
}

export interface AgencyPerformanceRollup {
  agencyGtid: string;
  totalInspections: number;
  acceptanceRate: number | null;
  overrideRate: number | null;
  disputeRate: number | null;
  rating: number | null;
  activeAccreditations: number;
  verifiedAccreditations: number;
  lastAssessment: Date | null;
}

// Accreditation status values (defensive — accept any string but normalise the common ones).
export const ACCREDITATION_STATUS = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
} as const;

// Thresholds.
const ACCREDITATION_GAP_DAYS = 60; // accreditation expiring within 60 days is flagged

// ============ Pure helpers ============

/**
 * Derive the effective status of an accreditation based on its dates.
 *
 *  - Explicit SUSPENDED / REVOKED wins.
 *  - If validTo is in the past → EXPIRED.
 *  - Otherwise → whatever status was supplied (default ACTIVE).
 */
export function deriveAccreditationStatus(
  validTo: Date | string | null | undefined,
  explicitStatus: string,
  asOf: Date = new Date(),
): string {
  if (explicitStatus === ACCREDITATION_STATUS.SUSPENDED) return ACCREDITATION_STATUS.SUSPENDED;
  if (explicitStatus === ACCREDITATION_STATUS.REVOKED) return ACCREDITATION_STATUS.REVOKED;
  if (validTo) {
    const d = typeof validTo === "string" ? new Date(validTo) : validTo;
    if (!isNaN(d.getTime()) && d.getTime() <= asOf.getTime()) {
      return ACCREDITATION_STATUS.EXPIRED;
    }
  }
  return explicitStatus || ACCREDITATION_STATUS.ACTIVE;
}

/**
 * Check whether an agency has at least one ACTIVE+VERIFIED accreditation.
 */
export function detectAccreditationGap(
  accreditations: Array<{
    status: string;
    verified: boolean;
    validTo?: Date | string | null;
  }>,
  asOf: Date = new Date(),
): { hasGap: boolean; reason: string; activeVerifiedCount: number; soonExpiring: boolean } {
  const now = asOf.getTime();
  const activeVerified = accreditations.filter((a) => {
    if (a.status !== ACCREDITATION_STATUS.ACTIVE) return false;
    if (!a.verified) return false;
    if (a.validTo) {
      const d = typeof a.validTo === "string" ? new Date(a.validTo) : a.validTo;
      if (!isNaN(d.getTime()) && d.getTime() <= now) return false;
    }
    return true;
  });
  if (activeVerified.length === 0) {
    return {
      hasGap: true,
      reason: "No active+verified accreditation",
      activeVerifiedCount: 0,
      soonExpiring: false,
    };
  }
  const soonExpiring = activeVerified.some((a) => {
    if (!a.validTo) return false;
    const d = typeof a.validTo === "string" ? new Date(a.validTo) : a.validTo;
    if (isNaN(d.getTime())) return false;
    const daysToExpiry = (d.getTime() - now) / 86_400_000;
    return daysToExpiry <= ACCREDITATION_GAP_DAYS;
  });
  return {
    hasGap: false,
    reason: soonExpiring
      ? `Coverage active but an accreditation expires within ${ACCREDITATION_GAP_DAYS} days`
      : "Coverage active",
    activeVerifiedCount: activeVerified.length,
    soonExpiring,
  };
}

/**
 * Serialise the scopeOfAccreditation array into a JSON string (per the schema's
 * String? column). Defensive — already-string input is passed through.
 */
export function serialiseScope(scope?: string[] | string): string | null {
  if (!scope) return null;
  if (typeof scope === "string") return scope;
  try {
    return JSON.stringify(scope);
  } catch {
    return null;
  }
}

/**
 * Parse the scopeOfAccreditation JSON string back into an array (defensive).
 */
export function parseScope(scope: string | null | undefined): string[] {
  if (!scope) return [];
  try {
    const parsed = JSON.parse(scope);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============ Persistence (defensive) ============

/**
 * Create an InspectionAgencyAccreditation row. Defensive — returns null on failure.
 */
export async function createAccreditation(input: AccreditationInput): Promise<{ id: string } | null> {
  try {
    const validFrom = input.validFrom ? new Date(input.validFrom) : null;
    const validTo = input.validTo ? new Date(input.validTo) : null;
    if (validFrom && isNaN(validFrom.getTime())) return null;
    if (validTo && isNaN(validTo.getTime())) return null;

    const created = await db.inspectionAgencyAccreditation.create({
      data: {
        agencyGtid: input.agencyGtid,
        accreditationStandard: input.accreditationStandard,
        accreditationBody: input.accreditationBody,
        certificateNumber: input.certificateNumber,
        validFrom,
        validTo,
        scopeOfAccreditation: serialiseScope(input.scopeOfAccreditation),
        verified: input.verified ?? false,
        status: input.status || ACCREDITATION_STATUS.ACTIVE,
      },
    });
    logger.info("[inspection/createAccreditation] created", {
      id: created.id, agencyGtid: input.agencyGtid, standard: input.accreditationStandard,
    });
    return { id: created.id };
  } catch (e: any) {
    logger.error("[inspection/createAccreditation] failed", {
      agencyGtid: input.agencyGtid, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Mark an accreditation as verified. Defensive — returns null on failure.
 */
export async function verifyAccreditation(id: string): Promise<{ id: string; verified: boolean } | null> {
  try {
    const updated = await db.inspectionAgencyAccreditation.update({
      where: { id },
      data: { verified: true, verifiedAt: new Date() },
    });
    logger.info("[inspection/verifyAccreditation] verified", { id });
    return { id: updated.id, verified: updated.verified };
  } catch (e: any) {
    logger.error("[inspection/verifyAccreditation] failed", {
      id, error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * List accreditations for an agency, with computed `effectiveStatus` and
 * parsed `scopeOfAccreditation` array.
 */
export async function listAccreditations(agencyGtid: string): Promise<any[]> {
  try {
    const rows = await db.inspectionAgencyAccreditation.findMany({
      where: { agencyGtid },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r: any) => ({
      ...r,
      effectiveStatus: deriveAccreditationStatus(r.validTo, r.status),
      scopeOfAccreditationParsed: parseScope(r.scopeOfAccreditation),
    }));
  } catch (e: any) {
    logger.error("[inspection/listAccreditations] failed", {
      agencyGtid, error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Roll up agency performance metrics from the latest
 * InspectionAgencyPerformance row + live accreditation count. Defensive.
 */
export async function rollupAgencyPerformance(agencyGtid: string): Promise<AgencyPerformanceRollup> {
  const empty: AgencyPerformanceRollup = {
    agencyGtid,
    totalInspections: 0,
    acceptanceRate: null,
    overrideRate: null,
    disputeRate: null,
    rating: null,
    activeAccreditations: 0,
    verifiedAccreditations: 0,
    lastAssessment: null,
  };

  try {
    const metric = await db.inspectionAgencyPerformance.findFirst({
      where: { agencyGtid },
      orderBy: { createdAt: "desc" },
    });

    const accreditations = await listAccreditations(agencyGtid);
    const active = accreditations.filter((a: any) => a.effectiveStatus === ACCREDITATION_STATUS.ACTIVE);
    const verified = active.filter((a: any) => a.verified);

    return {
      agencyGtid,
      totalInspections: metric?.totalInspections ?? 0,
      acceptanceRate: metric?.acceptanceRate ?? null,
      overrideRate: metric?.overrideRate ?? null,
      disputeRate: metric?.disputeRate ?? null,
      rating: metric?.rating ?? null,
      activeAccreditations: active.length,
      verifiedAccreditations: verified.length,
      lastAssessment: metric?.lastAssessment ?? null,
    };
  } catch (e: any) {
    logger.error("[inspection/rollupAgencyPerformance] failed", {
      agencyGtid, error: e?.message || String(e),
    });
    return empty;
  }
}
