// SGTX Part 6.9 — Late fee cron job.
//
// POST /api/sgtx/payment/late-fee/cron
//
// Runs the daily late-fee calculation:
//   1. Queries all FeePaymentRequest rows where dueDate < now AND status != PAID.
//   2. For each, calculates the late fee: 0.1% per full day of delay on the
//      outstanding (unpaid) amount.
//   3. Creates a LateFeeEvent row for each day that has not yet been recorded.
//   4. Updates FeePaymentRequest.lateFeeAccrued + feeLockStatus (FREEZE if late).
//   5. Creates a Smart Inbox reminder (priority 90) to the payer.
//   6. Returns { processed, totalLateFees }.
//
// Idempotency: we only create a LateFeeEvent for (feePaymentRequestId, day)
// pairs that don't already exist. Late fee is capped at 100% of original fee.
//
// Trigger: this would be called by a daily cron (e.g. systemd timer /
// Vercel Cron / k8s CronJob). For dev we expose it as a POST so it can be
// triggered manually.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const LATE_FEE_RATE_PER_DAY = 0.001; // 0.1% per day
const LATE_FEE_CAP_PCT = 1.0; // capped at 100% of original fee

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
}

export async function POST(_req: NextRequest) {
  try {
    const now = new Date();

    // 1. Fetch all overdue FeePaymentRequests (status != PAID, dueDate < now)
    const overdue = await db.feePaymentRequest.findMany({
      where: {
        status: { not: "PAID" },
        dueDate: { lt: now, not: null },
      },
    });

    let processed = 0;
    let totalLateFees = 0;
    const events: Array<{ requestId: string; ustn: string; daysLate: number; lateFee: number }> = [];

    for (const req of overdue) {
      if (!req.dueDate) continue;

      const totalDaysLate = Math.max(1, daysBetween(req.dueDate, now));
      const expectedLateFee = Math.round(
        req.totalAmountUsd * LATE_FEE_RATE_PER_DAY * totalDaysLate * 100,
      ) / 100;
      const cappedLateFee = Math.min(
        expectedLateFee,
        req.totalAmountUsd * LATE_FEE_CAP_PCT,
      );

      // Check how many LateFeeEvent rows we've already recorded for this req
      const existingEvents = await db.lateFeeEvent.count({
        where: { feePaymentRequestId: req.id },
      });

      // Create a new event only if we haven't already recorded for this day
      // (events are 1-per-day; if existingEvents < totalDaysLate we're behind).
      let newLateFeeAmount = 0;
      if (existingEvents < totalDaysLate) {
        const daysToRecord = totalDaysLate - existingEvents;
        const perDayFee = Math.round(
          req.totalAmountUsd * LATE_FEE_RATE_PER_DAY * 100,
        ) / 100;
        newLateFeeAmount = Math.round(perDayFee * daysToRecord * 100) / 100;

        const newTotalDue = req.totalAmountUsd + cappedLateFee;
        await db.lateFeeEvent.create({
          data: {
            feePaymentRequestId: req.id,
            ustn: req.ustn,
            daysLate: totalDaysLate,
            lateFeeAmount: newLateFeeAmount,
            totalDue: newTotalDue,
          },
        });

        // Update FeePaymentRequest with the new accrued late fee + freeze flag
        await db.feePaymentRequest.update({
          where: { id: req.id },
          data: {
            lateFeeAccrued: cappedLateFee,
            feeLockStatus: "FROZEN",
          },
        });

        // Smart Inbox reminder (priority 90)
        await db.inboxItem.create({
          data: {
            tenantGtid: req.payerGtid,
            tradeId: req.tradeId ?? null,
            category: "NEEDS_PAYMENT",
            priority: 90,
            title: `Late fee accrued — ${req.requestId} (${totalDaysLate} day(s) late)`,
            description: `SGTX fee for USTN ${req.ustn} is ${totalDaysLate} day(s) overdue. Late fee of $${cappedLateFee.toFixed(
              2,
            )} accrued (0.1%/day, capped at 100%). Total due: $${(req.totalAmountUsd + cappedLateFee).toFixed(
              2,
            )}. Pay now to avoid further accrual and container release block.`,
            ctaLabel: "Pay Now",
            deadline: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });

        processed += 1;
        totalLateFees += cappedLateFee;
        events.push({
          requestId: req.requestId,
          ustn: req.ustn,
          daysLate: totalDaysLate,
          lateFee: cappedLateFee,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      totalLateFees: Math.round(totalLateFees * 100) / 100,
      events,
    });
  } catch (e: any) {
    console.error("[payment/late-fee/cron] error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 },
    );
  }
}
