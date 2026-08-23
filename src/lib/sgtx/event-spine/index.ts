// @ts-nocheck
/**
 * SGTX Master Amendment — §12-18 Immutable Canonical Event Spine Engine
 * ===========================================================================
 *
 * Implements the immutable, hash-chained CanonicalEvent spine that is the
 * single source of truth for everything that happened to a USTN.
 *
 * §12 — Every real-world occurrence is recorded as a CanonicalEvent with:
 *   - eventId              — globally unique, derived from ustn+seq+random
 *   - ustn                 — the linked transaction
 *   - parentEventId        — §15 event causality (what triggered this)
 *   - eventType            — TRADE_CREATED, CONTRACT_SIGNED, …
 *   - eventTypeCategory    — OBSERVATION | ASSERTION | CONFIRMATION | COMMAND
 *   - eventTime            — §16 when the event actually occurred
 *   - observationTime      — §16 when SGTX received it
 *   - effectiveTime        — §16 when it became legally/operationally effective
 *   - sourceSystem         — originating system (BANK, CUSTOMS, ERP, …)
 *   - authority            — who has authority over this event
 *   - evidenceReference    — JSON array of evidence refs
 *   - previousEventHash    — link to the prior event in the chain (§15)
 *   - eventHash            — SHA-256 of canonical payload
 *   - idempotencyKey       — §18 deduplication key
 *   - status               — RECORDED | PROVISIONAL | SUPERSEDED | REJECTED
 *
 * §17 — Out-of-order events are preserved (eventTime vs observationTime
 *       are independent). The chain is ordered by observationTime for
 *       hash chaining, but eventTime is preserved for causal replay.
 *
 * §18 — Idempotency: if `appendEvent` is called twice with the same
 *       idempotencyKey, the second call returns the prior event unchanged
 *       (no duplicate, no new hash chain link).
 *
 * §86 — replayFromHistory: reconstruct the state vector from the event
 *       history (pure replay). Used for forensic verification and for
 *       rebuilding a Twin after a database incident.
 *
 * SHA-256 is computed via dynamic `await import('node:crypto')` so the
 * module can be loaded in both server and edge runtimes.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §12 Constants — canonical event types ============

/**
 * §12 — the canonical event types. Every event in SGTX is one of these.
 * Grouped by category for readability but flat-typed for fast lookup.
 */
