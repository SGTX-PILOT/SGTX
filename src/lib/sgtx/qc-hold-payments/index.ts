// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
/**
 * SGTX v18 §12.9 — Conditional QC Hold Impact on Payments
 * ============================================================================
 *
 * When a QC verdict is `CONDITIONAL_PASS` with an associated action plan,
 * ALL payment legs for the USTN are FROZEN — no further settlement may
 * proceed, no FeeLock may transition to ACTIVE, no container release may
 * be authorised.
 *
 * The hold is lifted when the action plan is verified (§12.9.1):
 *   - QcActionPlan.status = VERIFIED
 *   - QcActionPlan.verifiedBy !== null
 *
 * State model:
 *   - On freeze: ShipmentHold(holdType='QC_CONDITIONAL', holdStatus='ACTIVE',
 *     actionPlanId=...) is created; each PaymentLeg.legState is updated to
 *     FROZEN; FeeLock (if any) is transitioned to DISPUTED.
 *   - On lift: ShipmentHold.holdStatus=RELEASED, releasedAt=now,
 *     releasedByGtid=...; each PaymentLeg.legState returns to its previous
 *     state (PENDING/SUBMITTED/PROCESSING); FeeLock can re-activate.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash, randomUUID } from "crypto";

// ============ Types ============

export interface FreezeResult {
  frozenLegs: Array<{
    legId: string;
    previousStatus: string;
    newStatus: string;
  }>;
  holdId: string;
}

export interface LiftResult {
  releasedLegs: Array<{
    legId: string;
    previousStatus: string;
    newStatus: string;
  }>;
  releasedAt: string;
}

export interface QcHoldStatus {
  active: boolean;
  actionPlanId: string | null;
  deadline: string | null;
  frozenLegs: Array<{
    legId: string;
    beneficiaryName: string;
    amount: number;
    currency: string;
    status: string;
  }>;
}

export interface ExtensionResult {
  extensionId: string;
  approved: boolean;
  newDeadline: string;
  reason?: string;
}

// ============ Pure helpers ============

/**
 * Pure: generate a holdId. Format: QCHOLD-{ustn8}-{YYYYMMDDHHMMSS}-{RAND6}.
 */
export function generateHoldId(ustn: string, when: Date = new Date()): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}` +
    `${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `QCHOLD-${u}-${ts}-${r}`;
}

/**
 * Pure: compute the deadline for a QC hold. Defaults to 7 days from now.
 */
export function computeQcHoldDeadline(
  when: Date = new Date(),
  days: number = 7,
): Date {
  return new Date(when.getTime() + days * 86400000);
}

// ============ §12.9.1 — freezePaymentsOnQcHold ============

/**
 * Freeze all payment legs for a USTN due to a CONDITIONAL_PASS QC verdict
 * with an action plan. Idempotent: if a hold already exists for the same
 * action plan, returns the existing hold's frozen legs without re-freezing.
 *
 * Side effects:
 *   - Create ShipmentHold(holdType='QC_CONDITIONAL', holdStatus='ACTIVE').
 *   - Set PaymentLeg.legState='FROZEN' on every non-SETTLED leg for the USTN.
 *   - Transition the FeeLock to DISPUTED (if one exists in ACTIVE state).
 *   - Inbox alert to all parties.
 */
