import { NextRequest, NextResponse } from "next/server";
import { getMarketRecommendation } from "@/lib/sgtx/compliance/agmarket-integration";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  const role = (searchParams.get("role") || "buyer") as "buyer" | "seller";
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=STRAWBERRIES&role=buyer|seller" }, { status: 400 });
  const rec = await getMarketRecommendation(commodity, role);
  return NextResponse.json({ ok: true, recommendation: rec });
}
