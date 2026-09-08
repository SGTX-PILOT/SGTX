// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { deactivateFocusMode } from "@/lib/sgtx/focus-mode";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/focus-mode/deactivate — end the current focus window.
// Body: { tenantGtid, deactivatedBy? }
//   → { ok }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }
  try {
    const result = await deactivateFocusMode(body.tenantGtid, body.deactivatedBy || "system");
    return NextResponse.json({ ...result });
  } catch (e: any) {
    logger.error("[api/focus-mode/deactivate] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "deactivate failed" }, { status: 500 });
  }
}
