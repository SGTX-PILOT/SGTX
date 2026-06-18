import { NextRequest, NextResponse } from "next/server";
import { priceDeviationCheck } from "@/lib/sgtx/ai/orchestrator";
export async function POST(req: NextRequest) {
  const { commodity, enteredPrice, aiBandLow, aiBandHigh } = await req.json();
  if (!commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await priceDeviationCheck(commodity, Number(enteredPrice), Number(aiBandLow), Number(aiBandHigh));
  return NextResponse.json(result);
}
