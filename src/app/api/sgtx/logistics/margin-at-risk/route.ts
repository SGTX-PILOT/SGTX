// GET /api/sgtx/logistics/margin-at-risk?ustn=X&salePrice=N&logisticsTotal=&sgtxFee=
// Seller-only advisory. Returns expectedMargin, marginPct, logisticsExposure,
// marginAtRisk. Never auto-blocks the trade — purely informational.
//
// Query params:
//   ustn            — required
//   salePrice       — required (number)
//   logisticsTotal  — optional override (defaults to cost-certainty grand total)
//   sgtxFee         — optional override (defaults to salePrice * 0.015)

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { calculateMarginAtRisk } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

function toNum(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const sp = req.nextUrl.searchParams;
    const ustn = sp.get("ustn");
    const salePrice = toNum(sp.get("salePrice"));
    if (!ustn || salePrice === undefined) {
      return NextResponse.json({ error: "ustn + salePrice required" }, { status: 400 });
    }
    const logisticsTotal = toNum(sp.get("logisticsTotal"));
    const sgtxFee = toNum(sp.get("sgtxFee"));
    const result = await calculateMarginAtRisk(ustn, salePrice, logisticsTotal, sgtxFee);
    return NextResponse.json({ ok: true, ...result, advisory: true });
  } catch (e: any) {
    logger.error("[logistics/margin-at-risk] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to compute margin at risk" }, { status: 500 });
  }
}
