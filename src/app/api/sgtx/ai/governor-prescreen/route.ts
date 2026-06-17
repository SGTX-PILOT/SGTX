import { NextRequest, NextResponse } from "next/server";
import { governorPrescreen } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/governor-prescreen  { commodity, hsCode, buyerCountry, sellerCountry, value }
export async function POST(req: NextRequest) {
  const { commodity, hsCode, buyerCountry, sellerCountry, value } = await req.json();
  if (!commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await governorPrescreen({ commodity, hsCode, buyerCountry, sellerCountry, value });
  return NextResponse.json(result);
}
