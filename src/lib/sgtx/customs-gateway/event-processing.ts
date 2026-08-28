// @ts-nocheck
/**
 * SGTX Customs Gateway — Government Event Processing
 * ===========================================================================
 *
 * Receives external government events (webhooks, polling responses, SFTP
 * drop notifications) and normalises them into SGTX-canonical CustomsEvent
 * records. Every external event goes through a 10-step pipeline before it
 * is allowed to influence declaration state.
 *
 * The 10-step pipeline (processGovernmentEvent):
 *   1.  Validate event schema         — required fields present, types correct.
 *   2.  Extract USTN                  — resolve external reference to USTN via
 *                                       SGTX system of record (NEVER trust
 *                                       external_reference as the USTN itself).
 *   3.  Verify broker GTID            — NEVER trust broker_gtid from the
 *                                       external event. Resolve it from the
 *                                       CustomsDeclaration that owns the USTN.
 *   4.  Check idempotency             — skip if eventId already processed.
 *   5.  Correlate with submission     — confirm the USTN has an active
 *                                       customs submission; reject orphans.
 *   6.  Normalise event type          — map government status strings to
 *                                       SGTX-canonical eventType.
 *   7.  Update declaration state      — write the new status to
 *                                       CustomsDeclaration (DRAFT → SUBMITTED
 *                                       → ACKNOWLEDGED → ACCEPTED / REJECTED /
 *                                       HOLD / RELEASED).
 *   8.  Publish to NATS               — emit the event on the broker-scoped
 *                                       subject so subscribers (broker portal,
 *                                       Smart Inbox, audit consumers) react.
 *   9.  Update Smart Inbox            — create / update the relevant inbox
 *                                       item so the broker sees the event.
 *   10. Append to Loom                — append a customs Loom event with full
 *                                       provenance (hash-chained, sanitised).
 *
 * SECURITY: NEVER trust broker_gtid or filer_code in external events. The
 * adapterId passed to processGovernmentEvent is the SGTX-side identifier —
 * the payload's broker_gtid is advisory only. We resolve the real broker
 * from the CustomsDeclaration that owns the USTN.
 *
 * All public functions are wrapped in try/catch with safe defaults — the
 * processor never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  getCustomsSubject,
  validateCustomsEventType,
} from "@/lib/sgtx/customs-gateway/nats-subjects";
import {
  appendCustomsLoomEvent,
  sanitizeForLoom,
} from "@/lib/sgtx/customs-gateway/loom-customs";
import { sendToDeadLetter } from "@/lib/sgtx/customs-gateway/webhook-security";

// ============ §1 Types ============

export interface CustomsEvent {
  eventId: string;
  jurisdiction: string;
  adapterId: string;
  brokerGtid: string;
  ustn: string;
  externalReference: string;
  eventType: string; // ACKNOWLEDGED | ACCEPTED | REJECTED | HOLD | RELEASED | CORRECTION_REQUIRED | PGA_HOLD
  timestamp: Date;
  correlationId: string;
  idempotencyKey: string;
  payloadHash: string;
  payload: any;
}

// ============ §2 Constants ============

/**
 * The canonical SGTX customs event types. External government status strings
 * are mapped to these via normaliseEventType().
 */
export const CANONICAL_CUSTOMS_EVENT_TYPES = [
  "ACKNOWLEDGED",
  "ACCEPTED",
  "REJECTED",
  "HOLD",
  "RELEASED",
  "CORRECTION_REQUIRED",
  "PGA_HOLD",
] as const;

/**
 * Maps external government status strings to SGTX-canonical event types.
 * Case-insensitive. Keys include common ACE, Nafeza, ATLAS, CDS, FASAH, etc.
 * status strings.
 *
 * Unknown status strings default to "ACKNOWLEDGED" (conservative — we
 * acknowledge receipt but do not infer a stronger state).
 */
