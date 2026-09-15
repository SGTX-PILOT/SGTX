// @ts-nocheck
/**
 * SGTX v18 §13.8 — Payment Failure & Retry Logic
 * ===========================================================================
 *
 * Five canonical failure scenarios with explicit retry policies. Each scenario
 * maps to a deterministic action: notify user, schedule retry, or escalate.
 *
 * ┌──────────────────────────────────┬──────────────────────────────────────────┐
 * │ Failure type                     │ Action                                   │
 * ├──────────────────────────────────┼──────────────────────────────────────────┤
 * │ INSUFFICIENT_FUNDS               │ Notify user; top-up required; no retry   │
 * │ BANK_API_TIMEOUT                 │ Retry after 5 min, 3 attempts max        │
 * │ BANK_REJECTION                   │ Notify user with reason; no retry        │
 * │ BENEFICIARY_BANK_FAILURE         │ Retry after 1h, 2 attempts max           │
 * │ UNKNOWN_STATUS                   │ Mark UNKNOWN; reconciliation required   │
 * └──────────────────────────────────┴──────────────────────────────────────────┘
 *
 * Each attempt is recorded in `payment_retry_logs` (ConfigurationHistory
 * rowspce, configKey `pay_retry:{legId}`) so the full retry history is
 * recoverable per leg. The PaymentLeg's `legState` is updated to reflect
 * the failure (REJECTED / RETURNED / UNKNOWN) and the `returnCode`
 * field captures the bank's error code.
 *
 * All DB writes are defensive (try/catch). The functions never throw —
 * on failure they return a structured error object instead.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §13.8 Constants ============

export type PaymentFailureType =
  | "INSUFFICIENT_FUNDS"
  | "BANK_API_TIMEOUT"
  | "BANK_REJECTION"
  | "BENEFICIARY_BANK_FAILURE"
  | "UNKNOWN_STATUS";

export type PaymentRetryAction =
  | "NOTIFY_USER"
  | "SCHEDULE_RETRY"
  | "MARK_UNKNOWN"
  | "ESCALATE_RECONCILIATION";

export type ResolutionState =
  | "PENDING"
  | "RETRYING"
  | "AWAITING_USER"
  | "AWAITING_RECONCILIATION"
  | "RESOLVED"
  | "ESCALATED";

export interface RetryPolicy {
  delay: number;          // seconds between attempts
  maxAttempts: number;   // cap on retry attempts
  notify: string[];      // who to notify
  fallbackAction: string;
}

/**
 * Retry policies per failure type. NULL for scenarios that do not auto-retry.
 */
export const RETRY_POLICIES: Record<PaymentFailureType, RetryPolicy | null> = {
  INSUFFICIENT_FUNDS: null,
  BANK_API_TIMEOUT: {
    delay: 300,           // 5 minutes
    maxAttempts: 3,
    notify: ["user", "finance"],
    fallbackAction: "Escalate to manual reconciliation after 3 failed attempts",
  },
  BANK_REJECTION: null,
  BENEFICIARY_BANK_FAILURE: {
    delay: 3600,          // 1 hour
    maxAttempts: 2,
    notify: ["user", "finance", "ops"],
    fallbackAction: "Escalate to ops + reconciliation; freeze beneficiary leg",
  },
  UNKNOWN_STATUS: null,
};

const FAILURE_TO_ACTION: Record<PaymentFailureType, PaymentRetryAction> = {
  INSUFFICIENT_FUNDS: "NOTIFY_USER",
  BANK_API_TIMEOUT: "SCHEDULE_RETRY",
  BANK_REJECTION: "NOTIFY_USER",
  BENEFICIARY_BANK_FAILURE: "SCHEDULE_RETRY",
  UNKNOWN_STATUS: "MARK_UNKNOWN",
};

const FAILURE_TO_LEG_STATE: Record<PaymentFailureType, string> = {
  INSUFFICIENT_FUNDS: "REJECTED",
  BANK_API_TIMEOUT: "PROCESSING",
  BANK_REJECTION: "REJECTED",
  BENEFICIARY_BANK_FAILURE: "RETURNED",
  UNKNOWN_STATUS: "UNKNOWN",
};

const FAILURE_TO_USER_MESSAGE: Record<PaymentFailureType, string> = {
  INSUFFICIENT_FUNDS:
    "Your bank account has insufficient funds to settle this payment leg. " +
    "Please top-up your account and re-authorise the payment.",
  BANK_API_TIMEOUT:
    "The bank settlement API timed out. SGTX will retry automatically per policy. " +
    "You will be notified once the leg settles or after retries are exhausted.",
  BANK_REJECTION:
    "The beneficiary bank rejected the payment instruction. " +
    "Please review the rejection reason with your bank and re-issue the payment.",
  BENEFICIARY_BANK_FAILURE:
    "The beneficiary's bank could not process the payment (SWIFT gpi error). " +
    "SGTX will retry per policy; if it persists the leg will be escalated.",
  UNKNOWN_STATUS:
    "The payment leg is in an UNKNOWN state — bank has not returned a definitive " +
    "status. Reconciliation is required; you will be notified once it completes.",
};

