import { NextRequest, NextResponse } from "next/server";
import { syncAllRegionalPesticides } from "@/lib/sgtx/compliance/regional-pesticides";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await syncAllRegionalPesticides();
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function GET() {
  const { db } = await import("@/lib/db");
  const lastSyncs = await db.regionalPesticideSyncLog.findMany({ orderBy: { syncedAt: "desc" }, take: 10 });
  const byRegion = await db.regionalPesticideMrl.groupBy({ by: ["region"], _count: true });
  return NextResponse.json({ ok: true, lastSyncs, currentDbState: { byRegion } });
}
