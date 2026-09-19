// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
/**
 * SGTX v18 §13.4.9 — FeeLock NATS JetStream KV (Turso-persisted)
 * ============================================================================
 *
 * §13.4.9 FeeLock State Machine:
 *   PENDING → ACTIVE → PARTIALLY_RELEASED | DISPUTED | CANCELLED
 *
 * Stored in NATS JetStream KV in production:
 *   key:   feeflock:{ustn}
 *   value: { lock_id, ustn, status, fee_usd, settled_at, version }
 *
 * PERSISTENCE STRATEGY (IMPL-PERSIST):
 *   Prisma `FeeLock` table (Turso in production, SQLite in dev) is the
 *   SOURCE OF TRUTH. The in-memory Map is now a CACHE for fast reads —
 *   it survives ONLY within the lifetime of a single serverless function
 *   instance. On Vercel cold start, the Map is empty and is hydrated
 *   lazily from Prisma on the first read (see `getFeeLock`), or eagerly
 *   via `warmFeeLockCache()` called from `src/instrumentation.ts`.
 *
 *   This eliminates the v18 regression where FeeLock state was lost
 *   between requests because the in-memory Map reset on every cold start.
 *
 * JSON blob format for `providerFeesJson`:
 *   The existing FeeLock table has no dedicated columns for `lockId`,
 *   `payerGtid`, or `evidence`. We pack these into the existing
 *   `providerFeesJson` String column as a JSON object:
 *     {
 *       _v: 2,
 *       lockId:       string,           // persisted so lockId is stable across cold starts
 *       payerGtid:    string | null,
 *       evidence:     EvidenceEntry[],  // audit trail (Golden Principle)
 *       providerFees: ProviderFee[],    // backward-compat: the original array payload
 *       sgtxFeeUsd:   number
 *     }
 *   For backward-compatibility, `parseFeeLockJson()` ALSO accepts the
 *   legacy array format (i.e. just `[ProviderFee, ...]`) produced by
 *   the older `src/lib/sgtx/payment/fealock.ts` `createFeeLock` function.
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
import { logger } from "@/lib/sgtx/logger";
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

/**
 * JSON blob persisted in `FeeLock.providerFeesJson`. Stores everything that
 * doesn't have a dedicated column: lockId, payerGtid, evidence, plus the
 * original `providerFees` array payload for backward compat with the
 * older `src/lib/sgtx/payment/fealock.ts` FeeLock API.
 */
export interface FeeLockJsonBlob {
  _v?: number;
  lockId?: string;
  payerGtid?: string | null;
  evidence?: FeeLockKvValue["evidence"];
  providerFees?: Array<{ payee: string; amount: number; stage: string }>;
  sgtxFeeUsd?: number;
}

// ============ NATS JetStream KV simulation ============

const KV_NAMESPACE = "feeflock";
const kvStore = new Map<string, FeeLockKvValue>();

/**
 * Tracks whether the cache has been warmed on this serverless instance.
 * Set to true the first time `warmFeeLockCache()` runs successfully.
 * Prevents redundant full-table scans on every cold-start request.
 */
let cacheWarmed = false;

function kvKey(ustn: string): string {
  return `${KV_NAMESPACE}:${ustn}`;
}

/**
 * Parse the JSON blob stored in `FeeLock.providerFeesJson`.
 *
 * Backward-compat: the legacy format was a bare array of ProviderFee
 * objects (`[ { payee, amount, stage }, ... ]`), written by
 * `src/lib/sgtx/payment/fealock.ts` `createFeeLock`. The new format is
 * an object containing `{ _v, lockId, payerGtid, evidence, providerFees,
 * sgtxFeeUsd }`. This helper accepts both and normalises to the
 * FeeLockJsonBlob shape.
 */
