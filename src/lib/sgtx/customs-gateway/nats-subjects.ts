// @ts-nocheck
/**
 * SGTX Customs Gateway — NATS Tenant-Scoped Event Subjects
 * ===========================================================================
 *
 * Implements tenant-scoped NATS subject construction and access validation for
 * customs events. Every subject embeds the originating broker's GTID so that
 * subject-level ACLs enforce "Broker A must NOT subscribe to Broker B's events".
 *
 * Subject schema (canonical):
 *   customs.<jurisdiction>.<eventType>.<brokerGtid>
 *
 * Examples:
 *   customs.us.submission.created.GTID-AB12CD34
 *   customs.us.submission.status.GTID-AB12CD34
 *   customs.us.hold.GTID-AB12CD34
 *   customs.us.error.GTID-AB12CD34
 *   customs.us.audit.GTID-AB12CD34
 *   customs.eg.submission.created.GTID-XY98ZW76
 *   customs.eg.hold.GTID-XY98ZW76
 *
 * Wildcard subscription patterns:
 *   customs.us.submission.created.*    (all brokers, one event type)
 *   customs.us.>                       (everything in US jurisdiction — Governor only)
 *
 * Access control: validateSubjectAccess(subscriberGtid, subject) extracts the
 * embedded broker GTID from the subject and compares it to the subscriber. The
 * Governor (subscriberGtid === "GOVERNOR") may subscribe to any subject.
 * Subscriber must equal embedded broker OR be the Governor.
 *
 * All public functions are wrapped in try/catch with safe defaults — they
 * never throw synchronously into API routes.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ §1 Canonical customs event types ============

/**
 * The canonical customs event types. Every customs-related NATS subject uses
 * exactly one of these as its <eventType> segment.
 *
 * Categories:
 *   - submission.*    — declaration lifecycle (created, status, acknowledged)
 *   - hold / release  — government hold and release events
 *   - pga_hold        — Participating Government Agency hold (FDA, EPA, etc.)
 *   - correction_*    — government requested corrections
 *   - error           — adapter / broker errors
 *   - audit           — audit-grade events (every write replicated)
 *   - credential.*    — credential lifecycle (used, rotated, revoked, expired)
 *   - certificate.*   — certificate lifecycle (expired)
 */
export const CUSTOMS_EVENT_TYPES = [
  "submission.created",
  "submission.status",
  "submission.acknowledged",
  "hold",
  "pga_hold",
  "release",
  "correction_required",
  "error",
  "audit",
  "credential.expired",
  "certificate.expired",
] as const;

export type CustomsEventType = (typeof CUSTOMS_EVENT_TYPES)[number];

// ============ §2 Subject construction ============

/**
 * Normalise a jurisdiction code to lowercase 2-letter ISO-3166.
 * Falls back to "xx" (unknown) when invalid — never throws.
 */
function normalizeJurisdiction(jurisdiction: string): string {
  try {
    const j = String(jurisdiction || "").trim().toLowerCase();
    if (!j) return "xx";
    // Accept 2-letter ISO codes; pass through longer codes (e.g. "eu", "gcc").
    if (/^[a-z]{2,4}$/.test(j)) return j;
    return "xx";
  } catch {
    return "xx";
  }
}

/**
 * Normalise a broker GTID for inclusion in a subject. NATS subject tokens must
 * not contain ".", "*", ">", or whitespace. We replace forbidden chars with
 * "-" and uppercase for consistency.
 *
 * Returns "unknown" if the GTID is missing — never throws.
 */
function normalizeBrokerGtid(brokerGtid: string): string {
  try {
    const g = String(brokerGtid || "").trim().toUpperCase();
    if (!g) return "UNKNOWN";
    return g.replace(/[.*>\s]/g, "-");
  } catch {
    return "UNKNOWN";
  }
}

/**
 * Validate that an event type string is one of the canonical customs event
 * types. Returns the canonical type if valid, or null if invalid.
 */
