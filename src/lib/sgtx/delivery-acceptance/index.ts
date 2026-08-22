// @ts-nocheck
/**
 * SGTX Phase 7 — §1 Delivery Acceptance Engine
 * ===========================================================================
 *
 * Implements the DELIVERED → ACCEPTED state machine on top of the new
 * `DeliveryAcceptance` Prisma model (schema line 6812). A delivery
 * acceptance is the gate that closes the physical-goods leg of a trade —
 * the receiver confirms receipt, signs the Proof of Delivery (PoD), and
 * either accepts, partially accepts, or rejects the consignment.
 *
 * State machine (§1):
 *
 *   DELIVERED ──acceptDelivery────────▶ ACCEPTED
 *             ──rejectDelivery────────▶ REJECTED              (auto-opens a DAMAGE/QUALITY claim)
 *             ──partialAcceptance─────▶ PARTIAL_ACCEPTANCE    (auto-opens a SHORTAGE claim)
 *
 * Acceptance requirements (validated by `acceptDelivery`):
 *   - receiverGtid          (who is signing)
 *   - quantityAccepted      (>= 0)
 *   - condition != DAMAGED   (DAMAGED goods cannot be fully accepted)
 *   - quality   != REJECTED (REJECTED quality cannot be fully accepted)
 *   - podReference          (PoD reference / hash)
 *   - acceptanceTimestamp   (when the receiver signed)
 *
 * Temperature compliance (§1): when min/max/actual temperature fields are
 * present, `verifyTemperatureCompliance` (pure) checks that
 * `temperatureActualC ∈ [temperatureMinC, temperatureMaxC]` and the engine
 * persists the boolean on `temperatureCompliant`. A non-compliant reading
 * does NOT block acceptance (the receiver may still accept a slightly-off
 * delivery) but is recorded for downstream claim analytics.
 *
 * Auto-claim linkage: `rejectDelivery` and `partialAcceptance` auto-open a
 * TradeClaim (via the §2 Claim Engine) so the dispute/claim lifecycle is
 * wired end-to-end. The created claim's `claimId` is back-linked on the
 * delivery acceptance row.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers (`verifyTemperatureCompliance`,
 * `getClaimTypeForCondition`) have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Constants ============

export const DELIVERY_CONDITIONS = [
  "GOOD",
  "DAMAGED",
  "PARTIAL",
  "CONTAMINATED",
  "OTHER",
] as const;

export const DELIVERY_QUALITIES = [
  "ACCEPTABLE",
  "REJECTED",
  "CONDITIONAL",
] as const;

export const DELIVERY_STATUSES = [
  "DELIVERED",
  "ACCEPTED",
  "REJECTED",
  "PARTIAL_ACCEPTANCE",
] as const;

// ============ Types ============

export interface CreateAcceptanceInput {
  ustn?: string;
  tradeId?: string;
  shipmentId?: string;
  receiverGtid?: string;
  receiverName?: string;
  receiverSignature?: string;
  quantityDelivered?: number;
  quantityUnit?: string;
  condition?: string;
  conditionNotes?: string;
  quality?: string;
  qualityNotes?: string;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureActualC?: number;
  podReference?: string;
  documents?: any[];
  photos?: any[];
  deliveryLocation?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  notes?: string;
}

export interface AcceptanceInput {
  receiverGtid: string;
  receiverName?: string;
  receiverSignature?: string;
  quantityAccepted: number;
  quantityUnit?: string;
  condition?: string;
  conditionNotes?: string;
  quality?: string;
  qualityNotes?: string;
  temperatureMinC?: number;
  temperatureMaxC?: number;
  temperatureActualC?: number;
  podReference: string;
  acceptanceTimestamp: Date | string;
  deliveryLocation?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  notes?: string;
}

export interface DeliveryAcceptance {
  id: string;
  ustn?: string | null;
  tradeId?: string | null;
  shipmentId?: string | null;
  receiverGtid?: string | null;
  receiverName?: string | null;
  receiverSignature?: string | null;
  quantityDelivered?: number | null;
  quantityUnit?: string | null;
  quantityAccepted?: number | null;
  quantityRejected?: number | null;
  condition: string;
  conditionNotes?: string | null;
  quality: string;
  qualityNotes?: string | null;
  temperatureMinC?: number | null;
  temperatureMaxC?: number | null;
  temperatureActualC?: number | null;
  temperatureCompliant?: boolean | null;
  podReference?: string | null;
  documents?: string | null;
  photos?: string | null;
  status: string;
  acceptanceTimestamp?: Date | null;
  rejectionReason?: string | null;
  deliveryLocation?: string | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  claimId?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============ §1.0 Pure helpers ============

function isValidCondition(c?: string | null): boolean {
  return !!c && (DELIVERY_CONDITIONS as readonly string[]).includes(c);
}

function isValidQuality(q?: string | null): boolean {
  return !!q && (DELIVERY_QUALITIES as readonly string[]).includes(q);
}

function isValidStatus(s?: string | null): boolean {
  return !!s && (DELIVERY_STATUSES as readonly string[]).includes(s);
}

function parseJsonArray(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringifyJsonArray(arr: any[]): string {
  return JSON.stringify(Array.isArray(arr) ? arr : []);
}

/**
 * Pure temperature-compliance check. Returns `{ compliant, reason }`.
 *
 * Rules:
 *   - If `temperatureActualC` is null/undefined → `{ compliant: false, reason: "missing actual temperature reading" }`.
 *   - If `temperatureMinC` AND `temperatureMaxC` are both null/undefined →
 *     `{ compliant: true, reason: "no temperature range specified" }` (no
 *     constraint to enforce — permissive).
 *   - If only one bound is set, that single bound is enforced.
 *   - Otherwise `actual ∈ [min, max]` → compliant.
 *
 * This function is intentionally pure — no DB, no logging, no side effects.
 */
