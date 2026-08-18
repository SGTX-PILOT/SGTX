// GET /api/sgtx/trade-cost/obligations?ustn=X — List TradeCostObligation rows
// for a given USTN. Optionally filter by costState or obligationType.
//
// Query:
//   ustn             — required
//   costState?       — ESTIMATED | CONFIRMED | ACCRUING | FINALIZED | PAID | RECONCILED
//   obligationType?  — SGTX_FEE | CUSTOMS_DUTY | FREIGHT | ...
//   take?            — default 100, max 500
//
// Response:
//   { ok, ustn, count, obligations }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn is required" }, { status: 400 });
    }

    const costState = searchParams.get("costState") ?? undefined;
    const obligationType = searchParams.get("obligationType") ?? undefined;
    const takeRaw = Number(searchParams.get("take") ?? 100);
    const take = Math.min(Math.max(1, isNaN(takeRaw) ? 100 : takeRaw), 500);

    let obligations: any[] = [];
    try {
      obligations = await db.tradeCostObligation.findMany({
        where: {
          ustn,
          ...(costState ? { costState } : {}),
          ...(obligationType ? { obligationType } : {}),
        },
        orderBy: { createdAt: "asc" },
        take,
      });
    } catch (e: any) {
      logger.error("[trade-cost/obligations] DB query failed", {
        ustn,
        error: e?.message,
      });
      return NextResponse.json(
        { ok: false, ustn, count: 0, obligations: [], error: "Database query failed" },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, ustn, count: obligations.length, obligations });
  } catch (e: any) {
    logger.error("[trade-cost/obligations] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
