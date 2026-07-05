// Part 11.3 — Self-Healing Infrastructure & Chaos Engineering API
//
// GET /api/sgtx/addons/self-healing
//   Returns: cluster health snapshot + failure predictions + chaos test summary + cumulative stats.

import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getClusterHealth,
  predictFailures,
  getChaosTestResults,
  getSelfHealingStats,
} from "@/lib/sgtx/addons/self-healing";

export async function GET() {
  try {
    const [health, predictions, chaos, stats] = await Promise.all([
      getClusterHealth(),
      predictFailures(),
      getChaosTestResults(),
      getSelfHealingStats(),
    ]);

    return NextResponse.json({
      cluster: health,
      predictions,
      chaos,
      stats,
      mode: "SIMULATION",
      endpoints: {
        heal: "POST /api/sgtx/addons/self-healing/heal",
        chaosTest: "POST /api/sgtx/addons/self-healing/chaos-test",
      },
    });
  } catch (e: any) {
    logger.error("[self-healing/route] GET error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