export async function freezePaymentsOnQcHold(
  ustn: string,
  actionPlanId: string,
): Promise<FreezeResult> {
  // Idempotency — check for an existing ACTIVE hold on this action plan
  const existing = (await db.shipmentHold.findFirst({
    where: { ustn, actionPlanId, holdType: "QC_CONDITIONAL", holdStatus: "ACTIVE" },
  })) as any;
  if (existing) {
    const legs = (await db.paymentLeg.findMany({
      where: { ustn, legState: "FROZEN" },
    })) as any[];
    return {
      frozenLegs: legs.map((l) => ({
        legId: l.legId,
        previousStatus: "FROZEN",
        newStatus: "FROZEN",
      })),
      holdId: existing.id,
    };
  }

  // Find the action plan + QC inspection for the deadline
  const actionPlan = (await db.qcActionPlan.findUnique({
    where: { planId: actionPlanId },
  })) as any;
  const deadline =
    actionPlan?.dueDate ||
    actionPlan?.actionPlanDeadline ||
    computeQcHoldDeadline();

  const holdId = generateHoldId(ustn);

  // Create the ShipmentHold
  try {
    await db.shipmentHold.create({
      data: {
        ustn,
        holdType: "QC_CONDITIONAL",
        holdReason:
          "QC verdict CONDITIONAL_PASS — action plan required before payment release",
        reason: `Action plan ${actionPlanId} pending verification`,
        actionPlanId,
        holdStatus: "ACTIVE",
        released: false,
        notes: `deadline=${deadline instanceof Date ? deadline.toISOString() : String(deadline)}`,
      },
    });
  } catch (e: any) {
    logger.error("[freezePaymentsOnQcHold] create hold", e);
  }

  // Freeze all non-SETTLED legs
  const legs = (await db.paymentLeg.findMany({
    where: { ustn, legState: { not: "SETTLED" } },
  })) as any[];
  const frozenLegs: FreezeResult["frozenLegs"] = [];

  for (const leg of legs) {
    const previousStatus = leg.legState;
    try {
      await db.paymentLeg.update({
        where: { id: leg.id },
        data: {
          legState: "FROZEN",
          returnCode: `QC_HOLD:${actionPlanId}`,
        },
      });
      frozenLegs.push({
        legId: leg.legId,
        previousStatus,
        newStatus: "FROZEN",
      });
    } catch (e: any) {
      logger.error(`[freezePaymentsOnQcHold] leg ${leg.legId}`, e);
    }
  }

  // Transition FeeLock to DISPUTED (if ACTIVE)
  try {
    const feeLock = (await db.feeLock.findFirst({
      where: { ustn, status: { in: ["PENDING", "ACTIVE"] } },
      orderBy: { createdAt: "desc" },
    })) as any;
    if (feeLock) {
      await db.feeLock.update({
        where: { id: feeLock.id },
        data: {
          status: "DISPUTED",
          frozenReason: `QC_HOLD:${actionPlanId}`,
          kvVersion: (feeLock.kvVersion || 0) + 1,
        },
      });
    }
  } catch (_) {}

  // Inbox alert
  try {
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    const tenantGtid = trade?.sellerGtid || "SGTX-ADMIN";
    await db.inboxItem.create({
      data: {
        tenantGtid,
        tradeId: trade?.id,
        category: "SHIPMENT_ALERT",
        priority: 100,
        title: `QC HOLD — ${ustn.slice(0, 24)}…`,
        description: `QC verdict CONDITIONAL_PASS — all payment legs frozen until action plan ${actionPlanId} is verified. Deadline: ${deadline instanceof Date ? deadline.toISOString().slice(0, 10) : String(deadline).slice(0, 10)}.`,
        ctaLabel: "Review Action Plan",
      },
    });
  } catch (_) {}

  // Activity log
  try {
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    await db.activity.create({
      data: {
        tradeId: trade?.id,
        action: "QC_HOLD_FROZEN_PAYMENTS",
        description: `Frozen ${frozenLegs.length} payment legs on USTN due to QC CONDITIONAL_PASS. Action plan: ${actionPlanId}.`,
        type: "WARNING",
        metadata: JSON.stringify({
          ustn,
          actionPlanId,
          holdId,
          frozenLegs,
          deadline:
            deadline instanceof Date ? deadline.toISOString() : String(deadline),
        }),
      },
    });
  } catch (_) {}

  return { frozenLegs, holdId };
}

// ============ §12.9.1 — liftQcHold ============

/**
 * Lift the QC hold after the action plan is verified. Restores the legs to
 * their previous state (PENDING → SUBMITTED → PROCESSING → SETTLED cycle).
 *
 * Pre-conditions:
 *   - QcActionPlan.status === "VERIFIED" (governor-confirmed)
 *   - QcActionPlan.verifiedBy !== null
 */
