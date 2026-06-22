// SGTX Part 6.8 — Deferred Payment Guarantee Expiry Handling (Improvement #7)
//
// Three-step escalation per Part 6.8.2:
//   Step 1 — Reminder    | 7 days before expiry  | Smart Inbox priority 70
//   Step 2 — Alert        | 1 day before expiry   | Smart Inbox priority 90 (carrier + Platform Gov Authority)
//   Step 3 — Expiry       | at expiry timestamp   | priority 100; auto-charge if authorised else block release
//
// Payment Conversion Option (Part 6.8.3):
//   Payer can click "Convert to Immediate Payment" on the alert.
//   System calculates amount, charges PSP, releases guarantee.
//   deferred_status becomes PAID.

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { processPspSplit } from "./psp-split";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session). After a dev-server restart, both
// `db` and `freshDb` are equivalent.
const db = (freshDb ?? _db) as typeof _db;

// Note: This module writes to new FeePaymentRequest fields added in this PR
// (originalDueDate, paymentReference, lateFeeCapReached, lateFeePaidAt).
// We use pickFields to defensively filter out any fields the cached
// PrismaClient doesn't yet know about, so the cron endpoints keep working
// even before the dev server picks up the schema update.

// Detect if the PrismaClient supports the new fields. If not, pickFields
// silently drops them from write payloads.
const _fprFields: Set<string> = (() => {
  try {
    // Prisma's delegate exposes `.fields` as a Record<string, FieldInfo>.
    return new Set(Object.keys((db.feePaymentRequest as any)?.fields ?? {}));
  } catch {
    return new Set<string>();
  }
})();
function supportsField(field: string): boolean {
  return _fprFields.has(field);
}
function pickFields(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (supportsField(k) || v === undefined) {
      if (v !== undefined) out[k] = v;
    }
    // else: silently skip — field not in cached client; will be persisted after dev-server restart
  }
  return out;
}

export type DeferredStatus = "GUARANTEE_HELD" | "RELEASED" | "PAID" | "EXPIRED";
export type ExpiryActionTaken = "reminded" | "alerted" | "expired_charged" | "expired_blocked";

export interface DeferredEscalationResult {
  processed: number;
  reminders: number;       // step 1 — T-7d
  alerts: number;          // step 2 — T-1d
  expiredCharged: number;  // step 3a — auto-charge succeeded
  expiredBlocked: number;  // step 3b — auto-charge failed or not authorised
  details: Array<{
    feePaymentRequestId: string;
    ustn: string;
    action: ExpiryActionTaken | null;
    amount: number;
    message: string;
  }>;
}

