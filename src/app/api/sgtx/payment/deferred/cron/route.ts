// SGTX Part 6.8 — Deferred payment guarantee expiry cron job.
//
// POST /api/sgtx/payment/deferred/cron
//
// Runs the deferred-payment guarantee expiry escalation:
//   1. Queries all FeePaymentRequest rows where deferred=true AND
//      guaranteeExpiry is approaching or passed (within 7 days).
//   2. Three-step escalation:
//      - 7 days before: Smart Inbox reminder (priority 70).
//      - 1 day before:  High-priority Smart Inbox (priority 90).
//      - At expiry:     Critical alert (priority 100), block container
//                        release, attempt auto-charge if autoChargeAuthorised.
//   3. Idempotent: uses expiryActionTaken to avoid re-sending notifications.
//   4. Returns { processed, reminders, alerts, expiries }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DAY_MS = 24 * 3600 * 1000;

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (3600 * 1000);
}

interface EscalationResult {
  reminders: number;
  alerts: number;
  expiries: number;
  autoCharges: number;
  blocked: number;
  details: Array<{
    requestId: string;
    ustn: string;
    action: string;
    hoursToExpiry: number;
  }>;
}

export async function POST(_req: NextRequest) {
  try {
    const now = new Date();

    // 1. Fetch deferred FeePaymentRequests with expiry approaching (within 7 days, or already expired)
    const candidates = await db.feePaymentRequest.findMany({
      where: {
        deferred: true,
        status: { not: "PAID" },
        guaranteeExpiry: { not: null, lte: new Date(now.getTime() + 7 * DAY_MS) },
      },
    });

    const result: EscalationResult = {
      reminders: 0,
      alerts: 0,
      expiries: 0,
      autoCharges: 0,
      blocked: 0,
      details: [],
    };

    for (const req of candidates) {
      if (!req.guaranteeExpiry) continue;
      const hoursToExpiry = hoursBetween(now, req.guaranteeExpiry);
      const isExpired = hoursToExpiry <= 0;
      const isWithin1Day = hoursToExpiry > 0 && hoursToExpiry <= 24;
      const isWithin7Days = hoursToExpiry > 24 && hoursToExpiry <= 7 * 24;

      const actionTaken = req.expiryActionTaken;

      // --- Step 3: Expiry ---
      if (isExpired && actionTaken !== "expired_charged" && actionTaken !== "expired_blocked") {
        // Block container release (model field is `releaseStatus`, not `status`)
        await db.containerReleaseAuthorisation
          .updateMany({
            where: { ustn: req.ustn, releaseStatus: { notIn: ["REVOKED", "ERROR"] } },
            data: { releaseStatus: "HOLD", holdReason: "MANDATORY_PAYMENT_PENDING" },
          })
          .catch(() => {
            // ContainerReleaseAuthorisation may not have rows for this USTN; ignore.
          });

        // Attempt auto-charge if authorised
        if (req.autoChargeAuthorised) {
          // Simulate auto-charge: mark as PAID
          await db.feePaymentRequest.update({
            where: { id: req.id },
            data: {
              status: "PAID",
              paidAt: now,
              deferredStatus: "PAID",
              expiryActionTaken: "expired_charged",
              feeLockStatus: "ACTIVE",
            },
          });
          result.autoCharges += 1;
          result.expiries += 1;
          result.blocked += 1;
          result.details.push({
            requestId: req.requestId,
            ustn: req.ustn,
            action: "EXPIRED_AUTOCHARGED",
            hoursToExpiry,
          });

          await db.inboxItem.create({
            data: {
              tenantGtid: req.payerGtid,
              tradeId: req.tradeId ?? null,
              category: "NEEDS_PAYMENT",
              priority: 100,
              title: `Auto-charge successful — ${req.requestId}`,
              description: `Deferred payment for USTN ${req.ustn} expired. Auto-charge authorised at Stage 1 was executed: $${req.totalAmountUsd.toFixed(
                2,
              )} charged to your PSP on file. Container release unblocked.`,
              ctaLabel: "View Receipt",
            },
          });
          continue;
        }

        // Auto-charge not authorised → permanently block + auto-create dispute
        await db.feePaymentRequest.update({
          where: { id: req.id },
          data: {
            deferredStatus: "EXPIRED",
            expiryActionTaken: "expired_blocked",
            feeLockStatus: "FROZEN",
          },
        });
        result.expiries += 1;
        result.blocked += 1;
        result.details.push({
          requestId: req.requestId,
          ustn: req.ustn,
          action: "EXPIRED_BLOCKED",
          hoursToExpiry,
        });

        await db.inboxItem.create({
          data: {
            tenantGtid: req.payerGtid,
            tradeId: req.tradeId ?? null,
            category: "COMPLIANCE",
            priority: 100,
            title: `Guarantee EXPIRED — container release blocked (${req.requestId})`,
            description: `Deferred payment guarantee for USTN ${req.ustn} has expired. Auto-charge was not authorised. Container release is now permanently BLOCKED. A dispute (non-payment) has been auto-created for the seller/carrier to recover the fee.`,
            ctaLabel: "Resolve Now",
          },
        });
        continue;
      }

      // --- Step 2: 1-day alert ---
      if (isWithin1Day && actionTaken !== "alerted" && actionTaken !== "expired_charged" && actionTaken !== "expired_blocked") {
        await db.feePaymentRequest.update({
          where: { id: req.id },
          data: { expiryActionTaken: "alerted" },
        });
        result.alerts += 1;
        result.details.push({
          requestId: req.requestId,
          ustn: req.ustn,
          action: "ALERT_24H",
          hoursToExpiry,
        });

        await db.inboxItem.create({
          data: {
            tenantGtid: req.payerGtid,
            tradeId: req.tradeId ?? null,
            category: "NEEDS_PAYMENT",
            priority: 90,
            title: `Guarantee expires in 24h — ${req.requestId}`,
            description: `Deferred payment guarantee for USTN ${req.ustn} expires in less than 24 hours. Convert to immediate payment now to avoid container release block. Amount: $${req.totalAmountUsd.toFixed(
              2,
            )}.`,
            ctaLabel: "Convert to Immediate Payment",
            deadline: req.guaranteeExpiry,
          },
        });
        continue;
      }

      // --- Step 1: 7-day reminder ---
      if (
        isWithin7Days &&
        actionTaken !== "reminded" &&
        actionTaken !== "alerted" &&
        actionTaken !== "expired_charged" &&
        actionTaken !== "expired_blocked"
      ) {
        await db.feePaymentRequest.update({
          where: { id: req.id },
          data: { expiryActionTaken: "reminded" },
        });
        result.reminders += 1;
        result.details.push({
          requestId: req.requestId,
          ustn: req.ustn,
          action: "REMINDER_7D",
          hoursToExpiry,
        });

        await db.inboxItem.create({
          data: {
            tenantGtid: req.payerGtid,
            tradeId: req.tradeId ?? null,
            category: "NEEDS_PAYMENT",
            priority: 70,
            title: `Deferred payment expires in 7 days — ${req.requestId}`,
            description: `Deferred payment guarantee for USTN ${req.ustn} expires on ${req.guaranteeExpiry.toISOString()}. Please ensure customs clearance is completed before then.`,
            ctaLabel: "View Details",
            deadline: req.guaranteeExpiry,
          },
        });
      }
    }

    const processed =
      result.reminders + result.alerts + result.expiries;
    return NextResponse.json({
      ok: true,
      processed,
      ...result,
    });
  } catch (e: any) {
    console.error("[payment/deferred/cron] error:", e);
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 },
    );
  }
}