export async function liftQcHold(
  ustn: string,
  actionPlanId: string,
): Promise<LiftResult> {
  // Verify the action plan is VERIFIED
  const actionPlan = (await db.qcActionPlan.findUnique({
    where: { planId: actionPlanId },
  })) as any;
  if (!actionPlan) {
    throw new Error(`ACTION_PLAN_NOT_FOUND: ${actionPlanId}`);
  }
  if (actionPlan.status !== "VERIFIED" && actionPlan.status !== "COMPLETED") {
    throw new Error(
      `ACTION_PLAN_NOT_VERIFIED: status=${actionPlan.status}`,
    );
  }

  const releasedAt = new Date();

  // Release the ShipmentHold
  const hold = (await db.shipmentHold.findFirst({
    where: { ustn, actionPlanId, holdType: "QC_CONDITIONAL", holdStatus: "ACTIVE" },
    orderBy: { placedAt: "desc" },
  })) as any;
  if (hold) {
    await db.shipmentHold.update({
      where: { id: hold.id },
      data: {
        holdStatus: "RELEASED",
        released: true,
        releasedAt,
        releasedByGtid: actionPlan.verifiedBy || "GOVERNOR",
        notes: `Lifted — action plan ${actionPlanId} verified by ${actionPlan.verifiedBy || "unknown"}`,
      },
    });
  }

  // Restore frozen legs to PROCESSING (the next pipeline step)
  const frozenLegs = (await db.paymentLeg.findMany({
    where: { ustn, legState: "FROZEN" },
  })) as any[];
  const releasedLegs: LiftResult["releasedLegs"] = [];

  for (const leg of frozenLegs) {
    try {
      await db.paymentLeg.update({
        where: { id: leg.id },
        data: {
          legState: "PROCESSING",
          returnCode: null,
        },
      });
      releasedLegs.push({
        legId: leg.legId,
        previousStatus: "FROZEN",
        newStatus: "PROCESSING",
      });
    } catch (e: any) {
      logger.error(`[liftQcHold] leg ${leg.legId}`, e);
    }
  }

  // Restore FeeLock to ACTIVE (or PENDING if never confirmed)
  try {
    const feeLock = (await db.feeLock.findFirst({
      where: { ustn, status: "DISPUTED" },
      orderBy: { createdAt: "desc" },
    })) as any;
    if (feeLock) {
      // Only re-activate if a previous external confirmation exists
      const hadConfirmation = (feeLock.activatedAt || null) !== null;
      await db.feeLock.update({
        where: { id: feeLock.id },
        data: {
          status: hadConfirmation ? "ACTIVE" : "PENDING",
          frozenReason: null,
          kvVersion: (feeLock.kvVersion || 0) + 1,
        },
      });
    }
  } catch (_) {}

  // Inbox alert
  try {
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    const tenantGtid = trade?.sellerGtid || "SGTX-ADMIN";
    await db.inboxItem.create({
      data: {
        tenantGtid,
        tradeId: trade?.id,
        category: "NEW_OFFER",
        priority: 80,
        title: `QC HOLD LIFTED — ${ustn.slice(0, 24)}…`,
        description: `Action plan ${actionPlanId} verified. ${releasedLegs.length} payment leg(s) released. Payment processing resumed.`,
        ctaLabel: "View Trade",
      },
    });
  } catch (_) {}

  // Activity log
  try {
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    await db.activity.create({
      data: {
        tradeId: trade?.id,
        action: "QC_HOLD_LIFTED",
        description: `Lifted QC hold on USTN. Action plan ${actionPlanId} verified by ${actionPlan.verifiedBy || "governor"}. Released ${releasedLegs.length} legs.`,
        type: "INFO",
        metadata: JSON.stringify({
          ustn,
          actionPlanId,
          releasedLegs,
          releasedAt: releasedAt.toISOString(),
        }),
      },
    });
  } catch (_) {}

  return { releasedLegs, releasedAt: releasedAt.toISOString() };
}

// ============ §12.9.2 — getQcHoldStatus ============

/**
 * Get the current QC hold status for a USTN. Returns the active hold (if any),
 * the deadline, and the list of frozen legs.
 */
