// GET  /api/sgtx/free-integrations/cron — return the scheduler status
// POST /api/sgtx/free-integrations/cron — trigger an immediate sync run
//
// The scheduler itself is NOT auto-started on import; it must be initialised
// by calling `initFreeIntegrationsCron()` (typically from the Brain
// orchestrator's `initialize()` or via this route's first invocation).
import { NextRequest, NextResponse } from "next/server";
import {
  freeIntegrationsCron,
  getFreeIntegrationsSyncStatus,
  runAllFreeIntegrationSyncs,
  initFreeIntegrationsCron,
} from "@/lib/sgtx/brain-os/scheduler/free-integrations-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    if (!freeIntegrationsCron.isStarted()) {
      await initFreeIntegrationsCron();
    }
    return NextResponse.json({
      ok: true,
      status: getFreeIntegrationsSyncStatus(),
    });
  } catch (e: any) {
    logger.error("free-integrations cron GET failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!freeIntegrationsCron.isStarted()) {
      await initFreeIntegrationsCron();
    }
    const result = await runAllFreeIntegrationSyncs();
    return NextResponse.json({
      ok: result.overallOk,
      result,
      status: getFreeIntegrationsSyncStatus(),
    });
  } catch (e: any) {
    logger.error("free-integrations cron POST failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? String(e),
        status: getFreeIntegrationsSyncStatus(),
      },
      { status: 500 },
    );
  }
}
