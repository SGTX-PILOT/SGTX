// GET /api/sgtx/logistics/history?ustn=X
// Returns the full audit trail of every logistics event for a USTN:
// quote versions, capacity changes, booking changes, drift events,
// fallback activations.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { getLogisticsHistory } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const history = await getLogisticsHistory(ustn);
    return NextResponse.json({ ok: true, ...history });
  } catch (e: any) {
    logger.error("[logistics/history] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to fetch history" }, { status: 500 });
  }
}
