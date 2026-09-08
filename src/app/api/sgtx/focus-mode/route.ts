// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getFocusMode } from "@/lib/sgtx/focus-mode";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/focus-mode?tenantGtid=X — current focus-mode state (or null if inactive).
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  try {
    const state = await getFocusMode(tenantGtid);
    return NextResponse.json({ state, active: !!state?.active });
  } catch (e: any) {
    logger.error("[api/focus-mode] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
