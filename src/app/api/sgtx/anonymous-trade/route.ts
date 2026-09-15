// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAnonymousTrade, listAnonymousTrades } from "@/lib/sgtx/anonymous-trade";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/anonymous-trade?limit=50 — list anonymous trades (Government Portal).
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  try {
    const result = await listAnonymousTrades(limit);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/anonymous-trade] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/anonymous-trade — create an anonymous version of a real trade.
// Body: { realTradeId, redactionConfig?, createdBy? }
//   → { ok, anonymousUstn, redactedTrade, redactedDocuments, declassificationLogId }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.realTradeId) {
    return NextResponse.json({ error: "realTradeId required" }, { status: 400 });
  }
  try {
    const result = await createAnonymousTrade(
      body.realTradeId,
      body.redactionConfig || {},
      body.createdBy || "system",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/anonymous-trade] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "create failed" }, { status: 400 });
  }
}
