// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getBrainStats, getCachedPrices, getActiveAlerts } from "@/lib/sgtx/ai/brain";

// GET /api/sgtx/brain — Brain dashboard (stats + prices + alerts)
// ?commodity=frozen+strawberries&port=EGALX
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const commodity = sp.get("commodity") || undefined;
    const port = sp.get("port") || undefined;

    const stats = getBrainStats();
    const prices = getCachedPrices(commodity, port).slice(0, 50);
    const alerts = getActiveAlerts(commodity).slice(0, 20);

    return NextResponse.json({
      ok: true,
      stats,
      prices,
      alerts,
      lastUpdate: stats.lastUpdate,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
