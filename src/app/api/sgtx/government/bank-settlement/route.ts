// 7.5 — Bank Settlement: generate instruction, list, confirm
import { NextRequest, NextResponse } from "next/server";
import { generateBankSettlementInstruction, getBankSettlementInstructions, confirmBankSettlement } from "@/lib/sgtx/government";

export async function GET(req: NextRequest) {
  const bankBic = req.nextUrl.searchParams.get("bankBic");
  const status = req.nextUrl.searchParams.get("status") || "PENDING";
  const instructions = await getBankSettlementInstructions(bankBic || undefined, status);
  return NextResponse.json({ instructions, total: instructions.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "confirm") {
      const result = await confirmBankSettlement(body);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json({ ok: true, message: "Settlement confirmed. SGTX reconciled — no funds held." });
    }
    // Default: generate instruction
    const result = await generateBankSettlementInstruction(body);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[government/bank-settlement]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
