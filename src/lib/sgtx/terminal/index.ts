// SGTX Add-On 24 — Port & Terminal Integration
// ===========================================================================
//
// Receives, validates, and persists EDI / API events emitted by external
// terminal operating systems (TOS): gate-in, gate-out, vessel arrival,
// vessel departure, container load, container discharge, etc.
//
// The `receiveTerminalEvent` helper is the inbound ingestion path. It:
//   1. Validates the event payload (eventType + at least one of
//      {terminalIntegrationId, ustn} required).
//   2. Persists the raw event row (processed=false).
//   3. Optionally triggers downstream processing — handled here as a no-op
//      stub (`processEvent`) so that real processing (milestone emission,
//      Governor notification, demurrage auto-ping) can be wired in later.
//
// The integration registry (`TerminalIntegration`) tracks which terminals
// are wired up, what format they speak (EDI / API / SFTP), and credentials
// (encrypted). The API route `/integrations` is read-only and never
// returns `credentialsEncrypted`.
//
// Models:
//   db.terminalIntegration — registry of wired-up terminals
//   db.terminalEvent      — inbound event log (raw + processed flag)
//
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type TerminalEventType =
  | "GATE_IN"
  | "GATE_OUT"
  | "VESSEL_ARRIVAL"
  | "VESSEL_DEPARTURE"
  | "CONTAINER_LOAD"
  | "CONTAINER_DISCHARGE"
  | "CUSTOMS_HOLD"
  | "CUSTOMS_RELEASE"
  | "STACK_MOVE"
  | "OTHER";

export interface ReceiveTerminalEventInput {
  ustn?: string | null;
  terminalIntegrationId?: string | null;
  eventType: string;
  eventData?: Record<string, any> | string | null;
  /** Skip the (currently no-op) downstream processing step. Default false. */
  skipProcessing?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** List terminal integrations, optionally filtered by terminalGtid. */
export async function listTerminalIntegrations(terminalGtid?: string) {
  const where: any = {};
  if (terminalGtid) where.terminalGtid = terminalGtid;
  const rows = await (db as any).terminalIntegration.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows || [];
}

/** Receive an inbound terminal event.
 *  Throws if eventType is missing or both terminalIntegrationId and ustn
 *  are absent (an event must be attributable to at least one of them). */
export async function receiveTerminalEvent(input: ReceiveTerminalEventInput) {
  if (!input.eventType?.trim()) {
    throw new Error("eventType is required");
  }
  if (!input.terminalIntegrationId && !input.ustn) {
    throw new Error("either terminalIntegrationId or ustn is required");
  }

  // If a terminalIntegrationId is provided, validate the integration exists
  // and is active.
  if (input.terminalIntegrationId) {
    const integ = await (db as any).terminalIntegration.findUnique({
      where: { id: input.terminalIntegrationId },
      select: { id: true, isActive: true },
    });
    if (!integ) {
      throw new Error(`terminalIntegration not found: ${input.terminalIntegrationId}`);
    }
  }

  // eventData is stored as a JSON string (schema column is String?).
  const eventDataStr =
    input.eventData == null
      ? null
      : typeof input.eventData === "string"
        ? input.eventData
        : JSON.stringify(input.eventData);

  const data: any = {
    eventType: input.eventType.trim(),
    eventData: eventDataStr,
    processed: false,
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.terminalIntegrationId) data.terminalIntegrationId = input.terminalIntegrationId;

  const event = await (db as any).terminalEvent.create({ data });
  logger.info("[terminal] event received", {
    eventId: event.id,
    eventType: data.eventType,
    ustn: input.ustn || null,
    terminalIntegrationId: input.terminalIntegrationId || null,
  });

  // Best-effort downstream processing — never let a processing failure roll
  // back the event receipt. (Currently a no-op stub; real implementation
  // will emit milestones + Governor notifications.)
  if (!input.skipProcessing) {
    try {
      await processEvent(event);
    } catch (e: any) {
      logger.warn("[terminal] processing failed (event still persisted)", {
        eventId: event.id,
        error: e?.message || String(e),
      });
    }
  }

  return event;
}

/** List terminal events for a shipment (by USTN). */
export async function listTerminalEventsForShipment(ustn: string) {
  if (!ustn) return [];
  const rows = await (db as any).terminalEvent.findMany({
    where: { ustn },
    orderBy: { receivedAt: "desc" },
  });
  return rows || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: downstream processing (no-op stub for future wiring)
// ─────────────────────────────────────────────────────────────────────────────

/** Process a received event: mark it processed. Future versions will emit
 *  milestones, ping the Governor, trigger demurrage recompute, etc. */
async function processEvent(event: any): Promise<void> {
  await (db as any).terminalEvent.update({
    where: { id: event.id },
    data: { processed: true, processedAt: new Date() },
  });
}
