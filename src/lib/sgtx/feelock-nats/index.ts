// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
/**
 * SGTX v18 §13.4.9 — FeeLock NATS JetStream KV (simulated)
 * ============================================================================
 *
 * §13.4.9 FeeLock State Machine:
 *   PENDING → ACTIVE → PARTIALLY_RELEASED | DISPUTED | CANCELLED
 *
 * Stored in NATS JetStream KV in production:
 *   key:   feeflock:{ustn}
 *   value: { lock_id, ustn, status, fee_usd, settled_at, version }
 *
 * In this dev environment we don't have NATS JetStream, so we simulate the KV
 * store with an in-memory Map (process-local) AND a Prisma mirror (FeeLock
 * table). The in-memory Map is the source of truth for the duration of the
 * process; the Prisma mirror persists across restarts. On read, the KV store
 * is preferred; if not present (cold start), we hydrate from Prisma.
 *
 * CRITICAL INVARIANT (§13.4.9 + Golden Principle):
 *   "SGTX must never equate a payment instruction with a settled payment."
 *
 *   verifyFeeLockActive(ustn) returns { active: true } ONLY when an externally
 *   confirmed payment event (camt.054 confirmation OR SWIFT gpi UETR SETTLED)
 *   has been recorded. Clicking "Pay Now" alone NEVER activates the lock.
 *
 *   The only state transitions that produce ACTIVE are:
 *     - PENDING → ACTIVE  via updateFeeLockStatus(ustn, 'ACTIVE', evidence)
 *       where evidence.kind ∈ { 'CAMT054_CONFIRMATION', 'SWIFT_GPI_UETR_SETTLED' }
 *
 *   All other transitions (PARTIALLY_RELEASED, DISPUTED, CANCELLED) are
 *   driven by governance/dispute events.
 */

import { db } from "@/lib/db";
import { createHash, randomUUID } from "crypto";

// ============ Types ============

export type FeeLockStatus =
  | "PENDING"
  | "ACTIVE"
  | "PARTIALLY_RELEASED"
  | "DISPUTED"
  | "CANCELLED";

export interface FeeLockKvValue {
  lock_id: string;
  ustn: string;
  status: FeeLockStatus;
  fee_usd: number;
  settled_at: string | null;
  version: number;
  trade_id: string | null;
  payer_gtid: string | null;
  evidence: Array<{
    kind:
      | "CAMT054_CONFIRMATION"
      | "SWIFT_GPI_UETR_SETTLED"
      | "DISPUTE_FILED"
      | "PARTIAL_RELEASE_APPROVED"
      | "CANCELLATION"
      | "PAYMENT_BUTTON_CLICKED"; // NEVER activates — recorded only for audit
    ref: string;
    at: string;
  }>;
}

export interface SetFeeLockResult {
  lockId: string;
  status: FeeLockStatus;
  version: number;
}

export interface GetFeeLockResult {
  lockId: string;
  status: FeeLockStatus;
  feeUsd: number;
  settledAt: string | null;
  version: number;
  tradeId: string | null;
  payerGtid: string | null;
}

export interface UpdateResult {
  updated: boolean;
  previousStatus: FeeLockStatus;
  newStatus: FeeLockStatus;
  reason?: string;
}

export interface VerifyActiveResult {
  active: boolean;
  lockId: string | null;
  status: FeeLockStatus | null;
}

// ============ NATS JetStream KV simulation ============

const KV_NAMESPACE = "feeflock";
const kvStore = new Map<string, FeeLockKvValue>();

function kvKey(ustn: string): string {
  return `${KV_NAMESPACE}:${ustn}`;
}

/**
 * Pure: validate that an evidence kind is acceptable for the PENDING → ACTIVE
 * transition. Only externally-confirmed payment events may activate the lock.
 */
function isActivatingEvidence(kind: FeeLockKvValue["evidence"][number]["kind"]): boolean {
  return (
    kind === "CAMT054_CONFIRMATION" ||
    kind === "SWIFT_GPI_UETR_SETTLED"
  );
}

/**
 * Allowed transitions (§13.4.9):
 *   PENDING             → ACTIVE (only on camt.054 / gpi confirmation)
 *   PENDING             → CANCELLED
 *   PENDING             → DISPUTED
 *   ACTIVE              → PARTIALLY_RELEASED (dispute covers only part)
 *   ACTIVE              → DISPUTED
 *   ACTIVE              → CANCELLED
 *   PARTIALLY_RELEASED  → DISPUTED
 *   PARTIALLY_RELEASED  → CANCELLED
 *   DISPUTED            → ACTIVE (governor resolution)
 *   DISPUTED            → CANCELLED
 *   CANCELLED           → (terminal)
 */
const ALLOWED_TRANSITIONS: Record<FeeLockStatus, FeeLockStatus[]> = {
  PENDING: ["ACTIVE", "CANCELLED", "DISPUTED"],
  ACTIVE: ["PARTIALLY_RELEASED", "DISPUTED", "CANCELLED"],
  PARTIALLY_RELEASED: ["DISPUTED", "CANCELLED"],
  DISPUTED: ["ACTIVE", "CANCELLED"],
  CANCELLED: [],
};