export const EVENT_TYPES = [
  // === Trade lifecycle ===
  "TRADE_CREATED",
  "TRADE_UPDATED",
  "TRADE_CANCELLED",
  "TRADE_CLOSED",
  // === Contracting ===
  "CONTRACT_DRAFTED",
  "CONTRACT_SIGNED",
  "CONTRACT_AMENDED",
  "CONTRACT_TERMINATED",
  // === Financial / Payment ===
  "PAYMENT_AUTHORIZED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_PROCESSING",
  "PAYMENT_SETTLED",
  "PAYMENT_PARTIALLY_SETTLED",
  "PAYMENT_REJECTED",
  "PAYMENT_RETURNED",
  "PAYMENT_RECALLED",
  "PAYMENT_REVERSED",
  "FEE_COLLECTED",
  "FEE_REFUNDED",
  // === Documents ===
  "DOCUMENT_DRAFTED",
  "DOCUMENT_ISSUED",
  "DOCUMENT_VERIFIED",
  "DOCUMENT_SEALED",
  "DOCUMENT_REVOKED",
  "LC_ISSUED",
  "LC_CONFIRMED",
  "LC_AMENDED",
  "LC_DRAWN",
  // === Logistics / Execution ===
  "GOODS_PICKED_UP",
  "GOODS_IN_TRANSIT",
  "GOODS_ARRIVED",
  "GOODS_DELIVERED",
  "GOODS_ACCEPTED",
  "GOODS_REJECTED",
  // === Compliance / Customs ===
  "CUSTOMS_SUBMITTED",
  "CUSTOMS_ASSESSED",
  "CUSTOMS_CLEARED",
  "CUSTOMS_HOLD",
  "CUSTOMS_RELEASED",
  "SANCTIONS_CHECK",
  "AML_SCREENING",
  // === Reconciliation ===
  "RECONCILIATION_MATCHED",
  "RECONCILIATION_DIVERGENT",
  "RECONCILIATION_RESOLVED",
  // === Disputes / Exceptions ===
  "EXCEPTION_RAISED",
  "EXCEPTION_ACKNOWLEDGED",
  "EXCEPTION_RESOLVED",
  "EXCEPTION_ESCALATED",
  "DISPUTE_OPENED",
  "DISPUTE_RESOLVED",
  // === Recovery / Closure ===
  "RECOVERY_INITIATED",
  "RECOVERY_COMPLETED",
  "EVIDENCE_SEALED",
  "CLOSURE_REQUESTED",
  "CLOSURE_GRANTED",
  "CLOSURE_DENIED",
  // === Authority / External ===
  "AUTHORITY_DETERMINATION",
  "EXTERNAL_EVENT_RECEIVED",
  "POLICY_APPLIED",
  "POLICY_SUPERSEDED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * §159.1, §159.2 — four canonical event categories. Every event must be
 * classified into exactly one of these.
 *
 *   OBSERVATION   — SGTX observed an external occurrence (e.g. bank
 *                   sent a payment confirmation). No authority claimed.
 *   ASSERTION     — A party asserts a fact (e.g. seller asserts goods
 *                   shipped). Needs confirmation.
 *   CONFIRMATION  — A confirming authority verified an assertion
 *                   (e.g. customs confirmed clearance).
 *   COMMAND       — SGTX (or an authority) issues a directive
 *                   (e.g. CLOSE, REVERSE, SUSPEND).
 */
export const EVENT_CATEGORIES = [
  "OBSERVATION",
  "ASSERTION",
  "CONFIRMATION",
  "COMMAND",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/**
 * Canonical event status (§12).
 */
export const EVENT_STATUSES = [
  "RECORDED",
  "PROVISIONAL",
  "SUPERSEDED",
  "REJECTED",
] as const;

// ============ Types ============

export interface AppendEventInput {
  ustn?: string | null;
  parentEventId?: string | null;
  eventType: string;
  eventTypeCategory?: string;
  eventTime?: Date;
  observationTime?: Date;
  effectiveTime?: Date | null;
  sourceSystem?: string | null;
  sourceEventId?: string | null;
  sourceReference?: string | null;
  authority?: string | null;
  evidenceReference?: string[] | null;
  policyVersion?: string | null;
  actor?: string | null;
  authorizationContext?: Record<string, any> | null;
  idempotencyKey?: string | null;
  notes?: string | null;
}

export interface CanonicalEventRow {
  id: string;
  eventId: string;
  ustn?: string | null;
  parentEventId?: string | null;
  eventType: string;
  eventTypeCategory: string;
  eventTime: Date;
  observationTime: Date;
  effectiveTime?: Date | null;
  sourceSystem?: string | null;
  sourceEventId?: string | null;
  sourceReference?: string | null;
  authority?: string | null;
  evidenceReference?: string | null;
  previousEventHash?: string | null;
  eventHash?: string | null;
  policyVersion?: string | null;
  actor?: string | null;
  authorizationContext?: string | null;
  idempotencyKey?: string | null;
  status: string;
  notes?: string | null;
  createdAt: Date;
}

export interface ChainVerification {
  ustn: string;
  verified: boolean;
  totalEvents: number;
  brokenAt?: number; // 1-based index of first broken link
  brokenEventId?: string;
  expectedHash?: string;
  actualHash?: string;
}

// ============ §12.0 Pure helpers ============

/**
 * Pure: derive the event category for a given event type. Used as a
 * fallback when the caller does not specify one explicitly.
 */
export function deriveEventCategory(eventType: string): string {
  const t = String(eventType || "").toUpperCase();
  // COMMAND: closures, reversals, escalations, recoveries
  if (
    t.startsWith("CLOSURE_") ||
    t === "PAYMENT_REVERSED" ||
    t === "PAYMENT_RECALLED" ||
    t === "EXCEPTION_ESCALATED" ||
    t === "TRADE_CANCELLED" ||
    t === "CONTRACT_TERMINATED" ||
    t === "DOCUMENT_REVOKED" ||
    t.startsWith("RECOVERY_")
  ) {
    return "COMMAND";
  }
  // CONFIRMATION: settled / cleared / sealed
  if (
    t === "PAYMENT_SETTLED" ||
    t === "PAYMENT_PARTIALLY_SETTLED" ||
    t === "CUSTOMS_CLEARED" ||
    t === "CUSTOMS_RELEASED" ||
    t === "DOCUMENT_SEALED" ||
    t === "RECONCILIATION_MATCHED" ||
    t === "LC_CONFIRMED" ||
    t === "GOODS_DELIVERED" ||
    t === "GOODS_ACCEPTED" ||
    t === "EXCEPTION_RESOLVED" ||
    t === "DISPUTE_RESOLVED" ||
    t === "CLOSURE_GRANTED" ||
    t === "AUTHORITY_DETERMINATION"
  ) {
    return "CONFIRMATION";
  }
  // ASSERTION: drafted, submitted, opened
  if (
    t.endsWith("_DRAFTED") ||
    t.endsWith("_SUBMITTED") ||
    t === "CONTRACT_SIGNED" ||
    t === "GOODS_PICKED_UP" ||
    t === "EXCEPTION_RAISED" ||
    t === "DISPUTE_OPENED" ||
    t === "CLOSURE_REQUESTED" ||
    t === "TRADE_CREATED" ||
    t === "EXTERNAL_EVENT_RECEIVED" ||
    t === "POLICY_APPLIED"
  ) {
    return "ASSERTION";
  }
  // Default: OBSERVATION
  return "OBSERVATION";
}

/**
 * Pure: serialize the canonical payload of an event for SHA-256 hashing.
 * The canonical form is a stable, deterministic JSON serialization
 * (sorted keys, no whitespace) of the immutable fields.
 */
export function canonicalEventPayload(ev: Partial<CanonicalEventRow>): string {
  const canonical = {
    eventId: ev.eventId || "",
    ustn: ev.ustn || "",
    parentEventId: ev.parentEventId || "",
    eventType: ev.eventType || "",
    eventTypeCategory: ev.eventTypeCategory || "",
    eventTime: ev.eventTime instanceof Date ? ev.eventTime.toISOString() : String(ev.eventTime || ""),
    observationTime:
      ev.observationTime instanceof Date
        ? ev.observationTime.toISOString()
        : String(ev.observationTime || ""),
    effectiveTime:
      ev.effectiveTime instanceof Date
        ? ev.effectiveTime.toISOString()
        : String(ev.effectiveTime || ""),
    sourceSystem: ev.sourceSystem || "",
    sourceEventId: ev.sourceEventId || "",
    sourceReference: ev.sourceReference || "",
    authority: ev.authority || "",
    evidenceReference: ev.evidenceReference || "",
    previousEventHash: ev.previousEventHash || "",
    policyVersion: ev.policyVersion || "",
    actor: ev.actor || "",
    authorizationContext: ev.authorizationContext || "",
    idempotencyKey: ev.idempotencyKey || "",
    status: ev.status || "RECORDED",
  };
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Pure: generate an eventId for a new canonical event. Format:
 *   E-{ustn8}-{YYYYMMDDHHMMSS}-{RANDOM8}
 *
 * For events with no ustn, "GLOBAL" is used.
 */
export function generateEventId(
  ustn?: string | null,
  observationTime?: Date,
): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const t = observationTime || new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `E-${u}-${ts}-${r}`;
}

/**
 * Pure: compute the SHA-256 of the canonical payload. Uses a dynamic
 * `await import('node:crypto')` so the module works in any runtime.
 */
export async function computeEventHash(
  ev: Partial<CanonicalEventRow>,
): Promise<string> {
  const payload = canonicalEventPayload(ev);
  try {
    const crypto = await import("node:crypto");
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  } catch {
    // Fallback: simple FNV-1a hash (not cryptographic, but always works)
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv-${h.toString(16).padStart(8, "0")}-${payload.length.toString(16)}`;
  }
}

/**
 * Pure: parse the evidenceReference JSON array. Defensive — returns []
 * on parse error or non-array input.
 */
export function parseEvidenceReference(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: parse the authorizationContext JSON. Defensive — returns {} on
 * parse error or non-object input.
 */
export function parseAuthContext(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// ============ §12.1 appendEvent ============

/**
 * Append a new canonical event to the immutable spine.
 *
 * §18 — Idempotency: if the caller provides an idempotencyKey and an
 * event with that key already exists, the existing event is returned
 * unchanged (no duplicate, no new hash chain link).
 *
 * §15 — Hash chaining: the previousEventHash is the eventHash of the
 * most recent prior event for the same USTN (ordered by observationTime).
 *
 * §16 — Three timestamps: eventTime (when it occurred),
 *       observationTime (when SGTX received it), effectiveTime (when
 *       it became legally effective). All three are preserved
 *       independently.
 *
 * §17 — Out-of-order events: if eventTime is in the past, we still
 *       append it (preserving causality) but the chain order is by
 *       observationTime (so a late-arriving confirmation does not
 *       break the hash chain).
 *
 * Returns the new event row (or the prior event if idempotencyKey
 * matched). Returns null on error.
 */
export async function appendEvent(
  input: AppendEventInput,
): Promise<CanonicalEventRow | null> {
  if (!input || !input.eventType) {
    logger.warn("[event-spine] appendEvent rejected: missing eventType");
    return null;
  }
  const now = new Date();
  const observationTime = input.observationTime || now;
  const eventTime = input.eventTime || observationTime;
  const category =
    input.eventTypeCategory || deriveEventCategory(input.eventType);

  // §18 Idempotency check
  if (input.idempotencyKey) {
    try {
      const existing = await db.canonicalEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        logger.info("[event-spine] idempotent hit — returning prior event", {
          idempotencyKey: input.idempotencyKey,
          eventId: existing.eventId,
        });
        return existing as CanonicalEventRow;
      }
    } catch (err) {
      logger.warn("[event-spine] idempotency lookup failed — proceeding", {
        error: String(err),
        idempotencyKey: input.idempotencyKey,
      });
    }
  }

  const eventId = generateEventId(input.ustn, observationTime);

  // §15 Find previous event for this USTN (ordered by observationTime desc)
  let previousEventHash: string | null = null;
  if (input.ustn) {
    try {
      const last = await db.canonicalEvent.findFirst({
        where: { ustn: input.ustn },
        orderBy: { observationTime: "desc" },
      });
      if (last?.eventHash) previousEventHash = last.eventHash;
    } catch (err) {
      logger.warn("[event-spine] could not fetch previous event hash", {
        error: String(err),
        ustn: input.ustn,
      });
    }
  }

  // Build the canonical row for hashing
  const candidate: Partial<CanonicalEventRow> = {
    eventId,
    ustn: input.ustn || null,
    parentEventId: input.parentEventId || null,
    eventType: input.eventType,
    eventTypeCategory: category,
    eventTime,
    observationTime,
    effectiveTime: input.effectiveTime || null,
    sourceSystem: input.sourceSystem || null,
    sourceEventId: input.sourceEventId || null,
    sourceReference: input.sourceReference || null,
    authority: input.authority || null,
    evidenceReference: input.evidenceReference
      ? JSON.stringify(input.evidenceReference)
      : null,
    previousEventHash,
    policyVersion: input.policyVersion || null,
    actor: input.actor || null,
    authorizationContext: input.authorizationContext
      ? JSON.stringify(input.authorizationContext)
      : null,
    idempotencyKey: input.idempotencyKey || null,
    status: "RECORDED",
  };

  // §12 Compute event hash via SHA-256
  const eventHash = await computeEventHash(candidate);

  try {
    const row = await db.canonicalEvent.create({
      data: {
        eventId,
        ustn: input.ustn || null,
        parentEventId: input.parentEventId || null,
        eventType: input.eventType,
        eventTypeCategory: category,
        eventTime,
        observationTime,
        effectiveTime: input.effectiveTime || null,
        sourceSystem: input.sourceSystem || null,
        sourceEventId: input.sourceEventId || null,
        sourceReference: input.sourceReference || null,
        authority: input.authority || null,
        evidenceReference: candidate.evidenceReference,
        previousEventHash,
        eventHash,
        policyVersion: input.policyVersion || null,
        actor: input.actor || null,
        authorizationContext: candidate.authorizationContext,
        idempotencyKey: input.idempotencyKey || null,
        status: "RECORDED",
        notes: input.notes || null,
      },
    });
    logger.info("[event-spine] event appended", {
      eventId,
      ustn: input.ustn,
      eventType: input.eventType,
      category,
      hasParentHash: !!previousEventHash,
    });
    return row as CanonicalEventRow;
  } catch (err) {
    // Race: same idempotencyKey inserted concurrently
    if (input.idempotencyKey) {
      try {
        const existing = await db.canonicalEvent.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return existing as CanonicalEventRow;
      } catch (err2) {
        logger.error("[event-spine] post-race lookup failed", {
          error: String(err2),
          idempotencyKey: input.idempotencyKey,
        });
      }
    }
    logger.error("[event-spine] appendEvent create failed", {
      error: String(err),
      eventId,
      eventType: input.eventType,
    });
    return null;
  }
}

// ============ §12.2 getEvent ============

/**
 * Get a single canonical event by its eventId. Returns null if not found.
 */
export async function getEvent(
  eventId: string,
): Promise<CanonicalEventRow | null> {
  if (!eventId) return null;
  try {
    const row = await db.canonicalEvent.findUnique({
      where: { eventId },
    });
    return (row as CanonicalEventRow) || null;
  } catch (err) {
    logger.error("[event-spine] getEvent failed", {
      error: String(err),
      eventId,
    });
    return null;
  }
}

// ============ §12.3 getEventHistory ============

/**
 * Get all canonical events for a USTN, ordered by eventTime ascending
 * (causal order). Returns [] on error or if no USTN provided.
 */
export async function getEventHistory(
  ustn: string,
): Promise<CanonicalEventRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.canonicalEvent.findMany({
      where: { ustn },
      orderBy: [{ eventTime: "asc" }, { observationTime: "asc" }],
    });
    return (rows as CanonicalEventRow[]) || [];
  } catch (err) {
    logger.error("[event-spine] getEventHistory failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Get all canonical events for a USTN ordered by observationTime (chain
 * order). Used by `verifyEventChain`.
 */
export async function getEventChain(
  ustn: string,
): Promise<CanonicalEventRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.canonicalEvent.findMany({
      where: { ustn },
      orderBy: [{ observationTime: "asc" }, { createdAt: "asc" }],
    });
    return (rows as CanonicalEventRow[]) || [];
  } catch (err) {
    logger.error("[event-spine] getEventChain failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §12.4 getEventByHash ============

/**
 * Verify event integrity: look up an event by its SHA-256 hash. Used to
 * prove that an event in the spine was not tampered with.
 */
export async function getEventByHash(
  eventHash: string,
): Promise<CanonicalEventRow | null> {
  if (!eventHash) return null;
  try {
    const row = await db.canonicalEvent.findFirst({
      where: { eventHash },
    });
    return (row as CanonicalEventRow) || null;
  } catch (err) {
    logger.error("[event-spine] getEventByHash failed", {
      error: String(err),
      eventHash,
    });
    return null;
  }
}

// ============ §15.1 verifyEventChain ============

/**
 * Verify the hash chain integrity for all events of a USTN.
 *
 * Walks the chain (ordered by observationTime) and re-computes each
 * event's SHA-256 from its stored fields. Compares:
 *   - the stored eventHash vs the recomputed one (tamper check)
 *   - the stored previousEventHash vs the prior event's eventHash
 *     (chain link check)
 *
 * Returns `{ verified: true }` if the chain is intact, otherwise
 * `{ verified: false, brokenAt: N, brokenEventId: … }`.
 */
export async function verifyEventChain(
  ustn: string,
): Promise<ChainVerification> {
  const empty: ChainVerification = {
    ustn,
    verified: true,
    totalEvents: 0,
  };
  if (!ustn) return empty;
  const chain = await getEventChain(ustn);
  if (chain.length === 0) return { ...empty, verified: true };

  let previousHash: string | null = null;
  for (let i = 0; i < chain.length; i++) {
    const ev = chain[i];
    // 1. Check previousEventHash link
    if ((ev.previousEventHash || null) !== (previousHash || null)) {
      return {
        ustn,
        verified: false,
        totalEvents: chain.length,
        brokenAt: i + 1,
        brokenEventId: ev.eventId,
        expectedHash: previousHash || undefined,
        actualHash: ev.previousEventHash || undefined,
      };
    }
    // 2. Recompute SHA-256 and compare
    const recomputed = await computeEventHash(ev);
    if (recomputed !== ev.eventHash) {
      return {
        ustn,
        verified: false,
        totalEvents: chain.length,
        brokenAt: i + 1,
        brokenEventId: ev.eventId,
        expectedHash: ev.eventHash || undefined,
        actualHash: recomputed,
      };
    }
    previousHash = ev.eventHash || null;
  }
  return { ustn, verified: true, totalEvents: chain.length };
}

// ============ §86 replayFromHistory ============

/**
 * §86 — Replay Mode: reconstruct the canonical state from event history.
 *
 * Walks the event chain (ordered by eventTime, then observationTime)
 * and applies each event to a synthetic state vector. Returns the
 * reconstructed vector + a count of applied events.
 *
 * This is used:
 *   - for forensic verification (compare replayed state vs stored state)
 *   - to rebuild a Twin after a database incident
 *   - to compute "what would the state be if event X had not happened"
 *
 * No DB writes. Returns a synthetic state-vector snapshot.
 */
export async function replayFromHistory(ustn: string): Promise<{
  ustn: string;
  replayedEvents: number;
  finalState: {
    execution: string;
    financial: string;
    legal: string;
    physicalOperational: string;
    documentary: string;
    compliance: string;
    regulatory: string;
    counterparty: string;
    reconciliation: string;
    dispute: string;
    exposure: string;
    closure: string;
  };
  verified: boolean;
  verification?: ChainVerification;
}> {
  const emptyState = {
    execution: "PENDING",
    financial: "PENDING",
    legal: "PENDING",
    physicalOperational: "PENDING",
    documentary: "PENDING",
    compliance: "PENDING",
    regulatory: "PENDING",
    counterparty: "PENDING",
    reconciliation: "PENDING",
    dispute: "NONE",
    exposure: "NONE",
    closure: "OPEN",
  };

  if (!ustn) {
    return { ustn: "", replayedEvents: 0, finalState: emptyState, verified: true };
  }

  const history = await getEventHistory(ustn);
  const verification = await verifyEventChain(ustn);

  // Apply each event to the synthetic state
  const state = { ...emptyState };
  for (const ev of history) {
    switch (ev.eventType) {
      case "TRADE_CREATED":
        state.execution = "IN_PROGRESS";
        state.legal = "DRAFT";
        state.counterparty = "IN_PROGRESS";
        break;
      case "CONTRACT_SIGNED":
        state.legal = "COMPLETED";
        state.counterparty = "COMPLETED";
        break;
      case "LC_ISSUED":
      case "LC_CONFIRMED":
        state.documentary = ev.eventType === "LC_CONFIRMED" ? "SEALED" : "LC_ISSUED";
        state.financial = "AUTHORIZED";
        break;
      case "PAYMENT_AUTHORIZED":
        state.financial = "AUTHORIZED";
        break;
      case "PAYMENT_SUBMITTED":
      case "PAYMENT_PROCESSING":
        state.financial = "PROCESSING";
        break;
      case "PAYMENT_SETTLED":
        state.financial = "SETTLED";
        state.reconciliation = "MATCHED";
        break;
      case "PAYMENT_PARTIALLY_SETTLED":
        state.financial = "PARTIALLY_SETTLED";
        state.reconciliation = "DIVERGENT";
        break;
      case "PAYMENT_REJECTED":
      case "PAYMENT_RETURNED":
      case "PAYMENT_REVERSED":
        state.financial = "REVERSED";
        state.reconciliation = "DIVERGENT";
        break;
      case "DOCUMENT_SEALED":
      case "EVIDENCE_SEALED":
        state.documentary = "SEALED";
        break;
      case "GOODS_DELIVERED":
        state.physicalOperational = "COMPLETED";
        state.execution = "COMPLETED";
        break;
      case "GOODS_ACCEPTED":
        state.execution = "COMPLETED";
        state.physicalOperational = "COMPLETED";
        state.documentary = "COMPLETED";
        break;
      case "GOODS_REJECTED":
        state.execution = "FAILED";
        state.dispute = "OPEN";
        break;
      case "CUSTOMS_CLEARED":
      case "CUSTOMS_RELEASED":
        state.compliance = "COMPLETED";
        state.regulatory = "COMPLETED";
        break;
      case "CUSTOMS_HOLD":
        state.compliance = "BLOCKED";
        state.regulatory = "BLOCKED";
        break;
      case "RECONCILIATION_MATCHED":
        state.reconciliation = "MATCHED";
        break;
      case "RECONCILIATION_DIVERGENT":
        state.reconciliation = "DIVERGENT";
        break;
      case "RECONCILIATION_RESOLVED":
        state.reconciliation = "RESOLVED";
        break;
      case "EXCEPTION_RAISED":
      case "DISPUTE_OPENED":
        state.dispute = "OPEN";
        break;
      case "EXCEPTION_RESOLVED":
      case "DISPUTE_RESOLVED":
        state.dispute = "RESOLVED";
        break;
      case "CLOSURE_GRANTED":
        state.closure = "USTN_CLOSED";
        break;
      case "CLOSURE_DENIED":
        state.closure = "FAILED";
        break;
      default:
        // Unknown event type — leave state unchanged
        break;
    }
  }

  return {
    ustn,
    replayedEvents: history.length,
    finalState: state,
    verified: verification.verified,
    verification,
  };
}
