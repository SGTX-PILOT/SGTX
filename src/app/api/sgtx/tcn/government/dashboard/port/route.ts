import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/government/dashboard/port
 *
 * Port authority dashboard. Focus: congestion hours, berth occupancy,
 * throughput, RoRo capacity utilisation.
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
    const avgCongestion = totalVolume
      ? analyticsResults.reduce((s: number, a: any) => s + (a?.portCongestionHours || 0) * (a?.volume || 0), 0) / totalVolume
      : 0;

    // Pull the actual port twins for this country
    const portTwins = await db.portDigitalTwin.findMany({ where: { countryCode: country } });
    const ports = portTwins.map(p => ({
      unlocode: p.portUnlocode,
      name: p.portName,
      roroCapacity: p.roroCapacity,
      congestionLevel: p.portCongestionLevel,
      coldStorageAvailable: p.coldStorageAvailable,
      inspectionAvailable: p.inspectionAvailable,
      berths: p.portCapacity || "—",
      operatingHours: p.portOperatingHours || "24/7",
    }));

    return NextResponse.json({
      ok: true,
      dashboard: "port",
      country,
      totalThroughput: totalVolume,
      totalGmvUsd: totalGmv,
      avgCongestionHours: Math.round(avgCongestion * 10) / 10,
      berthOccupancy: Math.min(95, Math.round(avgCongestion * 5 + 60)), // demo derived metric
      ports,
      corridors: corridors.map((c, i) => ({
        code: c.corridorCode,
        name: c.corridorName,
        throughput: analyticsResults[i]?.volume || 0,
        congestionHours: analyticsResults[i]?.portCongestionHours || 0,
        onTime: analyticsResults[i]?.onTimePerformance || 0,
      })),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
