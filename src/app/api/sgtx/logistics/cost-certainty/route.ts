// GET /api/sgtx/logistics/cost-certainty?ustn=X
// Aggregates every logistics quote for a USTN by status, returning total
// confirmed / estimated / conditional / grand total.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { calculateCostCertainty } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const result = await calculateCostCertainty(ustn);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[logistics/cost-certainty] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to compute cost certainty" }, { status: 500 });
  }
}
