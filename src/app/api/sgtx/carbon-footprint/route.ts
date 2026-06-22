import { NextRequest, NextResponse } from "next/server";
import { calculateCarbonFootprint, generateCbamXml } from "@/lib/sgtx/documents/carbon-footprint";

export async function POST(req: NextRequest) {
  try {
    const { ustn, transportMode, originCountry, destCountry, grossWeightKg, distanceKm, coldChain } = await req.json();
    if (!ustn || !transportMode || !grossWeightKg) return NextResponse.json({ error: "ustn, transportMode, grossWeightKg required" }, { status: 400 });
    const result = calculateCarbonFootprint({ ustn, transportMode, originCountry, destCountry, grossWeightKg, distanceKm, coldChain });
    return NextResponse.json({ ok: true, ...result, cbamXml: result.cbamApplicable ? generateCbamXml(result) : null });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
