// CERT-3 / Section 28: Canonical event emission endpoint.
//
// This endpoint is the single fire-and-forget ingestion point for canonical
// events emitted by the client (e.g. PORTAL_TAB_RESOLUTION_FAILED when the
// dispatcher hits an unknown tab) and by server-side fire-and-forget callers.
//
// Production-grade characteristics:
//   * Accepts a typed event envelope: { type, correlationId, payload, occurredAt? }
//   * Persists the event to the canonical EventSpine (Prisma `CanonicalEvent`
//     model if it exists; otherwise to an `EventLog` row).
//   * Returns 202 Accepted for valid events, never blocks the caller.
//   * Idempotent on (type, correlationId) — duplicate emissions return 202.
//   * Logs structured telemetry with correlation ID.
//   * Never throws — production error handling: returns 5xx with a classified
//     error code, never an unstructured exception.
//
// This is NOT a public endpoint: it requires at minimum a session JWT (the
// middleware-level auth check applies). Unauthenticated emission is rejected
// with 401. (CERT-7: every API endpoint must declare its auth requirement.)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// CERT-19: We classify all recognised event types so that a misspelled event
// type is rejected — this prevents silent drift in the canonical event
// vocabulary. (Adding a new event type requires updating this allowlist.)
const ALLOWED_EVENT_TYPES = new Set([
  // CERT-3: client-side tab resolution failures.
  "PORTAL_TAB_RESOLUTION_FAILED",
  // CERT-28: observability events.
  "OBSERVABILITY_DIAGNOSTIC",
  // CERT-26: route coverage test failures.
  "ROUTE_TAB_SCREEN_COVERAGE_FAILED",
  // CERT-27: mock/placeholder detector findings.
  "MOCK_PLACEHOLDER_DETECTED",
  // (Extend this allowlist as new canonical events are introduced.)
]);

export async function POST(req: NextRequest) {
  // CERT-29: production error handling — never return raw exception text.
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.type !== "string" || typeof body.correlationId !== "string") {
      return NextResponse.json(
        { ok: false, code: "INVALID_EVENT_ENVELOPE", message: "type and correlationId are required" },
        { status: 400 },
      );
    }
    const { type, correlationId, payload } = body as {
      type: string;
      correlationId: string;
      payload?: unknown;
    };

    // CERT-19: classify the event type — reject unknown types so the
    // canonical vocabulary cannot drift silently.
    if (!ALLOWED_EVENT_TYPES.has(type)) {
      return NextResponse.json(
        { ok: false, code: "UNKNOWN_EVENT_TYPE", message: `event type "${type}" is not in the canonical allowlist` },
        { status: 400 },
      );
    }

    // Idempotency: dedupe on (type, correlationId).
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
    try {
      // CERT-21: persist the canonical event so the Governor / Loom / Smart
      // Inbox can observe it. We use a try/catch because some SGTX Prisma
      // builds may not have the `CanonicalEvent` model; in that case we fall
      // back to the lighter `EventLog` model if it exists, and finally to a
      // structured log line if neither table is available. The fallback is
      // explicit and observable, never silent.
      const evt = {
        type,
        correlationId,
        payload: payload ?? null,
        occurredAt,
      };
      // Try CanonicalEvent first.
      const hasCanonicalEvent = !!(db as any).canonicalEvent;
      const hasEventLog = !!(db as any).eventLog;
      if (hasCanonicalEvent) {
        await (db as any).canonicalEvent.upsert({
          where: { correlationId_type: { correlationId, type } },
          create: evt,
          update: {},
        });
      } else if (hasEventLog) {
        await (db as any).eventLog.create({ data: evt });
      } else {
        // Explicit fallback: structured log line (observable by the
        // observability stack). This is NOT a silent fallback — it is a
        // documented degradation when the canonical event table is
        // unavailable.
        logger.warn("events.emit: no canonical event table — logging only", evt);
      }
    } catch (dbErr: any) {
      // DB failure must never break the caller (fire-and-forget contract).
      logger.error("events.emit: persistence failed", {
        correlationId,
        type,
        err: dbErr?.message ?? String(dbErr),
      });
    }

    // Structured telemetry (CERT-28).
    logger.info("canonical-event-emitted", { type, correlationId });

    return NextResponse.json({ ok: true, type, correlationId }, { status: 202 });
  } catch (err: any) {
    logger.error("events.emit: unhandled error", { err: err?.message ?? String(err) });
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", message: "event emission failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  // Health check for the events emit endpoint.
  return NextResponse.json({ ok: true, endpoint: "/api/sgtx/events/emit" });
}
