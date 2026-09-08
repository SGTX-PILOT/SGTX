// @ts-nocheck
// SGTX v17 §13 — Deferred payment escalation route (single DeferredFee)
//
// POST /api/sgtx/payment/deferred/[id]/escalate
//   Triggers the next escalation step for the deferred fee [id].
//   Returns { escalated, step, action, message, evidence_ref, guarantee_expiry }
//
// GET  /api/sgtx/payment/deferred/[id]/escalate
//   Returns the current escalation status without performing any action.
//   Useful for the dashboard.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  escalateDeferredPayment,
  getEscalationStatus,
} from "@/lib/sgtx/payment/deferred-escalation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Optional body: { force?: boolean } — when true, the caller asks the
    // escalation engine to re-evaluate even if a step has already been
    // performed. Currently the engine is idempotent (re-evaluation is a
    // no-op after a step has been performed), so force is a no-op.
    const body = await req.json().catch(() => ({}));

    const result = await escalateDeferredPayment(id);
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404
        : result.code === "ALREADY_SETTLED" ? 409
        : 400;
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      escalated: result.escalated,
      step: result.step,
      action: result.action,
      deferred_fee_id: result.deferredFeeId,
      ustn: result.ustn,
      guarantee_expiry: result.guaranteeExpiry,
      message: result.message,
      evidence_ref: result.evidenceRef,
    });
  } catch (e: any) {
    logger.error("[payment/deferred/[id]/escalate POST]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const status = await getEscalationStatus(id);
    if (!status.ok) {
      const code = status.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: status.reason, code: status.code },
        { status: code },
      );
    }
    return NextResponse.json({
      ok: true,
      deferred_fee_id: status.deferredFeeId,
      ustn: status.ustn,
      current_step: status.currentStep,
      current_action: status.currentAction,
      next_action_at: status.nextActionAt,
      expired: status.expired,
      guarantee_expiry: status.guaranteeExpiry,
      auto_charge_authorised: status.autoChargeAuthorised,
      payer_gtid: status.payerGtid,
      guarantor_gtid: status.guarantorGtid,
    });
  } catch (e: any) {
    logger.error("[payment/deferred/[id]/escalate GET]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
