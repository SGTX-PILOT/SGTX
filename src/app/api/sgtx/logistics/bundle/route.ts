// GET /api/sgtx/logistics/bundle?ustn=X
// Returns the full logistics bundle for a USTN: all quotes, cost certainty,
// recent drift events, and fallback plans.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { getLogisticsBundle } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    const bundle = await getLogisticsBundle(ustn);
    return NextResponse.json({ ok: true, ...bundle });
  } catch (e: any) {
    logger.error("[logistics/bundle] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to fetch bundle" }, { status: 500 });
  }
}
