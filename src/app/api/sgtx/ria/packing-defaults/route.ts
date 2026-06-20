import { NextRequest, NextResponse } from "next/server";
import { getCommodityPackingDefaults } from "@/lib/sgtx/ria";

export async function GET(req: NextRequest) {
  const hsCode = req.nextUrl.searchParams.get("hsCode");
  const originCountry = req.nextUrl.searchParams.get("originCountry") || undefined;
  if (!hsCode) return NextResponse.json({ error: "hsCode required" }, { status: 400 });
  const result = await getCommodityPackingDefaults(hsCode, originCountry);
  return NextResponse.json({ hsCode, originCountry, packingDefaults: result });
}