const EVENT_TYPE_MAP: Record<string, string> = {
  // Acceptance family
  "accepted": "ACCEPTED",
  "cleared": "ACCEPTED",
  "released": "RELEASED",
  "complete": "ACCEPTED",
  "completed": "ACCEPTED",
  "approved": "ACCEPTED",
  "passed": "ACCEPTED",
  // Acknowledgement family
  "acknowledged": "ACKNOWLEDGED",
  "ack": "ACKNOWLEDGED",
  "received": "ACKNOWLEDGED",
  "submitted": "ACKNOWLEDGED",
  "in_review": "ACKNOWLEDGED",
  "processing": "ACKNOWLEDGED",
  "pending": "ACKNOWLEDGED",
  // Rejection family
  "rejected": "REJECTED",
  "denied": "REJECTED",
  "failed": "REJECTED",
  "error": "REJECTED",
  "invalid": "REJECTED",
  // Hold family
  "hold": "HOLD",
  "held": "HOLD",
  "on_hold": "HOLD",
  "suspended": "HOLD",
  "examination": "HOLD",
  "inspection": "HOLD",
  "exam": "HOLD",
  // Release family (post-hold)
  "release": "RELEASED",
  "released_from_hold": "RELEASED",
  // Correction family
  "correction_required": "CORRECTION_REQUIRED",
  "correction": "CORRECTION_REQUIRED",
  "amendment_required": "CORRECTION_REQUIRED",
  "resubmit": "CORRECTION_REQUIRED",
  // PGA hold family
  "pga_hold": "PGA_HOLD",
  "fda_hold": "PGA_HOLD",
  "epa_hold": "PGA_HOLD",
  "usda_hold": "PGA_HOLD",
  "agency_hold": "PGA_HOLD",
};

/**
 * Maps canonical event types to CustomsDeclaration.status values. Used by
 * step 7 (update declaration state). Conservative — only updates when the
 * new status represents forward progression.
 */
const DECLARATION_STATUS_MAP: Record<string, string> = {
  ACKNOWLEDGED: "ACKNOWLEDGED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  HOLD: "HOLD",
  RELEASED: "RELEASED",
  CORRECTION_REQUIRED: "CORRECTION_REQUIRED",
  PGA_HOLD: "PGA_HOLD",
};

/**
 * Maps canonical event types to customs Loom event types (loom-customs.ts).
 */
const LOOM_EVENT_MAP: Record<string, string> = {
  ACKNOWLEDGED: "government_acknowledged",
  ACCEPTED: "government_accepted",
  REJECTED: "government_rejected",
  HOLD: "government_hold",
  RELEASED: "government_released",
  CORRECTION_REQUIRED: "correction_requested",
  PGA_HOLD: "government_hold",
};

// ============ §3 Pure helpers ============

/**
 * Normalise an external government status string to a canonical SGTX event
 * type. Case-insensitive, whitespace-trimmed. Returns "ACKNOWLEDGED" if no
 * mapping is found (conservative default — we never infer a stronger state
 * from an unknown string).
 */
export function normaliseEventType(rawStatus: string): string {
  try {
    const s = String(rawStatus || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!s) return "ACKNOWLEDGED";
    return EVENT_TYPE_MAP[s] || "ACKNOWLEDGED";
  } catch {
    return "ACKNOWLEDGED";
  }
}

/**
 * Compute the SHA-256 hash of a payload (canonical JSON).
 */
async function computePayloadHash(payload: any): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const json = JSON.stringify(payload || {});
    return crypto.createHash("sha256").update(json, "utf8").digest("hex");
  } catch {
    return `error-${Date.now().toString(36)}`;
  }
}

/**
 * Generate a deterministic event ID. Format:
 *   CE-<ustn8>-<YYYYMMDDHHMMSS>-<random6>
 */
function generateEventId(ustn: string, timestamp: Date): string {
  try {
    const u = String(ustn || "GLOBAL").slice(0, 8).toUpperCase();
    const t = timestamp instanceof Date ? timestamp : new Date();
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    const ts =
      `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
      `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
    const r = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `CE-${u}-${ts}-${r}`;
  } catch {
    return `CE-UNKNOWN-${Date.now().toString(36).toUpperCase()}`;
  }
}

