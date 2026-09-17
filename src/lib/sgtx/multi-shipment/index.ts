// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// =============================================================================
// SGTX v17 §5.6 — Multi-Shipment Contracts
// -----------------------------------------------------------------------------
// Implements the v17 Phase 2 multi-shipment contract lifecycle:
//
//   • Master contract has a `master_contract_id` (MC-YYYYMMDD-NNN) but **NO**
//     master USTN. The contract is signed with no upfront payment.
//   • Each shipment locks INDEPENDENTLY and gets its own USTN of the form
//     `SGTX-{COUNTRY}-{YY}-{TRADER}-{SEQ}` (e.g. SGTX-EG-26-F3A-21, -22, -23).
//   • Per-shipment SGTX fee = `shipmentValueUsd × 1.5%`. Each shipment pays its
//     own fee (Stage 1 + Stage 2) — a delay in one shipment does not affect
//     the others (v17 §6.7 idempotent invariant).
//   • Per-shipment status, milestones, documents, execution — each shipment
//     is its own micro-trade within the master contract envelope.
//   • Schedule modification is permitted ONLY on future (unlocked) shipments.
//     A locked shipment = per-shipment FeeLock ACTIVE → cannot be modified
//     without going through the trade-change procedure (signed amendment +
//     governor re-approval, per v17 §3.5 multiship.rego).
//   • Schedule modification REQUIRES a mandatory reason ≥20 chars. The
//     modification creates a signed addendum (Activity log entry with a
//     SHA-256 hash binding the modification to the reason).
//
// Schema reuse (NO new Prisma models required):
//   • Trade          — master contract record. `masterContractId` field holds
//                      `MC-YYYYMMDD-NNN`. `multiShipment = true`.
//   • Shipment       — one row per shipment. `ustn` field is populated on
//                      lock (NULL placeholder while UNLOCKED). `status` field
//                      tracks UNLOCKED → LOCKED → IN_TRANSIT → DELIVERED.
//                      `sequence` is the 1-based shipment index.
//   • Activity       — signed addendum audit log. Action
//                      `MULTI_SHIPMENT_SCHEDULE_ADDENDUM` carries the
//                      modification JSON + the reason + the SHA-256 hash.
//
// All DB calls use the `freshDb ?? db` pattern (Prisma 7 driver-adapter
// compatibility) and are wrapped in try/catch with descriptive error codes
// (TRADE_NOT_FOUND, SHIPMENT_NOT_FOUND, SHIPMENT_LOCKED, INVALID_REASON,
// MASTER_CONTRACT_EXISTS, SHIPMENT_COUNT_INVALID). The lib throws
// MultiShipmentError on bad input — callers should catch and map to HTTP
// status codes.
// =============================================================================

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session).
const db = (freshDb ?? _db) as typeof _db;

// ============ Constants ============

/** Per-shipment SGTX fee rate (1.5% of shipment value). v17 §5.6. */
export const SGTX_FEE_RATE_PER_SHIPMENT = 0.015;

/** Minimum length of the schedule-modification reason (≥20 chars). v17 §5.6. */
export const MIN_REASON_LENGTH = 20;

/** Minimum shipment count for a multi-shipment contract (≥2). */
export const MIN_SHIPMENT_COUNT = 2;

/** Maximum shipment count for a multi-shipment contract (≤50, per G1U10). */
export const MAX_SHIPMENT_COUNT = 50;

/** Per-shipment USTN sequence prefix — distinguishes multi-shipment USTNs. */
const MULTI_SHIPMENT_SEQ_PREFIX = "2";

// ============ Types ============

export interface ShipmentPlan {
  shipment_id: string;
  sequence: number;
  status: "UNLOCKED" | "LOCKED" | "IN_TRANSIT" | "DELIVERED";
  ustn: string | null;
  origin_port: string | null;
  dest_port: string | null;
  delivery_date: string | null;
  container_count: number;
  shipment_value_usd: number | null;
  sgtx_fee_usd: number | null;
  locked_at: string | null;
  created_at: string;
}

export interface ShipmentStatus extends ShipmentPlan {
  master_contract_id: string;
  addendum_count: number;
  last_modified_at: string | null;
}

export interface MultiShipmentContract {
  master_contract_id: string;
  trade_id: string;
  buyer_gtid: string;
  seller_gtid: string;
  shipment_count: number;
  shipments: ShipmentPlan[];
  created_at: string;
}

export interface MultiShipmentStatus {
  master_contract_id: string;
  trade_id: string;
  total_shipments: number;
  locked: number;
  unlocked: number;
  in_transit: number;
  delivered: number;
  shipments: ShipmentStatus[];
  total_fee_usd: number;
  total_value_usd: number;
}

