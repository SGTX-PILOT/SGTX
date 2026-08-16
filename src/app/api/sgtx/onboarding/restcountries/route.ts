// GET  /api/sgtx/onboarding/restcountries        — return last sync logs
// POST /api/sgtx/onboarding/restcountries        — trigger REST Countries + World Bank sync
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncCountries } from "@/lib/sgtx/onboarding/restcountries-sync";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const lastSyncs = await db.freeIntegrationSyncLog.findMany({
      where: { integration: "rest-countries" },
      orderBy: { syncedAt: "desc" },
      take: 10,
    });
    const total = await db.countryData.count();
    return NextResponse.json({ ok: true, total, lastSyncs });
  } catch (e: any) {
    logger.error("restcountries sync GET failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await syncCountries();
    return NextResponse.json({ ok: result.ok, result });
  } catch (e: any) {
    logger.error("restcountries sync POST failed", { error: e?.message ?? String(e) });
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
