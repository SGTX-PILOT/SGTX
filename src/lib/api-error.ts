/**
 * SGTX API Error Envelope — RECOMMENDED pattern for all API route handlers.
 * ---------------------------------------------------------------------------
 *
 * This module establishes the canonical error contract for SGTX HTTP API
 * routes. New routes (and refactors of existing routes) SHOULD adopt this
 * pattern so that:
 *
 *   1. Every error response has the same JSON shape — the frontend can
 *      render a uniform toast / inline error UI without per-route parsing.
 *
 *   2. Every error carries a `correlationId` — support / SRE can trace a
 *      user-reported failure back to a specific log line / trace span.
 *
 *   3. Operational errors (ApiError) are distinguished from programmer
 *      errors (plain Error) — the latter are masked as `INTERNAL` and
 *      never leak stack traces or message internals to the client.
 *
 * RECOMMENDED USAGE (in a route handler):
 *
 *   import { ApiError, errorResponse, generateCorrelationId } from "@/lib/api-error";
 *
 *   export async function POST(req: NextRequest) {
 *     const correlationId = generateCorrelationId();
 *     try {
 *       const body = await req.json();
 *       if (!body.ustn) throw new ApiError("VALIDATION", "ustn required", 400);
 *       // ... business logic ...
 *       return NextResponse.json({ ok: true, data: result });
 *     } catch (err) {
 *       return errorResponse(err, correlationId);
 *     }
 *   }
 *
 * NOTE: Existing 575+ routes are NOT refactored to use this pattern (too large
 * a change for one task). This helper exists so that new routes start with a
 * consistent error contract, and existing routes can adopt it incrementally
 * during normal refactors. Adopting routes should: drop their bespoke
 * `NextResponse.json({ error: "..." }, { status: ... })` blocks in favour of
 * `throw new ApiError(...)` + a single top-level `errorResponse` catch.
 *
 * @see IMPL-10a — Hardening: errors, loading, security, rate-limit
 */

import { NextResponse } from "next/server";

/**
 * Standardised operational error. Throw this from inside an API route
 * handler to signal a known, recoverable failure (validation, not-found,
 * auth, conflicts, rate-limit, etc.). The constructor arguments are:
 *
 * @param code        Machine-readable error code (e.g. "VALIDATION",
 *                    "UNAUTHORIZED", "NOT_FOUND", "CONFLICT",
 *                    "RATE_LIMITED", "BRAIN_DENY"). Stable across releases.
 * @param message     Human-readable message safe to surface to the client
 *                    (NEVER include stack traces, SQL fragments, or secrets).
 * @param status      HTTP status code (default 400).
 * @param details     Optional structured details — field-level validation
 *                    errors, offending identifiers, etc. JSON-serialisable.
 * @param correlationId Optional correlation id propagated from the request
 *                    scope (generated via `generateCorrelationId()`).
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: any,
    public correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    // Restore prototype chain when targeting ES5 — needed for `instanceof`
    // to work reliably across compiled boundaries.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Convert any thrown error into a uniform NextResponse JSON error envelope.
 *
 * Shape (always sent):
 *   {
 *     ok: false,
 *     error: {
 *       code:         string,         // machine-readable
 *       message:      string,         // human-readable, client-safe
 *       details?:     any,            // optional structured details
 *       correlationId?: string        // optional trace id
 *     }
 *   }
 *
 * - ApiError instances surface their code/message/details/status.
 * - Plain Error instances (programmer errors) are masked as `INTERNAL` /
 *   500 with a generic message — internal details never leak to the client.
 *
 * @param err           The thrown error (ApiError or plain Error).
 * @param correlationId Optional correlation id from the request scope. Used
 *                      as a fallback if the ApiError doesn't already carry one.
 */
export function errorResponse(
  err: ApiError | Error,
  correlationId?: string,
): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          correlationId: err.correlationId || correlationId,
        },
      },
      { status: err.status },
    );
  }
  // Programmer error — log full detail server-side, mask client-side.
  console.error("[sgtx:api-error] unhandled", err);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Internal server error",
        correlationId,
      },
    },
    { status: 500 },
  );
}

/**
 * Generate a short, opaque correlation id for request tracing.
 *
 * Format: `corr_<ms-epoch>_<8-char-base36-random>`
 *   e.g. `corr_1737000000000_k4f9a2bx`
 *
 * Cheap (no crypto) — sufficient for tracing within a single request lifecycle.
 * For cryptographic trace ids, swap in `crypto.randomUUID()` (Edge-compatible)
 * when ready to migrate.
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
