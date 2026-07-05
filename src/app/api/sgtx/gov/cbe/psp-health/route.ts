import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getPspHealth } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/cbe/psp-health — health monitoring for CBE-licensed PSPs (Blueprint 7.6)
//
// Returns real-time health for the 3 CBE-licensed PSPs (Fawry, PayMob, CBE IPN):
//   - status: OPERATIONAL | DEGRADED | OUTAGE
//   - latencyMs: average round-trip over the last 5-minute sliding window
//   - errorRate: 0..1 (failed requests / total)
//   - uptime30d: 0..100 percent over the trailing 30 days
//   - splitCapability: whether the PSP supports split payments (Stage 1 fee split)
//   - lastCheckedAt: ISO 8601 timestamp of the last health probe
//
// Used by the SGTX PSP Router (A2 LightGBM + Groq) to make real-time routing
// decisions and trigger automatic fallback when a PSP degrades.

export async function GET() {
  try {
    const result = await getPspHealth(null as any);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    logger.error("[gov/cbe/psp-health GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch CBE PSP health" },
      { status: 500 }
    );
  }
}
