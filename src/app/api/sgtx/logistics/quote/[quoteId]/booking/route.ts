// POST /api/sgtx/logistics/quote/[quoteId]/booking
// Booking transitions: CONFIRM | CANCEL
//
// Body: { action: "CONFIRM" | "CANCEL", bookingRef, providerGtid?, reason?, traderMode? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { confirmBooking, cancelBooking } from "@/lib/sgtx/logistics";
import { governorLogisticsBookingConfirm } from "@/lib/sgtx/governor";
import { db } from "@/lib/db";

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

      // ── Cross-portal connection: notify the seller that the LSP/SHIP
      // provider confirmed the booking. This closes the loop so the seller
      // knows the logistics is locked and can proceed to the next stage.
      try {
        const quote = r.quote as any;
        const tradeId = quote?.tradeId;
        const ustn = quote?.ustn;
        if (tradeId && ustn) {
          const trade = await db.trade.findUnique({
            where: { id: tradeId },
            select: { sellerGtid: true, buyerGtid: true, commodity: true, seller: { select: { legalName: true } } },
          });
          if (trade) {
            await db.inboxItem.create({
              data: {
                tenantGtid: trade.sellerGtid,
                tradeId,
                category: "SHIPMENT_ALERT",
                priority: 80,
                title: `Booking confirmed — ${trade.commodity || "trade"} (${ustn.slice(0, 24)}…)`,
                description: `Logistics provider confirmed booking. Booking ref: ${body.bookingRef}. Provider: ${body.providerGtid}. Shipment is now ready for pickup scheduling.`,
                ctaLabel: "View Shipment",
              },
            });
          }
        }
      } catch (notifyErr: any) {
        logger.error("[logistics/quote/booking] seller notification failed (non-blocking):", notifyErr);
      }

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