export function validateCustomsEventType(eventType: string): string | null {
  try {
    const e = String(eventType || "").trim().toLowerCase();
    if (!e) return null;
    return (CUSTOMS_EVENT_TYPES as readonly string[]).includes(e) ? e : null;
  } catch {
    return null;
  }
}

/**
 * Build a tenant-scoped customs NATS subject.
 *
 * Format: customs.<jurisdiction>.<eventType>.<brokerGtid>
 *
 * Example:
 *   getCustomsSubject("US", "submission.created", "GTID-AB12CD34")
 *     => "customs.us.submission.created.GTID-AB12CD34"
 *
 * If the eventType is not canonical, "unknown" is substituted (the subject is
 * still syntactically valid but will not match any subscriber listening for a
 * known type — defensive against misconfiguration).
 */
export function getCustomsSubject(
  jurisdiction: string,
  eventType: string,
  brokerGtid: string,
): string {
  try {
    const j = normalizeJurisdiction(jurisdiction);
    const e = validateCustomsEventType(eventType) || "unknown";
    const b = normalizeBrokerGtid(brokerGtid);
    return `customs.${j}.${e}.${b}`;
  } catch (err) {
    logger.warn("[nats-subjects] getCustomsSubject failed — safe fallback", {
      error: String(err),
      jurisdiction,
      eventType,
      brokerGtid,
    });
    return "customs.xx.unknown.UNKNOWN";
  }
}

/**
 * Build a wildcard subscription pattern for a jurisdiction + event type.
 *
 * Format: customs.<jurisdiction>.<eventType>.*
 *
 * Example:
 *   getSubjectPattern("US", "submission.created")
 *     => "customs.us.submission.created.*"
 *
 * Use this when a Governor or audit consumer wants to receive every broker's
 * events of a given type within a jurisdiction. Per-broker ACLs still apply —
 * the Governor's broad subscription is the only case where this is permitted.
 */
export function getSubjectPattern(
  jurisdiction: string,
  eventType: string,
): string {
  try {
    const j = normalizeJurisdiction(jurisdiction);
    const e = validateCustomsEventType(eventType) || "unknown";
    return `customs.${j}.${e}.*`;
  } catch (err) {
    logger.warn("[nats-subjects] getSubjectPattern failed — safe fallback", {
      error: String(err),
      jurisdiction,
      eventType,
    });
    return "customs.xx.unknown.*";
  }
}

// ============ §3 Subject access control ============

/**
 * The Governor GTID. The Governor is the only subscriber permitted to
 * subscribe to broad wildcard patterns covering all brokers' events.
 * Per-broker ACLs do not apply to the Governor — it is the system-of-record
 * auditor.
 */
export const GOVERNOR_GTID = "GOVERNOR";

/**
 * Parse a NATS subject and extract its components.
 *
 * Returns null if the subject is not a valid customs subject.
 * Format: customs.<jurisdiction>.<eventType>.<brokerGtid>
 *   — eventType may itself contain dots (e.g. "submission.created"), so we
 *     split on "." and re-join the middle segments.
 */
export function parseCustomsSubject(
  subject: string,
): { jurisdiction: string; eventType: string; brokerGtid: string } | null {
  try {
    const s = String(subject || "").trim();
    if (!s) return null;
    const parts = s.split(".");
    if (parts.length < 4) return null;
    if (parts[0] !== "customs") return null;
    const jurisdiction = parts[1];
    const brokerGtid = parts[parts.length - 1];
    // eventType is everything between jurisdiction and brokerGtid.
    const eventType = parts.slice(2, parts.length - 1).join(".");
    if (!jurisdiction || !eventType || !brokerGtid) return null;
    return { jurisdiction, eventType, brokerGtid };
  } catch {
    return null;
  }
}

