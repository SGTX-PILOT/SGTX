// @ts-nocheck
// §1 Payments — fail (PROCESSING → FAILED). Body: { failureCode, failureReason }
// POST /api/sgtx/finance/payments/[id]/fail
import { NextResponse } from "next/server";
import { failPayment } from "@/lib/sgtx/payment-engine";
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
    if (!body?.failureCode) {
      return NextResponse.json(
        { error: "failureCode required" },
        { status: 400 },
      );
    }
    const payment = await failPayment(
      id,
      body.failureCode,
      body.failureReason || null,
    );
    return NextResponse.json({ payment });
  } catch (err: any) {
    logger.error("[api/finance/payments/[id]/fail] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
