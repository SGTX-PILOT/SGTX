// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { monitorPortPrices } from "@/lib/sgtx/ai/brain";

// POST /api/sgtx/brain/cron — Cron-triggered commodity price monitoring
// Authorization: Bearer <CRON_SECRET>
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret) {
      const provided = authHeader.replace("Bearer ", "");
      if (provided !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const result = await monitorPortPrices();

    return NextResponse.json({
      ok: true,
      checked: result.checked,
      alertsGenerated: result.alerts.length,
      alerts: result.alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