export function verifyTemperatureCompliance(acceptance: {
  temperatureMinC?: number | null;
  temperatureMaxC?: number | null;
  temperatureActualC?: number | null;
}): { compliant: boolean; reason: string } {
  if (!acceptance) {
    return { compliant: false, reason: "acceptance object is required" };
  }
  const min = acceptance.temperatureMinC;
  const max = acceptance.temperatureMaxC;
  const actual = acceptance.temperatureActualC;

  if (actual === null || actual === undefined || Number.isNaN(Number(actual))) {
    return {
      compliant: false,
      reason: "missing actual temperature reading",
    };
  }

  const a = Number(actual);
  const hasMin = min !== null && min !== undefined && !Number.isNaN(Number(min));
  const hasMax = max !== null && max !== undefined && !Number.isNaN(Number(max));

  if (!hasMin && !hasMax) {
    return {
      compliant: true,
      reason: "no temperature range specified",
    };
  }

  if (hasMin && hasMax) {
    const lo = Number(min);
    const hi = Number(max);
    if (lo > hi) {
      return {
        compliant: false,
        reason: `invalid range [${lo}, ${hi}] — min > max`,
      };
    }
    if (a < lo || a > hi) {
      return {
        compliant: false,
        reason: `actual ${a}°C is outside [${lo}, ${hi}]°C`,
      };
    }
    return {
      compliant: true,
      reason: `actual ${a}°C is within [${lo}, ${hi}]°C`,
    };
  }

  if (hasMin) {
    const lo = Number(min);
    return a >= lo
      ? { compliant: true, reason: `actual ${a}°C ≥ min ${lo}°C` }
      : { compliant: false, reason: `actual ${a}°C < min ${lo}°C` };
  }

  // hasMax only
  const hi = Number(max);
  return a <= hi
    ? { compliant: true, reason: `actual ${a}°C ≤ max ${hi}°C` }
    : { compliant: false, reason: `actual ${a}°C > max ${hi}°C` };
}

