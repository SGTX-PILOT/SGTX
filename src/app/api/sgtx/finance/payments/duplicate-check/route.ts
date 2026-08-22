// @ts-nocheck
// §1 Payments — duplicate check (§10 idempotency)
// GET /api/sgtx/finance/payments/duplicate-check?idempotencyKey=X
import { NextResponse } from "next/server";
import { detectDuplicatePayment } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const idempotencyKey = url.searchParams.get("idempotencyKey");
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "idempotencyKey required" },
        { status: 400 },
      );
    }
    const duplicate = await detectDuplicatePayment(idempotencyKey);
    return NextResponse.json({
      idempotencyKey,
      duplicate: !!duplicate,
      payment: duplicate || null,
    });
  } catch (err: any) {
    logger.error("[api/finance/payments/duplicate-check] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
