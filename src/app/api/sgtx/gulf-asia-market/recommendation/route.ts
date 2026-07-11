import { NextRequest, NextResponse } from "next/server";
import { getPackingAwareRecommendation, type PackingType } from "@/lib/sgtx/compliance/gulf-asia-market";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  const role = (searchParams.get("role") || "buyer") as "buyer" | "seller";
  const packingType = (searchParams.get("packing") as PackingType) || undefined;
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=Strawberries&role=buyer&packing=BULK_IQF" }, { status: 400 });
  const rec = await getPackingAwareRecommendation(commodity, role, packingType);
  return NextResponse.json({ ok: true, recommendation: rec });
}
