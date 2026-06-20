// GET /api/sgtx/tri/privileges?tenantGtid=... — applicable privileges based on
// the tenant's latest TRI status. Returns a uniform privilege envelope that
// financiers, customs, and the platform can use to gate discounted terms.
//
// Premier (≥900):  { financingAprDiscount: 0.5,  sgtxFeeDiscount: 0.3, customsLane: "GREEN" }
// Advanced (≥800):  { financingAprDiscount: 0.25, sgtxFeeDiscount: 0,   customsLane: "STANDARD" }
// Trusted  (≥700):  { financingAprDiscount: 0,    sgtxFeeDiscount: 0,   customsLane: "STANDARD" }
// Limited  (<500):  { financingAprDiscount: 0,    sgtxFeeDiscount: 0,   customsLane: "RED", collateralRequired: true }
//
// Recomputes the TRI on-demand so callers always see a fresh score.
import { NextRequest, NextResponse } from "next/server";
import { calculateTri } from "@/lib/sgtx/dispute";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid)
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });

  let tri: { triScore: number; confidence: number; status: string; components: any };
  try {
    tri = await calculateTri(tenantGtid);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "TRI calculation failed" }, { status: 500 });
  }

  const score = tri.triScore;
  let privileges: {
    tier: string;
    financingAprDiscount: number;
    sgtxFeeDiscount: number;
    customsLane: "GREEN" | "STANDARD" | "RED";
    collateralRequired?: boolean;
  };

  if (score >= 900) {
    privileges = {
      tier: "Premier",
      financingAprDiscount: 0.5,
      sgtxFeeDiscount: 0.3,
      customsLane: "GREEN",
    };
  } else if (score >= 800) {
    privileges = {
      tier: "Advanced",
      financingAprDiscount: 0.25,
      sgtxFeeDiscount: 0,
      customsLane: "STANDARD",
    };
  } else if (score >= 700) {
    privileges = {
      tier: "Trusted",
      financingAprDiscount: 0,
      sgtxFeeDiscount: 0,
      customsLane: "STANDARD",
    };
  } else if (score >= 500) {
    privileges = {
      tier: "Developing",
      financingAprDiscount: 0,
      sgtxFeeDiscount: 0,
      customsLane: "STANDARD",
    };
  } else {
    privileges = {
      tier: "Limited",
      financingAprDiscount: 0,
      sgtxFeeDiscount: 0,
      customsLane: "RED",
      collateralRequired: true,
    };
  }

  return NextResponse.json({
    tenantGtid,
    triScore: score,
    confidence: tri.confidence,
    triStatus: tri.status,
    ...privileges,
  });
}
