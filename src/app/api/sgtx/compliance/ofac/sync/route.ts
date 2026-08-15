// GET  /api/sgtx/compliance/ofac/sync       — return last sync logs
// POST /api/sgtx/compliance/ofac/sync       — trigger OFAC SDN sync (manual)
//
// Trigger is protected by CRON_SECRET (when set). Status fetch is open.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncOfacSdnList } from "@/lib/sgtx/compliance/ofac-sdn-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const lastSyncs = await db.freeIntegrationSyncLog.findMany({
      where: { integration: "ofac-sdn" },
      orderBy: { syncedAt: "desc" },
      take: 10,
    });
    const total = await db.ofacSdnEntry.count();
    return NextResponse.json({
      ok: true,
      total,
      lastSyncs,
    });
  } catch (e: any) {
    logger.error("ofac sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await syncOfacSdnList();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("ofac sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
