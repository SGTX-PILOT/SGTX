// @ts-nocheck
// §1 Payments — process (SUBMITTED → PROCESSING)
// POST /api/sgtx/finance/payments/[id]/process
import { NextResponse } from "next/server";
import { processPayment } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const payment = await processPayment(id);
    return NextResponse.json({ payment });
  } catch (err: any) {
    logger.error("[api/finance/payments/[id]/process] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
