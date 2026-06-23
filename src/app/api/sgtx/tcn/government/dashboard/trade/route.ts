import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/government/dashboard/trade
 *
 * Trade ministry / export promotion dashboard. Focus: GMV, export volume,
 * financing demand, RoRo share, on-time performance.
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
    const totalFinancing = analyticsResults.reduce((s: number, a: any) => s + (a?.financingDemand || 0), 0);
    const weightedOnTime = totalVolume ? analyticsResults.reduce((s: number, a: any) => s + (a?.onTimePerformance || 0) * (a?.volume || 0), 0) / totalVolume : 0;
    return NextResponse.json({
      ok: true,
      dashboard: "trade",
      country,
      totalExportUsd: totalGmv,
      totalVolumeUnits: totalVolume,
      roroShare: 100, // all 3 seeded corridors are RORO
      financingDemand: totalFinancing,
      onTimePerformance: Math.round(weightedOnTime * 10) / 10,
      corridors: corridors.map((c, i) => ({
        code: c.corridorCode,
        name: c.corridorName,
        volume: analyticsResults[i]?.volume || 0,
        gmv: analyticsResults[i]?.gmvUsd || 0,
        onTime: analyticsResults[i]?.onTimePerformance || 0,
        financing: analyticsResults[i]?.financingDemand || 0,
      })),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
