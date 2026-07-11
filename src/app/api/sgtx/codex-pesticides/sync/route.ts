// Codex Alimentarius Pesticides Daily Sync Cron
// Runs daily to fetch the latest Codex MRL data from FAO/WHO.
// Also pushes to the SGTX Brain AI (multi-source orchestrator).

import { NextRequest, NextResponse } from "next/server";
import { syncCodexPesticides } from "@/lib/sgtx/compliance/codex-pesticides-client";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const lastSync = await db.codexSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  if (lastSync) {
    const hoursSinceSync = (Date.now() - lastSync.syncedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync < 12) {
      return NextResponse.json({
        ok: true,
        message: `Codex sync already run ${hoursSinceSync.toFixed(1)}h ago.`,
        lastSync,
      });
    }
  }

  try {
    const result = await syncCodexPesticides();

    // Record sync log
    await db.codexSyncLog.create({
      data: {
        syncedAt: new Date(),
        commoditiesCount: result.commoditiesCount,
        pesticidesCount: result.pesticidesCount,
        mrlsCount: result.mrlsCount,
        errorCount: result.errors.length,
        errors: JSON.stringify(result.errors.slice(0, 50)),
        durationMs: result.durationMs,
        source: result.source,
      },
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const lastSync = await db.codexSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  return NextResponse.json({
    ok: true,
    lastSync,
    currentDbState: {
      commodities: await db.codexCommodity.count(),
      pesticides: await db.codexPesticide.count(),
      mrls: await db.codexMrl.count(),
    },
  });
}
