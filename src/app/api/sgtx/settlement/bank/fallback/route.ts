// @ts-nocheck
/**
 * POST /api/sgtx/settlement/bank/fallback
 *
 * Body: { settlementInstruction, reason }
 *   settlementInstruction: the original MultiLegSettlementInstruction object
 *   reason: "PAIN_002_REJECTION" | "SLA_TIMEOUT" | "BANK_ERROR"
 *
 * Handles bank fallback (§13.4.7). Selects the next-tier bank for the same
 * currency, logs the fallback attempt, and returns the new batchId.
 */
import { NextRequest, NextResponse } from "next/server";
import { handleBankFallback } from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { settlementInstruction, reason } = body;
    if (!settlementInstruction) {
      return NextResponse.json(
        { error: "settlementInstruction required" },
        { status: 400 },
      );
    }
    const validReasons = ["PAIN_002_REJECTION", "SLA_TIMEOUT", "BANK_ERROR"];
    if (!reason || !validReasons.includes(reason)) {
      return NextResponse.json(
        { error: `reason must be one of: ${validReasons.join(", ")}` },
        { status: 400 },
      );
    }
    const result = await handleBankFallback(settlementInstruction, reason);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
