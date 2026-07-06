/**
 * withBrainPrescreen — Higher-Order Gate for SGTX Brain AI (IMPL-5)
 * =================================================================
 *
 * AUDIT-1 finding: 0% of mutating routes use Brain output to gate or block.
 * The Brain was a side-channel advisory service with no enforcement authority.
 *
 * This HOC corrects that. It wraps any Next.js POST/PUT API route handler so
 * that a Brain pre-screen runs BEFORE the handler. The Brain may:
 *
 *   • ALLOW         — handler runs normally.
 *   • CONDITIONAL   — handler runs, but with `_brainConditions` attached to the
 *                     parsed body so the handler can record them on the trade
 *                     (Activity log, TimelineEvent, InboxItem, etc.).
 *   • DENY          — request is short-circuited with HTTP 422 + the Brain's
 *                     signed denial payload (verdict, conditions, brainModule,
 *                     aiConfidence, denialReason). No DB writes occur.
 *
 * Usage (contract signing — the canonical example):
 *
 * ```ts
 * import { withBrainPrescreen } from "@/lib/sgtx/ai/with-brain-prescreen";
 * import { autoCheckCompliance } from "@/lib/sgtx/ai/compliance-gate";
 *
 * async function handler(req, ctx) {
 *   // ctx.body is already parsed — do NOT re-call req.json()
 *   // ctx.prescreen is the BrainPrescreenResult (ALLOW / CONDITIONAL)
 *   // body._brainConditions holds the unmet conditions for CONDITIONAL verdicts
 *   ...
 * }
 *
 * export const POST = withBrainPrescreen(
 *   async ({ body, req, actorGtid, resourceUstn }) => {
 *     // ...look up trade from body.ustn, build ComplianceGateInput...
 *     return autoCheckCompliance(input);
 *   },
 *   handler,
 * );
 * ```
 *
 * The HOC is REUSABLE: any future mutating route (contract/amend, payment/authorize,
 * shipment/dispatch, customs/declare, etc.) can wrap its handler the same way
 * with a route-specific prescreen function. Follow-up tasks will do exactly that.
 *
 * Design notes:
 *   • The HOC parses `req.json()` ONCE so the handler does not need to re-parse.
 *     For non-JSON bodies (rare for mutating routes), `body` defaults to `{}`.
 *   • The original request is cloned BEFORE parsing so the handler can still
 *     read headers, query params, etc. from `reqClone` if needed. (Body is
 *     single-read on the Web Fetch `Request` interface — cloning first is the
 *     safe pattern.)
 *   • DENY returns 422 (Unprocessable Entity) — the request was well-formed
 *     but the Brain's compliance/policy gate refused to let it through.
 *   • The HOC never throws on a Brain error — if the prescreen itself throws,
 *     the HOC logs and returns 500. We deliberately do NOT silently ALLOW on
 *     Brain failure (fail-closed policy for compliance gates); the route
 *     operator can switch to fail-open by wrapping their prescreen in a
 *     try/catch that returns ALLOW.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Brain verdict for a single pre-screened action. */
export type BrainVerdict = "ALLOW" | "DENY" | "CONDITIONAL";

/** A single compliance/policy condition surfaced by the Brain. */
export interface BrainCondition {
  /** Stable condition identifier — e.g. "SANCTIONS-CLEAR", "EUDR-DDS",
   *  "CBAM-DECL", "FM-CORRIDOR-CLEAR". Used by UIs + downstream persistence. */
  condition_id: string;
  /** Human-readable label describing what must be true for the condition to
   *  flip from `unmet` → `met`. Surfaced directly in the SGTX portal UI. */
  label: string;
  /** `unmet` = action required (or the action is denied); `met` = satisfied. */
  status: "unmet" | "met";
}

/** Result of a Brain pre-screen — the only object a prescreen function returns. */
export interface BrainPrescreenResult {
  /** Final verdict. ALLOW → proceed; DENY → 422; CONDITIONAL → proceed with
   *  the unmet conditions attached to the request body for the handler to
   *  persist on the trade record. */
  verdict: BrainVerdict;
  /** All conditions surfaced by the Brain (both met and unmet). UIs render
   *  this list so operators see exactly what the Brain checked. */
  conditions: BrainCondition[];
  /** Required when `verdict === "DENY"`. Short human-readable reason. */
  denialReason?: string;
  /** Brain confidence in the verdict, in [0, 1]. Lower confidence (e.g. when
   *  inputs were partial or fuzzy) should trigger human-review UIs. */
  aiConfidence?: number;
  /** Identifies the Brain module that produced the verdict — e.g.
   *  "autoCheckCompliance", "predictTradeRisk", "sanctionsRadar". Used in the
   *  audit trail + the 422 response so callers know which gate fired. */
  brainModule: string;
}

/** Context passed to a prescreen function. */
export interface BrainPrescreenContext {
  /** Parsed JSON body. `{}` for non-JSON requests. The prescreen may augment
   *  this object (e.g. attach `_brainConditions`); mutations propagate to the
   *  handler via `ctx.body`. */
  body: any;
  /** The original NextRequest (body already consumed — use for headers/query). */
  req: NextRequest;
  /** Actor GTID resolved from body or `x-sgtx-gtid` header. May be undefined. */
  actorGtid?: string;
  /** Resource USTN resolved from body. May be undefined for non-USTN actions. */
  resourceUstn?: string;
}

/**
 * A pre-screen function receives the parsed body + request context and returns
 * a Brain verdict. Implementations typically call a Brain module like
 * `autoCheckCompliance` after looking up any missing trade data from the DB.
 */
