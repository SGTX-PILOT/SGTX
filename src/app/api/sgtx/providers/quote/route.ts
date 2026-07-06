// 9.6 — Send Quote (unified for all provider types)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { sendQuote } from "@/lib/sgtx/providers";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, providerGtid, providerType, serviceType, feeUsd, currency, validityDays, notes, description, vessel, voyage, etd, eta, sampleInstructions, inspectionDate, inspectionLocation, shipQuoteRequestId, thcUsd, freeDays } = body;
    if (!providerGtid || !providerType || !serviceType || feeUsd === undefined) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await sendQuote({ ustn, tradeId, providerGtid, providerType, serviceType, feeUsd: +feeUsd, currency, validityDays, notes, description, vessel, voyage, etd: etd ? new Date(etd) : undefined, eta: eta ? new Date(eta) : undefined, sampleInstructions, inspectionDate, inspectionLocation });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // CG-2 fix — when a shipping line submits a quote via this unified endpoint,
    // ALSO write a ShipQuote row linked to the originating ShipQuoteRequest so
    // the existing BookingRequestsScreen + ship-quote/select flow keeps working
    // (those queries read from the ShipQuote table, not ServiceQuotation).
    // The matching ShipQuoteRequest is resolved by (a) explicit shipQuoteRequestId
    // in the body, or (b) the most recent PENDING request whose targetLines
    // contains this provider's GTID and whose ustn matches (when supplied).
    if (providerType === "SHIP") {
      try {
        let matchingRequest: any = null;
        if (shipQuoteRequestId) {
          matchingRequest = await db.shipQuoteRequest.findUnique({ where: { id: shipQuoteRequestId } });
        } else if (ustn) {
          // Fallback: most recent PENDING request whose targetLines contains providerGtid
          // AND ustn matches. SQLite can't do JSON contains — use substring match
          // (same approach as /api/sgtx/ship-quote/list).
          const candidates = await db.shipQuoteRequest.findMany({
            where: { ustn, targetLines: { contains: providerGtid } },
            orderBy: { createdAt: "desc" },
            take: 5,
          });
          matchingRequest = candidates.find((r: any) => r.status !== "EXPIRED") || candidates[0] || null;
        }

        if (matchingRequest) {
          const baseFee = +feeUsd;
          const thc = Number(thcUsd) || 0;
          const addOnFees: Record<string, number> = {};
          if (thc > 0) addOnFees.THC = thc;
          if (Number.isFinite(Number(freeDays)) && Number(freeDays) > 0) addOnFees.FREE_DAYS = Number(freeDays);
          const totalFee = baseFee + thc;
          await db.shipQuote.create({
            data: {
              requestId: matchingRequest.id,
              shipperLineGtid: providerGtid,
              baseFee,
              addOnFees: JSON.stringify(addOnFees),
              totalFee,
              validityHours: (Number(validityDays) || 2) * 24,
            },
          });
          // Mark the request as QUOTED (at least one line has responded).
          if (matchingRequest.status === "PENDING") {
            await db.shipQuoteRequest.update({
              where: { id: matchingRequest.id },
              data: { status: "QUOTED" },
            }).catch(() => null);
          }
        }
      } catch (shipQuoteErr: any) {
        // Non-blocking: the ServiceQuotation + seller notification already
        // succeeded. The seller can still accept via /api/sgtx/providers/accept.
        logger.warn("[providers/quote] ShipQuote side-write failed (non-blocking):", shipQuoteErr);
      }
    }

    return NextResponse.json(result);
  } catch (e: any) { logger.error("[providers/quote]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