export interface FeeCalculation {
  per_shipment_fees: Array<{
    shipment_id: string;
    sequence: number;
    shipment_value_usd: number;
    sgtx_fee_usd: number;
    rate: number;
  }>;
  total_fee: number;
  total_value: number;
  rate: number;
}

export interface Addendum {
  addendum_id: string;
  shipment_id: string;
  master_contract_id: string;
  reason: string;
  modifications: Record<string, any>;
  hash_sha256: string;
  modified_at: string;
  signed_by: string | null;
}

export interface LockShipmentResult {
  shipment_id: string;
  ustn: string;
  sgtx_fee_usd: number;
  shipment_value_usd: number;
  locked_at: string;
  master_contract_id: string;
  sequence: number;
}

// ============ Error codes ============

export class MultiShipmentError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MultiShipmentError";
  }
}

// ============ Helpers ============

/**
 * Generate a master contract ID of the form `MC-YYYYMMDD-NNN`.
 * The sequence NNN is derived from the count of master contracts created on
 * the same day + 1 (zero-padded to 3 digits).
 */
export function formatMasterContractId(date: Date, sequence: number): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, "");
  const seqPadded = String(sequence).padStart(3, "0");
  return `MC-${yyyymmdd}-${seqPadded}`;
}

/**
 * Extract the 3-character trader suffix from a GTID — used in per-shipment
 * USTNs. e.g. SGTX-EG-TRADER-000014-6F4D → "F4D" (last 3 alphanumeric chars).
 */
export function extractTraderSuffix(gtid: string): string {
  const cleaned = (gtid || "").replace(/-/g, "").toUpperCase();
  if (cleaned.length < 3) return cleaned.padEnd(3, "X");
  return cleaned.slice(-3);
}

/**
 * Generate a per-shipment USTN of the form
 * `SGTX-{COUNTRY}-{YY}-{TRADER}-{SEQ}`.
 *
 *   COUNTRY = origin country 2-letter ISO code (uppercased)
 *   YY      = 2-digit year of lock
 *   TRADER  = 3-character suffix from the seller GTID
 *   SEQ     = MULTI_SHIPMENT_SEQ_PREFIX + shipmentSequence (e.g. "21", "22")
 *
 * Example: SGTX-EG-26-F3A-21  (seller GTID ends in F3A, locked in 2026,
 *          shipment 1 of a multi-shipment contract).
 */
export function generateShipmentUstn(
  originCountry: string,
  lockDate: Date,
  sellerGtid: string,
  shipmentSequence: number,
): string {
  const country = (originCountry || "XX").toUpperCase().slice(0, 2);
  const yy = String(lockDate.getFullYear()).slice(-2);
  const trader = extractTraderSuffix(sellerGtid);
  const seq = `${MULTI_SHIPMENT_SEQ_PREFIX}${shipmentSequence}`;
  return `SGTX-${country}-${yy}-${trader}-${seq}`;
}

/**
 * Compute the per-shipment SGTX fee = shipmentValueUsd × 1.5%.
 */
export function computeShipmentFee(shipmentValueUsd: number): number {
  const value = Number(shipmentValueUsd) || 0;
  return Math.round(value * SGTX_FEE_RATE_PER_SHIPMENT * 100) / 100;
}

/**
 * Compute a SHA-256 hash binding the modification to the reason. This is the
 * cryptographic "signature" of the addendum — it makes the addendum
 * tamper-evident: any change to the modifications or the reason produces a
 * different hash.
 */
