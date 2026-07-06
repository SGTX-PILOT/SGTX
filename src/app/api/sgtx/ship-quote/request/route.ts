import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/ship-quote/request — create Mode C ship quote request (Part 3B.3.5.3)
//
// CG-2 fix (AUDIT-2): previously this route auto-fabricated ShipQuote rows with
// `Math.random()` fees for the first 2 target lines. That made the SHIP portal
// a confirmation screen rather than a quoting portal — shipping lines never
// had to originate a quote. The auto-fabrication loop has been removed.
//
// Now the route ONLY creates the ShipQuoteRequest row + inboxes each target
// shipping line. Each SHIP line sees the request in their BookingRequestsScreen
// and submits a real quote via POST /api/sgtx/providers/quote (providerType: "SHIP"),
// which writes the ShipQuote row + a unified ServiceQuotation + notifies the seller.
export async function POST(req: NextRequest) {
  const { ustn, sellerGtid, baseServiceType, originPort, destinationPort, containerDetails, addOnServices, targetLines } = await req.json();
  if (!sellerGtid || !baseServiceType) return NextResponse.json({ error: "sellerGtid + baseServiceType required" }, { status: 400 });
  const req2 = await db.shipQuoteRequest.create({
    data: { ustn: ustn || null, sellerGtid, baseServiceType, originPort: originPort || "", destinationPort: destinationPort || "",
      containerDetails: JSON.stringify(containerDetails || {}), addOnServices: JSON.stringify(addOnServices || []),
      targetLines: JSON.stringify(targetLines || []) },
  });

  // Notify every targeted shipping line. They will see this in the SHIP portal's
  // BookingRequestsScreen and respond with their actual fee/schedule via
  // /api/sgtx/providers/quote (which writes the ShipQuote row + ServiceQuotation).
  const lines: string[] = Array.isArray(targetLines) ? targetLines : [];
  const seller = await db.tenant.findUnique({ where: { gtid: sellerGtid } }).catch(() => null);
  const sellerLabel = (seller as any)?.legalName || sellerGtid;
  const containerSummary = (() => {
    try {
      const c = containerDetails || {};
      return `${c.type || "Container"} × ${c.count || 1}`;
    } catch { return "Container"; }
  })();
  const addOnsLabel = Array.isArray(addOnServices) && addOnServices.length > 0 ? addOnServices.join(", ") : "none";

  for (const lineGtid of lines) {
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: lineGtid,
          category: "NEW_OFFER",
          priority: 80,
          title: `New booking request — ${baseServiceType} · ${originPort || "?"} → ${destinationPort || "?"}`,
          description: `Seller ${sellerLabel} requested a ${baseServiceType} quote for ${containerSummary}. Add-ons: ${addOnsLabel}. USTN ${ustn || "—"}. Submit your quote (vessel, voyage, ocean freight, THC, free days, ETA) from your Booking Requests tab.`,
          ctaLabel: "Submit Quote",
        },
      });
    } catch (e: any) {
      logger.warn(`[ship-quote/request] inbox to ${lineGtid} failed (non-blocking):`, e);
    }
  }

  const quotes = await db.shipQuote.findMany({ where: { requestId: req2.id } });
  return NextResponse.json({ request: req2, quotes });
}