export type BrainPrescreenFn = (ctx: BrainPrescreenContext) => Promise<BrainPrescreenResult>;

/** Context handed to the wrapped handler. */
export interface BrainHandlerContext {
  /** The parsed body (same reference the prescreen saw). For CONDITIONAL
   *  verdicts, `body._brainConditions` holds the unmet conditions array. */
  body: any;
  /** The full Brain pre-screen result. Handlers can log `prescreen.brainModule`
   *  and `prescreen.aiConfidence` on the trade record for audit. */
  prescreen: BrainPrescreenResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOC implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap a Next.js POST/PUT route handler with a Brain pre-screen gate.
 *
 * Behaviour:
 *   1. Parse `req.json()` once (default `{}` on parse failure — non-JSON body
 *      is OK; the handler will see `body = {}`).
 *   2. Clone the request BEFORE parsing so the handler can still inspect
 *      headers/query params on `reqClone` if needed.
 *   3. Invoke the prescreen function with `{ body, req, actorGtid, resourceUstn }`.
 *   4. If `verdict === "DENY"` → return HTTP 422 with the signed denial
 *      payload. The handler is NOT called. No DB writes occur.
 *   5. If `verdict === "CONDITIONAL"` → attach `result.conditions` to
 *      `body._brainConditions` so the handler can persist them on the trade.
 *   6. If `verdict === "ALLOW"` → proceed normally.
 *   7. Call the handler with `(reqClone, { body, prescreen })`.
 *
 * Error handling (fail-closed for compliance gates):
 *   If the prescreen function itself throws, the HOC logs the error and
 *   returns HTTP 500. This is deliberate — a Brain outage must NOT silently
 *   downgrade to ALLOW on compliance-critical mutations. Route operators who
 *   want fail-open behaviour can wrap their prescreen in a try/catch that
 *   returns `{ verdict: "ALLOW", conditions: [], brainModule: "fail-open" }`.
 *
 * @param prescreen Brain pre-screen function (typically wraps a Brain module
 *                  like `autoCheckCompliance` after looking up trade data).
 * @param handler   The original route handler. Receives `(req, ctx)` where
 *                  `ctx.body` is already-parsed JSON and `ctx.prescreen` is
 *                  the Brain result.
 * @returns A Next.js POST/PUT route handler suitable for `export const POST = ...`.
 */
export function withBrainPrescreen(
  prescreen: BrainPrescreenFn,
  handler: (
    req: NextRequest,
    ctx: BrainHandlerContext,
  ) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Clone the request BEFORE reading its body — the Web Fetch Request body
    // is single-read; cloning first preserves a readable copy for the handler.
    const reqClone = req.clone();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Non-JSON body (or empty body) — proceed with `body = {}`. The handler
      // can decide whether that's a 400.
      body = {};
    }

    // Resolve common context fields. Prescreen functions may override these
    // by reading body fields directly.
    const actorGtid: string | undefined =
      body?.actorGtid ||
      body?.gtid ||
      body?.signerGtid ||
      body?.filedByGtid ||
      body?.payerGtid ||
      req.headers.get("x-sgtx-gtid") ||
      undefined;
    const resourceUstn: string | undefined =
      body?.ustn || body?.resourceUstn || undefined;

    // Run the Brain pre-screen. Fail-closed on prescreen errors.
    let result: BrainPrescreenResult;
    try {
      result = await prescreen({ body, req, actorGtid, resourceUstn });
    } catch (err: any) {
      logger.error(
        "[withBrainPrescreen] prescreen threw — failing closed (500).",
        { brainModuleHint: prescreen.name || "anonymous", error: err?.message },
      );
      return NextResponse.json(
        {
          ok: false,
          error: "BRAIN_PRESCREEN_ERROR",
          message:
            "SGTX Brain pre-screen failed to evaluate this action. The request was rejected (fail-closed) pending investigation.",
          details: err?.message ?? String(err),
        },
        { status: 500 },
      );
    }

    // DENY → 422 with the signed denial payload. No handler call, no DB writes.
    if (result.verdict === "DENY") {
      return NextResponse.json(
        {
          ok: false,
          error: "BRAIN_DENY",
          message: result.denialReason || "SGTX Brain AI has blocked this action.",
          conditions: result.conditions,
          brainModule: result.brainModule,
          aiConfidence: result.aiConfidence,
        },
        { status: 422 },
      );
    }

    // CONDITIONAL → attach conditions to body so the handler can persist them
    // on the trade (Activity log, TimelineEvent, Smart Inbox notification).
    // The handler still runs.
    if (result.verdict === "CONDITIONAL") {
      body._brainConditions = result.conditions;
    }
    // Always stamp the brain module + verdict on body so handlers can audit
    // even ALLOW verdicts without needing to re-read ctx.prescreen.
    body._brainVerdict = result.verdict;
    body._brainModule = result.brainModule;
    body._brainAiConfidence = result.aiConfidence;

    // ALLOW (or CONDITIONAL) → run the handler with the parsed body + result.
    // Cast `reqClone` to NextRequest: at runtime `NextRequest.clone()` returns
    // a NextRequest (preserves cookies / nextUrl / page / ua), but the Web
    // Fetch `Request.clone()` lib type signature narrows to `Request`. The
    // cast is the standard escape hatch used inside Next.js App Router
    // middleware; it is sound because NextRequest extends Request and clone
    // preserves the prototype chain.
    return handler(reqClone as NextRequest, { body, prescreen: result });
  };
}
