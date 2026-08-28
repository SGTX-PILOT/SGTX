// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Engine Loom Audit Events (§45)
 * ===========================================================================
 *
 * The fee Loom is the immutable, legally-material audit log for every fee
 * action in the customs gateway: broker quotes created / accepted, fee
 * commitments created, additional-charge requests / acceptances / disputes,
 * evidence submitted, dispute lifecycle events, broker policy violations,
 * fee-schedule creates/updates, and fee risk-flag changes.
 *
 * Each event is:
 *   - Persisted to the existing `TradeEvent` table (source = "FEE_LOOM") so
 *     no schema migration is required and we coexist with loom-customs.ts.
 *   - SHA-256 hash-chained to the previous fee-Loom event for the same USTN,
 *     binding every entry to its predecessor (provable integrity).
 *   - SANITISED by `sanitizeFeeForLoom` before being hashed or stored — no
 *     credentials, secrets, filer codes, private keys, API keys, IBANs, or
 *     bank account numbers ever enter the Loom.
 *
 * SECURITY INVARIANTS:
 *   - NEVER put credentials, secrets, filer codes, or private keys in the
 *     Loom. `sanitizeFeeForLoom` enforces this on the deny-list of sensitive
 *     key fragments; long base64/hex blobs are also redacted.
 *   - The Loom is the LAST line of defence — the ingress layer should already
 *     have stripped secrets. We never throw; on internal error we return
 *     { loomHash: "error", eventId: "error" } so the calling code can record
 *     a fallback audit row without crashing the request.
 *
 * All public functions wrapped in try/catch with safe defaults — the Loom
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ §1 Canonical fee Loom event types (§45) ============

/**
 * The 15 canonical fee Loom event types. Every fee-related Loom entry is one
 * of these.
 *
 * Categories:
 *   - broker_quote_*       — quote lifecycle (created, accepted)
 *   - broker_fee_*         — immutable fee commitment lifecycle
 *   - additional_charge_*  — §16 fee change workflow
 *   - broker_evidence_*    — broker evidence submitted for a charge
 *   - dispute_*            — dispute lifecycle (opened, escalated, resolved)
 *   - broker_policy_*      — broker policy violation flagged
 *   - fee_schedule_*       — fee schedule lifecycle (created, updated)
 *   - fee_risk_*           — fee risk flag raised / cleared
 */
export const FEE_LOOM_EVENTS = [
  "broker_quote_created",
  "broker_quote_accepted",
  "broker_fee_commitment_created",
  "additional_charge_requested",
  "additional_charge_accepted",
  "additional_charge_disputed",
  "broker_evidence_submitted",
  "dispute_opened",
  "dispute_escalated",
  "dispute_resolved",
  "broker_policy_violation_flagged",
  "fee_schedule_created",
  "fee_schedule_updated",
  "fee_risk_flag_raised",
  "fee_risk_flag_cleared",
] as const;

export type FeeLoomEventType = (typeof FEE_LOOM_EVENTS)[number];

/**
 * Returns true iff the given string is a canonical fee Loom event type.
 * Never throws.
 */
export function isFeeLoomEvent(eventType: string): boolean {
  try {
    return (FEE_LOOM_EVENTS as readonly string[]).includes(String(eventType || ""));
  } catch {
    return false;
  }
}

// ============ §2 Sanitisation (defence-in-depth for §45) ============

/**
 * Field-name fragments (case-insensitive substring match) that must NEVER
 * appear in a fee Loom event payload. If any of these substrings appears in
 * a key, the value is replaced with "[REDACTED]" before the event is hashed
 * and stored.
 *
 * This is a deny-list approach; the ingress adapter should already have
 * stripped secrets. The Loom is the last line of defence.
 */
const FEE_SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "privatekey",
  "private_key",
  "filercode",
  "filer_code",
  "filerreference",
  "filer_reference",
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
  "swift",
  "accountno",
  "account_no",
  "accountnumber",
  "account_number",
  "bankaccount",
  "cardnumber",
  "cvv",
];

