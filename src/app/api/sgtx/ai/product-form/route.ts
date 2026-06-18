import { NextRequest, NextResponse } from "next/server";
import { productFormAgent } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  const { commodityType, productName, hsCode } = await req.json();
  if (!commodityType) return NextResponse.json({ error: "commodityType required" }, { status: 400 });
  const result = await productFormAgent(commodityType, productName || "", hsCode || "");
  return NextResponse.json(result);
}
