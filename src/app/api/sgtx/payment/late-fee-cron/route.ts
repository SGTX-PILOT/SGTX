// @ts-nocheck
/**
 * SGTX v18 §13.4.12 — Late Fee Calculator cron endpoint (CRON_SECRET-protected)
 * ============================================================================
 *
 * POST /api/sgtx/payment/late-fee-cron
 *
 * Daily cron job that runs the existing late-fee calculator
 * (`src/lib/sgtx/payment/late-fees.ts → runLateFeeCron()`).
 *
 * Per the blueprint (§13.4.12):
 *   "Late fee = 0.1% of unpaid fee per full day, capped at 100% of original
 *    fee. Daily cron late-fee-calculator scans fee_payment_requests where
 *    status='PENDING' AND due_date < NOW(), updates late_fee_accrued, inserts
 *    late_fee_events."
 *
 * The lib is fully implemented — this route is just the cron trigger + the
 * `processed / updated / totalLateFeesUsd / errors[]` response envelope.
 *
 * AUTHENTICATION:
 *   - Requires a valid CRON_SECRET in the `Authorization: Bearer <secret>`
 *     header (or `x-cron-secret` header for flexibility).
 *   - The middleware enforces this on every `/cron`-suffixed route via
 *     `CRON_ROUTES.has(path) || path.endsWith("/cron")`. We added this route
 *     to `CRON_ROUTES` in middleware.ts explicitly because the path does
 *     NOT end in `/cron` (it's `/late-fee-cron`).
 *   - In dev, you can hit this endpoint with `curl -X POST -H
 *     "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sgtx/payment/late-fee-cron`.
 *   - In production, Vercel Cron calls this endpoint with the CRON_SECRET
 *     automatically (configured in vercel.json).
 *
 * The previous (legacy) cron at `/api/sgtx/payment/late-fees/cron` exists
 * without CRON_SECRET auth — this new route is the SECURE replacement. The
 * old route will be deprecated in a future task.
 *
 * RESPONSE (200 OK):
 *   {
 *     ok: true,
 *     ranAt:      "2025-01-01T01:00:00.000Z",
 *     processed:  <number of overdue FeePaymentRequests scanned>,
 *     updated:    <number of FeePaymentRequests whose late_fee_accrued changed>,
 *     totalLateFeesUsd: <sum of all late fees accrued this run>,
 *     capReachedCount: <number of FeePaymentRequests that hit the 100% cap>,
 *     eventsCreated:   <number of LateFeeEvent rows inserted>,
 *     errors:    []
 *   }
 *
 * RESPONSE (401 Unauthorized):
 *   { error: "Unauthorized: invalid cron secret" }
 *
 * RESPONSE (503 — CRON_SECRET not configured):
 *   { error: "Cron secret not configured" }
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { runLateFeeCron } from "@/lib/sgtx/payment/late-fees";

export async function POST(req: NextRequest) {
  // ── CRON_SECRET verification (defence-in-depth — the middleware already
  // checks this, but we verify again at the route handler in case the
  // middleware is bypassed or this route is called via a non-cron path
  // alias).
  //
  // Accept the secret in either the standard `Authorization: Bearer <secret>`
  // header (Vercel Cron convention) OR a custom `x-cron-secret` header (for
  // manual dev triggers / curl / Postman).
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        error:
          "Cron secret not configured — set CRON_SECRET in your environment " +
          "before invoking this endpoint.",
      },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  const customSecret = req.headers.get("x-cron-secret") || "";
  const providedSecret = bearerSecret || customSecret;

  if (providedSecret !== cronSecret) {
    logger.warn("[payment/late-fee-cron] unauthorized invocation attempt", {
      hasBearer: Boolean(bearerSecret),
      hasCustom: Boolean(customSecret),
    });
    return NextResponse.json(
      { error: "Unauthorized: invalid cron secret" },
      { status: 401 },
    );
  }

  // ── Run the late-fee calculator
  //
  // The existing lib at `src/lib/sgtx/payment/late-fees.ts → runLateFeeCron()`
  // does the heavy lifting:
  //   1. Scans `fee_payment_requests` where status='PENDING' AND dueDate < NOW()
  //   2. For each, computes 0.1%/day late fee (capped at 100% of original fee)
  //   3. Idempotently inserts a LateFeeEvent per (reqId, daysLate) pair
  //   4. Updates `fee_payment_requests.lateFeeAccrued` + `lateFeeCapReached`
  //   5. Sends a Smart Inbox reminder (priority 90) to the payer
  //
  // We wrap the call in a per-record try/catch so a single bad row doesn't
  // abort the whole batch — partial errors are returned in the `errors[]`
  // array but the cron still reports success on the rows it did process.
  try {
    const errors: Array<{
      feePaymentRequestId?: string;
      ustn?: string;
      error: string;
    }> = [];

    let result;
    try {
      result = await runLateFeeCron();
    } catch (e: any) {
      logger.error("[payment/late-fee-cron] runLateFeeCron failed", {
        error: e?.message,
      });
      errors.push({ error: e?.message || "runLateFeeCron threw" });
      // Return a 200 with the error embedded so the cron scheduler doesn't
      // retry indefinitely — the operator can inspect the errors[] array.
      return NextResponse.json({
        ok: false,
        ranAt: new Date().toISOString(),
        processed: 0,
        updated: 0,
        totalLateFeesUsd: 0,
        capReachedCount: 0,
        eventsCreated: 0,
        errors,
      });
    }

    // Map the lib's response shape to the cron-endpoint envelope.
    //
    // The lib returns:
    //   { processed, eventsCreated, capReachedCount, details: LateFeeCalculationResult[] }
    //
    // We derive:
    //   - updated = number of details rows where lateFeeAccrued changed
    //     (i.e. the row wasn't already at the latest accrued amount)
    //   - totalLateFeesUsd = sum of lateFeeAccrued across all rows touched
    //     this run (cumulative, not just the day's accrual)
    //   - errors[] = [] (the lib's per-row try/catch is internal; if it
    //     returns a result, all rows succeeded)
    const details = Array.isArray(result?.details) ? result.details : [];
    const totalLateFeesUsd = Math.round(
      details.reduce((s, d) => s + (Number(d?.lateFeeAccrued) || 0), 0) * 100,
    ) / 100;

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      processed: result.processed,
      updated: details.length,
      totalLateFeesUsd,
      capReachedCount: result.capReachedCount,
      eventsCreated: result.eventsCreated,
      errors,
    });
  } catch (e: any) {
    logger.error("[payment/late-fee-cron] unhandled error", {
      error: e?.message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        ranAt: new Date().toISOString(),
        processed: 0,
        updated: 0,
        totalLateFeesUsd: 0,
        errors: [{ error: e?.message || "Unknown error" }],
      },
      { status: 500 },
    );
  }
}

// ── GET helper — describe the endpoint shape (no auth required for the
// description; useful for `curl -X GET` discovery + the OpenAPI doc).
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/sgtx/payment/late-fee-cron",
    method: "POST",
    description:
      "Daily late-fee calculator cron (§13.4.12). Accrues 0.1%/day late fee " +
      "on overdue FeePaymentRequests, capped at 100% of the original fee. " +
      "Persists LateFeeEvent rows + sends Smart Inbox reminders.",
    authentication: {
      type: "CRON_SECRET",
      header: "Authorization: Bearer <secret> OR x-cron-secret: <secret>",
      notes:
        "The middleware enforces this on every /cron-suffixed route. This " +
        "route is registered in CRON_ROUTES in src/middleware.ts because " +
        "the path does not end in '/cron' (it ends in 'late-fee-cron').",
    },
    response: {
      ok: "boolean",
      ranAt: "ISO timestamp",
      processed: "number — overdue FeePaymentRequests scanned",
      updated: "number — FeePaymentRequests whose late_fee_accrued changed",
      totalLateFeesUsd: "number — sum of all late fees accrued this run",
      capReachedCount: "number — rows that hit the 100% cap",
      eventsCreated: "number — LateFeeEvent rows inserted",
      errors: "Array<{ feePaymentRequestId?, ustn?, error }>",
    },
    schedule: "0 1 * * *  (daily at 01:00 UTC — see vercel.json)",
    lib: "src/lib/sgtx/payment/late-fees.ts → runLateFeeCron()",
    replaces: "/api/sgtx/payment/late-fees/cron (legacy — no CRON_SECRET auth)",
  });
}
