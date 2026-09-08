// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getDeclassificationLog } from "@/lib/sgtx/anonymous-trade";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/anonymous-trade/declassification-log?limit=50
//   → { log: [{ anonymousUstn, originalTradeId, declassifiedAt, reason, approvedBy: [] }], count }
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  try {
    const result = await getDeclassificationLog(limit);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/anonymous-trade/declassification-log] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
