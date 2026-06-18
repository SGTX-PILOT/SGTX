import { NextRequest, NextResponse } from "next/server";
import { incotermSummary } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  const { incoterm, buyerCountry, sellerCountry } = await req.json();
  if (!incoterm) return NextResponse.json({ error: "incoterm required" }, { status: 400 });
  const result = await incotermSummary(incoterm, buyerCountry || "", sellerCountry || "");
  return NextResponse.json(result);
}
