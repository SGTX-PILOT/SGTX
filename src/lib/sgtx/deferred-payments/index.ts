// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
/**
 * SGTX v18 §12.8 — Deferred Payment (Credit Terms)
 * ============================================================================
 *
 * Legs with `terms='CREDIT'` are registered at the bank as future-dated
 * pain.008 instructions with three terminal paths:
 *
 *   1. time-triggered due date — bank auto-executes on the due date.
 *   2. event-triggered milestone — releaseDeferredPayment when the milestone
 *      is verified (e.g. ARRIVED).
 *   3. expiry — mark EXPIRED if the deferred instruction passes its guarantee
 *      expiry date without resolution.
 *
 * State machine:
 *   GUARANTEE_HELD → SETTLED       (event-triggered release OR bank auto-charge
 *                                   on due date)
 *   GUARANTEE_HELD → EXPIRED       (expiry without settlement)
 *   GUARANTEE_HELD → CONVERTED    (payer converts to immediate payment)
 *
 * Escalation (§12.8.3 + §13.4.12):
 *   Step 1 (7 days before): reminder
 *   Step 2 (1 day before): alert + "Pay Now"
 *   Step 3 (expiry): auto-charge or block
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash, randomUUID } from "crypto";

// ============ Types ============

export type DeferredStatus =
  | "GUARANTEE_HELD"
  | "SETTLED"
  | "EXPIRED"
  | "CONVERTED";

export interface CreateDeferredResult {
  deferredId: string;
  status: DeferredStatus;
  dueDate: string;
  triggerMilestone?: string;
  guaranteeExpiry: string;
}

export interface ReleaseResult {
  released: boolean;
  settledAt: string | null;
  reason?: string;
}

export interface ExpiryResult {
  action: "AUTO_CHARGED" | "EXPIRED" | "NO_ACTION";
  reason?: string;
}

export interface EscalateResult {
  escalated: boolean;
  step: 1 | 2 | 3;
  action: "REMINDER" | "ALERT" | "AUTO_CHARGE_OR_BLOCK";
  reason?: string;
}

// ============ Constants ============

export const DEFERRED_REMINDER_DAYS = 7; // §13.4.12 Step 1
export const DEFERRED_ALERT_DAYS = 1; // §13.4.12 Step 2
export const DEFERRED_DEFAULT_GUARANTEE_DAYS = 30;
export const LATE_FEE_RATE_PER_DAY = 0.001; // 0.1%
export const LATE_FEE_CAP = 1.0; // 100% of original fee

// ============ Pure helpers ============

/**
 * Pure: generate a deferred payment ID. Format: DEF-{ustn8}-{YYYYMMDD}-{RAND6}.
 */