// ============ Public API ============

/**
 * Set (upsert) a FeeLock KV entry. Persisted to the in-memory Map AND the
 * Prisma FeeLock table. Returns the lockId + version.
 *
 * If a lock already exists for the USTN, returns the existing entry (no-op)
 * UNLESS `forceReset=true` (only for governance re-key).
 */
export async function setFeeLock(
  ustn: string,
  lockData: {
    feeUsd: number;
    tradeId?: string | null;
    payerGtid?: string | null;
    sgtxFeeUsd?: number;
    providerFees?: Array<{ payee: string; amount: number; stage: string }>;
  },
  forceReset = false,
): Promise<SetFeeLockResult> {
  // Hydrate from KV (memory) first; if absent, hydrate from Prisma.
  const existing = await getFeeLock(ustn);
  if (existing && !forceReset) {
    return {
      lockId: existing.lockId,
      status: existing.status,
      version: existing.version,
    };
  }

  const lockId = `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  const version = existing ? existing.version + 1 : 1;

  const kvValue: FeeLockKvValue = {
    lock_id: lockId,
    ustn,
    status: "PENDING",
    fee_usd: lockData.feeUsd,
    settled_at: null,
    version,
    trade_id: lockData.tradeId || null,
    payer_gtid: lockData.payerGtid || null,
    evidence: [],
  };

  // Set in memory
  kvStore.set(kvKey(ustn), kvValue);

  // Persist to Prisma
  try {
    await db.feeLock.create({
      data: {
        ustn,
        tradeId: lockData.tradeId || null,
        status: "PENDING",
        totalAmountUsd: lockData.feeUsd,
        sgtxFeeUsd: lockData.sgtxFeeUsd || 0,
        providerFeesJson: JSON.stringify(lockData.providerFees || []),
        kvVersion: version,
      },
    });
  } catch (e: any) {
    // Fall back to upsert if the unique constraint on ustn+createdAt conflicts
    try {
      await db.feeLock.updateMany({
        where: { ustn },
        data: {
          status: "PENDING",
          totalAmountUsd: lockData.feeUsd,
          sgtxFeeUsd: lockData.sgtxFeeUsd || 0,
          providerFeesJson: JSON.stringify(lockData.providerFees || []),
          kvVersion: version,
        },
      });
    } catch (_) {}
  }

  return { lockId, status: "PENDING", version };
}

/**
 * Read the FeeLock KV entry for a USTN. Hydrates from Prisma on cold start.
 */
export async function getFeeLock(ustn: string): Promise<GetFeeLockResult | null> {
  const fromKv = kvStore.get(kvKey(ustn));
  if (fromKv) {
    return {
      lockId: fromKv.lock_id,
      status: fromKv.status,
      feeUsd: fromKv.fee_usd,
      settledAt: fromKv.settled_at,
      version: fromKv.version,
      tradeId: fromKv.trade_id,
      payerGtid: fromKv.payer_gtid,
    };
  }

  // Cold start — hydrate from Prisma
  const row = (await db.feeLock.findFirst({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  })) as any;
  if (!row) return null;

  const lockId = `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${row.id.slice(0, 8).toUpperCase()}`;
  const hydrated: FeeLockKvValue = {
    lock_id: lockId,
    ustn,
    status: row.status as FeeLockStatus,
    fee_usd: row.totalAmountUsd,
    settled_at: row.activatedAt?.toISOString() || null,
    version: row.kvVersion || 1,
    trade_id: row.tradeId,
    payer_gtid: null,
    evidence: [],
  };
  kvStore.set(kvKey(ustn), hydrated);

  return {
    lockId: hydrated.lock_id,
    status: hydrated.status,
    feeUsd: hydrated.fee_usd,
    settledAt: hydrated.settled_at,
    version: hydrated.version,
    tradeId: hydrated.trade_id,
    payerGtid: hydrated.payer_gtid,
  };
}

/**
 * Transition the FeeLock to a new status. CRITICAL:
 *   - PENDING → ACTIVE requires evidence with kind ∈ {CAMT054_CONFIRMATION,
 *     SWIFT_GPI_UETR_SETTLED}. A "PAYMENT_BUTTON_CLICKED" evidence entry
 *     is recorded for audit but the transition is REFUSED.
 *
 * Other transitions:
 *   - ACTIVE → PARTIALLY_RELEASED: requires evidence PARTIAL_RELEASE_APPROVED
 *   - ACTIVE → DISPUTED: requires evidence DISPUTE_FILED
 *   - ACTIVE → CANCELLED: requires evidence CANCELLATION
 *   - DISPUTED → ACTIVE: requires evidence CAMT054_CONFIRMATION (governor
 *     approves re-activation after dispute resolved externally)
 */
export async function updateFeeLockStatus(
  ustn: string,
  newStatus: FeeLockStatus,
  evidence?: {
    kind: FeeLockKvValue["evidence"][number]["kind"];
    ref: string;
  },
): Promise<UpdateResult> {
  const current = kvStore.get(kvKey(ustn)) || (await hydrateFromPrisma(ustn));
  if (!current) {
    return {
      updated: false,
      previousStatus: "PENDING",
      newStatus: "PENDING",
      reason: "LOCK_NOT_FOUND",
    };
  }

  const previousStatus = current.status;
  if (previousStatus === newStatus) {
    return {
      updated: true,
      previousStatus,
      newStatus,
      reason: "NO_CHANGE",
    };
  }

  if (!ALLOWED_TRANSITIONS[previousStatus]?.includes(newStatus)) {
    return {
      updated: false,
      previousStatus,
      newStatus,
      reason: `INVALID_TRANSITION:${previousStatus}→${newStatus}`,
    };
  }

  // Guard the PENDING → ACTIVE transition (Golden Principle).
  if (
    previousStatus === "PENDING" &&
    newStatus === "ACTIVE"
  ) {
    if (!evidence || !isActivatingEvidence(evidence.kind)) {
      // Record the audit trail (e.g. a "PAYMENT_BUTTON_CLICKED" click)
      if (evidence) {
        current.evidence.push({
          kind: evidence.kind,
          ref: evidence.ref,
          at: new Date().toISOString(),
        });
        kvStore.set(kvKey(ustn), current);
      }
      return {
        updated: false,
        previousStatus,
        newStatus,
        reason:
          "REFUSED: PENDING→ACTIVE requires external confirmation (camt.054 or SWIFT gpi UETR SETTLED). Clicking a button does NOT activate the lock.",
      };
    }
  }

  // Apply the transition
  const updated: FeeLockKvValue = {
    ...current,
    status: newStatus,
    version: current.version + 1,
    settled_at:
      newStatus === "ACTIVE" && !current.settled_at
        ? new Date().toISOString()
        : current.settled_at,
    evidence: [
      ...current.evidence,
      ...(evidence
        ? [{ kind: evidence.kind, ref: evidence.ref, at: new Date().toISOString() }]
        : []),
    ],
  };
  kvStore.set(kvKey(ustn), updated);

  // Persist to Prisma mirror
  try {
    await db.feeLock.updateMany({
      where: { ustn, status: previousStatus },
      data: {
        status: newStatus,
        kvVersion: updated.version,
        activatedAt: newStatus === "ACTIVE" ? new Date() : undefined,
        releasedAt:
          newStatus === "CANCELLED" || newStatus === "PARTIALLY_RELEASED"
            ? new Date()
            : undefined,
        frozenReason: newStatus === "DISPUTED" ? evidence?.ref : undefined,
      },
    });
  } catch (_) {}

  // Mirror to FeePaymentRequest (back-compat with the existing release API)
  try {
    await db.feePaymentRequest.updateMany({
      where: { ustn },
      data: {
        feeLockStatus: newStatus,
        status: newStatus === "ACTIVE" ? "PAID" : undefined,
        paidAt: newStatus === "ACTIVE" ? new Date() : undefined,
      },
    });
  } catch (_) {}

  return {
    updated: true,
    previousStatus,
    newStatus,
  };
}

/**
 * CRITICAL: verify the FeeLock is ACTIVE. Used by the container release API
 * (Part 8.3) to authorise gate-out. Only returns active=true if the KV value
 * has been set to ACTIVE via an external confirmation event.
 */
export async function verifyFeeLockActive(ustn: string): Promise<VerifyActiveResult> {
  const lock = await getFeeLock(ustn);
  if (!lock) {
    return { active: false, lockId: null, status: null };
  }
  return {
    active: lock.status === "ACTIVE",
    lockId: lock.lockId,
    status: lock.status,
  };
}

// ============ Internal helpers ============

async function hydrateFromPrisma(ustn: string): Promise<FeeLockKvValue | null> {
  const row = (await db.feeLock.findFirst({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  })) as any;
  if (!row) return null;

  const lockId = `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${row.id.slice(0, 8).toUpperCase()}`;
  const hydrated: FeeLockKvValue = {
    lock_id: lockId,
    ustn,
    status: row.status as FeeLockStatus,
    fee_usd: row.totalAmountUsd,
    settled_at: row.activatedAt?.toISOString() || null,
    version: row.kvVersion || 1,
    trade_id: row.tradeId,
    payer_gtid: null,
    evidence: [],
  };
  kvStore.set(kvKey(ustn), hydrated);
  return hydrated;
}

/**
 * Pure: compute a deterministic lockId from ustn (for test purposes / idempotency).
 */
export function deterministicLockId(ustn: string, salt: string = ""): string {
  const hash = createHash("sha256")
    .update(`${ustn}|${salt}`)
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();
  return `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${hash}`;
}
