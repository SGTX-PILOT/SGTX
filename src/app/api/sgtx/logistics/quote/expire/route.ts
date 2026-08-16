// POST /api/sgtx/logistics/quote/expire
// Cron endpoint: find quotes past validUntil → EXPIRED; within 24h →
// RECONFIRM_REQUIRED. Safe to call repeatedly (idempotent updateMany).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { expireLogisticsQuotes } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Cron endpoints typically have no caller header; allow anonymous.
    const result = await expireLogisticsQuotes();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[logistics/quote/expire] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to expire quotes" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await expireLogisticsQuotes();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[logistics/quote/expire] GET error:", e);
    return NextResponse.json({ error: e?.message || "Failed to expire quotes" }, { status: 500 });
  }
}
