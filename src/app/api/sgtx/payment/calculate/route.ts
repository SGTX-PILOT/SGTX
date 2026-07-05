// POST /api/sgtx/payment/calculate — body: { ustn }
// Returns Stage 1 + Stage 2 fee breakdown (Part 6.1.1 + 6.2)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateStage1Fees, calculateStage2Fees } from "@/lib/sgtx/payment/psp-split";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const stage1 = await calculateStage1Fees(ustn);
    const stage2 = await calculateStage2Fees(ustn);

    return NextResponse.json({
      ustn,
      stage1,
      stage2,
      grand_total: stage1.total + stage2.total,
      currency: "USD",
    });
  } catch (e: any) {
    logger.error("[payment/calculate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
