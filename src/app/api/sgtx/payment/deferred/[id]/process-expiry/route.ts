// @ts-nocheck
// SGTX v17 §13 — Deferred payment expiry processing route
//
// POST /api/sgtx/payment/deferred/[id]/process-expiry
//   Forces processing of the expiry for the deferred fee [id]. Auto-charges
//   if autoChargeAuthorised + a payment method is on file; otherwise blocks
//   the trade (FeeLock → FROZEN, ContainerReleaseAuthorisation → HOLD,
//   auto-create NON_PAYMENT dispute).
//   Returns { action: "AUTO_CHARGED" | "BLOCKED", evidence_ref, psp_reference?,
//             blocked_trade, dispute_id? }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { processExpiry } from "@/lib/sgtx/payment/deferred-escalation";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await processExpiry(id);
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404
        : result.code === "NOT_EXPIRED" ? 409
        : 400;
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      action: result.action,
      evidence_ref: result.evidenceRef,
      psp_reference: result.pspReference,
      blocked_trade: result.blockedTrade,
      dispute_id: result.disputeId,
    });
  } catch (e: any) {
    logger.error("[payment/deferred/[id]/process-expiry POST]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
