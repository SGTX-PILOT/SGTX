// POST /api/sgtx/payment/deferred/convert — body: { feePaymentRequestId, pspProvider? }
// "Convert to Immediate Payment" one-click action (Part 6.8.3).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { convertDeferredToImmediate } from "@/lib/sgtx/payment/deferred";
import { PspProvider, PSP_PROVIDERS } from "@/lib/sgtx/payment/psp-split";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { feePaymentRequestId, pspProvider } = body;
    if (!feePaymentRequestId) {
      return NextResponse.json({ error: "feePaymentRequestId required" }, { status: 400 });
    }
    if (pspProvider && !PSP_PROVIDERS.includes(pspProvider as PspProvider)) {
      return NextResponse.json({ error: `pspProvider must be one of ${PSP_PROVIDERS.join(", ")}` }, { status: 400 });
    }

    const result = await convertDeferredToImmediate({
      feePaymentRequestId,
      pspProvider: pspProvider as PspProvider | undefined,
    });

    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[payment/deferred/convert]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
