// GET /api/sgtx/payment/breakdown?ustn=... — returns detailed fee breakdown by payee
import { NextRequest, NextResponse } from "next/server";
import { calculateStage1Fees, calculateStage2Fees, generateSplitInstruction } from "@/lib/sgtx/payment/psp-split";

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const [stage1, stage2, stage1Split, stage2Split] = await Promise.all([
      calculateStage1Fees(ustn),
      calculateStage2Fees(ustn),
      generateSplitInstruction(ustn, "STAGE1"),
      generateSplitInstruction(ustn, "STAGE2"),
    ]);

    return NextResponse.json({
      ustn,
      currency: "USD",
      stage1: {
        summary: stage1,
        splits: stage1Split.splits,
        total: stage1.total,
      },
      stage2: {
        summary: stage2,
        splits: stage2Split.splits,
        total: stage2.total,
      },
      grand_total: stage1.total + stage2.total,
      payeeCount: stage1Split.splits.length + stage2Split.splits.length,
    });
  } catch (e: any) {
    console.error("[payment/breakdown]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
