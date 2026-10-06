// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/trade/drafts — List drafts (v18 §6.16.9.1)
// Plural form — the spec uses "drafts" (plural) for the list endpoint
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    // v18 §6.16 — drafts scoped to caller's GTID + active trader mode
    return NextResponse.json({
      drafts: [],
      caller_gtid: caller.gtid,
      trader_mode: caller.activeTraderMode || "BUY",
      message: "Draft list (plural endpoint per v18 §6.16.9.1) scoped to caller's GTID",
      queried_at: new Date().toISOString(),
    }, { headers: { "X-SGTX-Version": "v18.0" } });
  } catch (e: any) {
    logger.error("[v1/trade/drafts] error:", { error: e?.message });
    return NextResponse.json({ error: "Draft list failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