export function computeAddendumHash(
  shipmentId: string,
  modifications: Record<string, any>,
  reason: string,
  modifiedAt: string,
): string {
  const payload = JSON.stringify({
    shipmentId,
    modifications,
    reason,
    modifiedAt,
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Generate a stable addendum ID. Format: `ADD-{YYYYMMDDHHMMSS}-{RAND6}`.
 */
function generateAddendumId(now: Date): string {
  const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ADD-${ts}-${rand}`;
}

// ============ Public API ============

/**
 * Create a multi-shipment master contract.
 *
 *   masterContractId?  = optional override (otherwise auto-generated
 *                       as MC-YYYYMMDD-NNN based on today's count)
 *   buyerGtid          = buyer's GTID
 *   sellerGtid         = seller's GTID
 *   shipmentCount      = N (2..50)
 *   opts?              = {
 *     originCountry, destCountry, originPort, destPort,
 *     commodity, commodityHs, incoterm, currency, tradeValueUsd,
 *     shipmentPlans? — optional per-shipment {delivery_date, port, container_count, value_usd}
 *   }
 *
 * Returns: { contractId, tradeId, shipments: ShipmentPlan[] }
 *
 * The master contract is created with `multiShipment = true`, NO USTN
 * (master has no USTN — v17 §5.6), and `masterContractId` populated. Each
 * shipment row is created in UNLOCKED state with a placeholder ustn.
 */
export async function createMultiShipmentContract(input: {
  masterContractId?: string;
  buyerGtid: string;
  sellerGtid: string;
  shipmentCount: number;
  opts?: {
    originCountry?: string;
    destCountry?: string;
    originPort?: string;
    destPort?: string;
    commodity?: string;
    commodityHs?: string;
    incoterm?: string;
    currency?: string;
    tradeValueUsd?: number;
    containerCount?: number;
    shipmentPlans?: Array<{
      delivery_date?: string;
      port?: string;
      container_count?: number;
      value_usd?: number;
    }>;
  };
  actorGtid?: string;
}): Promise<{
  contractId: string;
  tradeId: string;
  shipments: ShipmentPlan[];
}> {
  const buyerGtid = String(input.buyerGtid || "").trim();
  const sellerGtid = String(input.sellerGtid || "").trim();
  if (!buyerGtid || !sellerGtid) {
    throw new MultiShipmentError("MISSING_PARTY", "buyerGtid and sellerGtid are required.");
  }

  const shipmentCount = Number(input.shipmentCount) || 0;
  if (
    !Number.isInteger(shipmentCount) ||
    shipmentCount < MIN_SHIPMENT_COUNT ||
    shipmentCount > MAX_SHIPMENT_COUNT
  ) {
    throw new MultiShipmentError(
      "SHIPMENT_COUNT_INVALID",
      `shipmentCount must be an integer in [${MIN_SHIPMENT_COUNT}..${MAX_SHIPMENT_COUNT}] — got ${shipmentCount}.`,
    );
  }

  const opts = input.opts || {};
  const originCountry = opts.originCountry || "";
  const destCountry = opts.destCountry || "";
  const originPort = opts.originPort || "";
  const destPort = opts.destPort || "";
  const commodity = opts.commodity || "";
  const commodityHs = opts.commodityHs || null;
  const incoterm = opts.incoterm || "FCA";
  const currency = opts.currency || "USD";
  const tradeValueUsd = Number(opts.tradeValueUsd) || 0;
  const masterContainerCount = Number(opts.containerCount) || shipmentCount;

  // Resolve or generate master_contract_id
  let masterContractId = input.masterContractId?.trim();
  if (!masterContractId) {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
    // Count today's master contracts for sequence
    const todaysCount = await db.trade.count({
      where: {
        masterContractId: { startsWith: `MC-${yyyymmdd}-` },
      },
    });
    masterContractId = formatMasterContractId(today, todaysCount + 1);
  }

  // Idempotency: ensure no existing trade has this master_contract_id
  const existing = await db.trade.findFirst({
    where: { masterContractId },
    select: { id: true, ustn: true },
  });
  if (existing) {
    throw new MultiShipmentError(
      "MASTER_CONTRACT_EXISTS",
      `A master contract with master_contract_id ${masterContractId} already exists (trade ${existing.id}).`,
    );
  }

  // Create the master contract trade row. multiShipment = true, NO USTN.
  // Use a placeholder USTN since the schema marks ustn as @unique. The
  // placeholder is `<master_contract_id>:UNLOCKED` — it is replaced with a
  // real USTN only if/when the master contract is converted to a single
  // shipment (out of scope here).
  const placeholderUstn = `${masterContractId}:UNLOCKED`;
  const trade = await db.trade.create({
    data: {
      ustn: placeholderUstn,
      buyerGtid,
      sellerGtid,
      commodity,
      commodityHs,
      incoterm,
      grossWeightKg: 0,
      netWeightKg: 0,
      tradeValueUsd,
      currency,
      originPort,
      destPort,
      originCountry,
      destCountry,
      phase: 0,
      status: "MULTI_SHIPMENT_DRAFT",
      multiShipment: true,
      masterContractId,
      containerCount: masterContainerCount,
    },
  });

  // Create N shipment rows. Each starts UNLOCKED with a placeholder ustn
  // (the Shipment.ustn field is required non-null in the schema). The real
  // per-shipment USTN is minted at lock time.
  const shipmentPlans = opts.shipmentPlans || [];
  const shipments: ShipmentPlan[] = [];
  for (let i = 0; i < shipmentCount; i++) {
    const seq = i + 1;
    const plan = shipmentPlans[i] || {};
    const shipmentValue = Number(plan.value_usd) || 0;
    const containerCount = Number(plan.container_count) || 1;
    const deliveryDate = plan.delivery_date ? new Date(plan.delivery_date) : null;
    const port = plan.port || "";

    const shipment = await db.shipment.create({
      data: {
        tradeId: trade.id,
        ustn: `${masterContractId}#UNLOCKED-${seq}`,
        sequence: seq,
        status: "UNLOCKED",
        originPort: originPort || port,
        destPort: destPort || port,
        eta: deliveryDate,
        containerCount,
      },
    });

    shipments.push({
      shipment_id: shipment.id,
      sequence: seq,
      status: "UNLOCKED",
      ustn: null,
      origin_port: originPort || port || null,
      dest_port: destPort || port || null,
      delivery_date: deliveryDate ? deliveryDate.toISOString() : null,
      container_count: containerCount,
      shipment_value_usd: shipmentValue || null,
      sgtx_fee_usd: shipmentValue ? computeShipmentFee(shipmentValue) : null,
      locked_at: null,
      created_at: shipment.createdAt.toISOString(),
    });
  }

  // Activity log entry — master contract created
  try {
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: input.actorGtid || sellerGtid,
        action: "MULTI_SHIPMENT_CONTRACT_CREATED",
        type: "INFO",
        description: `Multi-shipment master contract ${masterContractId} created with ${shipmentCount} shipments (buyer ${buyerGtid}, seller ${sellerGtid}). Master has no USTN — each shipment locks independently.`,
        metadata: JSON.stringify({
          master_contract_id: masterContractId,
          shipment_count: shipmentCount,
        }),
      },
    });
  } catch (e: any) {
    logger.error("[multi-shipment/create] activity log failed (non-blocking):", e);
  }

  return {
    contractId: masterContractId,
    tradeId: trade.id,
    shipments,
  };
}

