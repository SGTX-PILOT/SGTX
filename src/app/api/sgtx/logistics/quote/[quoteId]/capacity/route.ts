// POST /api/sgtx/logistics/quote/[quoteId]/capacity
// Capacity transitions: HOLD | CONFIRM | LOSE
//
// Body: { action: "HOLD" | "CONFIRM" | "LOSE", providerGtid, bookingRef?, holdExpiry?, reason?, traderMode? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import {
  holdCapacity,
  confirmCapacity,
  loseCapacity,
} from "@/lib/sgtx/logistics";
import { governorLogisticsCapacityConfirm } from "@/lib/sgtx/governor";

export const dynamic = "force-dynamic";

export async function POST(
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
    const action = (body.action || "").toUpperCase();
    const providerGtid = body.providerGtid || caller.tenantGtid;
    if (!providerGtid) {
      return NextResponse.json({ error: "providerGtid required" }, { status: 400 });
    }

    if (action === "HOLD") {
      if (!body.holdExpiry) {
        return NextResponse.json({ error: "holdExpiry required for HOLD" }, { status: 400 });
      }
      const r = await holdCapacity(quoteId, providerGtid, new Date(body.holdExpiry));
      if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    if (action === "CONFIRM") {
      if (!body.bookingRef) {
        return NextResponse.json({ error: "bookingRef required for CONFIRM" }, { status: 400 });
      }
      const gov = await governorLogisticsCapacityConfirm(
        { quoteId, providerGtid, bookingRef: body.bookingRef },
        caller.tenantGtid || undefined,
        body.traderMode,
      ).catch((e: any) => {
        logger.warn("[logistics/quote/capacity] governor non-blocking error:", e?.message);
        return null;
      });
      const r = await confirmCapacity(quoteId, providerGtid, body.bookingRef, body.holdExpiry ? new Date(body.holdExpiry) : undefined);
      if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 409 });
      return NextResponse.json({ ok: true, quote: r.quote, governorDecision: gov?.decisionId || null });
    }

    if (action === "LOSE") {
      const r = await loseCapacity(quoteId, body.reason || "Capacity lost by provider");
      if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
  } catch (e: any) {
    logger.error("[logistics/quote/capacity] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to update capacity" }, { status: 500 });
  }
}
