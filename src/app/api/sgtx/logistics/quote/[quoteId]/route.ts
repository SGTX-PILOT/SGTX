// GET  /api/sgtx/logistics/quote/[quoteId]   — fetch quote with all related data
// PATCH /api/sgtx/logistics/quote/[quoteId]  — update quote (creates a new version,
//                                              never overwrites; before/after JSON
//                                              snapshot persisted in version row)

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { getLogisticsQuote, updateLogisticsQuote } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const quote = await getLogisticsQuote(quoteId);
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    return NextResponse.json({ ok: true, quote });
  } catch (e: any) {
    logger.error("[logistics/quote/get] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to fetch quote" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const body = await req.json();
    const updates = body.updates || {};
    const actorGtid = body.actorGtid || caller.tenantGtid;
    const reason = body.reason || "Updated via API";
    if (!actorGtid) {
      return NextResponse.json({ error: "actorGtid required" }, { status: 400 });
    }
    const result = await updateLogisticsQuote(quoteId, updates, actorGtid, reason);
    return NextResponse.json({ ok: true, quote: result.quote, version: result.version });
  } catch (e: any) {
    logger.error("[logistics/quote/patch] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to update quote" }, { status: 500 });
  }
}
