// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getQuietHours, setQuietHours, isInQuietHours } from "@/lib/sgtx/notifications/center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/notifications/quiet-hours?tenantGtid=X
//   → { config, currentlyInQuietHours }
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }
  try {
    const config = await getQuietHours(tenantGtid);
    const currentlyInQuietHours = await isInQuietHours(tenantGtid);
    return NextResponse.json({ config, currentlyInQuietHours });
  } catch (e: any) {
    logger.error("[api/notifications/quiet-hours] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/notifications/quiet-hours
//   Body: { tenantGtid, config: { enabled, start, end, days, exceptions }, changedByGtid? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tenantGtid, config, changedByGtid } = body;
  if (!tenantGtid || !config) {
    return NextResponse.json({ error: "tenantGtid and config required" }, { status: 400 });
  }
  try {
    const merged = await setQuietHours(tenantGtid, config, changedByGtid || "system");
    return NextResponse.json({ ok: true, config: merged });
  } catch (e: any) {
    logger.error("[api/notifications/quiet-hours] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "save failed" }, { status: 500 });
  }
}