/**
 * Sanitise a fee payload for Loom persistence. Walks the object recursively
 * and replaces any value whose key contains a sensitive fragment with the
 * literal "[REDACTED]". Long base64/hex strings (>=32 chars, no spaces) are
 * also redacted to defend against payloads where the secret is stored under
 * a benign key like "value" or "metadata".
 *
 * Returns a deep clone — the input is never mutated.
 *
 * CRITICAL: never throws — on any internal error returns the input unchanged
 * (a noisy-but-present payload beats a missing one).
 */
export function sanitizeFeeForLoom(payload: any): any {
  try {
    if (payload === null || payload === undefined) return payload;
    if (typeof payload !== "object") {
      if (typeof payload === "string") {
        return _redactIfSecretString(payload);
      }
      return payload;
    }
    if (Array.isArray(payload)) {
      return payload.map((item) => sanitizeFeeForLoom(item));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(payload)) {
      const lowerKey = String(k || "").toLowerCase();
      if (FEE_SENSITIVE_KEY_FRAGMENTS.some((frag) => lowerKey.includes(frag))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeFeeForLoom(v);
      }
    }
    return out;
  } catch (err) {
    logger.warn("[fee-loom] sanitizeFeeForLoom failed — returning raw payload", {
      error: String(err),
    });
    return payload;
  }
}

/**
 * Heuristic: redact a string if it looks like a secret (>=32 chars of base64
 * / hex with no spaces). Catches payloads where the secret is stored under a
 * benign key. Never throws.
 */
