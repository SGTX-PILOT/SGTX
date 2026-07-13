// GET  /api/sgtx/worldwide-routes/cron — return the daily-sync status.
// POST /api/sgtx/worldwide-routes/cron — trigger an immediate sync.
//
// The scheduler itself is NOT auto-started on import; it is initialised by
// the Brain orchestrator's `initialize()`. This route lets operators
// inspect the current scheduler state and kick off a manual sync without
// waiting for the 24h interval.
import { NextResponse } from "next/server";
import { brainOrchestrator } from "@/lib/sgtx/brain-os";
import {
  dailyRoutesSyncCron,
  getDailySyncStatus,
} from "@/lib/sgtx/brain-os/scheduler/daily-routes-sync";
import { logger } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET — return the current daily-sync scheduler status.
 */
export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      status: getDailySyncStatus(),
      schedulerStarted: dailyRoutesSyncCron.isStarted(),
    });
  } catch (e: any) {
    logger.error("worldwide-routes cron: GET failed", {
      component: "worldwide-routes-cron",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

/**
 * POST — trigger an immediate sync via the Brain orchestrator. Returns
 * the sync result + the updated scheduler status.
 */
export async function POST() {
  try {
    const result = await brainOrchestrator.invoke(
      "logistics.worldwide-routes-sync",
      { source: "manual-trigger" },
    );
    return NextResponse.json({
      ok: true,
      result,
      status: getDailySyncStatus(),
    });
  } catch (e: any) {
    logger.error("worldwide-routes cron: POST sync failed", {
      component: "worldwide-routes-cron",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? String(e),
        status: getDailySyncStatus(),
      },
      { status: 500 },
    );
  }
}