/**
 * Validate that a subscriber is permitted to access a given subject.
 *
 * Rules:
 *   1. The Governor (subscriberGtid === "GOVERNOR") may access any customs
 *      subject. This is the only broad wildcard subscription allowed.
 *   2. Otherwise, the subscriber's GTID must EXACTLY match the broker GTID
 *      embedded in the subject. Broker A cannot subscribe to Broker B's
 *      subjects.
 *   3. Wildcard subjects (containing "*" or ">") are permitted only for the
 *      Governor. Non-Governor subscribers requesting wildcards are denied.
 *   4. Invalid subjects are denied (default-deny).
 *
 * CRITICAL: this function NEVER throws. On any internal error it returns
 * false (default-deny) — access control must fail closed.
 */
export function validateSubjectAccess(
  subscriberGtid: string,
  subject: string,
): boolean {
  try {
    const sub = String(subscriberGtid || "").trim().toUpperCase();
    if (!sub) {
      logger.warn("[nats-subjects] validateSubjectAccess denied: empty subscriber");
      return false;
    }

    // Governor may access anything.
    if (sub === GOVERNOR_GTID) return true;

    // Reject wildcard subscriptions from non-Governor subscribers.
    const s = String(subject || "");
    if (s.includes("*") || s.includes(">")) {
      logger.warn("[nats-subjects] wildcard subject denied for non-Governor", {
        subscriberGtid: sub,
        subject: s,
      });
      return false;
    }

    const parsed = parseCustomsSubject(s);
    if (!parsed) {
      logger.warn("[nats-subjects] validateSubjectAccess denied: unparseable subject", {
        subscriberGtid: sub,
        subject: s,
      });
      return false;
    }

    const embeddedBroker = normalizeBrokerGtid(parsed.brokerGtid);
    const subscriber = normalizeBrokerGtid(sub);

    // Strict equality — no fuzzy matching, no partial-prefix matching.
    const allowed = embeddedBroker === subscriber && embeddedBroker !== "UNKNOWN";
    if (!allowed) {
      logger.warn("[nats-subjects] subject access denied: broker mismatch", {
        subscriber: sub,
        embeddedBroker,
        subject: s,
      });
    }
    return allowed;
  } catch (err) {
    logger.error("[nats-subjects] validateSubjectAccess failed — default deny", {
      error: String(err),
      subscriberGtid,
      subject,
    });
    return false; // fail closed
  }
}

// ============ §4 Subject introspection helpers ============

/**
 * Returns the list of canonical customs event types. Useful for adapters that
 * need to subscribe to every event type for a given jurisdiction/broker.
 */
export function listCustomsEventTypes(): readonly string[] {
  return CUSTOMS_EVENT_TYPES;
}

/**
 * Build a list of all subjects a given broker should subscribe to for a
 * jurisdiction. Useful for adapter bootstrapping — the adapter connects and
 * immediately subscribes to all its own event types.
 *
 * Returns an empty array on error — never throws.
 */
export function getAllSubjectsForBroker(
  jurisdiction: string,
  brokerGtid: string,
): string[] {
  try {
    const j = normalizeJurisdiction(jurisdiction);
    const b = normalizeBrokerGtid(brokerGtid);
    return CUSTOMS_EVENT_TYPES.map((e) => `customs.${j}.${e}.${b}`);
  } catch (err) {
    logger.warn("[nats-subjects] getAllSubjectsForBroker failed — empty list", {
      error: String(err),
      jurisdiction,
      brokerGtid,
    });
    return [];
  }
}

/**
 * Returns true if the given subject is a valid customs subject (parseable
 * and uses a known event type). Used by the ingress router to filter out
 * misconfigured subjects.
 */
export function isCustomsSubject(subject: string): boolean {
  try {
    const parsed = parseCustomsSubject(subject);
    if (!parsed) return false;
    return validateCustomsEventType(parsed.eventType) !== null;
  } catch {
    return false;
  }
}