// ============ Types ============

export interface HandlePaymentFailureInput {
  legId: string;
  failureType: PaymentFailureType;
  errorCode?: string | null;
  errorMessage?: string | null;
  ustn?: string | null;
  actorGtid?: string | null;
}

export interface PaymentFailureDecision {
  legId: string;
  failureType: PaymentFailureType;
  action: PaymentRetryAction;
  retrySchedule: {
    delaySeconds: number | null;
    maxAttempts: number | null;
    nextAttemptAt: string | null;
    attemptNumber: number;
  } | null;
  userNotification: {
    title: string;
    body: string;
    channel: string;
    priority: number;
  } | null;
  legState: string;
  resolutionState: ResolutionState;
  logId: string | null;
}

export interface RetryResult {
  legId: string;
  retried: boolean;
  scheduledAt: string | null;
  maxAttemptsReached: boolean;
  attemptNumber: number;
  resolutionState: ResolutionState;
  logId: string | null;
}

export interface RetryHistoryEntry {
  attemptNumber: number;
  failureType: PaymentFailureType;
  errorCode: string | null;
  errorMessage: string | null;
  scheduledAt: string | null;
  attemptedAt: string | null;
  resolutionState: ResolutionState;
  legStateAfter: string;
}

export interface RetryHistory {
  legId: string;
  attempts: RetryHistoryEntry[];
  totalAttempts: number;
  resolutionState: ResolutionState;
}

export interface EscalationResult {
  legId: string;
  escalated: boolean;
  assignedTo: string;
  escalationId: string | null;
  inboxItemId: string | null;
  resolutionState: ResolutionState;
}

// ============ Helpers ============

function nowIso(): string {
  return new Date().toISOString();
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/**
 * Read all retry log entries for a leg from ConfigurationHistory. Each row
 * is a JSON-encoded snapshot of a retry attempt.
 */
async function readRetryLogs(legId: string): Promise<RetryHistoryEntry[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: `pay_retry:${legId}` },
      orderBy: { version: "asc" },
    });
    return rows.map((r: any) => {
      const parsed = r.newValue ? JSON.parse(r.newValue) : {};
      return {
        attemptNumber: parsed.attemptNumber ?? r.version,
        failureType: parsed.failureType ?? "UNKNOWN_STATUS",
        errorCode: parsed.errorCode ?? null,
        errorMessage: parsed.errorMessage ?? null,
        scheduledAt: parsed.scheduledAt ?? null,
        attemptedAt: parsed.attemptedAt ?? null,
        resolutionState: parsed.resolutionState ?? "PENDING",
        legStateAfter: parsed.legStateAfter ?? "UNKNOWN",
      };
    });
  } catch (e: any) {
    logger.warn("[payment-resilience] readRetryLogs failed", { legId, error: e?.message });
    return [];
  }
}

async function writeRetryLog(legId: string, entry: RetryHistoryEntry, actorGtid?: string | null): Promise<string | null> {
  try {
    const existing = await db.configurationHistory.findMany({
      where: { configKey: `pay_retry:${legId}` },
      orderBy: { version: "desc" },
    });
    const nextVersion = (existing[0]?.version ?? 0) + 1;
    const created = await db.configurationHistory.create({
      data: {
        configKey: `pay_retry:${legId}`,
        oldValue: existing[0]?.newValue ?? null,
        newValue: JSON.stringify(entry),
        changedByGtid: actorGtid ?? "SGTX-SYSTEM",
        changeReason: `payment_retry:${entry.failureType}:attempt:${entry.attemptNumber}`,
        version: nextVersion,
      },
    });
    return created.id;
  } catch (e: any) {
    logger.error("[payment-resilience] writeRetryLog failed", { legId, error: e?.message });
    return null;
  }
}

async function setLegState(legId: string, legState: string, returnCode?: string | null): Promise<void> {
  try {
    await db.paymentLeg.update({
      where: { legId },
      data: {
        legState,
        ...(returnCode ? { returnCode } : {}),
        updatedAt: new Date(),
      },
    });
  } catch (e: any) {
    logger.error("[payment-resilience] setLegState failed", { legId, legState, error: e?.message });
  }
}

