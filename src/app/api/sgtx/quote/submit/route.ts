import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/quote/submit — seller submits quote to buyer (Phase 2 completion)
// Creates: Trade status → QUOTED, quote data stored on Trade, Smart Inbox to buyer (priority 75), Activity log
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn, sellerGtid, exwPrice, priceUnit, loadingCountry, loadingPort,
      packingLayers, totalCartons, logisticsModeA, incoterm,
      exwTotal, logisticsTotal, sgtxFee, totalQuote, carbonFootprint,
      logisticsModeGtids, logisticsRfqSummary,
    } = body;

    if (!ustn || !sellerGtid) {
      return NextResponse.json({ error: "ustn and sellerGtid required" }, { status: 400 });
    }

    // Find the trade
    const trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } });
    if (!trade) return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    if (trade.status !== "INITIATED") {
      return NextResponse.json({ error: `Trade already ${trade.status} — cannot submit quote` }, { status: 409 });
    }

    const quoteId = `SQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

    // Update trade status to QUOTED + store quote data
    await db.trade.update({
      where: { id: trade.id },
      data: {
        status: "QUOTED",
        phase: 2,
        sgtxFeeUsd: sgtxFee,
        originPort: loadingPort,
        originCountry: loadingCountry,
        tradeValueUsd: totalQuote,
        // Store quote details in globalNotes as JSON (since we don't have dedicated quote fields)
        globalNotes: JSON.stringify({
          quoteId,
          exwPrice, priceUnit, exwTotal, logisticsTotal, sgtxFee, totalQuote,
          totalCartons, packingLayers: packingLayers?.length || 0,
          incoterm, logisticsModeA, carbonFootprint,
          selectedQuotes: body.selectedQuotes || [],
          loadingPort, loadingCountry,
          quotedAt: new Date().toISOString(),
          // Mode B/C GTID assignments + RFQ pending summary
          logisticsModeGtids: logisticsModeGtids || {},
          logisticsRfqSummary: logisticsRfqSummary || { pendingCount: 0, respondedCount: 0, lockedCount: 0, fullQuotePending: false },
        }),
        // Persist Mode B/C GTID assignments at trade level (for quick lookup by LSP/ship-line portals)
        logisticsModeGtids: logisticsModeGtids ? JSON.stringify(logisticsModeGtids) : null,
        logisticsRfqSummary: logisticsRfqSummary ? JSON.stringify(logisticsRfqSummary) : null,
      },
    });

    // If Mode B/C RFQs were assigned, create ServiceQuotation records targeting
    // each LSP (Mode B) and ship-line (Mode C) GTID so they appear in the
    // provider portal's RFQ inbox. The seller's full quote is pending until
    // all assigned RFQs respond with their fees.
    if (logisticsModeGtids && typeof logisticsModeGtids === "object") {
      const today = new Date();
      const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
      let seq = 1;
      for (const [serviceName, assignment] of Object.entries(logisticsModeGtids as any)) {
        const a = assignment as any;
        if (a?.gtid && (a?.mode === "B" || a?.mode === "C")) {
          // Check if already exists for this trade + provider + service
          const existing = await db.serviceQuotation.findFirst({
            where: { tradeId: trade.id, providerGtid: a.gtid, serviceType: serviceName },
          });
          if (!existing) {
            // Determine providerType from the tenant record (LSP, SHIP, etc.)
            let providerType = a.mode === "B" ? "LSP" : "SHIP";
            try {
              const providerTenant = await db.tenant.findUnique({ where: { gtid: a.gtid } });
              if (providerTenant?.type) providerType = providerTenant.type;
            } catch {}
            await db.serviceQuotation.create({
              data: {
                quoteId: `SQ-${ymd}-${String(seq).padStart(3, "0")}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
                tradeId: trade.id,
                ustn: ustn,
                providerGtid: a.gtid,
                providerType,
                serviceType: serviceName,
                feeUsd: 0, // pending — provider fills in actual fee on response
                currency: "USD",
                validityDays: 7,
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: "PENDING",
                description: `Mode ${a.mode} RFQ — ${serviceName} for ${trade.commodity} (${incoterm} ${loadingPort})`,
                notes: `Mode ${a.mode} RFQ from seller ${sellerGtid}. Origin: ${loadingPort}. Incoterm: ${incoterm}. Buyer: ${trade.buyerGtid}.`,
              },
            });
            seq++;
          }
        }
      }
    }

    // Store packing plan as a document
    await db.document.create({
      data: {
        tradeId: trade.id,
        uploadedBy: sellerGtid,
        type: "PACKING_PLAN",
        title: `Packing Plan — ${ustn}`,
        hashSha256: `${ustn}-packing-${Date.now()}`,
        status: "VERIFIED",
      },
    });

    // Smart Inbox to buyer (priority 75)
    await db.inboxItem.create({
      data: {
        tenantGtid: trade.buyerGtid,
        tradeId: trade.id,
        category: "NEW_OFFER",
        priority: 75,
        title: `Quote received from ${trade.seller?.legalName || sellerGtid}`,
        description: `${trade.commodity} · EXW $${exwPrice}/${priceUnit} · ${totalCartons} cartons · Total: $${totalQuote.toLocaleString()} (incl. $${sgtxFee} SGTX fee). Incoterm: ${incoterm}. Review and accept/modify/reject.`,
        ctaLabel: "Review Quote",
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: sellerGtid,
        action: "QUOTE_SUBMITTED",
        type: "SUCCESS",
        description: `Seller ${trade.seller?.legalName || sellerGtid} submitted quote ${quoteId}. EXW $${exwPrice}/${priceUnit}. Total: $${totalQuote.toLocaleString()} (fee: $${sgtxFee}). Packing: ${totalCartons} cartons, ${packingLayers?.length || 0} layer patterns.`,
      },
    });

    return NextResponse.json({
      ok: true,
      quoteId,
      tradeStatus: "QUOTED",
      message: `Quote submitted to ${trade.buyer?.legalName || "buyer"}. Trade status updated to QUOTED.`,
      totals: { exwTotal, logisticsTotal, sgtxFee, totalQuote },
    });
  } catch (e: any) {
    console.error("[quote/submit] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
