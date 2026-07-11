import { NextRequest, NextResponse } from "next/server";
import { getCommodityForecast } from "@/lib/sgtx/compliance/agri-commodity-forecast";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  const region = searchParams.get("region") || undefined;
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=Wheat&region=Egypt" }, { status: 400 });
  const forecast = await getCommodityForecast(commodity, region);
  return NextResponse.json({ ok: true, forecast });
}
