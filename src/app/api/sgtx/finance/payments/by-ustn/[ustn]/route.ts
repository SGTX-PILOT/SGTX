// @ts-nocheck
// §1 Payments — all payments for a trade (USTN)
// GET /api/sgtx/finance/payments/by-ustn/[ustn]
import { NextResponse } from "next/server";
import { getPaymentsByUstn } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const payments = await getPaymentsByUstn(ustn);
    return NextResponse.json({ payments });
  } catch (err: any) {
    logger.error("[api/finance/payments/by-ustn] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
