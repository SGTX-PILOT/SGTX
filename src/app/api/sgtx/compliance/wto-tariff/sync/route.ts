// GET  /api/sgtx/compliance/wto-tariff/sync — return last sync logs + cache stats
// POST /api/sgtx/compliance/wto-tariff/sync — trigger WTO tariff sync (operator-only)
//
// POST is protected by CRON_SECRET (when set). GET is open.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncWtoTariffs, getWtoCacheStats } from "@/lib/sgtx/compliance/wto-tariff-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const [lastSyncs, cacheStats] = await Promise.all([
      db.freeIntegrationSyncLog.findMany({
        where: { integration: "wto-tariff" },
        orderBy: { syncedAt: "desc" },
        take: 10,
      }),
      Promise.resolve(getWtoCacheStats()),
    ]);
    return NextResponse.json({ ok: true, lastSyncs, cacheStats });
  } catch (e: any) {
    logger.error("wto-tariff sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await syncWtoTariffs();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("wto-tariff sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
