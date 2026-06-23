// 5.9 — Carbon Footprint Calculation (ISO 14067) + CBAM Report
import { NextRequest, NextResponse } from "next/server";
import { calculateCarbonFootprint, generateCbamReport } from "@/lib/sgtx/packing";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const cbam = req.nextUrl.searchParams.get("cbam") === "true";
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  // Calculate carbon footprint (simulated parameters for the trade)
  const carbon = calculateCarbonFootprint({
    vesselDistanceKm: 10000,
    cargoWeightTons: 20,
    truckDistanceKm: 150,
    reeferDays: 3,
    reeferPowerKwh: 500,
    packagingKg: 800,
    originCountry: "EG",
    destCountry: "DE",
  });

  if (cbam) {
    const cbamXml = generateCbamReport(ustn, carbon);
    return new NextResponse(cbamXml, { headers: { "Content-Type": "application/xml", "Content-Disposition": `attachment; filename="cbam-${ustn.slice(0, 20)}.xml"` } });
  }

  return NextResponse.json(carbon);
}
