// GET  /api/sgtx/shipping/unlocode/sync
// POST /api/sgtx/shipping/unlocode/sync?countryCode=EG (single-country)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncUnlocode } from "@/lib/sgtx/shipping/unlocode-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // full sync can take ~5min

export async function GET() {
  try {
    const lastSyncs = await db.freeIntegrationSyncLog.findMany({
      where: { integration: "unlocode" },
      orderBy: { syncedAt: "desc" },
      take: 10,
    });
    const total = await db.unlocodeEntry.count();
    const byCountry = await db.unlocodeEntry.groupBy({
      by: ["countryCode"],
      _count: true,
      orderBy: { countryCode: "asc" },
      take: 5,
    });
    return NextResponse.json({ ok: true, total, lastSyncs, byCountry });
  } catch (e: any) {
    logger.error("unlocode sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const countryCode = searchParams.get("countryCode") ?? undefined;
    const result = await syncUnlocode(countryCode);
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("unlocode sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
