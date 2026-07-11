import { NextRequest, NextResponse } from "next/server";
import { checkMultiRegionCompliance } from "@/lib/sgtx/compliance/multi-region-pesticides";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pesticide, commodity, detectedLevelMgKg, destinationCountry, euProductCode } = body;
    if (!pesticide || !commodity || typeof detectedLevelMgKg !== "number") {
      return NextResponse.json({ error: "Required: { pesticide, commodity, detectedLevelMgKg, destinationCountry?, euProductCode? }" }, { status: 400 });
    }
    const result = await checkMultiRegionCompliance(pesticide, commodity, detectedLevelMgKg, destinationCountry, euProductCode);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