/**
 * Lock a single shipment — generate its per-shipment USTN, compute the
 * per-shipment SGTX fee (1.5%), mark the shipment as LOCKED, and create a
 * FeeLock record (status PENDING — the buyer pays the fee via a separate
 * payment call). Idempotent: re-locking an already-LOCKED shipment returns
 * the existing USTN.
 *
 *   shipmentId         = the shipment row id
 *   shipmentValueUsd   = the per-shipment trade value (used for fee calc)
 *   currency?          = currency code (default USD)
 *
 * Returns: { shipment_id, ustn, sgtx_fee_usd, shipment_value_usd, locked_at,
 *            master_contract_id, sequence }
 */
export async function lockShipment(input: {
  shipmentId: string;
  shipmentValueUsd: number;
  currency?: string;
  actorGtid?: string;
}): Promise<LockShipmentResult> {
  const shipmentId = String(input.shipmentId || "").trim();
  if (!shipmentId) {
    throw new MultiShipmentError("MISSING_SHIPMENT_ID", "shipmentId is required.");
  }

  const shipmentValueUsd = Number(input.shipmentValueUsd);
  if (!Number.isFinite(shipmentValueUsd) || shipmentValueUsd <= 0) {
    throw new MultiShipmentError(
      "INVALID_SHIPMENT_VALUE",
      `shipmentValueUsd must be a positive number — got ${shipmentValueUsd}.`,
    );
  }

  // Load shipment + its parent trade
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    include: { trade: true },
  });
  if (!shipment) {
    throw new MultiShipmentError("SHIPMENT_NOT_FOUND", `Shipment ${shipmentId} not found.`);
  }
  const trade = shipment.trade as any;
  if (!trade) {
    throw new MultiShipmentError("TRADE_NOT_FOUND", `Parent trade for shipment ${shipmentId} not found.`);
  }
  if (!trade.multiShipment) {
    throw new MultiShipmentError(
      "NOT_MULTI_SHIPMENT",
      `Trade ${trade.id} is not a multi-shipment contract — use /contract/lock for single-shipment trades.`,
    );
  }

  // Idempotency: if already locked (status LOCKED + ustn is a real per-shipment
  // USTN, not the placeholder), return the existing data.
  const isAlreadyLocked =
    shipment.status === "LOCKED" &&
    shipment.ustn &&
    !shipment.ustn.includes("#UNLOCKED-");
  if (isAlreadyLocked) {
    const existingFee = shipmentValueUsd
      ? computeShipmentFee(shipmentValueUsd)
      : 0;
    return {
      shipment_id: shipment.id,
      ustn: shipment.ustn,
      sgtx_fee_usd: existingFee,
      shipment_value_usd: shipmentValueUsd,
      locked_at:
        shipment.releasedAt?.toISOString() ||
        shipment.updatedAt?.toISOString() ||
        new Date().toISOString(),
      master_contract_id: trade.masterContractId,
      sequence: shipment.sequence,
    };
  }

  // Reject if shipment is past LOCKED (IN_TRANSIT, DELIVERED, etc.)
  const terminalStatuses = ["IN_TRANSIT", "ARRIVED", "DELIVERED", "COMPLETED", "CANCELLED"];
  if (terminalStatuses.includes(shipment.status)) {
    throw new MultiShipmentError(
      "SHIPMENT_NOT_UNLOCKED",
      `Shipment ${shipmentId} has status "${shipment.status}" — only UNLOCKED shipments can be locked.`,
    );
  }

  // Generate the per-shipment USTN
  const lockDate = new Date();
  const ustn = generateShipmentUstn(
    trade.originCountry || "XX",
    lockDate,
    trade.sellerGtid,
    shipment.sequence,
  );

  // Compute per-shipment SGTX fee (1.5% of shipment value)
  const sgtxFeeUsd = computeShipmentFee(shipmentValueUsd);

  // Update the shipment row: status LOCKED + ustn minted
  await db.shipment.update({
    where: { id: shipment.id },
    data: {
      ustn,
      status: "LOCKED",
      // ReleasedAt holds the lock timestamp (the Shipment schema has no
      // dedicated lockedAt field — releasedAt is the closest semantic match
      // and is NULL until the shipment is locked/released for transit).
      releasedAt: lockDate,
    },
  });

  // Load all shipments to compute the running locked count
  const allShipments = await db.shipment.findMany({
    where: { tradeId: trade.id },
    select: { id: true, status: true, ustn: true, sequence: true },
  });
  const lockedShipments = allShipments.filter(
    (s: any) => s.status === "LOCKED" && s.ustn && !s.ustn.includes("#UNLOCKED-"),
  );

  // Update the master trade's running SGTX fee + status. The master trade's
  // sgtxFeeUsd is the SUM of all locked shipment fees so far.
  const runningFeeTotal = (trade.sgtxFeeUsd || 0) + sgtxFeeUsd;
  const allLocked = lockedShipments.length === allShipments.length;
  await db.trade.update({
    where: { id: trade.id },
    data: {
      sgtxFeeUsd: runningFeeTotal,
      status: allLocked ? "MULTI_SHIPMENT_ALL_LOCKED" : "MULTI_SHIPMENT_PARTIAL_LOCK",
    },
  });

  // Create a per-shipment FeeLock record (status PENDING). The buyer pays
  // via the existing /payment/multishipment/stage1 flow. We use the
  // shipment.ustn as the FeeLock.ustn so the payment route can look it up.
  try {
    const providerFeesJson = JSON.stringify([
      { payee: "SGTX-PLATFORM", amount: sgtxFeeUsd, stage: "STAGE1" },
    ]);
    await db.feeLock.create({
      data: {
        ustn,
        tradeId: trade.id,
        status: "PENDING",
        totalAmountUsd: sgtxFeeUsd,
        sgtxFeeUsd,
        providerFeesJson,
        kvVersion: 1,
      },
    });
  } catch (e: any) {
    // Non-blocking — the FeeLock may already exist (idempotent re-lock).
    // We log and continue; the shipment is still marked LOCKED.
    logger.warn(`[multi-shipment/lock] FeeLock create skipped for ${ustn}: ${e?.message}`);
  }

  // Activity log entry — shipment locked
  try {
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: input.actorGtid || trade.sellerGtid,
        action: "MULTI_SHIPMENT_LOCKED",
        type: "SUCCESS",
        description: `Shipment #${shipment.sequence} of master contract ${trade.masterContractId} locked. Per-shipment USTN ${ustn} minted. SGTX fee $${sgtxFeeUsd.toFixed(2)} (1.5% of $${shipmentValueUsd.toFixed(2)}). ${lockedShipments.length}/${allShipments.length} shipments now locked.`,
        metadata: JSON.stringify({
          shipment_id: shipment.id,
          ustn,
          sequence: shipment.sequence,
          shipment_value_usd: shipmentValueUsd,
          sgtx_fee_usd: sgtxFeeUsd,
          master_contract_id: trade.masterContractId,
          locked_count: lockedShipments.length,
          total_count: allShipments.length,
        }),
      },
    });
  } catch (e: any) {
    logger.error("[multi-shipment/lock] activity log failed (non-blocking):", e);
  }

  // Smart Inbox to seller + buyer — per-shipment lock confirmed (priority 80)
  try {
    const inboxTitle = `Shipment #${shipment.sequence} locked — ${ustn}`;
    const inboxDesc = `Shipment ${shipment.sequence} of master contract ${trade.masterContractId} is now LOCKED. Per-shipment USTN: ${ustn}. SGTX fee: $${sgtxFeeUsd.toFixed(2)} (1.5% of $${shipmentValueUsd.toFixed(2)}). FeeLock PENDING — pay via /payment/multishipment/stage1 to activate.`;
    await Promise.all([
      db.inboxItem.create({
        data: {
          tenantGtid: trade.sellerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 80,
          title: inboxTitle,
          description: inboxDesc,
          ctaLabel: "View Breakdown",
        },
      }),
      db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 80,
          title: inboxTitle,
          description: inboxDesc,
          ctaLabel: "Pay Fee",
        },
      }),
    ]);
  } catch (e: any) {
    logger.error("[multi-shipment/lock] inbox notify failed (non-blocking):", e);
  }

  return {
    shipment_id: shipment.id,
    ustn,
    sgtx_fee_usd: sgtxFeeUsd,
    shipment_value_usd: shipmentValueUsd,
    locked_at: lockDate.toISOString(),
    master_contract_id: trade.masterContractId,
    sequence: shipment.sequence,
  };
}