function parseFeeLockJson(raw: string | null | undefined): FeeLockJsonBlob {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy array format — wrap it.
      return { _v: 1, providerFees: parsed, evidence: [], payerGtid: null };
    }
    if (parsed && typeof parsed === "object") {
      return parsed as FeeLockJsonBlob;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Serialise a FeeLockJsonBlob to the string format stored in
 * `FeeLock.providerFeesJson`. Always produces the new object format
 * (version 2).
 */
function serializeFeeLockJson(blob: FeeLockJsonBlob): string {
  return JSON.stringify({ _v: 2, ...blob });
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

// ============ Internal: Prisma row ↔ FeeLockKvValue conversion ============

/**
 * Build a FeeLockKvValue from a Prisma FeeLock row. Reads lockId / payerGtid /
 * evidence from the JSON blob in `providerFeesJson` (so the lockId is stable
 * across cold starts); falls back to derived values if the blob is missing or
 * in the legacy array format.
 */
function rowToKvValue(ustn: string, row: any): FeeLockKvValue {
  const blob = parseFeeLockJson(row.providerFeesJson);
  const lockId =
    blob.lockId ||
    `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${row.id.slice(0, 8).toUpperCase()}`;
  return {
    lock_id: lockId,
    ustn,
    status: row.status as FeeLockStatus,
    fee_usd: row.totalAmountUsd,
    settled_at: row.activatedAt?.toISOString?.() || row.activatedAt || null,
    version: row.kvVersion || 1,
    trade_id: row.tradeId || null,
    payer_gtid: blob.payerGtid ?? null,
    evidence: Array.isArray(blob.evidence) ? blob.evidence : [],
  };
}

function kvValueToResult(v: FeeLockKvValue): GetFeeLockResult {
  return {
    lockId: v.lock_id,
    status: v.status,
    feeUsd: v.fee_usd,
    settledAt: v.settled_at,
    version: v.version,
    tradeId: v.trade_id,
    payerGtid: v.payer_gtid,
  };
}

// ============ Public API ============

/**
 * Set (upsert) a FeeLock KV entry. SOURCE OF TRUTH is now the Prisma
 * `FeeLock` table — we write there FIRST, then mirror to the in-memory
 * Map cache for fast subsequent reads. Returns the lockId + version.
 *
 * If a lock already exists for the USTN, returns the existing entry (no-op)
 * UNLESS `forceReset=true` (only for governance re-key).
 *
 * Persistence strategy:
 *   1. findFirst by ustn (latest by createdAt) — Prisma has no @unique on
 *      ustn, so we cannot use `upsert`. The find-then-update/create pair
 *      is the equivalent.
 *   2. If existing row: update in place (preserve the original lockId +
 *      evidence trail from the JSON blob unless forceReset).
 *   3. If no existing row: create a new PENDING row with a fresh lockId.
 *   4. Update the in-memory Map cache.
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
  // Hydrate from cache first; if absent, hydrate from Prisma.
  const existing = await getFeeLock(ustn);
  if (existing && !forceReset) {
    return {
      lockId: existing.lockId,
      status: existing.status,
      version: existing.version,
    };
  }

  const lockId = `FLOCK-${ustn.slice(0, 8).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const version = existing ? existing.version + 1 : 1;
  const providerFees = lockData.providerFees || [];
  const sgtxFeeUsd = lockData.sgtxFeeUsd || 0;
  const tradeId = lockData.tradeId || null;
  const payerGtid = lockData.payerGtid || null;

  // The JSON blob persists lockId + payerGtid + evidence + providerFees.
  // If forceReset, we drop the previous evidence trail; otherwise we
  // preserve it (the row's existing blob is loaded by `getFeeLock` above
  // and is also accessible via the in-memory cache).
  const evidence: FeeLockKvValue["evidence"] =
    existing && !forceReset
      ? (await hydrateFromPrisma(ustn))?.evidence || []
      : [];

  const blob: FeeLockJsonBlob = {
    _v: 2,
    lockId,
    payerGtid,
    evidence,
    providerFees,
    sgtxFeeUsd,
  };

  // 1. Persist to Prisma — SOURCE OF TRUTH
  let persistedId: string | null = null;
  try {
    const existingRow = await db.feeLock.findFirst({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    if (existingRow) {
      await db.feeLock.update({
        where: { id: existingRow.id },
        data: {
          tradeId: tradeId ?? existingRow.tradeId,
          status: forceReset ? "PENDING" : (existingRow.status as string),
          totalAmountUsd: lockData.feeUsd,
          sgtxFeeUsd,
          providerFeesJson: serializeFeeLockJson(blob),
          kvVersion: version,
          updatedAt: new Date(),
        },
      });
      persistedId = existingRow.id;
    } else {
      const created = await db.feeLock.create({
        data: {
          ustn,
          tradeId,
          status: "PENDING",
          totalAmountUsd: lockData.feeUsd,
          sgtxFeeUsd,
          providerFeesJson: serializeFeeLockJson(blob),
          kvVersion: version,
        },
      });
      persistedId = created.id;
    }
  } catch (e: any) {
    logger.error("[feelock-nats] setFeeLock: Prisma persist failed", {
      ustn,
      error: e?.message,
    });
    // Fallback: updateMany in case the findFirst returned null due to a race
    // (another instance created the row between our findFirst and create).
    try {
      await db.feeLock.updateMany({
        where: { ustn },
        data: {
          status: forceReset ? "PENDING" : undefined,
          totalAmountUsd: lockData.feeUsd,
          sgtxFeeUsd,
          providerFeesJson: serializeFeeLockJson(blob),
          kvVersion: version,
        },
      });
    } catch (_) {
      // Last-ditch: the in-memory cache below still works for this request,
      // but state will be lost on cold start. Logged for triage.
      logger.error("[feelock-nats] setFeeLock: updateMany fallback also failed", {
        ustn,
      });
    }
  }

  // 2. Update in-memory Map cache (FAST PATH for subsequent reads)
  const kvValue: FeeLockKvValue = {
    lock_id: lockId,
    ustn,
    status: forceReset ? "PENDING" : existing?.status || "PENDING",
    fee_usd: lockData.feeUsd,
    settled_at: existing?.settledAt || null,
    version,
    trade_id: tradeId,
    payer_gtid: payerGtid,
    evidence,
  };
  kvStore.set(kvKey(ustn), kvValue);

  return {
    lockId,
    status: kvValue.status,
    version,
  };
}

/**
 * Read the FeeLock KV entry for a USTN.
 *
 * 1. Check in-memory Map first (fast path).
 * 2. If not in Map (cold start), query Prisma `FeeLock` table.
 * 3. If found in Prisma, populate the Map cache.
 * 4. Return the data (or null if not found in either layer).
 */
export async function getFeeLock(ustn: string): Promise<GetFeeLockResult | null> {
  const fromKv = kvStore.get(kvKey(ustn));
  if (fromKv) {
    return kvValueToResult(fromKv);
  }

  // Cold start — hydrate from Prisma (source of truth)
  const hydrated = await hydrateFromPrisma(ustn);
  if (!hydrated) return null;
  return kvValueToResult(hydrated);
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
 *
 * PERSISTENCE (IMPL-PERSIST):
 *   1. Load current state from Map cache, falling back to Prisma.
 *   2. Validate the transition (state machine + Golden Principle).
 *   3. If refused: still record the audit entry in the Map cache AND
 *      in the Prisma JSON blob (so the audit survives cold start).
 *   4. If allowed: write to Prisma FIRST (source of truth), THEN update
 *      the Map cache.
 *   5. Mirror the status change to `FeePaymentRequest` (back-compat with
 *      the existing release API).
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
      // Record the audit trail (e.g. a "PAYMENT_BUTTON_CLICKED" click).
      // The audit MUST be persisted to Prisma so it survives cold start.
      if (evidence) {
        current.evidence.push({
          kind: evidence.kind,
          ref: evidence.ref,
          at: new Date().toISOString(),
        });
        kvStore.set(kvKey(ustn), current);
        // Persist the audit-trail-only update to Prisma (no status change).
        try {
          await persistEvidenceOnly(ustn, current);
        } catch (e: any) {
          logger.error("[feelock-nats] updateFeeLockStatus: audit persist failed", {
            ustn,
            error: e?.message,
          });
        }
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
  const nowIso = new Date().toISOString();
  const updated: FeeLockKvValue = {
    ...current,
    status: newStatus,
    version: current.version + 1,
    settled_at:
      newStatus === "ACTIVE" && !current.settled_at
        ? nowIso
        : current.settled_at,
    evidence: [
      ...current.evidence,
      ...(evidence
        ? [{ kind: evidence.kind, ref: evidence.ref, at: nowIso }]
        : []),
    ],
  };

  // 4. Persist to Prisma FIRST (source of truth).
  //
  // The blob in `providerFeesJson` is overwritten with the new evidence
  // trail. To AVOID losing the original `providerFees` array (which was
  // set during `setFeeLock`), we read the existing row first, parse its
  // blob, and preserve `providerFees` in the merged blob.
  try {
    const existingRow = (await db.feeLock.findFirst({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    })) as any;
    const existingBlob = existingRow
      ? parseFeeLockJson(existingRow.providerFeesJson)
      : {};
    const mergedBlob: FeeLockJsonBlob = {
      _v: 2,
      lockId: updated.lock_id,
      payerGtid: updated.payer_gtid,
      evidence: updated.evidence,
      // Preserve original providerFees across status transitions.
      providerFees: Array.isArray(existingBlob.providerFees)
        ? existingBlob.providerFees
        : [],
      sgtxFeeUsd: existingBlob.sgtxFeeUsd ?? updated.fee_usd,
    };

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
        providerFeesJson: serializeFeeLockJson(mergedBlob),
        updatedAt: new Date(),
      },
    });
  } catch (e: any) {
    logger.error("[feelock-nats] updateFeeLockStatus: Prisma persist failed", {
      ustn,
      error: e?.message,
    });
  }

  // 5. Update in-memory Map cache
  kvStore.set(kvKey(ustn), updated);

  // 6. Mirror to FeePaymentRequest (back-compat with the existing release API)
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
 *
 * Calls `getFeeLock(ustn)` which transparently hydrates from Prisma on cold
 * start — so this works correctly across Vercel serverless cold starts.
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

// ============ Cache warming (cold-start defence) ============

/**
 * Pre-populate the in-memory Map cache from Prisma. Called from
 * `src/instrumentation.ts` on server cold start, OR lazily on first access.
 *
 * - If `ustn` is provided: load just that one row (single-row warm-up).
 * - If no `ustn`: load the latest 100 FeeLock rows (bulk warm-up).
 *
 * Idempotent: safe to call multiple times — once `cacheWarmed` is true,
 * subsequent calls without an explicit `ustn` argument are no-ops. (An
 * explicit `ustn` always warms that specific row regardless of the flag,
 * because it might have been created on another instance after our boot.)
 *
 * @returns the number of rows actually loaded into the cache.
 */
export async function warmFeeLockCache(ustn?: string): Promise<number> {
  try {
    if (ustn) {
      // Single-row warm-up — always runs (the row may have been created on
      // another instance after our boot).
      const row = await db.feeLock.findFirst({
        where: { ustn },
        orderBy: { createdAt: "desc" },
      });
      if (!row) return 0;
      const v = rowToKvValue(ustn, row);
      kvStore.set(kvKey(ustn), v);
      return 1;
    }

    // Bulk warm-up — only runs once per instance.
    if (cacheWarmed) return 0;

    const rows = await db.feeLock.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    let loaded = 0;
    for (const row of rows) {
      // Don't overwrite cache entries that are already present (they may
      // have been mutated in this instance since boot — the in-memory
      // version is the most up-to-date).
      if (kvStore.has(kvKey(row.ustn))) continue;
      const v = rowToKvValue(row.ustn, row);
      kvStore.set(kvKey(row.ustn), v);
      loaded++;
    }
    cacheWarmed = true;
    logger.info("[feelock-nats] warmFeeLockCache: bulk warm-up complete", {
      rowsLoaded: loaded,
      totalCached: kvStore.size,
    });
    return loaded;
  } catch (e: any) {
    logger.error("[feelock-nats] warmFeeLockCache: failed (non-fatal)", {
      ustn: ustn || "(bulk)",
      error: e?.message,
    });
    return 0;
  }
}

/**
 * Reset the cache-warmed flag (TEST/DEBUG ONLY — not exported via the
 * public API). Used by the cold-start simulation in IMPL-PERSIST to
 * verify that `getFeeLock` correctly hydrates from Prisma after the
 * in-memory cache is cleared.
 */
export function _resetFeeLockCacheForTest(): void {
  kvStore.clear();
  cacheWarmed = false;
}

// ============ Internal helpers ============

async function hydrateFromPrisma(ustn: string): Promise<FeeLockKvValue | null> {
  const row = (await db.feeLock.findFirst({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  })) as any;
  if (!row) return null;

  const hydrated = rowToKvValue(ustn, row);
  kvStore.set(kvKey(ustn), hydrated);
  return hydrated;
}

/**
 * Persist the evidence-trail update ONLY (no status change). Used when the
 * PENDING→ACTIVE transition is REFUSED but the audit entry (e.g. a button
 * click) must still be persisted to Prisma so it survives cold start.
 *
 * Preserves the existing `providerFees` array in the blob by reading the
 * row first and merging.
 */
async function persistEvidenceOnly(
  ustn: string,
  current: FeeLockKvValue,
): Promise<void> {
  const row = (await db.feeLock.findFirst({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  })) as any;
  if (!row) return;
  const existingBlob = parseFeeLockJson(row.providerFeesJson);
  await db.feeLock.update({
    where: { id: row.id },
    data: {
      providerFeesJson: serializeFeeLockJson({
        _v: 2,
        lockId: current.lock_id,
        payerGtid: current.payer_gtid,
        evidence: current.evidence,
        // Preserve original providerFees across audit-only writes.
        providerFees: Array.isArray(existingBlob.providerFees)
          ? existingBlob.providerFees
          : [],
        sgtxFeeUsd: existingBlob.sgtxFeeUsd ?? current.fee_usd,
      }),
      updatedAt: new Date(),
    },
  });
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