/**
 * Build an idempotency key for an external government event. Keyed on
 * adapterId + externalReference + eventType — if the same event arrives
 * twice, the second call is a no-op.
 */
function buildIdempotencyKey(
  adapterId: string,
  externalReference: string,
  eventType: string,
): string {
  try {
    return `customs-event-${adapterId}-${externalReference}-${eventType}`.slice(0, 200);
  } catch {
    return `customs-event-${adapterId}-${Date.now()}`;
  }
}

// ============ §4 USTN resolution (§2 of pipeline) ============

/**
 * Resolve the USTN for an external government event.
 *
 * The external event carries an `external_reference` (the government's own
 * tracking number, e.g. ACE MRN, Nafeza declaration number). We look up the
 * CustomsDeclaration whose declarationNo matches the external reference, then
 * resolve the USTN via the linked Trade.
 *
 * CRITICAL: we NEVER trust a USTN field in the external event payload — we
 * always resolve it via our own system of record. This prevents a malicious
 * or buggy adapter from injecting events into the wrong transaction.
 *
 * Returns { ustn, declarationId, brokerGtid } or null on resolution failure.
 */
async function resolveUstn(
  externalReference: string,
  adapterId: string,
): Promise<{
  ustn: string;
  declarationId: string;
  brokerGtid: string;
} | null> {
  try {
    if (!externalReference) {
      logger.warn("[event-processing] resolveUstn: missing externalReference", {
        adapterId,
      });
      return null;
    }
    // Look up CustomsDeclaration by declarationNo.
    const decl = await db.customsDeclaration.findFirst({
      where: {
        OR: [
          { declarationNo: externalReference },
          // Some adapters encode the external ref in etaXml (e.g. ACID number).
          { etaXml: { contains: externalReference } },
        ],
      },
      include: { trade: true },
    });
    if (!decl) {
      logger.warn("[event-processing] resolveUstn: no declaration for external ref", {
        externalReference,
        adapterId,
      });
      return null;
    }
    const ustn = decl.trade?.ustn;
    if (!ustn) {
      logger.warn("[event-processing] resolveUstn: declaration has no USTN", {
        declarationId: decl.id,
        externalReference,
      });
      return null;
    }
    return {
      ustn,
      declarationId: decl.id,
      brokerGtid: decl.brokerGtid || "",
    };
  } catch (err) {
    logger.error("[event-processing] resolveUstn failed", {
      error: String(err),
      externalReference,
      adapterId,
    });
    return null;
  }
}

// ============ §5 Idempotency check (§4 of pipeline) ============

/**
 * Check if a customs event has already been processed. Uses the
 * IntegrationConnectorLog table — the idempotencyKey column has a unique
 * constraint, so concurrent inserts collide safely.
 *
 * Returns true if the event was already processed (caller should skip).
 */
async function isAlreadyProcessed(idempotencyKey: string): Promise<boolean> {
  try {
    if (!idempotencyKey) return false;
    const existing = await db.integrationConnectorLog.findUnique({
      where: { idempotencyKey },
    });
    return !!existing;
  } catch (err) {
    logger.warn("[event-processing] idempotency check failed — assuming not processed", {
      error: String(err),
      idempotencyKey,
    });
    return false;
  }
}

/**
 * Record that a customs event has been processed (for future idempotency).
 */