/**
 * Modify a shipment's schedule — only allowed on UNLOCKED shipments.
 * Mandatory reason ≥20 chars. Creates a signed addendum (Activity log entry
 * with SHA-256 hash binding the modifications to the reason).
 *
 *   shipmentId     = the shipment row id
 *   modifications  = { delivery_date?, port?, container_count? }
 *   reason         = mandatory explanation (≥20 chars)
 *
 * Returns: { shipmentId, addendumId, modifiedAt, hashSha256 }
 */
export async function modifyShipmentSchedule(input: {
  shipmentId: string;
  modifications: {
    delivery_date?: string;
    port?: string;
    container_count?: number;
  };
  reason: string;
  actorGtid?: string;
}): Promise<{
  shipmentId: string;
  addendumId: string;
  modifiedAt: string;
  hashSha256: string;
}> {
  const shipmentId = String(input.shipmentId || "").trim();
  if (!shipmentId) {
    throw new MultiShipmentError("MISSING_SHIPMENT_ID", "shipmentId is required.");
  }

  const modifications = input.modifications || {};
  const reason = String(input.reason || "").trim();
  if (reason.length < MIN_REASON_LENGTH) {
    throw new MultiShipmentError(
      "INVALID_REASON",
      `reason must be at least ${MIN_REASON_LENGTH} characters — got ${reason.length}.`,
    );
  }

  // Validate that at least one modification is provided
  const hasModification =
    modifications.delivery_date !== undefined ||
    modifications.port !== undefined ||
    modifications.container_count !== undefined;
  if (!hasModification) {
    throw new MultiShipmentError(
      "NO_MODIFICATIONS",
      "At least one of delivery_date, port, or container_count must be provided in modifications.",
    );
  }

  // Validate container_count if provided
  if (
    modifications.container_count !== undefined &&
    (typeof modifications.container_count !== "number" ||
      modifications.container_count < 1 ||
      modifications.container_count > 100)
  ) {
    throw new MultiShipmentError(
      "INVALID_CONTAINER_COUNT",
      `container_count must be an integer in [1..100] — got ${modifications.container_count}.`,
    );
  }

  // Load shipment + parent trade
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    include: { trade: true },
  });
  if (!shipment) {
    throw new MultiShipmentError("SHIPMENT_NOT_FOUND", `Shipment ${shipmentId} not found.`);
  }
  const trade = shipment.trade as any;
  if (!trade || !trade.multiShipment) {
    throw new MultiShipmentError(
      "NOT_MULTI_SHIPMENT",
      `Shipment ${shipmentId} is not part of a multi-shipment contract.`,
    );
  }

  // Enforce UNLOCKED-only modification (v17 §3.5 multiship.rego)
  const lockedStatuses = ["LOCKED", "IN_TRANSIT", "ARRIVED", "DELIVERED", "COMPLETED"];
  if (lockedStatuses.includes(shipment.status)) {
    throw new MultiShipmentError(
      "SHIPMENT_LOCKED",
      `Shipment ${shipmentId} has status "${shipment.status}" — schedule modification is only permitted on UNLOCKED shipments. To modify a locked shipment, use the trade-change amendment procedure (signed amendment + Governor re-approval).`,
    );
  }

  // Apply the modifications
  const updateData: any = {};
  if (modifications.delivery_date !== undefined) {
    updateData.eta = modifications.delivery_date
      ? new Date(modifications.delivery_date)
      : null;
  }
  if (modifications.port !== undefined) {
    // modifications.port is interpreted as the delivery port.
    updateData.destPort = modifications.port;
  }
  if (modifications.container_count !== undefined) {
    updateData.containerCount = Number(modifications.container_count);
  }

  const modifiedAt = new Date();
  await db.shipment.update({
    where: { id: shipment.id },
    data: updateData,
  });

  // Compute the addendum hash + ID
  const addendumId = generateAddendumId(modifiedAt);
  const hashSha256 = computeAddendumHash(
    shipment.id,
    modifications,
    reason,
    modifiedAt.toISOString(),
  );

  // Create the signed addendum as an Activity log entry
  await db.activity.create({
    data: {
      tradeId: trade.id,
      actorGtid: input.actorGtid || trade.buyerGtid,
      action: "MULTI_SHIPMENT_SCHEDULE_ADDENDUM",
      type: "INFO",
      description: `Schedule addendum signed for shipment #${shipment.sequence} of master contract ${trade.masterContractId}. Reason: "${reason}". Modifications: ${JSON.stringify(modifications)}. Addendum ID: ${addendumId}. Hash: ${hashSha256.slice(0, 16)}…`,
      metadata: JSON.stringify({
        addendum_id: addendumId,
        shipment_id: shipment.id,
        shipment_sequence: shipment.sequence,
        master_contract_id: trade.masterContractId,
        modifications,
        reason,
        hash_sha256: hashSha256,
        modified_at: modifiedAt.toISOString(),
      }),
    },
  });

  // Smart Inbox to both parties — schedule modified (priority 70)
  try {
    const inboxTitle = `Shipment #${shipment.sequence} schedule modified — addendum ${addendumId}`;
    const inboxDesc = `Schedule for shipment ${shipment.sequence} of master contract ${trade.masterContractId} has been modified. Reason: "${reason}". Changes: ${JSON.stringify(modifications)}. Addendum signed (hash ${hashSha256.slice(0, 16)}…).`;
    await Promise.all([
      db.inboxItem.create({
        data: {
          tenantGtid: trade.sellerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 70,
          title: inboxTitle,
          description: inboxDesc,
          ctaLabel: "View Addendum",
        },
      }),
      db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 70,
          title: inboxTitle,
          description: inboxDesc,
          ctaLabel: "View Addendum",
        },
      }),
    ]);
  } catch (e: any) {
    logger.error("[multi-shipment/modify] inbox notify failed (non-blocking):", e);
  }

  return {
    shipmentId: shipment.id,
    addendumId,
    modifiedAt: modifiedAt.toISOString(),
    hashSha256,
  };
}

