// SGTX Part 6.9 — Late Payment & Automatic Late Fees (A4)
//
// Commission Payment Terms (Part 6.9.1):
//   Fee due within 7 days of contract lock OR within 24 hours of loading confirmation
//   (whichever earlier).
//
// Late Fee Calculation (Part 6.9.2, A4):
//   0.1% of unpaid fee per full day of delay, capped at 100% of original fee.
//   Daily cron job checks fee_payment_requests where status='PENDING' and due_date < NOW().
//   Updates fee_payment_requests.late_fee_accrued + adds record to late_fee_events.
//   Seller receives Smart Inbox reminders (priority 90) on first day, then daily.
//   Late fee collected at same time as original fee (PSP split includes both).
//
// Container Loading Trigger (Part 6.9.3):
//   If container loaded before 7-day deadline:
//     - System recalculates due_date = loading confirmation + 24 hours
//     - Sends Smart Inbox alert

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session).
const db = (freshDb ?? _db) as typeof _db;

// Defensive field-support check: if the cached PrismaClient doesn't yet know
// about newly-added columns (originalDueDate, lateFeeCapReached, lateFeePaidAt),
// filter them out of write payloads. After a dev-server restart, all fields
// are persisted normally.
const _fprFields: Set<string> = (() => {
  try {
    return new Set(Object.keys((db.feePaymentRequest as any)?.fields ?? {}));
  } catch {
    return new Set<string>();
  }
})();
function pickFields(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (_fprFields.has(k) || v === undefined) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

export const LATE_FEE_DAILY_RATE_PCT = 0.001;   // 0.1% per day
export const LATE_FEE_CAP_PCT = 1.0;             // 100% of original fee
export const CONTRACT_LOCK_GRACE_DAYS = 7;       // Part 6.9.1 — 7 days from contract lock
export const LOADING_CONFIRMATION_GRACE_HOURS = 24;  // Part 6.9.1 — 24 hours from loading confirmation

export interface LateFeeCalculationResult {
  feePaymentRequestId: string;
  ustn: string;
  originalAmount: number;
  daysLate: number;
  lateFeeAccrued: number;
  totalDue: number;
  capReached: boolean;
  recalculated: boolean;
}

// ============ 6.9.3: Recalculate due date on loading confirmation ============
// When the container is loaded before the 7-day deadline, the due date becomes
// loading_confirmation + 24 hours.
export async function recalculateDueDateOnLoading(ustn: string): Promise<{ ok: true; newDueDate: string | null; recalculated: boolean } | { ok: false; reason: string }> {
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: {
      shipments: true,
      timeline: { where: { label: { contains: "CONTAINER LOADED" } } },
    },
  });
  if (!trade) return { ok: false, reason: `Trade not found for USTN ${ustn}` };

  // Find loading confirmation: either a completed TimelineEvent labelled "Milestone: CONTAINER LOADED"
  // or any shipment with status >= LOADED.
  const loadingEvent = (trade.timeline ?? []).find(t => t.completed && t.completedAt);
  const loadingShipment = (trade.shipments ?? []).find(s =>
    ["LOADED", "DEPARTED", "IN_TRANSIT", "ARRIVED", "RELEASED", "DELIVERED"].includes(s.status)
  );
  const loadingConfirmedAt = loadingEvent?.completedAt
    ?? (loadingShipment?.departedAt ?? null);
  if (!loadingConfirmedAt) {
    return { ok: true, newDueDate: null, recalculated: false };
  }

  const newDueDate = new Date(loadingConfirmedAt.getTime() + LOADING_CONFIRMATION_GRACE_HOURS * 3600 * 1000);

  // Update all pending FeePaymentRequests for this USTN
  const result = await db.feePaymentRequest.updateMany({
    where: { ustn, status: "PENDING" },
    data: { dueDate: newDueDate },
  });

  if (result.count > 0) {
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.sellerGtid,
        category: "SHIPMENT_ALERT",
        priority: 85,
        title: `Container loaded — fee due in 24h (${ustn.slice(0, 24)}…)`,
        description: `Container loaded on ${loadingConfirmedAt.toISOString()}. SGTX fee now due within 24 hours (by ${newDueDate.toISOString()}). Late fees apply after this deadline.`,
        ctaLabel: "Pay Now",
      },
    });
  }

  return { ok: true, newDueDate: newDueDate.toISOString(), recalculated: result.count > 0 };
}