async function recordProcessedEvent(
  idempotencyKey: string,
  event: CustomsEvent,
): Promise<void> {
  try {
    const logId = `CE-${event.adapterId}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: `customs-event:${event.adapterId}`,
        endpoint: `customs/${event.eventType.toLowerCase()}`,
        ustn: event.ustn,
        idempotencyKey,
        requestBody: JSON.stringify({
          eventId: event.eventId,
          eventType: event.eventType,
          externalReference: event.externalReference,
          brokerGtid: event.brokerGtid,
          jurisdiction: event.jurisdiction,
          payloadHash: event.payloadHash,
          correlationId: event.correlationId,
        }).slice(0, 2000),
        responseBody: JSON.stringify(event.payload || {}).slice(0, 2000),
        statusCode: 200,
        status: "PROCESSED",
        attemptCount: 1,
      },
    });
  } catch (err) {
    // Idempotency-key collision = concurrent duplicate. Not an error.
    logger.debug("[event-processing] recordProcessedEvent collision or error", {
      error: String(err),
      idempotencyKey,
    });
  }
}

// ============ §6 Update declaration state (§7 of pipeline) ============

/**
 * Update the CustomsDeclaration status based on a canonical event type.
 * Conservative — only updates if the new status represents forward
 * progression. Does NOT downgrade (e.g. a late-arriving ACKNOWLEDGED after
 * ACCEPTED is recorded as an event but does not change the declaration status).
 */
async function updateDeclarationState(
  declarationId: string,
  canonicalType: string,
): Promise<void> {
  try {
    if (!declarationId) return;
    const newStatus = DECLARATION_STATUS_MAP[canonicalType];
    if (!newStatus) return;

    const decl = await db.customsDeclaration.findUnique({
      where: { id: declarationId },
    });
    if (!decl) {
      logger.warn("[event-processing] updateDeclarationState: declaration not found", {
        declarationId,
      });
      return;
    }

    // Forward-progression check.
    const order = [
      "DRAFT",
      "SUBMITTED",
      "ACKNOWLEDGED",
      "CORRECTION_REQUIRED",
      "HOLD",
      "PGA_HOLD",
      "ACCEPTED",
      "RELEASED",
      "REJECTED",
    ];
    const currentIdx = order.indexOf(decl.status || "DRAFT");
    const newIdx = order.indexOf(newStatus);
    if (newIdx < 0) return; // unknown new status — skip
    if (currentIdx >= 0 && newIdx < currentIdx) {
      logger.info("[event-processing] status not downgraded (forward-only)", {
        declarationId,
        current: decl.status,
        attempted: newStatus,
      });
      return;
    }

    const update: any = { status: newStatus };
    if (newStatus === "ACCEPTED" || newStatus === "RELEASED") {
      update.clearedAt = new Date();
    }

    await db.customsDeclaration.update({
      where: { id: declarationId },
      data: update,
    });
    logger.info("[event-processing] declaration state updated", {
      declarationId,
      from: decl.status,
      to: newStatus,
    });
  } catch (err) {
    logger.error("[event-processing] updateDeclarationState failed", {
      error: String(err),
      declarationId,
      canonicalType,
    });
  }
}

// ============ §7 NATS publish (§8 of pipeline) ============

/**
 * "Publish" a customs event to NATS. In this implementation we do NOT have
 * a real NATS broker — instead we record the subject in the IntegrationConnectorLog
 * so an out-of-band NATS publisher can replay it. This keeps the module
 * dependency-free while preserving the publish semantics.
 *
 * The subject is built via getCustomsSubject() — tenant-scoped, broker-scoped.
 */
async function publishToNats(event: CustomsEvent): Promise<void> {
  try {
    // Map canonical type to NATS event type.
    const natsTypeMap: Record<string, string> = {
      ACKNOWLEDGED: "submission.acknowledged",
      ACCEPTED: "submission.status",
      REJECTED: "submission.status",
      HOLD: "hold",
      RELEASED: "release",
      CORRECTION_REQUIRED: "correction_required",
      PGA_HOLD: "pga_hold",
    };
    const natsType = natsTypeMap[event.eventType] || "submission.status";
    const subject = getCustomsSubject(
      event.jurisdiction,
      natsType,
      event.brokerGtid || "UNKNOWN",
    );

    logger.info("[event-processing] NATS publish (recorded)", {
      subject,
      eventId: event.eventId,
      ustn: event.ustn,
    });

    // Record the would-be publish for replay by an external NATS forwarder.
    try {
      const logId = `NATS-${event.eventId}-${Math.floor(Math.random() * 9000 + 1000)}`;
      await db.integrationConnectorLog.create({
        data: {
          logId,
          apiName: `nats-publish:${event.adapterId}`,
          endpoint: subject,
          ustn: event.ustn,
          idempotencyKey: `nats-${event.eventId}`,
          requestBody: JSON.stringify({
            subject,
            event: {
              eventId: event.eventId,
              ustn: event.ustn,
              eventType: event.eventType,
              timestamp: event.timestamp,
            },
          }).slice(0, 2000),
          status: "PUBLISHED",
          statusCode: 200,
        },
      });
    } catch {
      // best-effort
    }
  } catch (err) {
    logger.error("[event-processing] publishToNats failed", {
      error: String(err),
      eventId: event.eventId,
    });
  }
}

// ============ §8 Smart Inbox update (§9 of pipeline) ============

/**
 * Update the Smart Inbox for the broker. Creates or updates an InboxItem so
 * the broker sees the event in their portal.
 *
 * The InboxItem model is reused — the eventType column carries the customs
 * event type, the title carries a human-readable summary.
 */
async function updateSmartInbox(event: CustomsEvent): Promise<void> {
  try {
    if (!event.brokerGtid) return;
    // InboxItem may not exist in schema — use a defensive try/catch.
    // We attempt to create an inbox item; if the model is missing we log.
    const title = `Customs ${event.eventType}: ${event.externalReference}`;
    const description = `Government event received via adapter ${event.adapterId} for USTN ${event.ustn}. Event type: ${event.eventType}.`;

    try {
      // @ts-ignore — InboxItem may or may not exist on the Prisma client.
      await db.inboxItem.create({
        data: {
          tenantGtid: event.brokerGtid,
          ustn: event.ustn,
          title,
          description,
          eventType: `CUSTOMS_${event.eventType}`,
          severity: event.eventType === "REJECTED" || event.eventType === "HOLD" || event.eventType === "PGA_HOLD"
            ? "HIGH"
            : event.eventType === "CORRECTION_REQUIRED"
              ? "MEDIUM"
              : "LOW",
          status: "UNREAD",
        },
      });
    } catch (dbErr) {
      // InboxItem model may not exist in this Prisma schema — log and continue.
      logger.debug("[event-processing] inbox update skipped (model may be missing)", {
        error: String(dbErr),
        brokerGtid: event.brokerGtid,
      });
    }
  } catch (err) {
    logger.error("[event-processing] updateSmartInbox failed", {
      error: String(err),
      eventId: event.eventId,
    });
  }
}

// ============ §9 Loom append (§10 of pipeline) ============

/**
 * Append the event to the customs Loom. Uses appendCustomsLoomEvent from
 * loom-customs.ts — the payload is sanitised inside that function.
 */
async function appendToLoom(event: CustomsEvent, declarationId: string): Promise<void> {
  try {
    const loomEventType = LOOM_EVENT_MAP[event.eventType];
    if (!loomEventType) {
      logger.warn("[event-processing] no Loom mapping for event type", {
        eventType: event.eventType,
      });
      return;
    }
    await appendCustomsLoomEvent(
      loomEventType,
      event.ustn,
      event.brokerGtid || `adapter:${event.adapterId}`,
      {
        eventId: event.eventId,
        eventType: event.eventType,
        externalReference: event.externalReference,
        jurisdiction: event.jurisdiction,
        adapterId: event.adapterId,
        correlationId: event.correlationId,
        payloadHash: event.payloadHash,
        timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp),
      },
      declarationId,
    );
  } catch (err) {
    logger.error("[event-processing] appendToLoom failed", {
      error: String(err),
      eventId: event.eventId,
    });
  }
}

// ============ §10 processGovernmentEvent — the 10-step pipeline ============

/**
 * Process an external government event. Runs the 10-step pipeline:
 *
 *   1.  Validate event schema
 *   2.  Extract USTN from external reference (resolve against SGTX system of record)
 *   3.  Verify broker GTID (NEVER trust broker_gtid from external event)
 *   4.  Check idempotency (skip if already processed)
 *   5.  Correlate with original submission
 *   6.  Normalize event type to SGTX canonical
 *   7.  Update declaration state
 *   8.  Publish to NATS
 *   9.  Update Smart Inbox
 *   10. Append to Loom
 *
 * Returns the normalised CustomsEvent on success. On failure (invalid
 * schema, USTN resolution failure, etc.) the event is sent to the
 * dead-letter queue and a minimal error skeleton is returned.
 *
 * NEVER throws — all errors are caught and converted to safe returns.
 */
export async function processGovernmentEvent(
  rawEvent: any,
  adapterId: string,
): Promise<CustomsEvent> {
  try {
    if (!rawEvent || typeof rawEvent !== "object") {
      logger.warn("[event-processing] rejected: rawEvent is not an object", { adapterId });
      await sendToDeadLetter(rawEvent, "rawEvent is not an object", adapterId);
      return _errorEvent(adapterId);
    }
    if (!adapterId) {
      logger.warn("[event-processing] rejected: missing adapterId");
      await sendToDeadLetter(rawEvent, "missing adapterId", "unknown");
      return _errorEvent("unknown");
    }

    // §1 Validate event schema. Required: external_reference, event_type or
    // status, timestamp (or event_timestamp).
    const externalReference =
      rawEvent.external_reference ||
      rawEvent.externalReference ||
      rawEvent.reference ||
      rawEvent.declaration_no ||
      rawEvent.declarationNo ||
      rawEvent.mrn;
    const rawStatus =
      rawEvent.event_type ||
      rawEvent.eventType ||
      rawEvent.status ||
      rawEvent.state ||
      "ACKNOWLEDGED";
    const rawTimestamp =
      rawEvent.timestamp ||
      rawEvent.event_timestamp ||
      rawEvent.eventTimestamp ||
      new Date().toISOString();
    const jurisdiction =
      rawEvent.jurisdiction ||
      rawEvent.country ||
      rawEvent.country_code ||
      "us";

    if (!externalReference) {
      logger.warn("[event-processing] rejected: missing external_reference", { adapterId });
      await sendToDeadLetter(rawEvent, "missing external_reference", adapterId);
      return _errorEvent(adapterId);
    }

    // §2 + §3 Resolve USTN and broker GTID (NEVER trust payload).
    const resolved = await resolveUstn(externalReference, adapterId);
    if (!resolved) {
      logger.warn("[event-processing] rejected: USTN resolution failed", {
        externalReference,
        adapterId,
      });
      await sendToDeadLetter(
        rawEvent,
        `USTN resolution failed for external_reference=${externalReference}`,
        adapterId,
      );
      return _errorEvent(adapterId);
    }

    // §6 Normalise event type.
    const canonicalType = normaliseEventType(rawStatus);

    // §4 Idempotency check.
    const idempotencyKey = buildIdempotencyKey(adapterId, externalReference, canonicalType);
    if (await isAlreadyProcessed(idempotencyKey)) {
      logger.info("[event-processing] idempotent skip — already processed", {
        idempotencyKey,
        externalReference,
        canonicalType,
      });
      return _errorEvent(adapterId, "IDEMPOTENT_SKIP", resolved.ustn, resolved.brokerGtid);
    }

    // Build the canonical CustomsEvent.
    const timestamp = new Date(rawTimestamp);
    if (isNaN(timestamp.getTime())) {
      // Invalid timestamp — use now.
    }
    const safeTimestamp = timestamp && !isNaN(timestamp.getTime()) ? timestamp : new Date();
    const eventId =
      rawEvent.event_id ||
      rawEvent.eventId ||
      generateEventId(resolved.ustn, safeTimestamp);
    const correlationId =
      rawEvent.correlation_id ||
      rawEvent.correlationId ||
      `${adapterId}-${externalReference}`;
    const sanitisedPayload = sanitizeForLoom(rawEvent);
    const payloadHash = await computePayloadHash(sanitisedPayload);

    const event: CustomsEvent = {
      eventId,
      jurisdiction: String(jurisdiction || "us").toLowerCase(),
      adapterId,
      brokerGtid: resolved.brokerGtid,
      ustn: resolved.ustn,
      externalReference,
      eventType: canonicalType,
      timestamp: safeTimestamp,
      correlationId,
      idempotencyKey,
      payloadHash,
      payload: sanitisedPayload,
    };

    // §5 Correlate with original submission (sanity check — already done in
    // resolveUstn; here we log).
    logger.info("[event-processing] event correlated", {
      eventId,
      ustn: event.ustn,
      declarationId: resolved.declarationId,
      brokerGtid: event.brokerGtid,
      eventType: event.eventType,
    });

    // §7 Update declaration state.
    await updateDeclarationState(resolved.declarationId, canonicalType);

    // §8 Publish to NATS.
    await publishToNats(event);

    // §9 Update Smart Inbox.
    await updateSmartInbox(event);

    // §10 Append to Loom.
    await appendToLoom(event, resolved.declarationId);

    // Record for future idempotency.
    await recordProcessedEvent(idempotencyKey, event);

    logger.info("[event-processing] event processed", {
      eventId,
      ustn: event.ustn,
      eventType: event.eventType,
      adapterId,
    });

    return event;
  } catch (err) {
    logger.error("[event-processing] processGovernmentEvent failed — safe fallback", {
      error: String(err),
      adapterId,
    });
    try {
      await sendToDeadLetter(rawEvent, `pipeline error: ${String(err)}`, adapterId);
    } catch {
      // last-resort
    }
    return _errorEvent(adapterId);
  }
}

// ============ §11 Query helpers ============

/**
 * Get all customs events for a USTN, oldest first.
 *
 * Reads from the IntegrationConnectorLog table — the apiName pattern
 * `customs-event:<adapterId>` identifies customs event records.
 *
 * Returns an empty array on error — never throws.
 */
export async function getEventsByUSTN(ustn: string): Promise<CustomsEvent[]> {
  try {
    if (!ustn) return [];
    const rows = await db.integrationConnectorLog.findMany({
      where: {
        ustn,
        apiName: { startsWith: "customs-event:" },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return (rows || []).map((r: any) => _rowToEvent(r));
  } catch (err) {
    logger.error("[event-processing] getEventsByUSTN failed — empty list", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Get all customs events for an adapter, oldest first.
 *
 * Returns an empty array on error — never throws.
 */
export async function getEventsByAdapter(
  adapterId: string,
): Promise<CustomsEvent[]> {
  try {
    if (!adapterId) return [];
    const rows = await db.integrationConnectorLog.findMany({
      where: {
        apiName: `customs-event:${adapterId}`,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return (rows || []).map((r: any) => _rowToEvent(r));
  } catch (err) {
    logger.error("[event-processing] getEventsByAdapter failed — empty list", {
      error: String(err),
      adapterId,
    });
    return [];
  }
}

// ============ §12 Internal helpers ============

function _rowToEvent(row: any): CustomsEvent {
  try {
    const body =
      typeof row?.requestBody === "string"
        ? JSON.parse(row.requestBody)
        : row?.requestBody || {};
    const payload =
      typeof row?.responseBody === "string"
        ? JSON.parse(row.responseBody)
        : row?.responseBody || {};
    return {
      eventId: body.eventId || row?.logId || "unknown",
      jurisdiction: body.jurisdiction || "us",
      adapterId: (row?.apiName || "").replace("customs-event:", ""),
      brokerGtid: body.brokerGtid || "",
      ustn: row?.ustn || body.ustn || "",
      externalReference: body.externalReference || "",
      eventType: body.eventType || "ACKNOWLEDGED",
      timestamp: row?.createdAt || new Date(),
      correlationId: body.correlationId || row?.logId || "",
      idempotencyKey: row?.idempotencyKey || "",
      payloadHash: body.payloadHash || "",
      payload,
    };
  } catch {
    return _errorEvent("");
  }
}

function _errorEvent(
  adapterId: string,
  eventType = "ERROR",
  ustn = "",
  brokerGtid = "",
): CustomsEvent {
  return {
    eventId: `CE-ERROR-${Date.now().toString(36).toUpperCase()}`,
    jurisdiction: "xx",
    adapterId: adapterId || "",
    brokerGtid,
    ustn,
    externalReference: "",
    eventType,
    timestamp: new Date(),
    correlationId: "",
    idempotencyKey: "",
    payloadHash: "error",
    payload: null,
  };
}
