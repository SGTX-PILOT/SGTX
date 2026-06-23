import { NextRequest, NextResponse } from "next/server";
import { listStuckTrades } from "@/lib/sgtx/stuck-trade";

// GET /api/sgtx/stuck-trade/list — List all currently-stuck trades.
// Optional query params:
//   ?escalation_level=2    — filter by escalation level (1, 2, or 3)
//   ?ustn=SGTX-...         — filter by specific USTN
export async function GET(req: NextRequest) {
  const escalationLevelRaw = req.nextUrl.searchParams.get("escalation_level");
  const ustn = req.nextUrl.searchParams.get("ustn");

  const filter: { escalationLevel?: number; ustn?: string } = {};
  if (escalationLevelRaw) {
    const lvl = parseInt(escalationLevelRaw, 10);
    if (![1, 2, 3].includes(lvl)) {
      return NextResponse.json({ error: "escalation_level must be 1, 2, or 3" }, { status: 400 });
    }
    filter.escalationLevel = lvl;
  }
  if (ustn) filter.ustn = ustn;

  const alerts = await listStuckTrades(filter);
  return NextResponse.json({
    stuck_trades: alerts,
    count: alerts.length,
    scanned_at: new Date().toISOString(),
  });
}