// ============ 6.9.2: Calculate late fees for one FeePaymentRequest ============
export async function calculateLateFees(feePaymentRequestId: string, asOf: Date = new Date()): Promise<LateFeeCalculationResult | null> {
  const fpr = await db.feePaymentRequest.findUnique({ where: { id: feePaymentRequestId } });
  if (!fpr) return null;
  if (fpr.status === "PAID") {
    return {
      feePaymentRequestId: fpr.id,
      ustn: fpr.ustn,
      originalAmount: fpr.totalAmountUsd,
      daysLate: 0,
      lateFeeAccrued: fpr.lateFeeAccrued,
      totalDue: fpr.totalAmountUsd + fpr.lateFeeAccrued,
      capReached: fpr.lateFeeCapReached,
      recalculated: false,
    };
  }
  if (!fpr.dueDate) {
    return {
      feePaymentRequestId: fpr.id,
      ustn: fpr.ustn,
      originalAmount: fpr.totalAmountUsd,
      daysLate: 0,
      lateFeeAccrued: 0,
      totalDue: fpr.totalAmountUsd,
      capReached: false,
      recalculated: false,
    };
  }

  const dueDate = new Date(fpr.dueDate);
  if (asOf <= dueDate) {
    return {
      feePaymentRequestId: fpr.id,
      ustn: fpr.ustn,
      originalAmount: fpr.totalAmountUsd,
      daysLate: 0,
      lateFeeAccrued: fpr.lateFeeAccrued,
      totalDue: fpr.totalAmountUsd + fpr.lateFeeAccrued,
      capReached: fpr.lateFeeCapReached,
      recalculated: false,
    };
  }

  // Full days of delay (Part 6.9.2 — "per full day of delay")
  const msLate = asOf.getTime() - dueDate.getTime();
  const daysLate = Math.floor(msLate / (86400 * 1000));

  // 0.1% per day, capped at 100%
  const capAmount = fpr.totalAmountUsd * LATE_FEE_CAP_PCT;
  const rawLateFee = fpr.totalAmountUsd * LATE_FEE_DAILY_RATE_PCT * daysLate;
  const lateFeeAccrued = Math.min(rawLateFee, capAmount);
  const capReached = rawLateFee >= capAmount;

  return {
    feePaymentRequestId: fpr.id,
    ustn: fpr.ustn,
    originalAmount: fpr.totalAmountUsd,
    daysLate,
    lateFeeAccrued: Math.round(lateFeeAccrued * 100) / 100,
    totalDue: Math.round((fpr.totalAmountUsd + lateFeeAccrued) * 100) / 100,
    capReached,
    recalculated: false,
  };
}

