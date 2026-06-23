import { NextRequest, NextResponse } from "next/server";
import { listScenarios, type ScenarioType } from "@/lib/sgtx/digital-twin";

// GET /api/sgtx/digital-twin/scenarios — List past scenarios for a tenant.
// Optional query params:
//   ?tenant=GTID                — filter by tenant (required)
//   ?ustn=SGTX-...              — filter by single USTN
//   ?scenario_type=TARIFF       — filter by scenario type
//   ?limit=20                   — max results (default 20, max 100)
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenant");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const scenarioType = req.nextUrl.searchParams.get("scenario_type") as ScenarioType | null;
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw || "20", 10) || 20, 1), 100);

  if (!tenantGtid) {
    return NextResponse.json({ error: "tenant query parameter required" }, { status: 400 });
  }

  const scenarios = await listScenarios({
    tenantGtid,
    ustn: ustn || undefined,
    scenarioType: scenarioType || undefined,
    limit,
  });

  return NextResponse.json({
    scenarios,
    count: scenarios.length,
  });
}
