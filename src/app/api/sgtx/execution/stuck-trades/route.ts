// 3B.6.8 — Stuck Trade Recovery (list + run check)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkStuckTrades } from "@/lib/sgtx/execution";

export async function GET(req: NextRequest) {
  const escalationLevel = req.nextUrl.searchParams.get("level");
  const where: any = { resolvedAt: null };
  if (escalationLevel) where.escalationLevel = escalationLevel;
  const alerts = await db.stuckTradeAlert.findMany({
    where,
    orderBy: { hoursOverdue: "desc" },
  });
  // Enrich with trade info via ustn
  const ustns = [...new Set(alerts.map(a => a.ustn))];
  const trades = await db.trade.findMany({ where: { ustn: { in: ustns } }, include: { buyer: true, seller: true } });
  const tradeMap = new Map(trades.map(t => [t.ustn, t]));
  const enriched = alerts.map(a => ({ ...a, trade: tradeMap.get(a.ustn) }));
  return NextResponse.json({ alerts: enriched, total: enriched.length, level1: enriched.filter(a => a.escalationLevel === "LEVEL_1").length, level2: enriched.filter(a => a.escalationLevel === "LEVEL_2").length, level3: enriched.filter(a => a.escalationLevel === "LEVEL_3").length });
}

// POST — run the stuck-trade check (cron-style)
export async function POST() {
  const result = await checkStuckTrades();
  return NextResponse.json(result);
}
