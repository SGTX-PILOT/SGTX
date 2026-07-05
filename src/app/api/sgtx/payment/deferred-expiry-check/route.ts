// 6.8 — Deferred Payment Guarantee Expiry Check + Convert to Immediate
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { checkDeferredGuaranteeExpiry, convertDeferredToImmediate } from "@/lib/sgtx/payment-orchestration";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "convert") {
      const result = await convertDeferredToImmediate({ feePaymentRequestId: body.feePaymentRequestId });
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }
    // Default: run expiry check
    const result = await checkDeferredGuaranteeExpiry();
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[payment/deferred-expiry-check]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
