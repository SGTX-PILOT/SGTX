// 3B.7.1 — Generate Settlement Instruction (full or milestone-based)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { generateSettlementInstruction } from "@/lib/sgtx/settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, shipmentId, milestoneType, payerGtid, payeeGtid, amountUsd, currency, type, beneficiaryAccount, dueDate, autoExecute } = body;
    if (!ustn || !payerGtid || !payeeGtid || !amountUsd || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const result = await generateSettlementInstruction({
      ustn, tradeId, shipmentId, milestoneType, payerGtid, payeeGtid,
      amountUsd: +amountUsd, currency, type, beneficiaryAccount,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      autoExecute,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[settlement/generate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
