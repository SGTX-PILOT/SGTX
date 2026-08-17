// GET /api/sgtx/shipping/port-congestion
//   Returns a snapshot of all top-20 global container ports' congestion.
//
// GET /api/sgtx/shipping/port-congestion?port=CNSHA
//   Returns congestion for a single port (live Searates → heuristic fallback).
//
// The Searates port-congestion endpoint is freemium and frequently 403s for
// anonymous callers. This endpoint NEVER throws — it always returns a
// best-effort result, falling back to a berth-count heuristic when the live
// API is unavailable.
//
// Example:
//   curl 'https://sgtx.io/api/sgtx/shipping/port-congestion?port=NLRTM'
//   → { ok: true, port: 'NLRTM', result: { congestionLevel: 'low', ... } }
import { NextRequest, NextResponse } from "next/server";
import {
  getPortCongestion,
  getTopPortCongestion,
  TOP_20_PORTS,
} from "@/lib/sgtx/shipping/searates-client";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const port = (searchParams.get("port") ?? "").toUpperCase().trim();

    if (port) {
      const result = await getPortCongestion(port);
      return NextResponse.json({ ok: true, port, result });
    }

    // No port specified — return the full top-20 snapshot.
    const results = await getTopPortCongestion();
    return NextResponse.json({
      ok: true,
      count: results.length,
      results,
      knownPorts: TOP_20_PORTS.map((p) => p.unlocode),
    });
  } catch (e: any) {
    logger.error("port-congestion GET failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
