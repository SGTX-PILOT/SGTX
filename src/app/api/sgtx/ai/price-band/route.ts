import { NextRequest, NextResponse } from "next/server";
import { generatePriceBand } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/price-band  { commodity, hsCode, originCountry, destCountry }
export async function POST(req: NextRequest) {
  const { commodity, hsCode, originCountry, destCountry } = await req.json();
  if (!commodity) return NextResponse.json({ error: "commodity required" }, { status: 400 });
  const result = await generatePriceBand(commodity, hsCode || "", originCountry || "", destCountry || "");
  return NextResponse.json(result);
}
