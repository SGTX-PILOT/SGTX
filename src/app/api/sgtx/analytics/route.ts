// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") || "volume";
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid") || undefined;
    const analytics = await import("@/lib/sgtx/analytics");
    let data;
    if (type === "volume") data = await analytics.getTradeVolumeAnalytics({ tenantGtid });
    else if (type === "performance") data = await analytics.getPerformanceKPIs(tenantGtid);
    else if (type === "corridor") data = await analytics.getCorridorAnalytics();
    else if (type === "compliance") data = await analytics.getComplianceMetrics(tenantGtid);
    else data = await analytics.getTradeVolumeAnalytics({ tenantGtid });
    return NextResponse.json({ ok: true, type, data });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
