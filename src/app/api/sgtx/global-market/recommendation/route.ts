import { NextRequest, NextResponse } from "next/server";
import { getGlobalMarketRecommendation } from "@/lib/sgtx/compliance/global-market-intelligence";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  const role = (searchParams.get("role") || "buyer") as "buyer" | "seller";
  const isFrozen = searchParams.get("frozen") === "true" ? true : searchParams.get("fresh") === "true" ? false : undefined;
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=Strawberries&role=buyer&frozen=true" }, { status: 400 });
  const rec = await getGlobalMarketRecommendation(commodity, role, isFrozen);
  return NextResponse.json({ ok: true, recommendation: rec });
}
