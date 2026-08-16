// GET  /api/sgtx/shipping/port-congestion/sync
//   Returns the current cache size + known port list.
//
// POST /api/sgtx/shipping/port-congestion/sync
//   Triggers a bulk refresh of all top-20 ports' congestion data.
//   Protected by CRON_SECRET (when set).
//
// The cache is in-memory (6h TTL). The status endpoint reports `cacheSize`
// and `topPorts` rather than a DB row count.
import { NextRequest, NextResponse } from "next/server";
import {
  syncPortCongestion,
  portCongestionCacheSize,
  TOP_20_PORTS,
} from "@/lib/sgtx/shipping/searates-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      cacheSize: portCongestionCacheSize(),
      cacheTtlHours: 6,
      topPorts: TOP_20_PORTS.map((p) => ({
        unlocode: p.unlocode,
        name: p.name,
        country: p.country,
      })),
      source: "api.searates.com/marine/v2/port-congestion",
    });
  } catch (e: any) {
    logger.error("port-congestion sync GET failed", {
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
    const result = await syncPortCongestion();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("port-congestion sync POST failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
