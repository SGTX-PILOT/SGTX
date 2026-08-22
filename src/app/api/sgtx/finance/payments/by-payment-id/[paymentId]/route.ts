// @ts-nocheck
// §1 Payments — GET by paymentId (business identifier)
// GET /api/sgtx/finance/payments/by-payment-id/[paymentId]
import { NextResponse } from "next/server";
import { getPaymentByPaymentId } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  try {
    const { paymentId } = await params;
    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId required" },
        { status: 400 },
      );
    }
    const payment = await getPaymentByPaymentId(paymentId);
    if (!payment) {
      return NextResponse.json(
        { error: "payment not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ payment });
  } catch (err: any) {
    logger.error("[api/finance/payments/by-payment-id] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
