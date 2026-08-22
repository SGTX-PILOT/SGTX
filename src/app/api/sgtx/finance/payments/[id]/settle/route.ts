// @ts-nocheck
// §1 Payments — settle (PROCESSING → SETTLED). Body: { paymentReference }
// POST /api/sgtx/finance/payments/[id]/settle
import { NextResponse } from "next/server";
import { settlePayment } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.paymentReference) {
      return NextResponse.json(
        { error: "paymentReference required" },
        { status: 400 },
      );
    }
    const payment = await settlePayment(id, body.paymentReference);
    return NextResponse.json({ payment });
  } catch (err: any) {
    logger.error("[api/finance/payments/[id]/settle] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
