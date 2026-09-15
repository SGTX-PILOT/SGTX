// @ts-nocheck
/**
 * SGTX v18 §13.10 — Trade Memory Layer Recording (Payment Events)
 * ===========================================================================
 *
 * Six payment event types are captured into the Trade Memory layer so that
 * each payment lifecycle transition becomes a queryable, anonymised event
 * suitable for ML training, anomaly detection, and longitudinal analytics.
 *
 * Event types & payloads:
 *
 *   PAYMENT_MANIFEST_GENERATED
 *     { ustn, legs, amounts, currencies, buyer_gtid, timestamp }
 *
 *   PAYMENT_MANIFEST_AUTHORIZED
 *     { ustn, buyer_gtid, bank_gtid, iso_msg_id, timestamp }
 *
 *   PAYMENT_MANIFEST_DISPATCHED
 *     { ustn, bank_gtid, iso_msg_id, legs, timestamp }
 *
 *   PAYMENT_LEG_SETTLED
 *     { ustn, leg_id, end_to_end_id, amount, currency, settled_at }
 *
 *   PAYMENT_LEG_FAILED
 *     { ustn, leg_id, end_to_end_id, error_code, retry_count, failed_at }
 *
 *   PAYMENT_RECONCILIATION_COMPLETE
 *     { ustn, all_legs_matched, reconciliation_id, completed_at }
 *
 * Each event is persisted as a TradeMemoryEvent row with category "PAYMENT".
 * Tenant GTIDs are anonymised with a monthly-rotating pepper (sha256 prefix),
 * matching the existing trade-memory event route convention.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ §13.10 Constants ============

export const PAYMENT_EVENT_TYPES = [
  "PAYMENT_MANIFEST_GENERATED",
  "PAYMENT_MANIFEST_AUTHORIZED",
  "PAYMENT_MANIFEST_DISPATCHED",
  "PAYMENT_LEG_SETTLED",
  "PAYMENT_LEG_FAILED",
  "PAYMENT_RECONCILIATION_COMPLETE",
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export const PAYMENT_EVENT_CATEGORY = "PAYMENT";

// ============ Types ============

export interface PaymentEventData {
  ustn?: string | null;
  buyer_gtid?: string;
  bank_gtid?: string;
  iso_msg_id?: string;
  legs?: any[];
  leg_id?: string;
  end_to_end_id?: string;
  amount?: number;
  currency?: string;
  settled_at?: string;
  error_code?: string;
  retry_count?: number;
  failed_at?: string;
  all_legs_matched?: boolean;
  reconciliation_id?: string;
  completed_at?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface RecordPaymentEventInput {
  ustn: string;
  eventType: PaymentEventType;
  eventData: PaymentEventData;
  tenantGtid?: string | null;
}

export interface RecordPaymentEventResult {
  recordedEventId: string;
  ustn: string;
  eventType: PaymentEventType;
  anonymizedId: string | null;
  capturedAt: string;
}

export interface PaymentEventRow {
  id: string;
  ustn: string | null;
  tenantGtid: string | null;
  anonymizedId: string | null;
  eventType: string;
  eventValue: number | null;
  eventMetadata: any;
  createdAt: string;
}

export interface PaymentEventsList {
  events: PaymentEventRow[];
  total: number;
}

// ============ Helpers ============

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Compute a monthly-rotating anonymised tenant ID. Pepper rotates each
 * calendar month so the same tenant resolves to a different anonymised
 * identifier each month — preserving within-month analytics without
 * enabling permanent cross-month re-identification.
 */
function computeAnonymizedId(tenantGtid: string | null | undefined): string | null {
  if (!tenantGtid) return null;
  const pepper = `sgtx-pepper-${new Date().toISOString().slice(0, 7)}`;
  return createHash("sha256")
    .update(tenantGtid + pepper)
    .digest("hex")
    .slice(0, 16);
}

function isPaymentEventType(s: string): s is PaymentEventType {
  return (PAYMENT_EVENT_TYPES as readonly string[]).includes(s);
}