/**
 * Pure mapping from a delivery `condition` to the default §2 claim type
 * that should be auto-opened when the delivery is rejected. Used by
 * `rejectDelivery`.
 *
 *   DAMAGED / CONTAMINATED → DAMAGE
 *   GOOD / PARTIAL / OTHER → QUALITY
 */
function claimTypeForCondition(condition?: string | null): string {
  if (!condition) return "QUALITY";
  if (condition === "DAMAGED" || condition === "CONTAMINATED") return "DAMAGE";
  return "QUALITY";
}

// ============ §1.1 createDeliveryAcceptance ============

/**
 * Create a new DeliveryAcceptance in the DELIVERED state. Sets
 * `quantityDelivered`, `condition`, `quality`, and the temperature fields.
 *
 * If `condition` is omitted it defaults to `GOOD`. If `quality` is omitted
 * it defaults to `ACCEPTABLE`. The `status` is always `DELIVERED` on
 * creation — use `acceptDelivery` / `rejectDelivery` / `partialAcceptance`
 * to advance the state machine.
 *
 * If temperature min/max/actual are all provided, `temperatureCompliant`
 * is computed (pure) and persisted.
 */
export async function createDeliveryAcceptance(
  input: CreateAcceptanceInput,
): Promise<DeliveryAcceptance> {
  if (!input) {
    throw new Error("input is required");
  }

  const condition = isValidCondition(input.condition) ? input.condition! : "GOOD";
  const quality = isValidQuality(input.quality) ? input.quality! : "ACCEPTABLE";

  const documentsArr = Array.isArray(input.documents) ? input.documents : [];
  const photosArr = Array.isArray(input.photos) ? input.photos : [];

  const acceptanceShape = {
    temperatureMinC: input.temperatureMinC ?? null,
    temperatureMaxC: input.temperatureMaxC ?? null,
    temperatureActualC: input.temperatureActualC ?? null,
  };
  const tempCheck = verifyTemperatureCompliance(acceptanceShape);

  const data: any = {
    ustn: input.ustn || null,
    tradeId: input.tradeId || null,
    shipmentId: input.shipmentId || null,
    receiverGtid: input.receiverGtid || null,
    receiverName: input.receiverName || null,
    receiverSignature: input.receiverSignature || null,
    quantityDelivered:
      input.quantityDelivered !== undefined && input.quantityDelivered !== null
        ? Number(input.quantityDelivered)
        : null,
    quantityUnit: input.quantityUnit || null,
    quantityAccepted: null,
    quantityRejected: null,
    condition,
    conditionNotes: input.conditionNotes || null,
    quality,
    qualityNotes: input.qualityNotes || null,
    temperatureMinC:
      input.temperatureMinC !== undefined && input.temperatureMinC !== null
        ? Number(input.temperatureMinC)
        : null,
    temperatureMaxC:
      input.temperatureMaxC !== undefined && input.temperatureMaxC !== null
        ? Number(input.temperatureMaxC)
        : null,
    temperatureActualC:
      input.temperatureActualC !== undefined && input.temperatureActualC !== null
        ? Number(input.temperatureActualC)
        : null,
    temperatureCompliant:
      input.temperatureMinC !== undefined ||
      input.temperatureMaxC !== undefined ||
      input.temperatureActualC !== undefined
        ? tempCheck.compliant
        : null,
    podReference: input.podReference || null,
    documents: stringifyJsonArray(documentsArr),
    photos: stringifyJsonArray(photosArr),
    status: "DELIVERED",
    acceptanceTimestamp: null,
    rejectionReason: null,
    deliveryLocation: input.deliveryLocation || null,
    deliveryLat:
      input.deliveryLat !== undefined && input.deliveryLat !== null
        ? Number(input.deliveryLat)
        : null,
    deliveryLng:
      input.deliveryLng !== undefined && input.deliveryLng !== null
        ? Number(input.deliveryLng)
        : null,
    notes: input.notes || null,
  };

  try {
    const row = await db.deliveryAcceptance.create({ data });
    logger.info("[delivery-acceptance] acceptance created (DELIVERED)", {
      id: row.id,
      ustn: input.ustn,
      condition,
      quality,
      temperatureCompliant: tempCheck.compliant,
    });
    return row as DeliveryAcceptance;
  } catch (err) {
    logger.error("[delivery-acceptance] createDeliveryAcceptance DB error", {
      error: String(err),
      ustn: input.ustn,
      condition,
    });
    throw err;
  }
}

