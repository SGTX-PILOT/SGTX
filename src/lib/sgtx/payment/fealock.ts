// SGTX Part 6.6 — FeeLock State Machine
// Non-custodial: SGTX never holds funds. FeeLock is a NATS JetStream KV instruction
// (simulated here as a Prisma record with kvVersion mirroring KV revision semantics).
// Referenced by the Container Release API (Part 8.3) to authorise gate-out.
//
// States: PENDING → ACTIVE → (FROZEN on dispute) → RELEASED
//                 ↘ EXPIRED (deferred guarantee expiry, Part 6.8.2)
//
// Allowed transitions:
//   PENDING  → ACTIVE | EXPIRED
//   ACTIVE   → FROZEN | RELEASED
//   FROZEN   → RELEASED (dispute resolved) | ACTIVE (dispute cleared, requires governor)
//   RELEASED → (terminal)
//   EXPIRED  → (terminal)

import { db } from "@/lib/db";

export type FeeLockStatus = "PENDING" | "ACTIVE" | "FROZEN" | "RELEASED" | "EXPIRED";

export interface ProviderFee {
  payee: string;
  amount: number;
  stage: string;
}

export interface FeeLockRecord {
  id: string;
  ustn: string;
  tradeId: string | null;
  status: FeeLockStatus;
  totalAmountUsd: number;
  sgtxFeeUsd: number;
  providerFees: ProviderFee[];
  kvVersion: number;
  frozenAt: string | null;
  activatedAt: string | null;
  releasedAt: string | null;
  frozenReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(r: any): FeeLockRecord {
  return {
    id: r.id,
    ustn: r.ustn,
    tradeId: r.tradeId,
    status: r.status as FeeLockStatus,
    totalAmountUsd: r.totalAmountUsd,
    sgtxFeeUsd: r.sgtxFeeUsd,
    providerFees: r.providerFeesJson ? JSON.parse(r.providerFeesJson) : [],
    kvVersion: r.kvVersion,
    frozenAt: r.frozenAt?.toISOString() ?? null,
    activatedAt: r.activatedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    frozenReason: r.frozenReason,
    createdAt: r.createdAt?.toISOString() ?? null,
    updatedAt: r.updatedAt?.toISOString() ?? null,
  };
}

// ============ 6.6.1: createFeeLock ============
// Stage 1 payment requested but not yet initiated. Created during calculate/pay flow.
export async function createFeeLock(
  ustn: string,
  tradeId: string | null,
  totalAmount: number,
  sgtxFee: number,
  providerFees: ProviderFee[]
): Promise<FeeLockRecord> {
  // Idempotency: if a FeeLock already exists for this USTN in a non-terminal state, return it.
  const existing = await db.feeLock.findFirst({
    where: { ustn, status: { in: ["PENDING", "ACTIVE", "FROZEN"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return serialize(existing);

  const created = await db.feeLock.create({
    data: {
      ustn,
      tradeId,
      status: "PENDING",
      totalAmountUsd: totalAmount,
      sgtxFeeUsd: sgtxFee,
      providerFeesJson: JSON.stringify(providerFees),
      kvVersion: 1,
    },
  });
  return serialize(created);
}

// ============ 6.6.1: activateFeeLock ============
// PENDING → ACTIVE (called after PSP confirms Stage 1 payment, Part 6.1.2 step 8)
export async function activateFeeLock(ustn: string): Promise<FeeLockRecord> {
  const lock = await db.feeLock.findFirst({
    where: { ustn, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!lock) throw new Error(`FEELOCK_NOT_FOUND for USTN ${ustn}`);
  if (lock.status === "ACTIVE") return serialize(lock);
  if (lock.status !== "PENDING") {
    throw new Error(`FEELOCK_INVALID_TRANSITION: ${lock.status} → ACTIVE not allowed`);
  }

  const updated = await db.feeLock.update({
    where: { id: lock.id },
    data: {
      status: "ACTIVE",
      activatedAt: new Date(),
      kvVersion: lock.kvVersion + 1,
    },
  });

  // Mirror to FeePaymentRequest.feeLockStatus for backward compat with Part 8.3 release check
  await db.feePaymentRequest.updateMany({
    where: { ustn, stage: "STAGE1", feeLockStatus: { not: "ACTIVE" } },
    data: { feeLockStatus: "ACTIVE", status: "PAID", paidAt: new Date() },
  });

  return serialize(updated);
}

// ============ 6.6.3: freezeFeeLock ============
// ACTIVE → FROZEN (called on dispute — no further container releases)
export async function freezeFeeLock(ustn: string, reason: string): Promise<FeeLockRecord> {
  const lock = await db.feeLock.findFirst({
    where: { ustn, status: { in: ["ACTIVE", "FROZEN"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!lock) throw new Error(`FEELOCK_NOT_FOUND for USTN ${ustn} (or not in ACTIVE state)`);
  if (lock.status === "FROZEN") {
    // Update reason if already frozen
    const updated = await db.feeLock.update({
      where: { id: lock.id },
      data: { frozenReason: reason, kvVersion: lock.kvVersion + 1 },
    });
    return serialize(updated);
  }

  const updated = await db.feeLock.update({
    where: { id: lock.id },
    data: {
      status: "FROZEN",
      frozenAt: new Date(),
      frozenReason: reason,
      kvVersion: lock.kvVersion + 1,
    },
  });

  // Mirror freeze to FeePaymentRequest — release API will return HOLD while frozen
  await db.feePaymentRequest.updateMany({
    where: { ustn, stage: "STAGE1" },
    data: { feeLockStatus: "FROZEN" },
  });

  // Smart Inbox alert to all parties
  await db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-EG-SHP-000031-9E8F",
      category: "SHIPMENT_ALERT",
      priority: 95,
      title: `FEELOCK_FROZEN — ${ustn.slice(0, 24)}…`,
      description: `FeeLock frozen due to dispute. Container release authorisation is now blocked. Reason: ${reason}. Government fees already paid remain non-refundable.`,
      ctaLabel: "View Dispute",
    },
  });

  return serialize(updated);
}

// ============ 6.6.1: releaseFeeLock ============
// FROZEN/ACTIVE → RELEASED (called after settlement / dispute resolution)
export async function releaseFeeLock(ustn: string): Promise<FeeLockRecord> {
  const lock = await db.feeLock.findFirst({
    where: { ustn, status: { in: ["ACTIVE", "FROZEN", "RELEASED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!lock) throw new Error(`FEELOCK_NOT_FOUND for USTN ${ustn} (or already released)`);
  if (lock.status === "RELEASED") return serialize(lock);

  const updated = await db.feeLock.update({
    where: { id: lock.id },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      kvVersion: lock.kvVersion + 1,
    },
  });

  // Mirror to FeePaymentRequest
  await db.feePaymentRequest.updateMany({
    where: { ustn, stage: "STAGE1" },
    data: { feeLockStatus: "RELEASED" },
  });

  return serialize(updated);
}

// ============ 6.6.1: expireFeeLock ============
// PENDING → EXPIRED (Part 6.8.2 — deferred guarantee expired without settlement)
export async function expireFeeLock(ustn: string): Promise<FeeLockRecord> {
  const lock = await db.feeLock.findFirst({
    where: { ustn, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!lock) throw new Error(`FEELOCK_NOT_FOUND for USTN ${ustn} in PENDING state`);

  const updated = await db.feeLock.update({
    where: { id: lock.id },
    data: {
      status: "EXPIRED",
      kvVersion: lock.kvVersion + 1,
    },
  });

  await db.feePaymentRequest.updateMany({
    where: { ustn, stage: "STAGE1" },
    data: { feeLockStatus: "EXPIRED" },
  });

  return serialize(updated);
}

// ============ 6.6.2: getFeeLockStatus ============
// Returns the current FeeLock state (KVS read)
export async function getFeeLockStatus(ustn: string): Promise<FeeLockRecord | null> {
  const lock = await db.feeLock.findFirst({
    where: { ustn },
    orderBy: { createdAt: "desc" },
  });
  return lock ? serialize(lock) : null;
}

// ============ 6.6.1: checkFeeLockActive ============
// Boolean — used by the release authorisation API (Part 8.3) gate-out check
export async function checkFeeLockActive(ustn: string): Promise<boolean> {
  const lock = await db.feeLock.findFirst({
    where: { ustn, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return !!lock;
}
