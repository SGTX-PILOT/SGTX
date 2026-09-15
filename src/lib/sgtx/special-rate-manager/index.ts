// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Special Rate Manager (Admin Portal)
// -----------------------------------------------------------------------------
// Special rates: a tenant-scoped override of the standard SGTX fee rate
// (default 1.5%), bounded to the constitutional range 0.1% – 2.5%.
//
// Workflow:
//   1. ADM tenant proposes a special rate (createSpecialRate) — writes a
//      SpecialRate row with isActive=false AND a MultisigRequest
//      (requestType = "SPECIAL_RATE", requiredApprovals = 3).
//   2. Each approver calls approveSpecialRate(rateId, decision).
//   3. When the multisig threshold is met (3-of-5), the SpecialRate is
//      activated (isActive=true) and the previous active rate for that
//      (targetGtid, rateType) is revoked.
//   4. revokeSpecialRate(rateId, reason) deactivates a live special rate.
//   5. getActiveSpecialRate(tenantGtid, rateType) returns the currently
//      effective rate for a tenant + rate type.
//
// Storage:
//   • SpecialRate (model fields: rateId, targetGtid, rateType, rateValue,
//                  originalRate, reason, validFrom, validUntil, isActive,
//                  grantedBy)
//   • MultisigRequest (requestType = "SPECIAL_RATE", payload =
//                      { rateId, targetGtid, rateType, rateValue, reason,
//                        validFrom, validTo, authorisedApproverGtids })
//   • ConfigurationHistory (configKey = `special_rate_history:{rateId}`)
//     — version history (creation, approval, revocation)
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const MIN_RATE = 0.001; // 0.1%
export const MAX_RATE = 0.025; // 2.5%
const REQUIRED_APPROVALS = 3;

const DEFAULT_AUTHORIZED_APPROVERS = [
  "SGTX-EG-GOV-000001-9A0B",
  "SGTX-ADM-000001-C1D2",
  "SGTX-GOV-LEGAL-0001-E3F4",
  "SGTX-GOV-COMPL-0001-A5B6",
  "SGTX-GOV-AUDIT-0001-C7D8",
];

const DEFAULT_RATES: Record<string, number> = {
  SGTX_FEE: 0.015,        // 1.5% standard SGTX fee
  CUSTOMS_FEE: 0.005,     // 0.5% customs
  PROCESSING_FEE: 0.0025, // 0.25% processing
};

export interface SpecialRateCreateInput {
  tenantGtid: string;   // The ADM/GOV proposing the rate (also the requester)
  targetGtid: string;   // The tenant receiving the special rate
  rateType: string;     // SGTX_FEE | CUSTOMS_FEE | PROCESSING_FEE | custom
  rateValue: number;    // 0.001 – 0.025 (decimal percent)
  reason: string;
  validFrom?: string;
  validTo?: string;
}