async function findOpsAdmin(): Promise<{ gtid: string; legalName: string } | null> {
  try {
    const admin = await db.tenant.findFirst({
      where: { OR: [{ type: "ADM" }, { type: "GOV" }] },
      select: { gtid: true, legalName: true },
    });
    return admin ?? null;
  } catch {
    return null;
  }
}

// ============ §13.8.1 handlePaymentFailure ============

/**
 * Classify a payment failure and produce a deterministic action:
 *  - INSUFFICIENT_FUNDS / BANK_REJECTION → NOTIFY_USER (no auto-retry)
 *  - BANK_API_TIMEOUT / BENEFICIARY_BANK_FAILURE → SCHEDULE_RETRY
 *  - UNKNOWN_STATUS → MARK_UNKNOWN + escalate reconciliation
 *
 * Records the failure to payment_retry_logs and updates the leg state.
 */
export async function handlePaymentFailure(input: HandlePaymentFailureInput): Promise<PaymentFailureDecision> {
  const { legId, failureType, errorCode, errorMessage, ustn, actorGtid } = input;
  const action = FAILURE_TO_ACTION[failureType];
  const policy = RETRY_POLICIES[failureType];
  const legState = FAILURE_TO_LEG_STATE[failureType];

  // 1. Load existing attempts
  const existing = await readRetryLogs(legId);
  const attemptNumber = existing.length + 1;
  const resolutionState: ResolutionState =
    action === "SCHEDULE_RETRY" ? "RETRYING"
    : action === "NOTIFY_USER" ? "AWAITING_USER"
    : action === "MARK_UNKNOWN" ? "AWAITING_RECONCILIATION"
    : "PENDING";

  // 2. Compute next retry time
  const attemptedAt = nowIso();
  const nextAttemptAt = policy ? addSeconds(attemptedAt, policy.delay) : null;

  // 3. Persist retry log
  const logId = await writeRetryLog(
    legId,
    {
      attemptNumber,
      failureType,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      scheduledAt: nextAttemptAt,
      attemptedAt,
      resolutionState,
      legStateAfter: legState,
    },
    actorGtid,
  );

  // 4. Update leg state
  await setLegState(legId, legState, errorCode ?? null);

  // 5. Build user notification (if applicable)
  let userNotification: PaymentFailureDecision["userNotification"] = null;
  if (action === "NOTIFY_USER" || action === "MARK_UNKNOWN") {
    userNotification = {
      title: `Payment leg ${legId} — ${failureType.replace(/_/g, " ")}`,
      body: FAILURE_TO_USER_MESSAGE[failureType] +
        (errorMessage ? ` Bank reason: ${errorMessage}.` : "") +
        (errorCode ? ` Error code: ${errorCode}.` : ""),
      channel: "IN_APP",
      priority: failureType === "BANK_REJECTION" || failureType === "INSUFFICIENT_FUNDS" ? 85 : 70,
    };
  }

  // 6. Notify operations admin for UNKNOWN_STATUS (reconciliation required)
  if (action === "MARK_UNKNOWN") {
    const admin = await findOpsAdmin();
    if (admin) {
      try {
        await db.inboxItem.create({
          data: {
            tenantGtid: admin.gtid,
            category: "COMPLIANCE",
            priority: 90,
            title: `Reconciliation required — payment leg ${legId}`,
            description:
              `Leg ${legId} for USTN ${ustn ?? "—"} is in UNKNOWN state. ` +
              `Error code: ${errorCode ?? "—"}. Reason: ${errorMessage ?? "—"}. ` +
              `Manual reconciliation with the bank is required.`,
            ctaLabel: "Open Reconciliation",
          },
        });
      } catch (e: any) {
        logger.warn("[payment-resilience] inbox notify failed", { legId, error: e?.message });
      }
    }
  }

  return {
    legId,
    failureType,
    action,
    retrySchedule: policy
      ? {
          delaySeconds: policy.delay,
          maxAttempts: policy.maxAttempts,
          nextAttemptAt,
          attemptNumber,
        }
      : null,
    userNotification,
    legState,
    resolutionState,
    logId,
  };
}

// ============ §13.8.2 retryPayment ============

/**
 * Execute a scheduled retry attempt on a leg. If max attempts reached, the
 * leg is escalated to manual review and AWAITING_RECONCILIATION state.
 */
