// @ts-nocheck
// §1 Payments — split payment (one logical payment → N parts)
// POST /api/sgtx/finance/payments/split  body: SplitPaymentInput
import { NextResponse } from "next/server";
import { splitPayment } from "@/lib/sgtx/payment-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.payerGtid) {
      return NextResponse.json(
        { error: "payerGtid required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.parts) || body.parts.length === 0) {
      return NextResponse.json(
        { error: "parts must be a non-empty array" },
        { status: 400 },
      );
    }
    const results = await splitPayment(body);
    return NextResponse.json({ results });
  } catch (err: any) {
    logger.error("[api/finance/payments/split] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
