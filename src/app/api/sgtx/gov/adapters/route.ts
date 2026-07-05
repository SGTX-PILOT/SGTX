// GET /api/sgtx/gov/adapters — list all 4 government adapters with config + health
//
// Returns per-adapter:
//   { config, queue, rateLimit, healthy }
// Used by the platform admin Integrations dashboard + PSP/gov health tiles.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listAdaptersWithHealth, GOV_ADAPTER_NAMES } from "@/lib/sgtx/gov/adapter-auth";

export async function GET() {
  try {
    const adapters = await listAdaptersWithHealth();
    const allHealthy = adapters.every(a => a.healthy);

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      checkedAt: new Date().toISOString(),
      totalAdapters: GOV_ADAPTER_NAMES.length,
      allHealthy,
      adapters,
      summary: {
        activeCerts: adapters.filter(a => a.config.mtlsCertificate.status === "ACTIVE").length,
        totalQueuePending: adapters.reduce((s, a) => s + a.queue.pending, 0),
        totalQueueProcessing: adapters.reduce((s, a) => s + a.queue.processing, 0),
        totalQueueFailed: adapters.reduce((s, a) => s + a.queue.failed, 0),
        totalQueueCompleted: adapters.reduce((s, a) => s + a.queue.completed, 0),
      },
    });
  } catch (e: any) {
    logger.error("[gov/adapters]", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to list adapters" },
      { status: 500 },
    );
  }
}