// ============ §1.2 acceptDelivery ============

/**
 * Advance a delivery from DELIVERED → ACCEPTED.
 *
 * Required fields (validated):
 *   - receiverGtid         — who is signing the acceptance
 *   - quantityAccepted     — >= 0
 *   - condition            — must NOT be DAMAGED (use `rejectDelivery` instead)
 *   - quality              — must NOT be REJECTED (use `rejectDelivery` instead)
 *   - podReference         — Proof of Delivery reference / hash
 *   - acceptanceTimestamp  — when the receiver signed
 *
 * If temperature min/max/actual are provided, `temperatureCompliant` is
 * recomputed and persisted — but a non-compliant reading does NOT block
 * acceptance (it is recorded for downstream claim analytics).
 *
 * Returns the updated DeliveryAcceptance with `status=ACCEPTED`.
 */
export async function acceptDelivery(
  id: string,
  acceptanceData: AcceptanceInput,
): Promise<DeliveryAcceptance> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!acceptanceData) {
    throw new Error("acceptanceData is required");
  }

  // Required-field validation
  if (!acceptanceData.receiverGtid) {
    throw new Error("receiverGtid is required to accept a delivery");
  }
  if (
    acceptanceData.quantityAccepted === undefined ||
    acceptanceData.quantityAccepted === null ||
    Number.isNaN(Number(acceptanceData.quantityAccepted)) ||
    Number(acceptanceData.quantityAccepted) < 0
  ) {
    throw new Error("quantityAccepted must be >= 0");
  }
  if (!acceptanceData.podReference) {
    throw new Error("podReference is required to accept a delivery");
  }
  if (!acceptanceData.acceptanceTimestamp) {
    throw new Error("acceptanceTimestamp is required to accept a delivery");
  }

  let row: any = null;
  try {
    row = await db.deliveryAcceptance.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[delivery-acceptance] acceptDelivery lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DeliveryAcceptance not found: ${id}`);
  }
  if (row.status !== "DELIVERED") {
    throw new Error(
      `Cannot accept delivery in status ${row.status} — must be DELIVERED`,
    );
  }

  const condition = isValidCondition(acceptanceData.condition)
    ? acceptanceData.condition!
    : row.condition || "GOOD";
  const quality = isValidQuality(acceptanceData.quality)
    ? acceptanceData.quality!
    : row.quality || "ACCEPTABLE";

  if (condition === "DAMAGED") {
    throw new Error(
      "Cannot accept a delivery with condition=DAMAGED — use rejectDelivery instead",
    );
  }
  if (quality === "REJECTED") {
    throw new Error(
      "Cannot accept a delivery with quality=REJECTED — use rejectDelivery instead",
    );
  }

  const tempShape = {
    temperatureMinC:
      acceptanceData.temperatureMinC !== undefined
        ? acceptanceData.temperatureMinC
        : row.temperatureMinC,
    temperatureMaxC:
      acceptanceData.temperatureMaxC !== undefined
        ? acceptanceData.temperatureMaxC
        : row.temperatureMaxC,
    temperatureActualC:
      acceptanceData.temperatureActualC !== undefined
        ? acceptanceData.temperatureActualC
        : row.temperatureActualC,
  };
  const hasTemp =
    tempShape.temperatureMinC !== undefined ||
    tempShape.temperatureMaxC !== undefined ||
    tempShape.temperatureActualC !== undefined;
  const tempCheck = hasTemp ? verifyTemperatureCompliance(tempShape) : null;

  const acceptanceTimestamp =
    acceptanceData.acceptanceTimestamp instanceof Date
      ? acceptanceData.acceptanceTimestamp
      : new Date(acceptanceData.acceptanceTimestamp);

  const updateData: any = {
    status: "ACCEPTED",
    receiverGtid: acceptanceData.receiverGtid,
    receiverName: acceptanceData.receiverName || row.receiverName || null,
    receiverSignature: acceptanceData.receiverSignature || row.receiverSignature || null,
    quantityAccepted: Number(acceptanceData.quantityAccepted),
    quantityRejected: 0,
    condition,
    conditionNotes: acceptanceData.conditionNotes || row.conditionNotes || null,
    quality,
    qualityNotes: acceptanceData.qualityNotes || row.qualityNotes || null,
    podReference: acceptanceData.podReference,
    acceptanceTimestamp,
    deliveryLocation: acceptanceData.deliveryLocation || row.deliveryLocation || null,
    deliveryLat:
      acceptanceData.deliveryLat !== undefined
        ? Number(acceptanceData.deliveryLat)
        : row.deliveryLat,
    deliveryLng:
      acceptanceData.deliveryLng !== undefined
        ? Number(acceptanceData.deliveryLng)
        : row.deliveryLng,
    notes: acceptanceData.notes || row.notes || null,
  };
  if (acceptanceData.temperatureMinC !== undefined) {
    updateData.temperatureMinC = Number(acceptanceData.temperatureMinC);
  }
  if (acceptanceData.temperatureMaxC !== undefined) {
    updateData.temperatureMaxC = Number(acceptanceData.temperatureMaxC);
  }
  if (acceptanceData.temperatureActualC !== undefined) {
    updateData.temperatureActualC = Number(acceptanceData.temperatureActualC);
  }
  if (tempCheck) {
    updateData.temperatureCompliant = tempCheck.compliant;
  }

  try {
    const updated = await db.deliveryAcceptance.update({
      where: { id },
      data: updateData,
    });
    logger.info("[delivery-acceptance] delivery accepted", {
      id,
      receiverGtid: acceptanceData.receiverGtid,
      quantityAccepted: updateData.quantityAccepted,
      temperatureCompliant: tempCheck?.compliant,
    });
    return updated as DeliveryAcceptance;
  } catch (err) {
    logger.error("[delivery-acceptance] acceptDelivery DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §1.3 rejectDelivery ============

/**
 * Advance a delivery from DELIVERED → REJECTED. Sets `rejectionReason`.
 *
 * Auto-opens a TradeClaim via the §2 Claim Engine:
 *   - condition = DAMAGED or CONTAMINATED → claimType = DAMAGE
 *   - any other condition                      → claimType = QUALITY
 *
 * The created claim's `claimId` is back-linked on the delivery acceptance
 * row (`claimId` field) so the chain is bidirectional.
 *
 * If the claim cannot be created (DB error in the claim engine), the
 * rejection itself still succeeds — the claim is best-effort.
 */
export async function rejectDelivery(
  id: string,
  reason: string,
): Promise<DeliveryAcceptance> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required to reject a delivery");
  }

  let row: any = null;
  try {
    row = await db.deliveryAcceptance.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[delivery-acceptance] rejectDelivery lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DeliveryAcceptance not found: ${id}`);
  }
  if (row.status !== "DELIVERED") {
    throw new Error(
      `Cannot reject delivery in status ${row.status} — must be DELIVERED`,
    );
  }

  // Auto-open a TradeClaim. Best-effort: a failure here does NOT block the
  // rejection — the delivery still transitions to REJECTED.
  let claimId: string | null = null;
  try {
    const claimType = claimTypeForCondition(row.condition);
    const claim = await db.tradeClaim.create({
      data: {
        claimId: generateClaimId(),
        ustn: row.ustn || null,
        tradeId: row.tradeId || null,
        parentUstn: null,
        claimType,
        claimSeverity: "MAJOR",
        claimDescription: `Auto-opened by delivery rejection (${row.condition}). Reason: ${reason}`,
        claimedAmountUsd: null,
        claimantGtid: row.receiverGtid || null,
        respondentGtid: null,
        evidence: stringifyJsonArray([
          {
            type: "DELIVERY_REJECTION",
            reference: row.id,
            hash: null,
            uploadedAt: new Date().toISOString(),
            reason,
            condition: row.condition,
            quality: row.quality,
          },
        ]),
        status: "OPEN",
        deliveryAcceptanceId: row.id,
        filedAt: new Date(),
        notes: `Auto-opened by rejectDelivery on ${new Date().toISOString()}`,
      },
    });
    claimId = (claim as any).claimId || null;
    logger.info("[delivery-acceptance] auto-opened claim on rejection", {
      deliveryId: id,
      claimId,
      claimType,
    });
  } catch (err) {
    logger.error("[delivery-acceptance] auto-claim on rejection failed", {
      error: String(err),
      deliveryId: id,
    });
    // continue — rejection itself must still succeed
  }

  const updateData: any = {
    status: "REJECTED",
    rejectionReason: reason,
    acceptanceTimestamp: null,
  };
  if (claimId) {
    updateData.claimId = claimId;
  }

  try {
    const updated = await db.deliveryAcceptance.update({
      where: { id },
      data: updateData,
    });
    logger.info("[delivery-acceptance] delivery rejected", {
      id,
      reason,
      claimId,
    });
    return updated as DeliveryAcceptance;
  } catch (err) {
    logger.error("[delivery-acceptance] rejectDelivery DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §1.4 partialAcceptance ============

/**
 * Advance a delivery from DELIVERED → PARTIAL_ACCEPTANCE.
 *
 * Sets `quantityAccepted` + `quantityRejected`. Auto-opens a TradeClaim
 * with `claimType=SHORTAGE` (the canonical partial-acceptance claim type).
 *
 * Validates:
 *   - acceptedQty + rejectedQty >= 0
 *   - acceptedQty + rejectedQty <= quantityDelivered (if quantityDelivered is set)
 *
 * If the auto-claim fails, the partial acceptance itself still succeeds.
 */
export async function partialAcceptance(
  id: string,
  acceptedQty: number,
  rejectedQty: number,
  reason: string,
): Promise<DeliveryAcceptance> {
  if (!id) {
    throw new Error("id is required");
  }
  if (
    acceptedQty === undefined ||
    acceptedQty === null ||
    Number.isNaN(Number(acceptedQty)) ||
    Number(acceptedQty) < 0
  ) {
    throw new Error("acceptedQty must be >= 0");
  }
  if (
    rejectedQty === undefined ||
    rejectedQty === null ||
    Number.isNaN(Number(rejectedQty)) ||
    Number(rejectedQty) < 0
  ) {
    throw new Error("rejectedQty must be >= 0");
  }
  if (!reason || !reason.trim()) {
    throw new Error("reason is required for partial acceptance");
  }

  let row: any = null;
  try {
    row = await db.deliveryAcceptance.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[delivery-acceptance] partialAcceptance lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DeliveryAcceptance not found: ${id}`);
  }
  if (row.status !== "DELIVERED") {
    throw new Error(
      `Cannot partially accept delivery in status ${row.status} — must be DELIVERED`,
    );
  }

  const accQty = Number(acceptedQty);
  const rejQty = Number(rejectedQty);

  if (row.quantityDelivered !== null && row.quantityDelivered !== undefined) {
    const delivered = Number(row.quantityDelivered);
    if (accQty + rejQty > delivered + 0.0001) {
      throw new Error(
        `acceptedQty (${accQty}) + rejectedQty (${rejQty}) exceeds quantityDelivered (${delivered})`,
      );
    }
  }

  // Auto-open a SHORTAGE claim (best-effort).
  let claimId: string | null = null;
  try {
    const claim = await db.tradeClaim.create({
      data: {
        claimId: generateClaimId(),
        ustn: row.ustn || null,
        tradeId: row.tradeId || null,
        parentUstn: null,
        claimType: "SHORTAGE",
        claimSeverity: "MINOR",
        claimDescription: `Auto-opened by partial acceptance. Accepted ${accQty}, rejected ${rejQty}. Reason: ${reason}`,
        claimedAmountUsd: null,
        claimantGtid: row.receiverGtid || null,
        respondentGtid: null,
        evidence: stringifyJsonArray([
          {
            type: "PARTIAL_ACCEPTANCE",
            reference: row.id,
            hash: null,
            uploadedAt: new Date().toISOString(),
            reason,
            acceptedQty: accQty,
            rejectedQty: rejQty,
          },
        ]),
        status: "OPEN",
        deliveryAcceptanceId: row.id,
        filedAt: new Date(),
        notes: `Auto-opened by partialAcceptance on ${new Date().toISOString()}`,
      },
    });
    claimId = (claim as any).claimId || null;
    logger.info("[delivery-acceptance] auto-opened SHORTAGE claim on partial", {
      deliveryId: id,
      claimId,
    });
  } catch (err) {
    logger.error("[delivery-acceptance] auto-claim on partial failed", {
      error: String(err),
      deliveryId: id,
    });
    // continue — partial acceptance itself must still succeed
  }

  const updateData: any = {
    status: "PARTIAL_ACCEPTANCE",
    quantityAccepted: accQty,
    quantityRejected: rejQty,
    rejectionReason: reason,
    acceptanceTimestamp: new Date(),
  };
  if (claimId) {
    updateData.claimId = claimId;
  }

  try {
    const updated = await db.deliveryAcceptance.update({
      where: { id },
      data: updateData,
    });
    logger.info("[delivery-acceptance] partial acceptance recorded", {
      id,
      acceptedQty: accQty,
      rejectedQty: rejQty,
      claimId,
    });
    return updated as DeliveryAcceptance;
  } catch (err) {
    logger.error("[delivery-acceptance] partialAcceptance DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §1.5 getDeliveryAcceptance ============

/** Fetch a DeliveryAcceptance by its database id. Null-safe. */
export async function getDeliveryAcceptance(
  id: string,
): Promise<DeliveryAcceptance | null> {
  if (!id) return null;
  try {
    const row = await db.deliveryAcceptance.findUnique({ where: { id } });
    return (row as DeliveryAcceptance) || null;
  } catch (err) {
    logger.error("[delivery-acceptance] getDeliveryAcceptance failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §1.6 getDeliveryByUstn ============

/** All delivery acceptances for a trade USTN. Empty array on error. */
export async function getDeliveryByUstn(
  ustn: string,
): Promise<DeliveryAcceptance[]> {
  if (!ustn) return [];
  try {
    const rows = await db.deliveryAcceptance.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return (rows as DeliveryAcceptance[]) || [];
  } catch (err) {
    logger.error("[delivery-acceptance] getDeliveryByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §1.7 listDeliveryAcceptances ============

/**
 * List DeliveryAcceptances with optional filters. Ordered by createdAt desc.
 * Empty array on error.
 */
export async function listDeliveryAcceptances(filters?: {
  ustn?: string;
  receiverGtid?: string;
  status?: string;
}): Promise<DeliveryAcceptance[]> {
  const where: any = {};
  if (filters?.ustn) where.ustn = filters.ustn;
  if (filters?.receiverGtid) where.receiverGtid = filters.receiverGtid;
  if (filters?.status) where.status = filters.status;

  try {
    const rows = await db.deliveryAcceptance.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as DeliveryAcceptance[]) || [];
  } catch (err) {
    logger.error("[delivery-acceptance] listDeliveryAcceptances failed", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §1.8 addEvidence ============

/**
 * Append documents/photos to a delivery acceptance. The arrays are stored as
 * JSON strings on the `documents` + `photos` columns. Existing items are
 * preserved; new items are appended.
 *
 * `evidence` may be:
 *   - `{ documents?: any[], photos?: any[] }` — both arrays optional
 *   - `any[]` — treated as documents
 *   - a single object — wrapped into a one-element documents array
 */
export async function addEvidence(
  id: string,
  evidence: any,
): Promise<DeliveryAcceptance> {
  if (!id) {
    throw new Error("id is required");
  }
  if (!evidence) {
    throw new Error("evidence is required");
  }

  let row: any = null;
  try {
    row = await db.deliveryAcceptance.findUnique({ where: { id } });
  } catch (err) {
    logger.error("[delivery-acceptance] addEvidence lookup failed", {
      error: String(err),
      id,
    });
    throw err;
  }
  if (!row) {
    throw new Error(`DeliveryAcceptance not found: ${id}`);
  }

  let newDocs: any[] = [];
  let newPhotos: any[] = [];
  if (Array.isArray(evidence)) {
    newDocs = evidence;
  } else if (evidence && typeof evidence === "object") {
    if (Array.isArray(evidence.documents)) newDocs = evidence.documents;
    if (Array.isArray(evidence.photos)) newPhotos = evidence.photos;
    if (
      !Array.isArray(evidence.documents) &&
      !Array.isArray(evidence.photos)
    ) {
      newDocs = [evidence];
    }
  } else {
    newDocs = [{ value: evidence }];
  }

  const existingDocs = parseJsonArray(row.documents);
  const existingPhotos = parseJsonArray(row.photos);
  const mergedDocs = [...existingDocs, ...newDocs];
  const mergedPhotos = [...existingPhotos, ...newPhotos];

  try {
    const updated = await db.deliveryAcceptance.update({
      where: { id },
      data: {
        documents: stringifyJsonArray(mergedDocs),
        photos: stringifyJsonArray(mergedPhotos),
      },
    });
    logger.info("[delivery-acceptance] evidence added", {
      id,
      documentsAdded: newDocs.length,
      photosAdded: newPhotos.length,
    });
    return updated as DeliveryAcceptance;
  } catch (err) {
    logger.error("[delivery-acceptance] addEvidence DB error", {
      error: String(err),
      id,
    });
    throw err;
  }
}

// ============ §1.9 isDeliveryAccepted ============

/**
 * Check if a trade USTN has at least one ACCEPTED delivery. Returns false on
 * error or if no accepted delivery exists.
 *
 * NOTE: PARTIAL_ACCEPTANCE is NOT counted as accepted — only ACCEPTED.
 */
export async function isDeliveryAccepted(ustn: string): Promise<boolean> {
  if (!ustn) return false;
  try {
    const count = await db.deliveryAcceptance.count({
      where: { ustn, status: "ACCEPTED" },
    });
    return count > 0;
  } catch (err) {
    logger.error("[delivery-acceptance] isDeliveryAccepted failed", {
      error: String(err),
      ustn,
    });
    return false;
  }
}

// ============ §1.10 Local claim-id generator ============

/**
 * Generate a `CLM-YYYYMMDD-NNNNN` claim id (5-digit zero-padded random
 * suffix). Pure (no DB, no side effects).
 *
 * This is a local copy of the §2 Claim Engine's generator so the
 * `rejectDelivery` / `partialAcceptance` auto-claim helpers can create
 * TradeClaim rows without a circular import on `@/lib/sgtx/claim`.
 */
export function generateClaimId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `CLM-${ymd}-${n}`;
}
