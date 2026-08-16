// POST /api/sgtx/logistics/quote/[quoteId]/booking
// Booking transitions: CONFIRM | CANCEL
//
// Body: { action: "CONFIRM" | "CANCEL", bookingRef, providerGtid?, reason?, traderMode? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { confirmBooking, cancelBooking } from "@/lib/sgtx/logistics";
import { governorLogisticsBookingConfirm } from "@/lib/sgtx/governor";

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

    if (action === "CONFIRM") {
      if (!body.bookingRef || !body.providerGtid) {
        return NextResponse.json({ error: "bookingRef + providerGtid required for CONFIRM" }, { status: 400 });
      }
      const gov = await governorLogisticsBookingConfirm(
        { quoteId, providerGtid: body.providerGtid, bookingRef: body.bookingRef },
        caller.tenantGtid || undefined,
        body.traderMode,
      ).catch((e: any) => {
        logger.warn("[logistics/quote/booking] governor non-blocking error:", e?.message);
        return null;
      });
      const r = await confirmBooking(quoteId, body.bookingRef, body.providerGtid);
      if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 409 });
      return NextResponse.json({ ok: true, quote: r.quote, governorDecision: gov?.decisionId || null });
    }

    if (action === "CANCEL") {
      const r = await cancelBooking(quoteId, body.reason || "Cancelled by caller");
      if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason }, { status: 409 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 });
  } catch (e: any) {
    logger.error("[logistics/quote/booking] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to update booking" }, { status: 500 });
  }
}
