import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { eventBus } from "@/lib/sgtx/brain-os";
import { withIdempotency, getIdempotencyKey } from "@/lib/sgtx/idempotency-middleware";

export const dynamic = "force-dynamic";

// POST /api/sgtx/quote/submit — seller submits quote to buyer (Phase 2 completion)
// Creates: Trade status → QUOTED, quote data stored on Trade, Smart Inbox to buyer (priority 75), Activity log
export async function POST(req: NextRequest) {
  const idempotencyKey = getIdempotencyKey(req);
  const result = await withIdempotency(idempotencyKey, "quote.submit", async () => {
  try {
    const body = await req.json();
    const {
      ustn, sellerGtid, exwPrice, priceUnit, loadingCountry, loadingPort,
      packingLayers, totalCartons, logisticsModeA, incoterm,
      exwTotal, logisticsTotal, sgtxFee, totalQuote, carbonFootprint,
      logisticsModeGtids, logisticsRfqSummary,
    } = body;

    if (!ustn || !sellerGtid) {
      return { body: { error: "ustn and sellerGtid required" }, status: 400 };
    }

    // ── FIX-CRITICAL / Bug 1 — Input validation BEFORE any DB mutation ──
    // Audit Finding F-1 (CRITICAL): the route previously ran
    // `db.trade.update({status:"QUOTED"})` BEFORE `db.inboxItem.create()`,
    // and the inbox item used `totalQuote.toLocaleString()` — a TypeError
    // when totalQuote was undefined or non-numeric. The trade was left in
    // QUOTED state with no buyer notification (partial state, no atomicity).
    // Validate everything here so a malformed payload returns 400 BEFORE
    // the transaction touches the database.
    const numericFields: Array<[string, unknown]> = [
      ["totalQuote", totalQuote],
      ["exwPrice", exwPrice],
      ["sgtxFee", sgtxFee],
      ["exwTotal", exwTotal],
      ["logisticsTotal", logisticsTotal],
    ];
    for (const [k, v] of numericFields) {
      if (v === undefined || v === null) {
        return { body: { error: `${k} is required` }, status: 400 };
      }
      const n = typeof v === "number" ? v : Number(v);
      if (!isFinite(n)) {
        return { body: { error: `${k} must be a finite number` }, status: 400 };
      }
    }
    if (typeof priceUnit !== "string" || !priceUnit.trim()) {
      return { body: { error: "priceUnit is required" }, status: 400 };
    }
    if (typeof incoterm !== "string" || !incoterm.trim()) {
      return { body: { error: "incoterm is required" }, status: 400 };
    }
    if (totalCartons === undefined || totalCartons === null || !isFinite(Number(totalCartons))) {
      return { body: { error: "totalCartons is required" }, status: 400 };
    }
    // Coerce validated numerics to actual numbers — protects against
    // stringified JSON values (e.g. "1234.50") that would otherwise crash
    // `.toLocaleString()` and the Prisma Float columns downstream.
    const totalQuoteNum = Number(totalQuote);
    const exwPriceNum = Number(exwPrice);
    const sgtxFeeNum = Number(sgtxFee);
    const exwTotalNum = Number(exwTotal);
    const logisticsTotalNum = Number(logisticsTotal);
    const totalCartonsNum = Number(totalCartons);

    // Find the trade
    const trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } });
    if (!trade) return { body: { error: `Trade ${ustn} not found` }, status: 404 };
    if (trade.status !== "PENDING_SELLER_RESPONSE" && trade.status !== "INITIATED") {
      return { body: { error: `Trade already ${trade.status} — cannot submit quote` }, status: 409 };
    }

    const quoteId = `SQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

    // ── FIX-CRITICAL / Bug 1 — Atomic $transaction (audit Finding F-1) ──
    // Previously `db.trade.update({status:"QUOTED"})` ran BEFORE
    // `db.inboxItem.create()`. If the inbox step threw (e.g.
    // `totalQuote.toLocaleString()` on a non-number), the trade was
    // stuck in QUOTED with NO buyer notification — partial state. Now
    // every mutation lives inside one `$transaction(async (tx) => …)`
    // callback: trade-status flip, Mode B/C service-quotation fan-out,
    // packing-plan document, buyer inbox item, and activity log. A
    // failure in ANY step rolls back ALL of them — the trade stays in
    // its prior state (PENDING_SELLER_RESPONSE or INITIATED), no
    // orphaned inbox/activity/document/service-quotation rows remain.
    await db.$transaction(async (tx) => {
      // Update trade status to QUOTED + store quote data
      await tx.trade.update({
        where: { id: trade.id },
        data: {
          status: "QUOTED",
          phase: 2,
          sgtxFeeUsd: sgtxFeeNum,
          originPort: loadingPort,
          originCountry: loadingCountry,
          tradeValueUsd: totalQuoteNum,
          // Store quote details in globalNotes as JSON (since we don't have dedicated quote fields)
          globalNotes: JSON.stringify({
            quoteId,
            exwPrice: exwPriceNum, priceUnit, exwTotal: exwTotalNum, logisticsTotal: logisticsTotalNum, sgtxFee: sgtxFeeNum, totalQuote: totalQuoteNum,
            totalCartons: totalCartonsNum, packingLayers: packingLayers?.length || 0,
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
      //
      // Phase 2.6 — Multi-GTID + RFQ-for-All support:
      //   logisticsModeGtids[service] = { gtids: string[], mode: "B"|"C", status, rfqAll: boolean }
      //   When rfqAll=true, the RFQ is broadcast to ALL verified tenants of the
      //   matching type (LSP for Mode B, SHIP for Mode C). When gtids[] is non-empty,
      //   an RFQ is created per listed GTID. Both options can co-exist across
      //   different services (e.g., Trucking → RFQ to all LSPs; Cold Storage →
      //   2 specific LSPs). Backward compat: legacy { gtid: string } entries are
      //   still honoured (treated as a single-element gtids[] array).
      if (logisticsModeGtids && typeof logisticsModeGtids === "object") {
        const today = new Date();
        const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, "0")}${String(today.getUTCDate()).padStart(2, "0")}`;
        let seq = 1;

        // Pre-fetch all verified LSP + SHIP tenants once (for rfqAll broadcasts)
        const [allLsps, allShips] = await Promise.all([
          tx.tenant.findMany({ where: { type: "LSP", lifecycleState: "VERIFIED" } }),
          tx.tenant.findMany({ where: { type: "SHIP", lifecycleState: "VERIFIED" } }),
        ]);

        for (const [serviceName, assignment] of Object.entries(logisticsModeGtids as any)) {
          const a = assignment as any;
          if (!a || (a?.mode !== "B" && a?.mode !== "C")) continue;

          // Resolve the target GTID list:
          //   - rfqAll=true → broadcast to every verified tenant of the matching type
          //   - gtids=[...] → one RFQ per listed GTID
          //   - legacy gtid="..." (string) → treat as single-element array
          let targetGtids: string[] = [];
          if (a.rfqAll === true) {
            const pool = a.mode === "B" ? allLsps : allShips;
            targetGtids = pool.map((t) => t.gtid);
          } else {
            if (Array.isArray(a.gtids)) {
              targetGtids = a.gtids.filter((g: any) => typeof g === "string" && g);
            } else if (typeof a.gtid === "string" && a.gtid) {
              // Backward compat — legacy single-gtid payload
              targetGtids = [a.gtid];
            }
          }
          if (targetGtids.length === 0) continue;

          for (const targetGtid of targetGtids) {
            // Check if already exists for this trade + provider + service
            const existing = await tx.serviceQuotation.findFirst({
              where: { tradeId: trade.id, providerGtid: targetGtid, serviceType: serviceName },
            });
            if (existing) continue;

            // Determine providerType from the tenant record (LSP, SHIP, etc.)
            let providerType = a.mode === "B" ? "LSP" : "SHIP";
            try {
              const providerTenant = await tx.tenant.findUnique({ where: { gtid: targetGtid } });
              if (providerTenant?.type) providerType = providerTenant.type;
            } catch {}

            const broadcastNote = a.rfqAll === true
              ? ` (broadcast RFQ — sent to all ${targetGtids.length} verified ${a.mode === "B" ? "LSPs" : "ship lines"})`
              : "";

            await tx.serviceQuotation.create({
              data: {
                quoteId: `SQ-${ymd}-${String(seq).padStart(3, "0")}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
                tradeId: trade.id,
                ustn: ustn,
                providerGtid: targetGtid,
                providerType,
                serviceType: serviceName,
                feeUsd: 0, // pending — provider fills in actual fee on response
                currency: "USD",
                validityDays: 7,
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                status: "PENDING",
                description: `Mode ${a.mode} RFQ — ${serviceName} for ${trade.commodity} (${incoterm} ${loadingPort})${broadcastNote}`,
                notes: `Mode ${a.mode} RFQ from seller ${sellerGtid}. Origin: ${loadingPort}. Incoterm: ${incoterm}. Buyer: ${trade.buyerGtid}.${broadcastNote}`,
              },
            });
            seq++;
          }
        }
      }

      // Store packing plan as a document
      await tx.document.create({
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
      await tx.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          tradeId: trade.id,
          category: "NEW_OFFER",
          priority: 75,
          title: `Quote received from ${trade.seller?.legalName || sellerGtid}`,
          description: `${trade.commodity} · EXW $${exwPriceNum}/${priceUnit} · ${totalCartonsNum} cartons · Total: $${totalQuoteNum.toLocaleString()} (incl. $${sgtxFeeNum} SGTX fee). Incoterm: ${incoterm}. Review and accept/modify/reject.`,
          ctaLabel: "Review Quote",
        },
      });

      // Activity log
      await tx.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: sellerGtid,
          action: "QUOTE_SUBMITTED",
          type: "SUCCESS",
          description: `Seller ${trade.seller?.legalName || sellerGtid} submitted quote ${quoteId}. EXW $${exwPriceNum}/${priceUnit}. Total: $${totalQuoteNum.toLocaleString()} (fee: $${sgtxFeeNum}). Packing: ${totalCartonsNum} cartons, ${packingLayers?.length || 0} layer patterns.`,
        },
      });
    });

    // FIX-12-FINAL / Fix 8 — Brain event publication. Publishes
    // `trade.quote.submitted` so downstream subscribers (audit S34) fire.
    // Fire-and-forget — never blocks the quote submission.
    eventBus
      .publish("trade.quote.submitted", ustn, {
        ustn,
        sellerGtid,
        buyerGtid: trade.buyerGtid,
        quoteId,
        totalQuote,
        incoterm,
      }, { source: "quote.submit", tenantGtid: sellerGtid })
      .catch(() => { /* event publish failure is non-blocking */ });

    return { body: {
      ok: true,
      quoteId,
      tradeStatus: "QUOTED",
      message: `Quote submitted to ${trade.buyer?.legalName || "buyer"}. Trade status updated to QUOTED.`,
      totals: { exwTotal, logisticsTotal, sgtxFee, totalQuote },
    }, status: 200 };
  } catch (e: any) {
    logger.error("[quote/submit] error:", e);
    return { body: { error: e.message }, status: 500 };
  }
  });
  return NextResponse.json(result.body, { status: result.status });
}
