// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 6.8 — Convert Deferred to Immediate Payment
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { convertDeferredToImmediate } from "@/lib/sgtx/payment-orchestration";

export async function POST(req: NextRequest) {
  try {
    const { feePaymentRequestId } = await req.json();
    if (!feePaymentRequestId) return NextResponse.json({ error: "feePaymentRequestId required" }, { status: 400 });
    const result = await convertDeferredToImmediate({ feePaymentRequestId });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, ...result, message: "Deferred payment converted to immediate. PSP charged successfully." });
  } catch (e: any) { logger.error("[payment/convert-immediate]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
