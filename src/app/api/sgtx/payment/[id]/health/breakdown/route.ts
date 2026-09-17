// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentHealthBreakdown } from "@/lib/sgtx/payment-health";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/[id]/health/breakdown
// Returns the leg-level, milestone-level, and trend breakdown for the
// payment health score of a trade. The URL `id` segment is the USTN.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await getPaymentHealthBreakdown(ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment/[id]/health/breakdown] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
