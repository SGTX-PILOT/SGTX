// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPaymentHealthHistory } from "@/lib/sgtx/payment-health";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/[id]/health/history
// Returns the historical series of payment health score snapshots for the
// trade, so trends can be plotted over time. The URL `id` segment is the USTN.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await getPaymentHealthHistory(ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment/[id]/health/history] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
