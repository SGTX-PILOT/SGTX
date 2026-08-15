// GET  /api/sgtx/compliance/fx-rates/sync — return last sync logs
// POST /api/sgtx/compliance/fx-rates/sync — trigger FX sync
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncFxRates } from "@/lib/sgtx/compliance/fx-rates-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const lastSyncs = await db.freeIntegrationSyncLog.findMany({
      where: { integration: "fx-rates" },
      orderBy: { syncedAt: "desc" },
      take: 10,
    });
    const totals = await db.fxRate.groupBy({
      by: ["source"],
      _count: true,
    });
    return NextResponse.json({ ok: true, lastSyncs, totals });
  } catch (e: any) {
    logger.error("fx-rates sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await syncFxRates();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("fx-rates sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
