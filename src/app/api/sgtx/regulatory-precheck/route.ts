// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { buyerGtid, sellerGtid, originCountry, destinationCountry, hsCode, commodity, coldChain } = body;
    const checks: any = {};
    let overallVerdict = "ALLOW";
    const warnings: string[] = [];
    // Sanctions (simplified — uses jurisdiction data)
    const sanctioned = ["IR", "SY", "KP", "CU"];
    if (sanctioned.includes(originCountry) || sanctioned.includes(destinationCountry)) {
      checks.sanctions = { status: "BLOCKED", details: "Sanctioned country detected" };
      overallVerdict = "DENY";
    } else {
      checks.sanctions = { status: "CLEAR", details: "No sanctions matches" };
    }
    // FTA eligibility (simplified)
    const ftaPairs = [["EG", "DE"], ["EG", "AE"], ["EG", "SA"], ["EG", "GB"]];
    const ftaEligible = ftaPairs.some(([a, b]) => (a === originCountry && b === destinationCountry) || (b === originCountry && a === destinationCountry));
    checks.ftaEligibility = ftaEligible
      ? { status: "ELIGIBLE", ftaName: "Egypt-EU FTA", preferenceRate: 0 }
      : { status: "NOT_ELIGIBLE", ftaName: null, preferenceRate: null };
    // Required documents (simplified)
    checks.requiredDocuments = { count: 5, documents: ["Commercial Invoice", "Packing List", "Bill of Lading", "Certificate of Origin", "Phytosanitary Certificate"] };
    // Duty estimate (simplified — 5.5% MFN)
    const dutyRate = 5.5;
    checks.dutyEstimate = { rate: dutyRate, note: "MFN rate (estimate)" };
    // Cold chain
    if (coldChain) {
      checks.coldChain = { required: true, tempMin: -18, tempMax: -15, note: "Frozen goods require reefer container" };
      warnings.push("Cold chain required — ensure reefer container is booked");
    } else {
      checks.coldChain = { required: false };
    }
    if (overallVerdict !== "DENY" && warnings.length > 0) overallVerdict = "CONDITIONAL";
    return NextResponse.json({ ok: true, overallVerdict, checks, warnings, recommendations: [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
