// GET /api/sgtx/worldwide-routes/stats — worldwide route database stats.
//
// Returns the Brain's `logistics.worldwide-routes-stats` capability output
// (registered by Task 1-A) plus the daily-sync scheduler status and the
// worldwide-routes learner's accuracy stats so a dashboard can render
// everything in a single round-trip.
import { NextResponse } from "next/server";
import {
  brainOrchestrator,
  logger,
  worldwideRoutesLearner,
} from "@/lib/sgtx/brain-os";
import { getDailySyncStatus } from "@/lib/sgtx/brain-os/scheduler/daily-routes-sync";

export const dynamic = "force-dynamic";

/**
 * GET — return worldwide stats + scheduler status + learning stats.
 */
export async function GET() {
  try {
    let stats: unknown = null;
    let statsError: string | null = null;
    try {
      stats = await brainOrchestrator.invoke(
        "logistics.worldwide-routes-stats",
        {},
      );
    } catch (e: any) {
      // Capability not registered yet (Task 1-A in-flight) — degrade
      // gracefully and surface the error in the response payload.
      statsError = e?.message ?? String(e);
    }

    return NextResponse.json({
      ok: true,
      stats,
      statsError,
      dailySyncStatus: getDailySyncStatus(),
      learningStats: worldwideRoutesLearner.getLearningStats(),
    });
  } catch (e: any) {
    logger.error("worldwide-routes stats: GET failed", {
      component: "worldwide-routes-stats",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
