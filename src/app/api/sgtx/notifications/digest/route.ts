// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getDailyDigest, getWeeklyDigest } from "@/lib/sgtx/notifications/center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/notifications/digest?tenantGtid=X&period=daily|weekly
//   → { summary, count, byPriority, byChannel, byCategory, window }
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const period = req.nextUrl.searchParams.get("period") || "daily";
  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }
  if (period !== "daily" && period !== "weekly") {
    return NextResponse.json(
      { error: "period must be 'daily' or 'weekly'" },
      { status: 400 },
    );
  }
  try {
    const digest =
      period === "daily"
        ? await getDailyDigest(tenantGtid)
        : await getWeeklyDigest(tenantGtid);
    return NextResponse.json({ period, ...digest });
  } catch (e: any) {
    logger.error("[api/notifications/digest] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
