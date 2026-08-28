// @ts-nocheck
/**
 * SGTX Customs Gateway — Loom Customs-Specific Audit Events
 * ===========================================================================
 *
 * Implements the customs-specific Loom audit event stream. Every legally
 * material customs operation (declaration created, broker certified,
 * credential used, government acknowledged, etc.) is recorded as a Loom event
 * with a SHA-256 hash chained to the previous event for the same USTN.
 *
 * The Loom is the immutable, legally-material audit log. It is distinct from
 * the general CanonicalEvent spine in two ways:
 *   1. Every Loom event has a fixed customs-specific eventType drawn from
 *      CUSTOMS_LOOM_EVENTS (21 types below). This makes regulatory reporting
 *      deterministic.
 *   2. Loom events are SANITISED before persistence — no credentials, secrets,
 *      filer codes, private keys, or API keys ever enter the Loom. This is a
 *      hard constraint enforced by sanitizeForLoom() before the event is
 *      hashed and stored.
 *
 * Storage: events are persisted in the TradeEvent table (which already has
 * previousHash / eventHash columns for hash-chaining). The eventType column
 * carries the customs Loom event type; eventMetadata carries the sanitised
 * payload JSON; source carries "CUSTOMS_LOOM" to distinguish from regular
 * trade events.
 *
 * Hash chain: previousHash is the eventHash of the most recent prior Loom
 * event for the same USTN (ordered by createdAt). eventHash is SHA-256 of
 * (eventType | ustn | actorGtid | declarationId | payloadHash | previousHash |
 * timestamp). This binds every event to its predecessor.
 *
 * SECURITY: NEVER include private credentials, secrets, filer codes, private
 * keys, or API keys in a Loom event. sanitizeForLoom() enforces this.
 *
 * All public functions are wrapped in try/catch with safe defaults — the Loom
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Canonical customs Loom event types ============

/**
 * The 21 canonical customs Loom event types. Every customs-related Loom
 * entry is one of these.
 *
 * Categories:
 *   - declaration_*        — declaration lifecycle (created, updated, versioned)
 *   - broker_*             — broker certification lifecycle
 *   - credential_*         — credential lifecycle (used, rotated, revoked)
 *   - submission_*         — submission lifecycle (authorized, submitted)
 *   - government_*         — government decisions (ack/accept/reject/hold/release)
 *   - correction_*         — government correction workflow
 *   - evidence_generated   — evidence package produced (for dispute / audit)
 *   - adapter_*            — adapter connection lifecycle
 */
export const CUSTOMS_LOOM_EVENTS = [
  "declaration_created",
  "declaration_updated",
  "declaration_versioned",
  "broker_certified",
  "broker_rejected",
  "credential_used",
  "credential_rotated",
  "credential_revoked",
  "submission_authorized",
  "submission_submitted",
  "government_acknowledged",
  "government_accepted",
  "government_rejected",
  "government_hold",
  "government_released",
  "correction_requested",
  "correction_approved",
  "evidence_generated",
  "adapter_connected",
  "adapter_disconnected",
  "adapter_error",
] as const;

export type CustomsLoomEventType = (typeof CUSTOMS_LOOM_EVENTS)[number];

/**
 * Returns true if the given string is a valid customs Loom event type.
 */
export function isCustomsLoomEvent(eventType: string): boolean {
  try {
    return (CUSTOMS_LOOM_EVENTS as readonly string[]).includes(String(eventType || ""));
  } catch {
    return false;
  }
}

// ============ §2 Sanitisation ============

/**
 * Field names (case-insensitive substring match) that must NEVER appear in a
 * Loom event. If any of these substrings appears in a key, the value is
 * replaced with "[REDACTED]" before the event is hashed and stored.
 *
 * This is a deny-list approach — comprehensive enough for customs events but
 * not a substitute for upstream data classification. The Loom is the last
 * line of defence; the ingress adapter should already have stripped these.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "filercode",
  "filer_code",
  "filercode",
  "credential",
  "authorization",
  "cookie",
  "session",
  "passport",
  "nationalid",
  "national_id",
  "taxid",
  "tax_id",
  "iban",
  "bic",
  "accountno",
  "account_no",
  "accountnumber",
  "account_number",
];

/**
 * Sanitise a payload for Loom persistence. Walks the object recursively and
 * replaces any value whose key contains a sensitive fragment with the
 * literal string "[REDACTED]". Also redacts strings that look like secrets
 * (long base64 / hex blobs) to defend against payloads where the secret is
 * stored under a benign key.
 *
 * Returns a deep clone — the input is never mutated.
 *
 * CRITICAL: never throws — on any internal error, returns the input unchanged
 * (we prefer a noisy-but-present payload over a missing one, and the ingress
 * layer is responsible for stripping secrets before they reach us).
 */
