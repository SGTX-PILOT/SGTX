import { NextRequest, NextResponse } from "next/server";
import { getCommodityPrice } from "@/lib/sgtx/compliance/agmarket-integration";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=STRAWBERRIES" }, { status: 400 });
  const price = await getCommodityPrice(commodity);
  return NextResponse.json({ ok: true, price });
}