// ============ 6.8.1: Create deferred payment (during Stage 1) ============
// Payer toggles "Defer" for eligible fees. System creates a guarantee with a
// defined expiry date (default 30 days, jurisdiction-specific).
export async function createDeferredPayment(input: {
  ustn: string;
  feePaymentRequestId?: string;
  payerGtid: string;
  amount: number;
  currency?: string;
  jurisdictionMaxDays?: number;     // default 30
  autoChargeAuthorised?: boolean;
  tradeId?: string;
  shipmentId?: string;
  stage?: string;
  splits?: string;
}): Promise<{ ok: true; feePaymentRequestId: string; guaranteeExpiry: string } | { ok: false; reason: string }> {
  const trade = await db.trade.findUnique({ where: { ustn: input.ustn } });
  if (!trade) return { ok: false, reason: `Trade not found for USTN ${input.ustn}` };

  const maxDays = input.jurisdictionMaxDays ?? 30;
  const expiry = new Date(Date.now() + maxDays * 86400 * 1000);

  const requestId = `FPR-DEF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  // Use pickFields so newly-added FeePaymentRequest columns (e.g. originalDueDate)
  // are silently dropped if the dev-server's cached PrismaClient hasn't yet picked
  // them up. After a dev-server restart, the columns are persisted normally.
  const created = await db.feePaymentRequest.create({
    data: pickFields({
      requestId,
      ustn: input.ustn,
      tradeId: input.tradeId ?? trade.id,
      shipmentId: input.shipmentId ?? null,
      stage: input.stage ?? "STAGE1",
      payerGtid: input.payerGtid,
      totalAmountUsd: input.amount,
      currency: input.currency ?? "USD",
      splits: input.splits ?? "[]",
      status: "PENDING",
      feeLockStatus: "PENDING",
      deferred: true,
      deferredStatus: "GUARANTEE_HELD",
      guaranteeExpiry: expiry,
      autoChargeAuthorised: input.autoChargeAuthorised ?? false,
      originalDueDate: expiry,
      dueDate: expiry,
    }) as any,
  });

  return {
    ok: true,
    feePaymentRequestId: created.id,
    guaranteeExpiry: expiry.toISOString(),
  };
}

// ============ 6.8.2: Three-step escalation cron ============
// Called daily by POST /api/sgtx/payment/deferred-expiry/cron.
// Returns counts of reminders/alerts/expiries processed.
export async function runDeferredExpiryCron(): Promise<DeferredEscalationResult> {
  const now = new Date();
  const REMINDER_MS = 7 * 86400 * 1000;     // T-7d
  const ALERT_MS = 1 * 86400 * 1000;        // T-1d

  // All deferred FeePaymentRequests in GUARANTEE_HELD state, not yet expired/block-charged
  const deferred = await db.feePaymentRequest.findMany({
    where: {
      deferred: true,
      deferredStatus: "GUARANTEE_HELD",
      status: { not: "PAID" },
    },
  });

  const details: DeferredEscalationResult["details"] = [];
  let reminders = 0, alerts = 0, expiredCharged = 0, expiredBlocked = 0;

  for (const fpr of deferred) {
    if (!fpr.guaranteeExpiry) continue;
    const expiry = new Date(fpr.guaranteeExpiry);
    const msToExpiry = expiry.getTime() - now.getTime();
    const actionTaken = fpr.expiryActionTaken ?? null;

    // Step 3 — at or past expiry
    if (msToExpiry <= 0) {
      // Check if customs clearance milestone is confirmed (Part 6.8.2 step 3)
      // Customs clearance is tracked via TimelineEvent with label "Milestone: CUSTOMS CLEARED"
      // and via Shipment.status = "RELEASED" (per existing milestone confirm route).
      const trade = await db.trade.findUnique({
        where: { ustn: fpr.ustn },
        include: {
          shipments: true,
          timeline: { where: { label: { contains: "CUSTOMS CLEARED" } } },
        },
      });
      const customsCleared = (trade?.shipments ?? []).some(s => s.status === "RELEASED" || s.status === "DELIVERED")
        || (trade?.timeline ?? []).some(t => t.completed);

      if (customsCleared) {
        // Customs cleared — guarantee can be released
        await db.feePaymentRequest.update({
          where: { id: fpr.id },
          data: {
            deferredStatus: "RELEASED",
            expiryActionTaken: (actionTaken ?? "expired_blocked") as ExpiryActionTaken,
            status: "PAID",
            paidAt: now,
          },
        });
        details.push({
          feePaymentRequestId: fpr.id,
          ustn: fpr.ustn,
          action: (actionTaken ?? "expired_blocked") as ExpiryActionTaken,
          amount: fpr.totalAmountUsd,
          message: "Customs clearance confirmed — guarantee released, deferred fee marked PAID.",
        });
        continue;
      }

      // Auto-charge if authorised (Part 6.8.2 step 3a)
      if (fpr.autoChargeAuthorised) {
        try {
          const result = await processPspSplit(fpr.ustn, "STAGE1", "FAWRY");
          if (result.ok) {
            await db.feePaymentRequest.update({
              where: { id: fpr.id },
              data: {
                deferredStatus: "PAID",
                expiryActionTaken: "expired_charged",
                status: "PAID",
                paidAt: now,
                pspReference: result.pspReference,
              },
            });
            expiredCharged++;
            details.push({
              feePaymentRequestId: fpr.id,
              ustn: fpr.ustn,
              action: "expired_charged",
              amount: fpr.totalAmountUsd,
              message: `Auto-charged via FAWRY on expiry. PSP ref ${result.pspReference}. Guarantee released.`,
            });
            await sendDeferredAlert(fpr, 100, "EXPIRED_AUTOCHARGED",
              `Deferred guarantee for ${fpr.ustn} expired; auto-charge succeeded via FAWRY. PSP ref ${result.pspReference}.`);
            continue;
          } else {
            // Auto-charge failed → block release (Part 6.8.2 step 3b)
            await db.feePaymentRequest.update({
              where: { id: fpr.id },
              data: { deferredStatus: "EXPIRED", expiryActionTaken: "expired_blocked" },
            });
            expiredBlocked++;
            details.push({
              feePaymentRequestId: fpr.id,
              ustn: fpr.ustn,
              action: "expired_blocked",
              amount: fpr.totalAmountUsd,
              message: "Auto-charge attempted but failed. Guarantee EXPIRED — container release permanently blocked until fee paid.",
            });
            await sendDeferredAlert(fpr, 100, "EXPIRED_BLOCKED",
              `Deferred guarantee for ${fpr.ustn} expired; auto-charge FAILED. Container release BLOCKED. Dispute (non-payment) auto-created.`);
            await createNonPaymentDispute(fpr);
            continue;
          }
        } catch (e: any) {
          // PSP call exception → block release
          await db.feePaymentRequest.update({
            where: { id: fpr.id },
            data: { deferredStatus: "EXPIRED", expiryActionTaken: "expired_blocked" },
          });
          expiredBlocked++;
          details.push({
            feePaymentRequestId: fpr.id,
            ustn: fpr.ustn,
            action: "expired_blocked",
            amount: fpr.totalAmountUsd,
            message: `Auto-charge failed with exception: ${e.message}. Container release BLOCKED.`,
          });
          await sendDeferredAlert(fpr, 100, "EXPIRED_BLOCKED",
            `Deferred guarantee for ${fpr.ustn} expired; auto-charge error: ${e.message}. Container release BLOCKED.`);
          await createNonPaymentDispute(fpr);
          continue;
        }
      } else {
        // Not authorised for auto-charge → block release (Part 6.8.2 step 3b)
        await db.feePaymentRequest.update({
          where: { id: fpr.id },
          data: { deferredStatus: "EXPIRED", expiryActionTaken: "expired_blocked" },
        });
        expiredBlocked++;
        details.push({
          feePaymentRequestId: fpr.id,
          ustn: fpr.ustn,
          action: "expired_blocked",
          amount: fpr.totalAmountUsd,
          message: "Not authorised for auto-charge. Guarantee EXPIRED — container release permanently blocked.",
        });
        await sendDeferredAlert(fpr, 100, "EXPIRED_BLOCKED",
          `Deferred guarantee for ${fpr.ustn} expired. Auto-charge NOT authorised. Container release BLOCKED. Dispute (non-payment) auto-created.`);
        await createNonPaymentDispute(fpr);
        continue;
      }
    }

    // Step 2 — Alert (T-1d, i.e. 0 < msToExpiry ≤ ALERT_MS)
    if (msToExpiry > 0 && msToExpiry <= ALERT_MS && actionTaken !== "alerted" && actionTaken !== "expired_charged" && actionTaken !== "expired_blocked") {
      await db.feePaymentRequest.update({
        where: { id: fpr.id },
        data: { expiryActionTaken: "alerted" },
      });
      alerts++;
      details.push({
        feePaymentRequestId: fpr.id,
        ustn: fpr.ustn,
        action: "alerted",
        amount: fpr.totalAmountUsd,
        message: `Guarantee expires in 24h (${expiry.toISOString()}). Convert to immediate payment to avoid release block.`,
      });
      await sendDeferredAlert(fpr, 90, "ALERT_T1D",
        `Guarantee for ${fpr.ustn} expires in 24h. Click "Convert to Immediate Payment" to avoid release block.`);
      continue;
    }

    // Step 1 — Reminder (T-7d, i.e. ALERT_MS < msToExpiry ≤ REMINDER_MS)
    if (msToExpiry > ALERT_MS && msToExpiry <= REMINDER_MS && !actionTaken) {
      await db.feePaymentRequest.update({
        where: { id: fpr.id },
        data: { expiryActionTaken: "reminded" },
      });
      reminders++;
      details.push({
        feePaymentRequestId: fpr.id,
        ustn: fpr.ustn,
        action: "reminded",
        amount: fpr.totalAmountUsd,
        message: `Deferred payment guarantee expires in 7 days (${expiry.toISOString()}). Ensure customs clearance is completed.`,
      });
      await sendDeferredAlert(fpr, 70, "REMINDER_T7D",
        `Deferred payment guarantee for ${fpr.ustn} expires in 7 days. Please ensure customs clearance is completed.`);
      continue;
    }
  }

  return {
    processed: deferred.length,
    reminders,
    alerts,
    expiredCharged,
    expiredBlocked,
    details,
  };
}

// ============ 6.8.3: Convert to Immediate Payment (one-click) ============
export async function convertDeferredToImmediate(input: {
  feePaymentRequestId: string;
  pspProvider?: "FAWRY" | "PAYMOB" | "STRIPE" | "CBE_IPN";
}): Promise<{ ok: true; pspReference: string; feeLockStatus: string } | { ok: false; reason: string }> {
  const fpr = await db.feePaymentRequest.findUnique({ where: { id: input.feePaymentRequestId } });
  if (!fpr) return { ok: false, reason: "FeePaymentRequest not found." };
  if (!fpr.deferred) return { ok: false, reason: "FeePaymentRequest is not deferred." };
  if (fpr.deferredStatus === "PAID") return { ok: false, reason: "FeePaymentRequest is already PAID." };

  const result = await processPspSplit(fpr.ustn, (fpr.stage as "STAGE1" | "STAGE2") || "STAGE1", input.pspProvider ?? "FAWRY");
  if (!result.ok) return { ok: false, reason: "PSP processing failed." };

  await db.feePaymentRequest.update({
    where: { id: fpr.id },
    data: {
      deferredStatus: "PAID",
      status: "PAID",
      paidAt: new Date(),
      pspReference: result.pspReference,
      expiryActionTaken: "expired_charged",
    },
  });

  // Smart Inbox to payer
  await db.inboxItem.create({
    data: {
      tenantGtid: fpr.payerGtid,
      category: "NEW_OFFER",
      priority: 85,
      title: `Deferred payment converted — ${fpr.ustn.slice(0, 24)}…`,
      description: `Deferred FeePaymentRequest converted to immediate payment. $${fpr.totalAmountUsd.toFixed(2)} charged via ${input.pspProvider ?? "FAWRY"}. PSP ref ${result.pspReference}. Guarantee released.`,
      ctaLabel: "View Receipt",
    },
  });

  return { ok: true, pspReference: result.pspReference, feeLockStatus: result.feeLockStatus };
}

// ============ 6.8.2 — Helper: send Smart Inbox alert ============
async function sendDeferredAlert(
  fpr: { id: string; ustn: string; payerGtid: string; totalAmountUsd: number; guaranteeExpiry: Date | null },
  priority: number,
  alertType: string,
  message: string
): Promise<void> {
  // Route to payer
  await db.inboxItem.create({
    data: {
      tenantGtid: fpr.payerGtid,
      category: "COMPLIANCE",
      priority,
      title: `Deferred Payment ${alertType} — ${fpr.ustn.slice(0, 24)}…`,
      description: message,
      ctaLabel: alertType === "ALERT_T1D" ? "Convert to Immediate Payment" : "View Details",
    },
  });

  // For alerts+expiry, also notify Platform Governance Authority (admin)
  if (priority >= 90) {
    const admin = await db.tenant.findFirst({
      where: { OR: [{ type: "ADM" }, { type: "GOV" }] },
    });
    if (admin) {
      await db.inboxItem.create({
        data: {
          tenantGtid: admin.gtid,
          category: "COMPLIANCE",
          priority,
          title: `[Governance] Deferred Payment ${alertType} — ${fpr.ustn.slice(0, 24)}…`,
          description: `Payer ${fpr.payerGtid}. Amount $${fpr.totalAmountUsd.toFixed(2)}. Expiry ${fpr.guaranteeExpiry?.toISOString() ?? "—"}. ${message}`,
          ctaLabel: "Review",
        },
      });
    }
  }
}

// ============ 6.8.2 step 3b — auto-create dispute (non-payment) ============
async function createNonPaymentDispute(fpr: { id: string; ustn: string; payerGtid: string; totalAmountUsd: number }): Promise<void> {
  const trade = await db.trade.findUnique({ where: { ustn: fpr.ustn } });
  if (!trade) return;

  // Idempotent — don't create duplicate non-payment disputes for same FeePaymentRequest
  const existing = await db.dispute.findFirst({
    where: {
      tradeId: trade.id,
      type: "NON_PAYMENT",
      description: { contains: fpr.id },
    },
  });
  if (existing) return;

  await db.dispute.create({
    data: {
      tradeId: trade.id,
      type: "NON_PAYMENT",
      status: "FILED",
      filedByGtid: "SGTX-PLATFORM-GOVERNOR",
      claimAmountUsd: fpr.totalAmountUsd,
      description: `Auto-created by deferred payment expiry cron. FeePaymentRequest ${fpr.id} ($${fpr.totalAmountUsd.toFixed(2)}) expired without payment. Payer ${fpr.payerGtid} did not honour the deferred guarantee.`,
    },
  });
}