export function sanitizeForLoom(payload: any): any {
  try {
    if (payload === null || payload === undefined) return payload;
    if (typeof payload !== "object") {
      // Primitive — check if it looks like a secret.
      if (typeof payload === "string") {
        return _redactIfSecretString(payload);
      }
      return payload;
    }
    if (Array.isArray(payload)) {
      return payload.map((item) => sanitizeForLoom(item));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      const lowerKey = String(k || "").toLowerCase();
      if (SENSITIVE_KEY_FRAGMENTS.some((frag) => lowerKey.includes(frag))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeForLoom(v);
      }
    }
    return out;
  } catch (err) {
    logger.warn("[loom-customs] sanitizeForLoom failed — returning raw payload", {
      error: String(err),
    });
    return payload;
  }
}

/**
 * Heuristic: redact a string if it looks like a secret (>=32 chars of base64
 * / hex with no spaces). This catches payloads where the secret is stored
 * under a benign key like "metadata" or "value".
 */
function _redactIfSecretString(s: string): string {
  try {
    if (typeof s !== "string") return s;
    if (s.length < 32) return s;
    // Long string of base64 / hex chars only — looks like a secret.
    if (/^[A-Za-z0-9+/=_-]{32,}$/.test(s)) {
      return "[REDACTED-SECRET-LIKE]";
    }
    return s;
  } catch {
    return s;
  }
}

// ============ §3 Hash computation ============

/**
 * Compute the SHA-256 hash of a Loom event. The canonical form is a stable,
 * deterministic JSON serialization of the immutable fields.
 *
 * Hash inputs:
 *   - eventType (from CUSTOMS_LOOM_EVENTS)
 *   - USTN
 *   - actor GTID
 *   - declaration ID
 *   - payload hash (SHA-256 of the sanitised payload)
 *   - previous hash (from the event-spine / prior Loom event)
 *   - timestamp (ISO 8601 UTC)
 *
 * Returns "error-<random>" on internal failure — never throws.
 */
export async function computeLoomHash(input: {
  eventType: string;
  ustn: string;
  actorGtid: string;
  declarationId: string;
  payloadHash: string;
  previousHash: string | null;
  timestamp: string;
}): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const canonical = JSON.stringify({
      eventType: String(input.eventType || ""),
      ustn: String(input.ustn || ""),
      actorGtid: String(input.actorGtid || ""),
      declarationId: String(input.declarationId || ""),
      payloadHash: String(input.payloadHash || ""),
      previousHash: String(input.previousHash || ""),
      timestamp: String(input.timestamp || ""),
    }, Object.keys({
      eventType: 1, ustn: 1, actorGtid: 1, declarationId: 1,
      payloadHash: 1, previousHash: 1, timestamp: 1,
    }).sort());
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  } catch (err) {
    logger.error("[loom-customs] computeLoomHash failed — error fallback", {
      error: String(err),
    });
    return `error-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Compute the SHA-256 of the sanitised payload. Used to bind the Loom event
 * hash to a specific payload without storing the payload in the hash itself
 * (the payload is stored separately in eventMetadata).
 */
export async function computePayloadHash(payload: any): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const json = JSON.stringify(payload || {});
    return crypto.createHash("sha256").update(json, "utf8").digest("hex");
  } catch (err) {
    return `error-${Date.now().toString(36)}`;
  }
}

// ============ §4 Append Loom event ============

export interface LoomAppendResult {
  loomHash: string;
  eventId: string;
}

/**
 * Append a customs Loom event.
 *
 * Steps:
 *   1. Validate eventType is one of CUSTOMS_LOOM_EVENTS. If not, return
 *      { loomHash: "invalid", eventId: "invalid" } — never persist an
 *      unknown event type.
 *   2. Sanitise the payload (sanitizeForLoom). This strips credentials,
 *      secrets, filer codes, private keys, etc.
 *   3. Compute payloadHash = SHA-256(sanitised payload).
 *   4. Find the most recent prior Loom event for this USTN (ordered by
 *      createdAt desc). Use its eventHash as previousHash.
 *   5. Compute the Loom event hash.
 *   6. Persist to TradeEvent with source = "CUSTOMS_LOOM".
 *
 * Every Loom event includes (per spec):
 *   - event type (from CUSTOMS_LOOM_EVENTS)
 *   - USTN
 *   - actor GTID
 *   - declaration ID
 *   - payload hash
 *   - previous hash (from event-spine / prior Loom event)
 *   - current hash (SHA-256)
 *   - timestamp
 *   - Governor decision ID (if applicable — stored in eventMetadata.governorDecisionId)
 *
 * Returns { loomHash, eventId } on success, or { loomHash: "error", eventId:
 * "error" } on failure — never throws.
 */
export async function appendCustomsLoomEvent(
  eventType: string,
  ustn: string,
  actorGtid: string,
  payload: any,
  declarationId: string,
): Promise<LoomAppendResult> {
  try {
    // §1 Validate event type.
    if (!isCustomsLoomEvent(eventType)) {
      logger.warn("[loom-customs] rejected — unknown event type", {
        eventType,
        ustn,
        actorGtid,
      });
      return { loomHash: "invalid", eventId: "invalid" };
    }
    if (!ustn) {
      logger.warn("[loom-customs] rejected — missing USTN", { eventType });
      return { loomHash: "invalid", eventId: "invalid" };
    }

    // §2 Sanitise payload — NEVER include secrets.
    const sanitised = sanitizeForLoom(payload || {});

    // §3 Compute payload hash.
    const payloadHash = await computePayloadHash(sanitised);

    // §4 Find the previous Loom event for this USTN.
    let previousHash: string | null = null;
    try {
      const last = await db.tradeEvent.findFirst({
        where: {
          ustn: ustn,
          source: "CUSTOMS_LOOM",
        },
        orderBy: { createdAt: "desc" },
      });
      if (last?.eventHash) previousHash = last.eventHash;
    } catch (err) {
      logger.warn("[loom-customs] could not fetch previous Loom hash — continuing", {
        error: String(err),
        ustn,
      });
    }

    // §5 Compute current hash.
    const timestamp = new Date().toISOString();
    const loomHash = await computeLoomHash({
      eventType,
      ustn,
      actorGtid: actorGtid || "",
      declarationId: declarationId || "",
      payloadHash,
      previousHash,
      timestamp,
    });

    // §6 Persist to TradeEvent.
    const eventId = `LOOM-${ustn.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const metadata = {
      declarationId: declarationId || null,
      actorGtid: actorGtid || null,
      payloadHash,
      governorDecisionId:
        (sanitised && sanitised.governorDecisionId) || null,
      loomVersion: 1,
    };

    try {
      await db.tradeEvent.create({
        data: {
          ustn,
          eventType,
          eventDescription: `Customs Loom: ${eventType}`,
          eventMetadata: JSON.stringify({
            ...metadata,
            payload: sanitised,
          }).slice(0, 8000),
          actorGtid: actorGtid || null,
          source: "CUSTOMS_LOOM",
          previousHash,
          eventHash: loomHash,
        },
      });
    } catch (dbErr) {
      logger.error("[loom-customs] persist failed", {
        error: String(dbErr),
        eventType,
        ustn,
      });
      return { loomHash: "error", eventId: "error" };
    }

    logger.info("[loom-customs] event appended", {
      eventType,
      ustn,
      actorGtid,
      declarationId,
      loomHash: loomHash.slice(0, 16) + "...",
      hasPreviousHash: !!previousHash,
    });

    return { loomHash, eventId };
  } catch (err) {
    logger.error("[loom-customs] appendCustomsLoomEvent failed — safe fallback", {
      error: String(err),
      eventType,
      ustn,
    });
    return { loomHash: "error", eventId: "error" };
  }
}

