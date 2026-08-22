// @ts-nocheck
// §1 Payments — GET by database id
// GET /api/sgtx/finance/payments/[id]
import { NextResponse } from "next/server";
import { getPayment } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const payment = await getPayment(id);
    if (!payment) {
      return NextResponse.json(
        { error: "payment not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ payment });
  } catch (err: any) {
    logger.error("[api/finance/payments/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
