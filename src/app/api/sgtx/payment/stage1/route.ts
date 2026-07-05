// 6.1 — Stage 1 Payment (Pre-shipment, One-Click)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { orchestrateStage1Payment } from "@/lib/sgtx/payment-orchestration";

export async function POST(req: NextRequest) {
  try {
    const { ustn, payerGtid, invoiceValueUsd } = await req.json();
    if (!ustn || !payerGtid || !invoiceValueUsd) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await orchestrateStage1Payment({ ustn, payerGtid, invoiceValueUsd: +invoiceValueUsd });
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[payment/stage1]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
