// GET  /api/sgtx/onboarding/worldbank-indicators/sync
//   Returns the current cache size + supported indicator codes.
//
// POST /api/sgtx/onboarding/worldbank-indicators/sync
//   Triggers a bulk refresh of all 5 World Bank indicators for all ~249
//   countries. Protected by CRON_SECRET (when set).
//
// The cache is in-memory (24h TTL) — there are no Prisma rows to count.
// The status endpoint therefore reports `cacheSize` instead of a DB count.
import { NextRequest, NextResponse } from "next/server";
import {
  syncWorldBankIndicators,
  worldBankIndicatorCacheSize,
  clearWorldBankIndicatorCache,
  WORLD_BANK_INDICATORS,
} from "@/lib/sgtx/onboarding/worldbank-indicators-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      cacheSize: worldBankIndicatorCacheSize(),
      indicators: WORLD_BANK_INDICATORS,
      cacheTtlHours: 24,
      source: "api.worldbank.org/v2",
    });
  } catch (e: any) {
    logger.error("worldbank-indicators sync GET failed", {
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
    const result = await syncWorldBankIndicators();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("worldbank-indicators sync POST failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// Exported for test/ops tooling — clears the in-memory cache. Not exposed
// via a route but importable from the module surface.
export { clearWorldBankIndicatorCache };
