import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/sla — SLA metrics dashboard (blueprint Part 25)
export async function GET(req: NextRequest) {
  const window = req.nextUrl.searchParams.get("window") || "24h";
  const metrics = await db.slaMetric.findMany({
    where: { uptimeWindow: window },
    orderBy: { measuredAt: "desc" },
    take: 50,
  });
  const credits = await db.slaMetric.count({ where: { availabilityPct: { lt: 99.9 } } });
  return NextResponse.json({ metrics, creditsEligible: credits, window });
}

// POST /api/sgtx/sla — Record SLA metric (internal/admin)
export async function POST(req: NextRequest) {
  const { component, availabilityPct, p95LatencyMs, errorRatePct, uptimeWindow } = await req.json();
  const metric = await db.slaMetric.create({
    data: { component, availabilityPct, p95LatencyMs, errorRatePct, uptimeWindow: uptimeWindow || "24h" },
  });
  // Create status page event if availability drops below threshold
  if (availabilityPct < 99.5) {
    await db.statusPageEvent.create({
      data: {
        component,
        status: availabilityPct < 95 ? "major_outage" : "degraded",
        message: `${component} availability at ${availabilityPct}% (${uptimeWindow})`,
      },
    });
  }
  return NextResponse.json({ ok: true, metric });
}