function extractEventValue(eventType: PaymentEventType, data: PaymentEventData): number | null {
  switch (eventType) {
    case "PAYMENT_MANIFEST_GENERATED":
      return Array.isArray(data.legs) ? data.legs.length : null;
    case "PAYMENT_MANIFEST_DISPATCHED":
      return Array.isArray(data.legs) ? data.legs.length : null;
    case "PAYMENT_LEG_SETTLED":
      return typeof data.amount === "number" ? data.amount : null;
    case "PAYMENT_LEG_FAILED":
      return typeof data.retry_count === "number" ? data.retry_count : null;
    case "PAYMENT_RECONCILIATION_COMPLETE":
      return data.all_legs_matched ? 1 : 0;
    default:
      return null;
  }
}

// ============ §13.10.1 recordPaymentEvent ============

export async function recordPaymentEvent(
  input: RecordPaymentEventInput,
): Promise<RecordPaymentEventResult> {
  const { ustn, eventType, eventData, tenantGtid } = input;

  if (!isPaymentEventType(eventType)) {
    throw new Error(`Invalid payment event type: ${eventType}`);
  }

  const capturedAt = nowIso();
  const payload: PaymentEventData = { ...eventData, ustn, timestamp: eventData.timestamp ?? capturedAt };
  const eventValue = extractEventValue(eventType, payload);
  const anonymizedId = computeAnonymizedId(tenantGtid ?? eventData.buyer_gtid ?? null);

  let recordedId: string | null = null;
  try {
    const created = await db.tradeMemoryEvent.create({
      data: {
        ustn,
        tenantGtid: tenantGtid ?? null,
        category: PAYMENT_EVENT_CATEGORY,
        eventType,
        eventValue,
        eventMetadata: JSON.stringify(payload),
        anonymizedId,
      },
    });
    recordedId = created.id;
  } catch (e: any) {
    logger.error("[trade-memory-payment] recordPaymentEvent persist failed", {
      ustn,
      eventType,
      error: e?.message,
    });
    throw new Error(`Failed to record payment event: ${e?.message ?? "unknown"}`);
  }

  return {
    recordedEventId: recordedId ?? "",
    ustn,
    eventType,
    anonymizedId,
    capturedAt,
  };
}

// ============ §13.10.2 getPaymentEvents ============

export async function getPaymentEvents(
  ustn: string,
  options?: { eventType?: PaymentEventType; limit?: number; sinceIso?: string },
): Promise<PaymentEventsList> {
  const where: any = { ustn, category: PAYMENT_EVENT_CATEGORY };
  if (options?.eventType) where.eventType = options.eventType;
  if (options?.sinceIso) where.createdAt = { gte: new Date(options.sinceIso) };
  const limit = options?.limit ?? 200;

  try {
    const rows = await db.tradeMemoryEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const events: PaymentEventRow[] = rows.map((r: any) => ({
      id: r.id,
      ustn: r.ustn,
      tenantGtid: r.tenantGtid,
      anonymizedId: r.anonymizedId,
      eventType: r.eventType,
      eventValue: r.eventValue,
      eventMetadata: r.eventMetadata ? JSON.parse(r.eventMetadata) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
    return { events, total: events.length };
  } catch (e: any) {
    logger.error("[trade-memory-payment] getPaymentEvents failed", { ustn, error: e?.message });
    return { events: [], total: 0 };
  }
}

// ============ §13.10.3 getPaymentEventByType ============

export async function getPaymentEventByType(
  ustn: string,
  eventType: PaymentEventType,
): Promise<PaymentEventsList> {
  return getPaymentEvents(ustn, { eventType, limit: 200 });
}

// ============ §13.10.4 listAllPaymentEvents (bonus) ============

export async function listAllPaymentEvents(
  options?: { tenantGtid?: string; limit?: number; offset?: number },
): Promise<PaymentEventsList> {
  const where: any = { category: PAYMENT_EVENT_CATEGORY };
  if (options?.tenantGtid) where.tenantGtid = options.tenantGtid;
  const limit = Math.min(options?.limit ?? 100, 500);
  const offset = options?.offset ?? 0;

  try {
    const rows = await db.tradeMemoryEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    const events: PaymentEventRow[] = rows.map((r: any) => ({
      id: r.id,
      ustn: r.ustn,
      tenantGtid: r.tenantGtid,
      anonymizedId: r.anonymizedId,
      eventType: r.eventType,
      eventValue: r.eventValue,
      eventMetadata: r.eventMetadata ? JSON.parse(r.eventMetadata) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
    return { events, total: events.length };
  } catch (e: any) {
    logger.error("[trade-memory-payment] listAllPaymentEvents failed", { error: e?.message });
    return { events: [], total: 0 };
  }
}