function _redactIfSecretString(s: string): string {
  try {
    if (typeof s !== "string") return s;
    if (s.length < 32) return s;
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
 * Compute the SHA-256 hash of a fee Loom event. The canonical form is a
 * stable, deterministic JSON serialisation of the immutable fields.
 *
 * Hash inputs:
 *   - eventType (from FEE_LOOM_EVENTS)
 *   - USTN
 *   - actor GTID
 *   - payload hash (SHA-256 of the sanitised payload)
 *   - previous hash (from the prior fee-Loom event for this USTN)
 *   - timestamp (ISO 8601 UTC)
 *
 * Returns "error-<random>" on internal failure — never throws.
 */
async function computeFeeLoomHash(input: {
  eventType: string;
  ustn: string;
  actorGtid: string;
  payloadHash: string;
  previousHash: string | null;
  timestamp: string;
}): Promise<string> {
  try {
    const canonical = JSON.stringify({
      eventType: String(input.eventType || ""),
      ustn: String(input.ustn || ""),
      actorGtid: String(input.actorGtid || ""),
      payloadHash: String(input.payloadHash || ""),
      previousHash: String(input.previousHash || ""),
      timestamp: String(input.timestamp || ""),
    }, Object.keys({
      eventType: 1,
      ustn: 1,
      actorGtid: 1,
      payloadHash: 1,
      previousHash: 1,
      timestamp: 1,
    }).sort());
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  } catch (err) {
    logger.error("[fee-loom] computeFeeLoomHash failed — error fallback", {
      error: String(err),
    });
    return `error-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Compute the SHA-256 of a sanitised fee payload. Binds the Loom event hash
 * to a specific payload without embedding the payload in the hash itself.
 */
function computeFeePayloadHash(payload: any): string {
  try {
    const json = JSON.stringify(payload || {});
    return createHash("sha256").update(json, "utf8").digest("hex");
  } catch (err) {
    return `error-${Date.now().toString(36)}`;
  }
}

// ============ §4 Append fee Loom event ============

export interface FeeLoomAppendResult {
  loomHash: string;
  eventId: string;
}

/**
 * Append a fee Loom event.
 *
 * Steps:
 *   1. Validate eventType ∈ FEE_LOOM_EVENTS. Unknown types are rejected with
 *      { loomHash: "invalid", eventId: "invalid" } — never persisted.
 *   2. Sanitise the payload (sanitizeFeeForLoom). Strips credentials,
 *      secrets, filer codes, private keys, IBANs, etc.
 *   3. Compute payloadHash = SHA-256(sanitised payload).
 *   4. Find the most recent prior fee-Loom event for this USTN (ordered by
 *      createdAt desc). Use its eventHash as previousHash.
 *   5. Compute the Loom event hash (SHA-256 over canonical fields).
 *   6. Persist to TradeEvent with source = "FEE_LOOM".
 *
 * Returns { loomHash, eventId } on success; { loomHash: "error", eventId:
 * "error" } on failure — never throws.
 */
export async function appendFeeLoomEvent(
  eventType: string,
  ustn: string,
  actorGtid: string,
  payload: any,
): Promise<FeeLoomAppendResult> {
  try {
    // §1 Validate event type.
    if (!isFeeLoomEvent(eventType)) {
      logger.warn("[fee-loom] rejected — unknown event type", {
        eventType,
        ustn,
        actorGtid,
      });
      return { loomHash: "invalid", eventId: "invalid" };
    }
    if (!ustn) {
      logger.warn("[fee-loom] rejected — missing USTN", { eventType });
      return { loomHash: "invalid", eventId: "invalid" };
    }

    // §2 Sanitise payload — NEVER include secrets.
    const sanitised = sanitizeFeeForLoom(payload || {});

    // §3 Compute payload hash.
    const payloadHash = computeFeePayloadHash(sanitised);

    // §4 Find the previous fee-Loom event for this USTN (hash chain link).
    let previousHash: string | null = null;
    try {
      const last = await db.tradeEvent.findFirst({
        where: {
          ustn,
          source: "FEE_LOOM",
        },
        orderBy: { createdAt: "desc" },
      });
      if (last?.eventHash) previousHash = last.eventHash;
    } catch (err) {
      logger.warn("[fee-loom] could not fetch previous fee-Loom hash — continuing", {
        error: String(err),
        ustn,
      });
    }

    // §5 Compute current hash.
    const timestamp = new Date().toISOString();
    const loomHash = await computeFeeLoomHash({
      eventType,
      ustn,
      actorGtid: actorGtid || "",
      payloadHash,
      previousHash,
      timestamp,
    });

    // §6 Persist to TradeEvent with source = "FEE_LOOM".
    const eventId =
      `FEELOOM-${ustn.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const metadata = {
      actorGtid: actorGtid || null,
      payloadHash,
      governorDecisionId: (sanitised && sanitised.governorDecisionId) || null,
      loomVersion: 1,
    };

    try {
      await db.tradeEvent.create({
        data: {
          ustn,
          eventType,
          eventDescription: `Fee Loom: ${eventType}`,
          eventMetadata: JSON.stringify({
            ...metadata,
            payload: sanitised,
          }).slice(0, 8000),
          actorGtid: actorGtid || null,
          source: "FEE_LOOM",
          previousHash,
          eventHash: loomHash,
        },
      });
    } catch (dbErr) {
      logger.error("[fee-loom] persist failed", {
        error: String(dbErr),
        eventType,
        ustn,
      });
      return { loomHash: "error", eventId: "error" };
    }

    logger.info("[fee-loom] event appended", {
      eventType,
      ustn,
      actorGtid,
      loomHash: loomHash.slice(0, 16) + "...",
      hasPreviousHash: !!previousHash,
    });

    return { loomHash, eventId };
  } catch (err) {
    logger.error("[fee-loom] appendFeeLoomEvent failed — safe fallback", {
      error: String(err),
      eventType,
      ustn,
    });
    return { loomHash: "error", eventId: "error" };
  }
}

// ============ §5 Query helpers ============

/**
 * List all fee-Loom events for a USTN, oldest first.
 * Returns an empty array on error — never throws.
 */
export async function listFeeLoomEvents(
  ustn: string,
): Promise<Array<Record<string, any>>> {
  try {
    if (!ustn) return [];
    const rows = await db.tradeEvent.findMany({
      where: { ustn, source: "FEE_LOOM" },
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
    logger.error("[fee-loom] listFeeLoomEvents failed — empty list", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Verify the integrity of the fee-Loom hash chain for a USTN. Walks the chain
 * oldest-first and confirms every previousHash matches the prior event's
 * eventHash.
 *
 * Returns { verified, totalEvents, brokenAt? }.
 */
export async function verifyFeeLoomChain(ustn: string): Promise<{
  verified: boolean;
  totalEvents: number;
  brokenAt?: number;
  brokenEventId?: string;
  expectedHash?: string | null;
  actualHash?: string | null;
}> {
  try {
    const events = await listFeeLoomEvents(ustn);
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
    logger.error("[fee-loom] verifyFeeLoomChain failed", {
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