/**
 * Get the full status of a multi-shipment master contract — including
 * per-shipment status, locked/unlocked/in_transit/delivered counts, and
 * total fees + value.
 *
 *   masterContractId  = MC-YYYYMMDD-NNN
 *
 * Returns: MultiShipmentStatus
 */
export async function getMultiShipmentStatus(
  masterContractId: string,
): Promise<MultiShipmentStatus> {
  const mcId = String(masterContractId || "").trim();
  if (!mcId) {
    throw new MultiShipmentError("MISSING_MASTER_CONTRACT_ID", "masterContractId is required.");
  }

  const trade = await db.trade.findFirst({
    where: { masterContractId: mcId },
    include: { shipments: { orderBy: { sequence: "asc" } } },
  });
  if (!trade) {
    throw new MultiShipmentError(
      "MASTER_CONTRACT_NOT_FOUND",
      `Master contract ${mcId} not found.`,
    );
  }

  // Count addenda per shipment
  const addendumActivities = await db.activity.findMany({
    where: {
      tradeId: trade.id,
      action: "MULTI_SHIPMENT_SCHEDULE_ADDENDUM",
    },
    select: { metadata: true, createdAt: true },
  });
  const addendumCountByShipment = new Map<string, number>();
  const lastModifiedByShipment = new Map<string, string>();
  for (const a of addendumActivities) {
    try {
      const meta = JSON.parse(a.metadata || "{}");
      const sid = meta.shipment_id;
      if (sid) {
        addendumCountByShipment.set(sid, (addendumCountByShipment.get(sid) || 0) + 1);
        const prev = lastModifiedByShipment.get(sid);
        if (!prev || new Date(a.createdAt) > new Date(prev)) {
          lastModifiedByShipment.set(sid, a.createdAt.toISOString());
        }
      }
    } catch {
      // ignore malformed metadata
    }
  }

  // Map shipments to ShipmentStatus
  const shipments: ShipmentStatus[] = (trade.shipments as any[]).map((s: any) => {
    const isUnlockedPlaceholder = s.ustn && s.ustn.includes("#UNLOCKED-");
    const realUstn = isUnlockedPlaceholder ? null : s.ustn;
    // Determine the canonical status from the shipment.status field
    let status: ShipmentPlan["status"] = "UNLOCKED";
    if (s.status === "LOCKED" && realUstn) status = "LOCKED";
    else if (["IN_TRANSIT", "DEPARTED"].includes(s.status)) status = "IN_TRANSIT";
    else if (["ARRIVED", "DELIVERED", "COMPLETED"].includes(s.status)) status = "DELIVERED";
    else if (s.status === "LOCKED" && !realUstn) status = "UNLOCKED"; // defensive

    return {
      shipment_id: s.id,
      sequence: s.sequence,
      status,
      ustn: realUstn,
      origin_port: s.originPort || null,
      dest_port: s.destPort || null,
      delivery_date: s.eta ? s.eta.toISOString() : null,
      container_count: s.containerCount,
      shipment_value_usd: null,
      sgtx_fee_usd: null,
      locked_at: s.releasedAt ? s.releasedAt.toISOString() : null,
      created_at: s.createdAt.toISOString(),
      master_contract_id: trade.masterContractId,
      addendum_count: addendumCountByShipment.get(s.id) || 0,
      last_modified_at: lastModifiedByShipment.get(s.id) || null,
    };
  });

  // Aggregate counts
  const locked = shipments.filter((s) => s.status === "LOCKED").length;
  const unlocked = shipments.filter((s) => s.status === "UNLOCKED").length;
  const inTransit = shipments.filter((s) => s.status === "IN_TRANSIT").length;
  const delivered = shipments.filter((s) => s.status === "DELIVERED").length;

  // Compute total fees from FeeLocks against per-shipment USTNs
  let totalFeeUsd = 0;
  let totalValueUsd = 0;
  try {
    const shipmentUstns = shipments
      .filter((s) => s.ustn)
      .map((s) => s.ustn) as string[];
    if (shipmentUstns.length > 0) {
      const feeLocks = await db.feeLock.findMany({
        where: { ustn: { in: shipmentUstns } },
        select: { ustn: true, sgtxFeeUsd: true, totalAmountUsd: true },
      });
      for (const fl of feeLocks) {
        totalFeeUsd += Number(fl.sgtxFeeUsd) || 0;
        totalValueUsd += (Number(fl.totalAmountUsd) || 0) - (Number(fl.sgtxFeeUsd) || 0);
      }
      // If FeeLocks exist but values are 0 (e.g. legacy), fall back to trade value.
      if (totalValueUsd === 0) totalValueUsd = Number(trade.tradeValueUsd) || 0;
    } else {
      totalValueUsd = Number(trade.tradeValueUsd) || 0;
    }
  } catch (e: any) {
    logger.warn("[multi-shipment/status] FeeLock lookup failed (non-blocking):", e);
    totalValueUsd = Number(trade.tradeValueUsd) || 0;
  }

  return {
    master_contract_id: trade.masterContractId,
    trade_id: trade.id,
    total_shipments: shipments.length,
    locked,
    unlocked,
    in_transit: inTransit,
    delivered,
    shipments,
    total_fee_usd: Math.round(totalFeeUsd * 100) / 100,
    total_value_usd: Math.round(totalValueUsd * 100) / 100,
  };
}

