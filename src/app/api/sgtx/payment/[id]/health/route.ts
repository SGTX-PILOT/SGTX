// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { calculatePaymentHealthScore } from "@/lib/sgtx/payment-health";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/[id]/health
// Returns the weighted 0-100 payment health score for the trade, with the
// four-component breakdown (legs_settled 30% / timeliness 25% /
// reconciliation 25% / dispute_impact 20%) and band (HEALTHY/WARNING/CRITICAL).
// The URL `id` segment is the USTN of the trade.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await calculatePaymentHealthScore(ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment/[id]/health] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
