// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { activateFocusMode } from "@/lib/sgtx/focus-mode";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/focus-mode/activate — start a focus window.
// Body: { tenantGtid, durationKey, customMs?, thresholdPriority?, activatedBy? }
//   → { ok, state }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.tenantGtid || !body.durationKey) {
    return NextResponse.json({ error: "tenantGtid and durationKey required" }, { status: 400 });
  }
  try {
    const state = await activateFocusMode(
      body.tenantGtid,
      body.durationKey,
      body.customMs ? Number(body.customMs) : undefined,
      body.thresholdPriority ? Number(body.thresholdPriority) : 90,
      body.activatedBy || "system",
    );
    return NextResponse.json({ ok: true, state });
  } catch (e: any) {
    logger.error("[api/focus-mode/activate] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "activate failed" }, { status: 400 });
  }
}
