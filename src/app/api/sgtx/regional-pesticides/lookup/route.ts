import { NextRequest, NextResponse } from "next/server";
import { lookupMultiRegionMrl } from "@/lib/sgtx/compliance/multi-region-pesticides";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pesticide = searchParams.get("pesticide");
  const commodity = searchParams.get("commodity");
  const destinationCountry = searchParams.get("destinationCountry") || undefined;
  const euProductCode = searchParams.get("euProductCode") || undefined;
  if (!pesticide || !commodity) {
    return NextResponse.json({ error: "Required: ?pesticide=NAME&commodity=NAME[&destinationCountry=DE&euProductCode=0110000]" }, { status: 400 });
  }
  const result = await lookupMultiRegionMrl(pesticide, commodity, destinationCountry, euProductCode);
  return NextResponse.json({ ok: true, ...result });
}
