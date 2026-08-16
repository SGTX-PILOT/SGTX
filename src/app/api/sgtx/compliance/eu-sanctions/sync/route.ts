// GET  /api/sgtx/compliance/eu-sanctions/sync
// POST /api/sgtx/compliance/eu-sanctions/sync
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncEuSanctionsList } from "@/lib/sgtx/compliance/eu-sanctions-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const lastSyncs = await db.freeIntegrationSyncLog.findMany({
      where: { integration: "eu-sanctions" },
      orderBy: { syncedAt: "desc" },
      take: 10,
    });
    const total = await db.euSanctionsEntry.count();
    return NextResponse.json({ ok: true, total, lastSyncs });
  } catch (e: any) {
    logger.error("eu-sanctions sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await syncEuSanctionsList();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("eu-sanctions sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
