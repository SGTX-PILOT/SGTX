// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentRetryHistory } from "@/lib/sgtx/payment-resilience";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/[id]/retry-history
// Returns the full retry log for a leg, including the resolution state.
// The URL `id` segment is the payment leg ID.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const history = await getPaymentRetryHistory(legId);
    return NextResponse.json({ ok: true, history });
  } catch (e: any) {
    logger.error("[api/payment/[id]/retry-history] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
