import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { detectStuckTrades } from "@/lib/sgtx/stuck-trade";

// POST /api/sgtx/stuck-trade/recover — Manually trigger stuck-trade detection.
// Per blueprint 3.15.3.7 + gate G5UA8, this endpoint:
//   1. Scans all active trades for SLA breaches.
//   2. For each stuck trade, escalates per L1/L2/L3 policy.
//   3. L3 (≥7 days overdue) → auto-cancels the trade.
//
// Body: {} (no params — scans the whole platform)
// Optional: { tenant_filter?: "GTID" } — restrict to one tenant's trades
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const detections = await detectStuckTrades();

    return NextResponse.json({
      ok: true,
      scanned_at: new Date().toISOString(),
      stuck_count: detections.length,
      l1_count: detections.filter(d => d.escalationLevel === 1).length,
      l2_count: detections.filter(d => d.escalationLevel === 2).length,
      l3_count: detections.filter(d => d.escalationLevel === 3).length,
      detections,
      message: `Scanned all active trades. ${detections.length} stuck trade${detections.length === 1 ? "" : "s"} detected. ${detections.filter(d => d.escalationLevel === 3).length} auto-cancelled (L3).`,
    });
  } catch (e: any) {
    logger.error("[stuck-trade/recover] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
