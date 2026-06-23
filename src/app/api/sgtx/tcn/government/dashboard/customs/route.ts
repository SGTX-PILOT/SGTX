import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/government/dashboard/customs
 *
 * Customs authority dashboard. Focus: clearance hours, document delay rate,
 * declaration volume, certificate verification rate.
 */
export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the RoRo Corridors (TCN) feature.
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const country = req.nextUrl.searchParams.get("country") || "EG";
    const corridors = await db.tradeCorridor.findMany({ where: { OR: [{ originCountry: country }, { destinationCountry: country }] } });
    const analyticsResults = await Promise.all(corridors.map(c => db.corridorAnalytics.findFirst({ where: { corridorCode: c.corridorCode }, orderBy: { measurementPeriod: "desc" } })));
    const totalVolume = analyticsResults.reduce((s: number, a: any) => s + (a?.volume || 0), 0);
    const totalGmv = analyticsResults.reduce((s: number, a: any) => s + (a?.gmvUsd || 0), 0);
    const avgClearanceHours = totalVolume
      ? analyticsResults.reduce((s: number, a: any) => s + (a?.customsClearanceHours || 0) * (a?.volume || 0), 0) / totalVolume
      : 0;
    const avgDocDelay = totalVolume
      ? analyticsResults.reduce((s: number, a: any) => s + (a?.documentDelayRate || 0) * (a?.volume || 0), 0) / totalVolume
      : 0;
    return NextResponse.json({
      ok: true,
      dashboard: "customs",
      country,
      declarationsProcessed: totalVolume,
      totalGmvUsd: totalGmv,
      avgClearanceHours: Math.round(avgClearanceHours * 10) / 10,
      avgDocumentDelayRate: Math.round(avgDocDelay * 100) / 100,
      preClearanceRate: 92, // Nafeza ACI pre-arrival %, deterministic demo value
      certificateVerificationRate: 98,
      corridors: corridors.map((c, i) => ({
        code: c.corridorCode,
        name: c.corridorName,
        declarations: analyticsResults[i]?.volume || 0,
        clearanceHours: analyticsResults[i]?.customsClearanceHours || 0,
        documentDelayRate: analyticsResults[i]?.documentDelayRate || 0,
      })),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
