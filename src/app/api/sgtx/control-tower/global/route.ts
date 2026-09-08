// @ts-nocheck
// GET /api/sgtx/control-tower/global — Global Trade Control Tower
// v17 §20.121 — top-level trade overview. Read-only aggregate over Trade.
// Public for observability (demo portal + admin shells have no session cookie).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getGlobalTradeMetrics } from "@/lib/sgtx/control-towers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trades = await db.trade.findMany({
      take: 10000,
      orderBy: { createdAt: "desc" },
    });

    const metrics = getGlobalTradeMetrics(trades);

    // snake_case response per task spec
    return NextResponse.json({
      active_trades: metrics.activeTrades,
      total_value_usd: metrics.totalValueUsd,
      by_status: metrics.byStatus,
      by_corridor: metrics.byCorridor,
      by_mode: metrics.byMode,
      health_summary: metrics.healthSummary,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[control-tower/global GET] failed", { error: e?.message });
    return NextResponse.json(
      { ok: false, error: e?.message || "internal error" },
      { status: 500 },
    );
  }
}
