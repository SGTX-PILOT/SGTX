// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getSlaStatus, getTotalSlaCredits } from "@/lib/sgtx/payment-sla";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/payment/sla/[ustn]/status
// Returns the full SLA status for a trade: by-leg SLA records, breaches,
// and the total credits accrued (which feeds the Trade Health Score).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const status = await getSlaStatus(ustn);
    const totalCredits = await getTotalSlaCredits(ustn);
    return NextResponse.json({
      ok: true,
      ...status,
      total_credits: totalCredits,
    });
  } catch (e: any) {
    logger.error("[api/payment/sla/[ustn]/status] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
