// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { monitorPortPrices } from "@/lib/sgtx/ai/brain";

// POST /api/sgtx/brain/monitor — Trigger price monitoring
// Body: { commodities?: string[] }
// Returns: { checked, alerts, prices }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const commodities = body?.commodities;
    const result = await monitorPortPrices(commodities);

    return NextResponse.json({
      ok: true,
      checked: result.checked,
      alertsGenerated: result.alerts.length,
      prices: result.prices.slice(0, 50),
      alerts: result.alerts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