export async function retryPayment(legId: string, attemptNumber: number): Promise<RetryResult> {
  const history = await readRetryLogs(legId);
  // Find the last failure to determine the policy
  const lastFailure = history[history.length - 1];
  if (!lastFailure) {
    return {
      legId,
      retried: false,
      scheduledAt: null,
      maxAttemptsReached: false,
      attemptNumber,
      resolutionState: "PENDING",
      logId: null,
    };
  }

  const policy = RETRY_POLICIES[lastFailure.failureType as PaymentFailureType];
  if (!policy) {
    return {
      legId,
      retried: false,
      scheduledAt: null,
      maxAttemptsReached: false,
      attemptNumber,
      resolutionState: "AWAITING_USER",
      logId: null,
    };
  }

  const maxAttemptsReached = attemptNumber > policy.maxAttempts;
  if (maxAttemptsReached) {
    // Escalate automatically
    const escalation = await escalateToManualReview(
      legId,
      `Max retry attempts (${policy.maxAttempts}) reached for ${lastFailure.failureType}`,
    );
    return {
      legId,
      retried: false,
      scheduledAt: null,
      maxAttemptsReached: true,
      attemptNumber,
      resolutionState: "ESCALATED",
      logId: escalation.escalationId,
    };
  }

  const scheduledAt = addSeconds(nowIso(), policy.delay);
  const logId = await writeRetryLog(
    legId,
    {
      attemptNumber,
      failureType: lastFailure.failureType,
      errorCode: lastFailure.errorCode,
      errorMessage: lastFailure.errorMessage,
      scheduledAt,
      attemptedAt: nowIso(),
      resolutionState: "RETRYING",
      legStateAfter: "PROCESSING",
    },
    "SGTX-RETRY-WORKER",
  );

  // Move leg back to PROCESSING for the retry
  await setLegState(legId, "PROCESSING");

  return {
    legId,
    retried: true,
    scheduledAt,
    maxAttemptsReached: false,
    attemptNumber,
    resolutionState: "RETRYING",
    logId,
  };
}

// ============ §13.8.3 getPaymentRetryHistory ============

export async function getPaymentRetryHistory(legId: string): Promise<RetryHistory> {
  const attempts = await readRetryLogs(legId);
  const resolutionState: ResolutionState = attempts.length
    ? attempts[attempts.length - 1].resolutionState
    : "PENDING";
  return {
    legId,
    attempts,
    totalAttempts: attempts.length,
    resolutionState,
  };
}

// ============ §13.8.4 escalateToManualReview ============

/**
 * Move a leg into manual review — creates a Smart Inbox item assigned to the
 * operations admin and flips the resolution state to ESCALATED.
 */
export async function escalateToManualReview(legId: string, reason: string): Promise<EscalationResult> {
  const admin = await findOpsAdmin();
  const assignedTo = admin?.gtid ?? "SGTX-OPS";
  const ustn: string | null = await (async () => {
    try {
      const leg = await db.paymentLeg.findUnique({ where: { legId }, select: { ustn: true } });
      return leg?.ustn ?? null;
    } catch {
      return null;
    }
  })();

  let escalationId: string | null = null;
  let inboxItemId: string | null = null;

  try {
    const created = await db.configurationHistory.create({
      data: {
        configKey: `pay_escalation:${legId}`,
        oldValue: null,
        newValue: JSON.stringify({
          legId,
          reason,
          assignedTo,
          ustn,
          escalatedAt: nowIso(),
          resolutionState: "ESCALATED",
        }),
        changedByGtid: assignedTo,
        changeReason: `payment_escalation:${legId}`,
        version: 1,
      },
    });
    escalationId = created.id;
  } catch (e: any) {
    logger.error("[payment-resilience] escalation log failed", { legId, error: e?.message });
  }

  if (admin) {
    try {
      const inbox = await db.inboxItem.create({
        data: {
          tenantGtid: admin.gtid,
          category: "COMPLIANCE",
          priority: 95,
          title: `Manual review required — payment leg ${legId}`,
          description:
            `Leg ${legId}${ustn ? ` (USTN ${ustn})` : ""} has been escalated. ` +
            `Reason: ${reason}. Please review the payment retry history and contact the bank.`,
          ctaLabel: "Review Payment Leg",
        },
      });
      inboxItemId = inbox.id;
    } catch (e: any) {
      logger.warn("[payment-resilience] inbox escalation failed", { legId, error: e?.message });
    }
  }

  // Update leg state to REJECTED (held for manual review)
  await setLegState(legId, "REJECTED", "MANUAL_REVIEW_REQUIRED");

  return {
    legId,
    escalated: true,
    assignedTo,
    escalationId,
    inboxItemId,
    resolutionState: "ESCALATED",
  };
}

// ============ §13.8.5 getRetryPolicy (pure helper) ============

export function getRetryPolicy(failureType: PaymentFailureType): RetryPolicy | null {
  return RETRY_POLICIES[failureType] ?? null;
}

export function listRetryPolicies(): Array<{ failureType: PaymentFailureType; policy: RetryPolicy | null }> {
  return (Object.keys(RETRY_POLICIES) as PaymentFailureType[]).map((k) => ({
    failureType: k,
    policy: RETRY_POLICIES[k],
  }));
}