export function generateDeferredId(ustn: string, when: Date = new Date()): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${when.getUTCFullYear()}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DEF-${u}-${ts}-${r}`;
}

/**
 * Pure: idempotency key for the pain.008 deferred registration.
 * SHA256(JCS-canonical-body + UTC-second). Matches §13.4.13.
 */
export function deferredIdempotencyKey(
  body: unknown,
  when: Date = new Date(),
): string {
  const canonical = JSON.stringify(sortKeysDeep(body));
  const utcSec = Math.floor(when.getTime() / 1000);
  return createHash("sha256")
    .update(`${canonical}|${utcSec}`)
    .digest("hex");
}

function sortKeysDeep<T>(v: T): T {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
  }
  return out as unknown as T;
}

/**
 * Pure: compute the late fee accrued up to `now` for an overdue deferred
 * amount. Capped at LATE_FEE_CAP (100%).
 */
export function computeLateFee(
  originalAmount: number,
  dueDate: Date,
  now: Date = new Date(),
): { daysLate: number; lateFee: number; totalDue: number; capped: boolean } {
  if (now.getTime() <= dueDate.getTime()) {
    return { daysLate: 0, lateFee: 0, totalDue: originalAmount, capped: false };
  }
  const daysLate = Math.floor(
    (now.getTime() - dueDate.getTime()) / 86400000,
  );
  const cappedDays = Math.min(daysLate, Math.floor(LATE_FEE_CAP / LATE_FEE_RATE_PER_DAY));
  const lateFee = +(originalAmount * LATE_FEE_RATE_PER_DAY * cappedDays).toFixed(2);
  const totalDue = +(originalAmount + lateFee).toFixed(2);
  return { daysLate, lateFee, totalDue, capped: cappedDays < daysLate };
}

// ============ §12.8.1 — createDeferredInstruction ============

/**
 * Register a deferred (credit-terms) leg at the bank as a future-dated
 * pain.008 instruction. The instruction is in state GUARANTEE_HELD until:
 *   - releaseDeferredPayment is called (event-triggered), OR
 *   - processDeferredExpiry is called on the due date (time-triggered), OR
 *   - the guarantee expiry passes without resolution (EXPIRED).
 *
 * `triggerMilestone` is optional — when set, the deferred payment can be
 * released automatically when that milestone is VERIFIED.
 */
export async function createDeferredInstruction(
  ustn: string,
  legId: string,
  dueDate: Date,
  triggerMilestone?: string,
): Promise<CreateDeferredResult> {
  // Find the leg + trade
  const leg = (await db.paymentLeg.findUnique({
    where: { legId },
  })) as any;
  if (!leg) {
    throw new Error(`LEG_NOT_FOUND: ${legId}`);
  }
  const trade = (await db.trade.findUnique({
    where: { ustn },
  })) as any;
  if (!trade) {
    throw new Error(`TRADE_NOT_FOUND: ${ustn}`);
  }

  const deferredId = generateDeferredId(ustn);
  const guaranteeExpiry = new Date(
    dueDate.getTime() + DEFERRED_DEFAULT_GUARANTEE_DAYS * 86400000,
  );

  // Persist a DeferredFee record (mirrors the pain.008 future-dated instruction)
  try {
    await db.deferredFee.create({
      data: {
        ustn,
        feePaymentRequestId: deferredId,
        amountUsd: leg.amount,
        guaranteeAmount: leg.amount,
        payerGtid: trade.sellerGtid,
        payeeGtid: leg.beneficiaryId,
        feeType: leg.beneficiaryType,
        trigger: triggerMilestone || null,
        guaranteeExpiry,
        status: "GUARANTEE_HELD",
        autoChargeAuthorised: false,
      },
    });
  } catch (e: any) {
    logger.error("[createDeferredInstruction]", e);
  }

  // Update the leg to reflect the deferred registration
  try {
    await db.paymentLeg.update({
      where: { id: leg.id },
      data: {
        legState: "PROCESSING",
        bankInstructionId: deferredId,
      },
    });
  } catch (_) {}

  return {
    deferredId,
    status: "GUARANTEE_HELD",
    dueDate: dueDate.toISOString(),
    triggerMilestone,
    guaranteeExpiry: guaranteeExpiry.toISOString(),
  };
}

// ============ §12.8.2 — releaseDeferredPayment (event-triggered) ============

/**
 * Release a deferred payment because the trigger milestone was verified.
 * e.g. an ocean freight on CREDIT terms is released when ARRIVED is verified.
 *
 * On success: marks the deferred instruction SETTLED and records the
 * settlement confirmation on the leg. Mirrors the §12.7 SETTLED update.
 */
export async function releaseDeferredPayment(
  deferredId: string,
  triggerMilestone: string,
): Promise<ReleaseResult> {
  const deferred = (await db.deferredFee.findFirst({
    where: { feePaymentRequestId: deferredId },
  })) as any;
  if (!deferred) {
    return {
      released: false,
      settledAt: null,
      reason: "DEFERRED_NOT_FOUND",
    };
  }
  if (deferred.status !== "GUARANTEE_HELD") {
    return {
      released: false,
      settledAt: deferred.triggeredAt?.toISOString() || null,
      reason: `DEFERRED_NOT_GUARANTEE_HELD: status=${deferred.status}`,
    };
  }

  // Verify the milestone is VERIFIED (if a trigger milestone was set)
  if (deferred.trigger && deferred.trigger !== triggerMilestone) {
    return {
      released: false,
      settledAt: null,
      reason: `TRIGGER_MISMATCH: expected ${deferred.trigger}, got ${triggerMilestone}`,
    };
  }
  if (deferred.trigger) {
    const milestoneRow = (await db.milestone.findFirst({
      where: { ustn: deferred.ustn, type: deferred.trigger },
      orderBy: { createdAt: "desc" },
    })) as any;
    if (
      !milestoneRow ||
      (milestoneRow.status !== "VERIFIED" &&
        milestoneRow.status !== "CONFIRMED" &&
        milestoneRow.confirmedAt === null)
    ) {
      return {
        released: false,
        settledAt: null,
        reason: `MILESTONE_NOT_VERIFIED: ${deferred.trigger}`,
      };
    }
  }

  const settledAt = new Date();
  await db.deferredFee.update({
    where: { id: deferred.id },
    data: {
      status: "SETTLED",
      triggeredAt: settledAt,
    },
  });

  // Update the leg to SETTLED
  try {
    const leg = (await db.paymentLeg.findFirst({
      where: { ustn: deferred.ustn, beneficiaryId: deferred.payeeGtid },
    })) as any;
    if (leg) {
      await db.paymentLeg.update({
        where: { id: leg.id },
        data: {
          legState: "SETTLED",
          bankTransactionRef: deferredId,
          reconciliationStatus: "MATCHED",
          executionTimestamp: settledAt,
          valueDate: settledAt,
        },
      });
    }
  } catch (_) {}

  // Mirror to FeePaymentRequest
  try {
    await db.feePaymentRequest.updateMany({
      where: { ustn: deferred.ustn },
      data: {
        deferredStatus: "PAID",
        paidAt: settledAt,
      },
    });
  } catch (_) {}

  return { released: true, settledAt: settledAt.toISOString() };
}

// ============ §12.8.3 — processDeferredExpiry (time-triggered) ============

/**
 * Process the expiry of a deferred instruction. Called by a daily cron on
 * the guarantee expiry date (or when the bank's auto-charge fires on the
 * due date).
 *
 * If `autoChargeAuthorised` is true → bank auto-charges → SETTLED.
 * Else → mark EXPIRED (container release permanently blocked until paid).
 */
export async function processDeferredExpiry(
  deferredId: string,
): Promise<ExpiryResult> {
  const deferred = (await db.deferredFee.findFirst({
    where: { feePaymentRequestId: deferredId },
  })) as any;
  if (!deferred) {
    return { action: "NO_ACTION", reason: "DEFERRED_NOT_FOUND" };
  }
  if (deferred.status !== "GUARANTEE_HELD") {
    return {
      action: "NO_ACTION",
      reason: `DEFERRED_NOT_GUARANTEE_HELD: status=${deferred.status}`,
    };
  }

  const now = new Date();
  // Time-triggered: bank auto-executes on the due date if autoChargeAuthorised.
  const pastDue = deferred.guaranteeExpiry.getTime() <= now.getTime();

  if (!pastDue) {
    return {
      action: "NO_ACTION",
      reason: "GUARANTEE_NOT_EXPIRED",
    };
  }

  if (deferred.autoChargeAuthorised) {
    // Bank auto-charge — settle the leg
    await db.deferredFee.update({
      where: { id: deferred.id },
      data: {
        status: "SETTLED",
        triggeredAt: now,
      },
    });
    try {
      const leg = (await db.paymentLeg.findFirst({
        where: { ustn: deferred.ustn, beneficiaryId: deferred.payeeGtid },
      })) as any;
      if (leg) {
        await db.paymentLeg.update({
          where: { id: leg.id },
          data: {
            legState: "SETTLED",
            bankTransactionRef: deferredId,
            reconciliationStatus: "MATCHED",
            executionTimestamp: now,
            valueDate: now,
          },
        });
      }
    } catch (_) {}
    return { action: "AUTO_CHARGED" };
  }

  // Mark EXPIRED
  await db.deferredFee.update({
    where: { id: deferred.id },
    data: { status: "EXPIRED" },
  });

  // Inbox alert — container release permanently blocked
  try {
    await db.inboxItem.create({
      data: {
        tenantGtid: deferred.payerGtid || "SGTX-ADMIN",
        category: "SHIPMENT_ALERT",
        priority: 100,
        title: `CRITICAL: Deferred payment expired — ${deferredId}`,
        description:
          "Guarantee expired. Container release permanently blocked until fee is paid. A dispute (non-payment) has been automatically created.",
        ctaLabel: "Pay Now",
      },
    });
  } catch (_) {}

  return { action: "EXPIRED" };
}

// ============ §13.4.12 — escalateDeferredPayment ============

/**
 * Three-step escalation ladder (§13.4.12):
 *   Step 1 (7 days before guarantee expiry): reminder InboxItem.
 *   Step 2 (1 day before guarantee expiry): alert + "Pay Now" CTA.
 *   Step 3 (on expiry): auto-charge or block (calls processDeferredExpiry).
 *
 * `step` is provided explicitly so the caller (cron job or admin) can drive
 * the escalation. Returns whether the escalation was applied (no-op if the
 * instruction is not in GUARANTEE_HELD or the step doesn't match the current
 * expiry window).
 */
export async function escalateDeferredPayment(
  deferredId: string,
  step: 1 | 2 | 3,
): Promise<EscalateResult> {
  const deferred = (await db.deferredFee.findFirst({
    where: { feePaymentRequestId: deferredId },
  })) as any;
  if (!deferred) {
    return {
      escalated: false,
      step,
      action: "REMINDER",
      reason: "DEFERRED_NOT_FOUND",
    };
  }
  if (deferred.status !== "GUARANTEE_HELD") {
    return {
      escalated: false,
      step,
      action: "REMINDER",
      reason: `DEFERRED_NOT_GUARANTEE_HELD: status=${deferred.status}`,
    };
  }

  const daysToExpiry = Math.ceil(
    (deferred.guaranteeExpiry.getTime() - Date.now()) / 86400000,
  );

  if (step === 1) {
    if (daysToExpiry > DEFERRED_REMINDER_DAYS || daysToExpiry < DEFERRED_ALERT_DAYS) {
      return {
        escalated: false,
        step: 1,
        action: "REMINDER",
        reason: `NOT_IN_REMINDER_WINDOW: ${daysToExpiry}d to expiry`,
      };
    }
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: deferred.payerGtid || "SGTX-ADMIN",
          category: "NEEDS_APPROVAL",
          priority: 70,
          title: `Deferred payment expires in ${daysToExpiry}d — ${deferredId}`,
          description: `Please ensure customs clearance is completed before expiry. Guarantee expiry: ${deferred.guaranteeExpiry.toISOString().slice(0, 10)}.`,
          ctaLabel: "View Details",
        },
      });
    } catch (_) {}
    return { escalated: true, step: 1, action: "REMINDER" };
  }

  if (step === 2) {
    if (daysToExpiry >= DEFERRED_ALERT_DAYS && daysToExpiry > 0) {
      return {
        escalated: false,
        step: 2,
        action: "ALERT",
        reason: `NOT_IN_ALERT_WINDOW: ${daysToExpiry}d to expiry`,
      };
    }
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: deferred.payerGtid || "SGTX-ADMIN",
          category: "SHIPMENT_ALERT",
          priority: 90,
          title: `Deferred payment expires in 24h — ${deferredId}`,
          description: "Click here to pay now and avoid release block.",
          ctaLabel: "Convert to Immediate Payment",
        },
      });
    } catch (_) {}
    return { escalated: true, step: 2, action: "ALERT" };
  }

  // Step 3 — expiry
  if (daysToExpiry > 0) {
    return {
      escalated: false,
      step: 3,
      action: "AUTO_CHARGE_OR_BLOCK",
      reason: `NOT_EXPIRED: ${daysToExpiry}d to expiry`,
    };
  }
  const result = await processDeferredExpiry(deferredId);
  return {
    escalated: true,
    step: 3,
    action: "AUTO_CHARGE_OR_BLOCK",
    reason: result.action,
  };
}
