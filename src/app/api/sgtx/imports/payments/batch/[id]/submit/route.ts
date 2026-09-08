// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: submit local payment batch to PSP
 * ============================================================================
 * POST /api/sgtx/imports/payments/batch/[id]/submit
 *   (id is the batch_id returned by POST /api/sgtx/imports/payments/batch)
 *   Returns: { ok, submitted, batch_id, tracking_id,
 *              payment_legs: [{ leg_id, payee, amount, currency, status,
 *                               external_ref }] }
 *
 * Submits all PaymentLeg rows in the batch to the PSP for execution.
 * Transitions each leg from PENDING → SUBMITTED and stamps the
 * externalPaymentRef returned by the PSP. Non-custodial — SGTX only emits
 * the split; the PSP holds and executes the funds.
 *
 * Idempotent — re-calling on an already-submitted batch returns the existing
 * leg statuses without re-submitting.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitPaymentBatch } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id (batch_id) is required" }, { status: 400 });
    }
    const result = await submitPaymentBatch(id);
    return NextResponse.json({
      ok: true,
      submitted: result.submitted,
      batch_id: result.batchId,
      tracking_id: result.trackingId,
      payment_legs: result.paymentLegs,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/payments/batch/[id]/submit] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("BATCH_NOT_FOUND")
      || err?.message?.startsWith("BATCH_EMPTY")
      || err?.message?.startsWith("BATCH_ID_REQUIRED")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
