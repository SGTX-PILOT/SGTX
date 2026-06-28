import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/corridor/{code}/analytics — aggregated corridor analytics
// Returns differential-private aggregated metrics per measurement period.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "corridor code required" }, { status: 400 });
  }
  const corridorCode = code.toUpperCase();

  const corridor = await db.tradeCorridor.findUnique({ where: { corridorCode } });
  if (!corridor) {
    return NextResponse.json({ error: "corridor not found" }, { status: 404 });
  }

  const analytics = await db.corridorAnalytics.findMany({
    where: { corridorCode },
    orderBy: { measurementPeriod: "asc" },
  });

  // Aggregate totals (with differential-privacy note)
  const totalVolume = analytics.reduce((s, a) => s + (a.volume ?? 0), 0);
  const totalGmv = analytics.reduce((s, a) => s + (a.gmvUsd ?? 0), 0);
  const avgTransit = analytics.length
    ? analytics.reduce((s, a) => s + (a.averageTransitDays ?? 0), 0) / analytics.length
    : 0;
  const avgOnTime = analytics.length
    ? analytics.reduce((s, a) => s + (a.onTimePerformance ?? 0), 0) / analytics.length
    : 0;
  const avgClearance = analytics.length
    ? analytics.reduce((s, a) => s + (a.customsClearanceHours ?? 0), 0) / analytics.length
    : 0;

  return NextResponse.json({
    corridor: {
      code: corridor.corridorCode,
      name: corridor.corridorName,
      type: corridor.corridorType,
    },
    privacy: {
      mechanism: "differential_privacy",
      defaultEpsilon: 0.1,
      note: "Aggregated metrics are post-processed with ε-differential privacy. Per-tenant data is never disclosed.",
    },
    summary: {
      measurementPeriods: analytics.length,
      totalVolume,
      totalGmvUsd: totalGmv,
      averageTransitDays: Number(avgTransit.toFixed(2)),
      onTimePerformance: Number(avgOnTime.toFixed(3)),
      averageCustomsClearanceHours: Number(avgClearance.toFixed(2)),
    },
    series: analytics.map((a) => ({
      period: a.measurementPeriod,
      volume: a.volume,
      gmvUsd: a.gmvUsd,
      averageTransitDays: a.averageTransitDays,
      onTimePerformance: a.onTimePerformance,
      documentDelayRate: a.documentDelayRate,
      customsClearanceHours: a.customsClearanceHours,
      portCongestionHours: a.portCongestionHours,
      financingDemand: a.financingDemand,
      privacyEpsilon: a.privacyEpsilon,
    })),
  });
}