// =============================================================================
// createSpecialRate
// =============================================================================
export async function createSpecialRate(input: SpecialRateCreateInput): Promise<{
  specialRateId: string;
  requiresApproval: true;
  multisigRequestId: string;
  requiredApprovals: number;
}> {
  // Validate bounds (0.1% – 2.5%).
  if (input.rateValue < MIN_RATE || input.rateValue > MAX_RATE) {
    throw new Error(
      `rateValue must be within constitutional bounds [${MIN_RATE}, ${MAX_RATE}] (got ${input.rateValue})`,
    );
  }
  if (!input.targetGtid || !input.rateType || !input.reason) {
    throw new Error("targetGtid, rateType, reason required");
  }

  const originalRate = DEFAULT_RATES[input.rateType] ?? 0.015;
  const specialRateId = `SR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // Create the SpecialRate row (isActive=false until approved).
  const created = await db.specialRate.create({
    data: {
      rateId: specialRateId,
      targetGtid: input.targetGtid,
      rateType: input.rateType,
      rateValue: input.rateValue,
      originalRate,
      reason: input.reason,
      validFrom: input.validFrom ? new Date(input.validFrom) : new Date(),
      validUntil: input.validTo ? new Date(input.validTo) : null,
      isActive: false, // Requires 3-of-5 approval first.
      grantedBy: input.tenantGtid,
    },
  });

  // Multisig request.
  const payload = {
    rateId: specialRateId,
    targetGtid: input.targetGtid,
    rateType: input.rateType,
    rateValue: input.rateValue,
    originalRate,
    reason: input.reason,
    validFrom: input.validFrom || new Date().toISOString(),
    validTo: input.validTo || null,
    authorisedApproverGtids: DEFAULT_AUTHORIZED_APPROVERS,
  };
  const multisig = await db.multisigRequest.create({
    data: {
      requestType: "SPECIAL_RATE",
      requesterGtid: input.tenantGtid,
      payload: JSON.stringify(payload),
      requiredApprovals: REQUIRED_APPROVALS,
      authorisedApproverGtids: JSON.stringify(DEFAULT_AUTHORIZED_APPROVERS),
      status: "PENDING",
    },
  });

  // Version history.
  await db.configurationHistory.create({
    data: {
      configKey: `special_rate_history:${specialRateId}`,
      newValue: JSON.stringify({
        rateId: specialRateId,
        action: "PROPOSED",
        targetGtid: input.targetGtid,
        rateType: input.rateType,
        rateValue: input.rateValue,
        originalRate,
        reason: input.reason,
        proposedBy: input.tenantGtid,
        proposedAt: new Date().toISOString(),
        multisigRequestId: multisig.id,
      }),
      changedByGtid: input.tenantGtid,
      changeReason: `Special rate proposed: ${input.reason}`,
      version: 1,
    },
  });

  // Inbox the governance authority members.
  for (const approverGtid of DEFAULT_AUTHORIZED_APPROVERS) {
    await db.inboxItem.create({
      data: {
        tenantGtid: approverGtid,
        category: "APPROVAL",
        priority: 90,
        title: `Special rate approval: ${specialRateId} (${(input.rateValue * 100).toFixed(2)}% ${input.rateType})`,
        description: `Proposed by ${input.tenantGtid} for ${input.targetGtid}. Reason: ${input.reason}. ${REQUIRED_APPROVALS}-of-${DEFAULT_AUTHORIZED_APPROVERS.length} approvals required.`,
        ctaLabel: "Review & Approve",
      },
    }).catch((e: any) => logger.error("[special-rate] inbox failed:", e?.message));
  }

  return {
    specialRateId,
    requiresApproval: true,
    multisigRequestId: multisig.id,
    requiredApprovals: REQUIRED_APPROVALS,
  };
}

// =============================================================================
// approveSpecialRate — record one approval against the multisig request
// =============================================================================
export async function approveSpecialRate(
  rateId: string,
  approverGtid: string,
  decision: "APPROVE" | "REJECT" = "APPROVE",
): Promise<{
  approved: boolean;
  approvalsCount: number;
  active: boolean;
  request: any;
}> {
  // Find the multisig request by rateId in payload.
  const requests = await db.multisigRequest.findMany({
    where: { requestType: "SPECIAL_RATE", status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const target = requests.find((r: any) => {
    try {
      const p = JSON.parse(r.payload || "{}");
      return p.rateId === rateId;
    } catch { return false; }
  });
  if (!target) throw new Error("special rate request not found (or already resolved)");

  // Approver membership check.
  if (target.authorisedApproverGtids) {
    try {
      const authorised = JSON.parse(target.authorisedApproverGtids);
      if (Array.isArray(authorised) && authorised.length > 0 && !authorised.includes(approverGtid)) {
        throw new Error("approver not in the authorised set");
      }
    } catch (e: any) {
      if (e.message.includes("authorised")) throw e;
    }
  }

  const approvals = JSON.parse(target.approvals || "[]");

  if (decision === "REJECT") {
    await db.multisigRequest.update({
      where: { id: target.id },
      data: { status: "REJECTED" },
    });
    await db.specialRate.updateMany({
      where: { rateId },
      data: { isActive: false },
    });
    return { approved: false, approvalsCount: approvals.length, active: false, request: target };
  }

  if (approvals.includes(approverGtid)) {
    return { approved: false, approvalsCount: approvals.length, active: false, request: target };
  }
  approvals.push(approverGtid);
  const isApproved = approvals.length >= target.requiredApprovals;

  await db.multisigRequest.update({
    where: { id: target.id },
    data: {
      approvals: JSON.stringify(approvals),
      status: isApproved ? "APPROVED" : "PENDING",
      executedAt: isApproved ? new Date() : null,
    },
  });

  let active = false;
  if (isApproved) {
    active = await activateSpecialRate(rateId, approverGtid, approvals);
  }

  return { approved: isApproved, approvalsCount: approvals.length, active, request: target };
}

// =============================================================================
// activateSpecialRate — promote to active; revoke any prior active rate for
// the same (targetGtid, rateType).
// =============================================================================
async function activateSpecialRate(
  rateId: string,
  approverGtid: string,
  approverGtids: string[],
): Promise<boolean> {
  const rate = await db.specialRate.findUnique({ where: { rateId } });
  if (!rate) return false;

  // Revoke any prior active rate for the same target+type.
  await db.specialRate.updateMany({
    where: {
      targetGtid: rate.targetGtid,
      rateType: rate.rateType,
      isActive: true,
      rateId: { not: rateId },
    },
    data: { isActive: false, validUntil: new Date() },
  });

  // Activate the new rate.
  await db.specialRate.update({
    where: { rateId },
    data: { isActive: true },
  });

  // Version history entry.
  await db.configurationHistory.create({
    data: {
      configKey: `special_rate_history:${rateId}`,
      newValue: JSON.stringify({
        rateId,
        action: "ACTIVATED",
        rateValue: rate.rateValue,
        activatedAt: new Date().toISOString(),
        approvedBy: approverGtids,
      }),
      changedByGtid: approverGtid,
      changeReason: `Special rate activated by ${approverGtids.length}-of-5 multisig`,
      version: (await nextHistoryVersion(rateId)),
    },
  });

  // Inbox notify the receiving tenant.
  await db.inboxItem.create({
    data: {
      tenantGtid: rate.targetGtid,
      category: "APPROVAL",
      priority: 80,
      title: `Your special rate is active: ${(rate.rateValue * 100).toFixed(2)}% ${rate.rateType}`,
      description: `Special rate ${rateId} has been activated. Reason: ${rate.reason}.`,
      ctaLabel: "View Rate",
    },
  }).catch(() => null);

  return true;
}

// =============================================================================
// getSpecialRates — list with filters
// =============================================================================
export async function getSpecialRates(filters: {
  targetGtid?: string;
  rateType?: string;
  isActive?: boolean;
  limit?: number;
} = {}): Promise<{ rates: any[]; count: number }> {
  const where: any = {};
  if (filters.targetGtid) where.targetGtid = filters.targetGtid;
  if (filters.rateType) where.rateType = filters.rateType;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  const rates = await db.specialRate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit || 50, 500),
  });

  return { rates, count: rates.length };
}

// =============================================================================
// getActiveSpecialRate — return the currently effective rate for a tenant+type
// =============================================================================
export async function getActiveSpecialRate(
  tenantGtid: string,
  rateType: string,
): Promise<{
  rate: number;
  isSpecial: boolean;
  specialRateId: string | null;
  originalRate: number;
  validFrom?: string;
  validUntil?: string | null;
}> {
  const originalRate = DEFAULT_RATES[rateType] ?? 0.015;
  const special = await db.specialRate.findFirst({
    where: {
      targetGtid: tenantGtid,
      rateType,
      isActive: true,
      OR: [
        { validUntil: null },
        { validUntil: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (!special) {
    return { rate: originalRate, isSpecial: false, specialRateId: null, originalRate };
  }
  return {
    rate: special.rateValue,
    isSpecial: true,
    specialRateId: special.rateId,
    originalRate: special.originalRate,
    validFrom: special.validFrom.toISOString(),
    validUntil: special.validUntil?.toISOString() || null,
  };
}

// =============================================================================
// revokeSpecialRate — deactivate a live special rate
// =============================================================================
export async function revokeSpecialRate(
  rateId: string,
  reason: string,
  revokedBy: string = "system",
): Promise<{ revoked: boolean; revokedAt: string }> {
  const rate = await db.specialRate.findUnique({ where: { rateId } });
  if (!rate) throw new Error("special rate not found");
  if (!rate.isActive) throw new Error("special rate is not active");

  await db.specialRate.update({
    where: { rateId },
    data: { isActive: false, validUntil: new Date() },
  });

  const revokedAt = new Date().toISOString();
  await db.configurationHistory.create({
    data: {
      configKey: `special_rate_history:${rateId}`,
      newValue: JSON.stringify({
        rateId,
        action: "REVOKED",
        revokedAt,
        reason,
        revokedBy,
      }),
      changedByGtid: revokedBy,
      changeReason: `Special rate revoked: ${reason}`,
      version: (await nextHistoryVersion(rateId)),
    },
  });

  await db.activity.create({
    data: {
      actorGtid: revokedBy,
      action: "SPECIAL_RATE_REVOKED",
      description: `Special rate ${rateId} revoked. Reason: ${reason}`,
      type: "WARN",
      metadata: JSON.stringify({ rateId, reason, revokedAt }),
    },
  }).catch(() => null);

  return { revoked: true, revokedAt };
}

// =============================================================================
// getSpecialRateHistory — version history of a special rate
// =============================================================================
export async function getSpecialRateHistory(rateId: string): Promise<{ history: any[]; count: number }> {
  const rows = await db.configurationHistory.findMany({
    where: { configKey: `special_rate_history:${rateId}` },
    orderBy: { version: "asc" },
    take: 100,
  }).catch(() => []);
  const history = rows.map((r: any) => {
    try { return JSON.parse(r.newValue); } catch { return null; }
  }).filter(Boolean);
  return { history, count: history.length };
}

// =============================================================================
// helpers
// =============================================================================
async function nextHistoryVersion(rateId: string): Promise<number> {
  const last = await db.configurationHistory.findFirst({
    where: { configKey: `special_rate_history:${rateId}` },
    orderBy: { version: "desc" },
    select: { version: true },
  }).catch(() => null);
  return (last?.version || 0) + 1;
}