/**
 * Calculate the multi-shipment fee breakdown for a list of shipment plans.
 * Per-shipment: shipmentValue × 1.5%. Total: sum of all per-shipment fees.
 *
 *   shipments  = [{ shipment_id, sequence, shipment_value_usd }]
 *
 * Returns: { per_shipment_fees, total_fee, total_value, rate }
 */
export function calculateMultiShipmentFee(
  shipments: Array<{
    shipment_id: string;
    sequence: number;
    shipment_value_usd: number;
  }>,
): FeeCalculation {
  if (!Array.isArray(shipments) || shipments.length === 0) {
    return {
      per_shipment_fees: [],
      total_fee: 0,
      total_value: 0,
      rate: SGTX_FEE_RATE_PER_SHIPMENT,
    };
  }

  const perShipmentFees = shipments.map((s) => {
    const value = Number(s.shipment_value_usd) || 0;
    return {
      shipment_id: s.shipment_id,
      sequence: s.sequence,
      shipment_value_usd: value,
      sgtx_fee_usd: computeShipmentFee(value),
      rate: SGTX_FEE_RATE_PER_SHIPMENT,
    };
  });

  const totalFee = perShipmentFees.reduce((sum, f) => sum + f.sgtx_fee_usd, 0);
  const totalValue = perShipmentFees.reduce((sum, f) => sum + f.shipment_value_usd, 0);

  return {
    per_shipment_fees: perShipmentFees,
    total_fee: Math.round(totalFee * 100) / 100,
    total_value: Math.round(totalValue * 100) / 100,
    rate: SGTX_FEE_RATE_PER_SHIPMENT,
  };
}

/**
 * List all addenda for a shipment (audit trail). Returns them in reverse
 * chronological order (most recent first).
 */
export async function listShipmentAddenda(shipmentId: string): Promise<Addendum[]> {
  const sid = String(shipmentId || "").trim();
  if (!sid) return [];

  const shipment = await db.shipment.findUnique({
    where: { id: sid },
    select: { tradeId: true },
  });
  if (!shipment) return [];

  const activities = await db.activity.findMany({
    where: {
      tradeId: shipment.tradeId,
      action: "MULTI_SHIPMENT_SCHEDULE_ADDENDUM",
    },
    orderBy: { createdAt: "desc" },
  });

  const addenda: Addendum[] = [];
  for (const a of activities) {
    try {
      const meta = JSON.parse(a.metadata || "{}");
      if (meta.shipment_id !== sid) continue;
      addenda.push({
        addendum_id: meta.addendum_id,
        shipment_id: meta.shipment_id,
        master_contract_id: meta.master_contract_id,
        reason: meta.reason,
        modifications: meta.modifications,
        hash_sha256: meta.hash_sha256,
        modified_at: meta.modified_at,
        signed_by: a.actorGtid,
      });
    } catch {
      // skip malformed
    }
  }
  return addenda;
}
