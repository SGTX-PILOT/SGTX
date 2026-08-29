// POST /api/sgtx/logistics/quote/[quoteId]/select
// Seller marks a quote as SELECTED. Validates eligibility + validity first;
// fails closed if provider is sanctions-blocked or license expired.
//
// Body: { sellerGtid, traderMode? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { selectLogisticsQuote } from "@/lib/sgtx/logistics";
import { governorLogisticsQuoteSelect } from "@/lib/sgtx/governor";
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
    const sellerGtid = body.sellerGtid || caller.tenantGtid;
    if (!sellerGtid) {
      return NextResponse.json({ error: "sellerGtid required" }, { status: 400 });
    }

    // Governor gate
    const gov = await governorLogisticsQuoteSelect(
      { quoteId, sellerGtid },
      caller.tenantGtid || undefined,
      body.traderMode,
    ).catch((e: any) => {
      logger.warn("[logistics/quote/select] governor non-blocking error:", e?.message);
      return null;
    });

    const result = await selectLogisticsQuote(quoteId, sellerGtid);
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 409 });
    }

    // ── Cross-portal connection: notify the LSP/SHIP provider that their
    // quote was selected. This closes the loop so the provider sees the
    // assignment in their Smart Inbox and can proceed with booking.
    try {
      const quote = result.quote as any;
      const providerGtid = quote?.providerGtid;
      const tradeId = quote?.tradeId;
      const ustn = quote?.ustn;
      if (providerGtid && tradeId && ustn) {
        const trade = await db.trade.findUnique({
          where: { id: tradeId },
          select: { commodity: true, originPort: true, destPort: true, seller: { select: { legalName: true } } },
        });
        await db.inboxItem.create({
          data: {
            tenantGtid: providerGtid,
            tradeId,
            category: "NEW_OFFER",
            priority: 85,
            title: `Quote selected — ${trade?.commodity || "trade"} (${ustn.slice(0, 24)}…)`,
            description: `Seller ${trade?.seller?.legalName || sellerGtid} selected your logistics quote for ${trade?.commodity || "this trade"}. Route: ${trade?.originPort || "—"} → ${trade?.destPort || "—"}. Proceed to confirm booking and assign driver/vehicle.`,
            ctaLabel: "Confirm Booking",
          },
        });
      }
    } catch (notifyErr: any) {
      logger.error("[logistics/quote/select] provider notification failed (non-blocking):", notifyErr);
    }

    return NextResponse.json({
      ok: true,
      quote: result.quote,
      governorDecision: gov?.decisionId || null,
    });
  } catch (e: any) {
    logger.error("[logistics/quote/select] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to select quote" }, { status: 500 });
  }
}