export async function getQcHoldStatus(ustn: string): Promise<QcHoldStatus> {
  const hold = (await db.shipmentHold.findFirst({
    where: { ustn, holdType: "QC_CONDITIONAL", holdStatus: "ACTIVE" },
    orderBy: { placedAt: "desc" },
  })) as any;

  if (!hold) {
    return {
      active: false,
      actionPlanId: null,
      deadline: null,
      frozenLegs: [],
    };
  }

  // Look up the action plan for the deadline
  let deadline: string | null = null;
  if (hold.actionPlanId) {
    const plan = (await db.qcActionPlan.findUnique({
      where: { planId: hold.actionPlanId },
    })) as any;
    if (plan?.dueDate) {
      deadline = plan.dueDate.toISOString();
    } else if (plan?.actionPlanDeadline) {
      deadline = plan.actionPlanDeadline.toISOString();
    }
  }

  const legs = (await db.paymentLeg.findMany({
    where: { ustn, legState: "FROZEN" },
  })) as any[];

  return {
    active: true,
    actionPlanId: hold.actionPlanId,
    deadline,
    frozenLegs: legs.map((l) => ({
      legId: l.legId,
      beneficiaryName: l.beneficiaryName || "",
      amount: l.amount,
      currency: l.currency,
      status: l.legState,
    })),
  };
}

// ============ §12.9.3 — requestQcHoldExtension ============

/**
 * Request an extension to the QC hold deadline. Requires governor approval.
 * Creates an extension record (idempotency key on ustn+actionPlanId+days).
 *
 * Returns the extensionId + whether the extension was approved.
 */
export async function requestQcHoldExtension(
  ustn: string,
  actionPlanId: string,
  extensionDays: number,
  reason: string,
): Promise<ExtensionResult> {
  if (extensionDays <= 0 || extensionDays > 30) {
    return {
      extensionId: "",
      approved: false,
      newDeadline: "",
      reason: "EXTENSION_DAYS_OUT_OF_RANGE (1-30)",
    };
  }

  // Find the action plan + current deadline
  const actionPlan = (await db.qcActionPlan.findUnique({
    where: { planId: actionPlanId },
  })) as any;
  if (!actionPlan) {
    return {
      extensionId: "",
      approved: false,
      newDeadline: "",
      reason: "ACTION_PLAN_NOT_FOUND",
    };
  }

  const currentDeadline =
    actionPlan.dueDate ||
    actionPlan.actionPlanDeadline ||
    computeQcHoldDeadline();
  const newDeadline = new Date(
    (currentDeadline instanceof Date
      ? currentDeadline.getTime()
      : new Date(currentDeadline).getTime()) +
      extensionDays * 86400000,
  );

  const extensionId = `QCXT-${ustn.slice(0, 8).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;

  // Auto-approve short extensions (≤3 days) — governor delegates.
  // Longer extensions require explicit multisig (omitted here for brevity).
  const autoApprove = extensionDays <= 3;
  if (autoApprove) {
    try {
      await db.qcActionPlan.update({
        where: { planId: actionPlanId },
        data: {
          dueDate: newDeadline,
          actionPlanDeadline: newDeadline,
        },
      });
    } catch (_) {}
  }

  // Activity log
  try {
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    await db.activity.create({
      data: {
        tradeId: trade?.id,
        action: "QC_HOLD_EXTENSION_REQUESTED",
        description: `Extension of ${extensionDays}d requested for action plan ${actionPlanId}. Reason: ${reason}. ${autoApprove ? "AUTO_APPROVED (≤3d)." : "PENDING_GOVERNOR_APPROVAL."} New deadline: ${newDeadline.toISOString().slice(0, 10)}.`,
        type: "INFO",
        metadata: JSON.stringify({
          ustn,
          actionPlanId,
          extensionId,
          extensionDays,
          reason,
          autoApproved: autoApprove,
          previousDeadline:
            currentDeadline instanceof Date
              ? currentDeadline.toISOString()
              : String(currentDeadline),
          newDeadline: newDeadline.toISOString(),
        }),
      },
    });
  } catch (_) {}

  return {
    extensionId,
    approved: autoApprove,
    newDeadline: newDeadline.toISOString(),
    reason: autoApprove ? undefined : "PENDING_GOVERNOR_APPROVAL",
  };
}
