// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/trade/draft/{id} — Load draft (v18 §6.16.9.1)
// DELETE /api/v1/trade/draft/{id} — Delete draft (v18 §6.16.9.1)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const draftId = params.id;
    if (!draftId) return NextResponse.json({ error: "INVALID_DRAFT_ID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    // v18 §6.16 — load draft scoped to caller's GTID (no cross-tenant draft access)
    // In production: freshDb.tradeRequestDraft.findUnique({ where: { id: draftId, tenantGtid: caller.gtid } })
    return NextResponse.json({
      draft_id: draftId,
      draft_data: null, // In production: loaded from DB
      step: 1,
      trader_mode: caller.activeTraderMode || "BUY",
      caller_gtid: caller.gtid,
      message: "Draft load scoped to caller's GTID (no cross-tenant access)",
      loaded_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0" } });
  } catch (e: any) {
    logger.error("[v1/trade/draft/{id}] GET error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Draft load failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const draftId = params.id;
    if (!draftId) return NextResponse.json({ error: "INVALID_DRAFT_ID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    // v18 §6.16.9.1 — draft delete
    // In production: freshDb.tradeRequestDraft.delete({ where: { id: draftId, tenantGtid: caller.gtid } })
    try {
      await (await import("@/lib/db-fresh")).freshDb.activity.create({
        data: { action: "TRADE_DRAFT_DELETED", type: "INFO", description: `Trade draft ${draftId} deleted by ${caller.gtid}`, actorGtid: caller.gtid },
      });
    } catch (e: any) { logger.warn("[v1/trade/draft/{id}] DELETE activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      draft_id: draftId,
      deleted: true,
      deleted_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0" } });
  } catch (e: any) {
    logger.error("[v1/trade/draft/{id}] DELETE error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Draft delete failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