// ============ 6.9.2: Daily late-fee cron ============
// For every FeePaymentRequest where status='PENDING' and due_date < NOW(),
// accrue 0.1% per day late fee, persist a LateFeeEvent, send Smart Inbox.
export async function runLateFeeCron(asOf: Date = new Date()): Promise<{
  processed: number;
  eventsCreated: number;
  capReachedCount: number;
  details: LateFeeCalculationResult[];
}> {
  const overdue = await db.feePaymentRequest.findMany({
    where: {
      status: "PENDING",
      dueDate: { lt: asOf },
    },
  });

  const details: LateFeeCalculationResult[] = [];
  let eventsCreated = 0;
  let capReachedCount = 0;

  for (const fpr of overdue) {
    const calc = await calculateLateFees(fpr.id, asOf);
    if (!calc || calc.daysLate === 0) continue;

    // Idempotent: only create a LateFeeEvent for the current day if not already present
    const existing = await db.lateFeeEvent.findFirst({
      where: {
        feePaymentRequestId: fpr.id,
        daysLate: calc.daysLate,
      },
    });
    if (!existing) {
      await db.lateFeeEvent.create({
        data: {
          feePaymentRequestId: fpr.id,
          ustn: fpr.ustn,
          daysLate: calc.daysLate,
          lateFeeAmount: calc.lateFeeAccrued - fpr.lateFeeAccrued,
          totalDue: calc.totalDue,
        },
      });
      eventsCreated++;
    }

    // Update FeePaymentRequest — pickFields filters lateFeeCapReached if the
    // cached PrismaClient doesn't yet have that column.
    await db.feePaymentRequest.update({
      where: { id: fpr.id },
      data: pickFields({
        lateFeeAccrued: calc.lateFeeAccrued,
        lateFeeCapReached: calc.capReached,
      }),
    });

    if (calc.capReached) capReachedCount++;
    details.push(calc);

    // Smart Inbox reminder (Part 6.9.2 — priority 90 on first day, daily thereafter)
    const isFirstDay = calc.daysLate === 1;
    await db.inboxItem.create({
      data: {
        tenantGtid: fpr.payerGtid,
        category: "COMPLIANCE",
        priority: 90,
        title: `${isFirstDay ? "🚨 Payment overdue" : `Payment still overdue (day ${calc.daysLate})`} — ${fpr.ustn.slice(0, 24)}…`,
        description:
          `SGTX fee of $${fpr.totalAmountUsd.toFixed(2)} for ${fpr.ustn} was due ${fpr.dueDate?.toISOString()}. ` +
          `${calc.daysLate} day(s) late. Late fee accrued: $${calc.lateFeeAccrued.toFixed(2)} (${(LATE_FEE_DAILY_RATE_PCT * 100).toFixed(2)}%/day, capped at 100%). ` +
          `Total now due: $${calc.totalDue.toFixed(2)}${calc.capReached ? " (CAP REACHED)" : ""}. ` +
          `Late fee will be collected alongside the original fee at payment.`,
        ctaLabel: "Pay Now",
      },
    });
  }

  return {
    processed: overdue.length,
    eventsCreated,
    capReachedCount,
    details,
  };
}

// ============ 6.9.2: When seller eventually pays — include late fee in split ============
// Returns the augmented total (original + late fee) for inclusion in PSP split.
export async function computeTotalDueWithLateFees(feePaymentRequestId: string): Promise<{
  originalAmount: number;
  lateFeeAccrued: number;
  totalDue: number;
  capReached: boolean;
  daysLate: number;
} | null> {
  const calc = await calculateLateFees(feePaymentRequestId);
  if (!calc) return null;
  return {
    originalAmount: calc.originalAmount,
    lateFeeAccrued: calc.lateFeeAccrued,
    totalDue: calc.totalDue,
    capReached: calc.capReached,
    daysLate: calc.daysLate,
  };
}

// ============ 6.9.1: Initialize due date on contract lock ============
// Fee due within 7 days of contract lock OR 24h of loading (whichever earlier).
export async function initializeDueDateOnContractLock(ustn: string): Promise<{ ok: true; dueDate: string; count: number } | { ok: false; reason: string }> {
  const trade = await db.trade.findUnique({ where: { ustn } });
  if (!trade) return { ok: false, reason: `Trade not found for USTN ${ustn}` };

  const dueDate = new Date(Date.now() + CONTRACT_LOCK_GRACE_DAYS * 86400 * 1000);
  const result = await db.feePaymentRequest.updateMany({
    where: { ustn, dueDate: null },
    data: pickFields({ dueDate, originalDueDate: dueDate }),
  });

  return { ok: true, dueDate: dueDate.toISOString(), count: result.count };
}
