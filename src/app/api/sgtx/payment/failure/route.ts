// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { handlePaymentFailure, RETRY_POLICIES, PaymentFailureType } from "@/lib/sgtx/payment-resilience";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment/failure
// Body: { legId, failureType, errorCode?, errorMessage?, ustn?, actorGtid? }
// Reports a payment leg failure and returns the deterministic action
// (NOTIFY_USER / SCHEDULE_RETRY / MARK_UNKNOWN) plus retry policy details.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { legId, failureType, errorCode, errorMessage, ustn, actorGtid } = body;

    if (!legId || typeof legId !== "string") {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    if (!failureType || !(failureType in RETRY_POLICIES)) {
      return NextResponse.json(
        { error: `failureType must be one of: ${Object.keys(RETRY_POLICIES).join(", ")}` },
        { status: 400 },
      );
    }

    const decision = await handlePaymentFailure({
      legId,
      failureType: failureType as PaymentFailureType,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      ustn: ustn ?? null,
      actorGtid: actorGtid ?? null,
    });

    return NextResponse.json({ ok: true, decision });
  } catch (e: any) {
    logger.error("[api/payment/failure] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
