// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { retryPayment } from "@/lib/sgtx/payment-resilience";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment/[id]/retry
// Body: { attemptNumber }
// Executes a scheduled retry attempt on a leg. The URL `id` segment is the
// payment leg ID. If max attempts are reached, the leg is automatically
// escalated to manual review.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const attemptNumber = typeof body.attemptNumber === "number"
      ? body.attemptNumber
      : 1;

    const result = await retryPayment(legId, attemptNumber);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    logger.error("[api/payment/[id]/retry] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