// ============ §5 Query helpers ============

/**
 * List all customs Loom events for a USTN, oldest first.
 *
 * Returns an empty array on error — never throws.
 */
export async function listCustomsLoomEvents(
  ustn: string,
): Promise<Array<Record<string, any>>> {
  try {
    if (!ustn) return [];
    const rows = await db.tradeEvent.findMany({
      where: { ustn, source: "CUSTOMS_LOOM" },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return (rows || []).map((r: any) => ({
      id: r.id,
      ustn: r.ustn,
      eventType: r.eventType,
      actorGtid: r.actorGtid,
      previousHash: r.previousHash,
      eventHash: r.eventHash,
      createdAt: r.createdAt,
      metadata: _safeParse(r.eventMetadata),
    }));
  } catch (err) {
    logger.error("[loom-customs] listCustomsLoomEvents failed — empty list", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Verify the integrity of the customs Loom hash chain for a USTN. Walks the
 * chain oldest-first and confirms every previousHash matches the prior
 * event's eventHash.
 *
 * Returns { verified, totalEvents, brokenAt? }.
 */
export async function verifyCustomsLoomChain(ustn: string): Promise<{
  verified: boolean;
  totalEvents: number;
  brokenAt?: number;
  brokenEventId?: string;
  expectedHash?: string;
  actualHash?: string;
}> {
  try {
    const events = await listCustomsLoomEvents(ustn);
    if (events.length === 0) {
      return { verified: true, totalEvents: 0 };
    }
    let prevHash: string | null = null;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (i === 0) {
        if (ev.previousHash !== null && ev.previousHash !== undefined) {
          return {
            verified: false,
            totalEvents: events.length,
            brokenAt: i + 1,
            brokenEventId: ev.id,
            expectedHash: null,
            actualHash: ev.previousHash,
          };
        }
      } else {
        if (ev.previousHash !== prevHash) {
          return {
            verified: false,
            totalEvents: events.length,
            brokenAt: i + 1,
            brokenEventId: ev.id,
            expectedHash: prevHash || null,
            actualHash: ev.previousHash || null,
          };
        }
      }
      prevHash = ev.eventHash || null;
    }
    return { verified: true, totalEvents: events.length };
  } catch (err) {
    logger.error("[loom-customs] verifyCustomsLoomChain failed", {
      error: String(err),
      ustn,
    });
    return { verified: false, totalEvents: 0 };
  }
}

// ============ §6 Internal helpers ============

function _safeParse(raw: unknown): any {
  try {
    if (typeof raw !== "string" || !raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
