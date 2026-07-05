// 3B.5.1 — Financing Request Initiation + 3B.5.2 Credit Intelligence + 3B.5.3 RFQ Broadcast
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  validateFinancingRequest,
  computeCreditIntelligence,
  findMatchingFinanciers,
  generateRequestId,
  DEFAULT_BIDDING_WINDOW_HOURS,
} from "@/lib/sgtx/financing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { borrowerGtid, tradeId, shipmentSeq, amountUsd, financingType, tenorDays, preferredSettlement, preferredCurrency, collateralType, specialInstructions, traderMode, biddingWindowHours } = body;
    if (!borrowerGtid || !tradeId || !amountUsd || !financingType || !tenorDays) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
        const trade = await db.trade.findUnique({ where: { id: tradeId }, include: { shipments: true } }) as any;
        if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 }) as any;

    // G4U1 validation
        const validation = validateFinancingRequest({ trade, borrowerGtid, amountUsd, tenorDays, traderMode: traderMode || "DUAL", financingType }) as any;
    if (!validation.ok) {
            return NextResponse.json({ error: validation.reason, code: validation.code }, { status: 400 }) as any;
    }

        const borrower = await db.tenant.findUnique({ where: { gtid: borrowerGtid } }) as any;
        if (!borrower) return NextResponse.json({ error: "Borrower tenant not found" }, { status: 404 }) as any;

    // 3B.5.2 — Compute credit intelligence (A2)
    const creditIntel = await computeCreditIntelligence(borrowerGtid, trade);

    const requestId = generateRequestId();
    const ustn = shipmentSeq ? trade.ustn : trade.ustn;
    const windowHours = biddingWindowHours || DEFAULT_BIDDING_WINDOW_HOURS;
    const biddingWindowEndsAt = new Date(Date.now() + windowHours * 3600 * 1000);

    // Create financing request
    const financingRequest = await db.financingRequest.create({
      data: {
        requestId,
        tradeId,
        borrowerGtid,
        shipmentSeq: shipmentSeq || null,
        ustn,
        amountUsd: +amountUsd,
        totalTradeValue: trade.tradeValueUsd,
        financingType,
        tenorDays: +tenorDays,
        preferredSettlement,
        preferredCurrency: preferredCurrency || "USD",
        collateralType,
        specialInstructions: specialInstructions || null,
        recommendedLtv: creditIntel.recommendedLtv,
        status: "RFQ_BROADCAST",
        creditScore: creditIntel.creditScore,
        defaultProbability: creditIntel.defaultProbability,
        creditIntelligence: JSON.stringify(creditIntel),
        biddingWindowEndsAt,
      },
      include: { borrower: true, trade: true },
        }) as any;

    // 3B.5.3 — Auto RFQ broadcast to matching financiers
    const matches = await findMatchingFinanciers({
      borrowerGtid,
      borrowerCountry: borrower.country,
      borrowerTrustScore: borrower.trustScore,
      totalTradeValue: trade.tradeValueUsd,
      amountUsd: +amountUsd,
      financingType,
      preferredSettlement,
      commodityHs: trade.commodityHs,
    });

    const rfqLogs: any[] = [];
    for (const m of matches) {
      // Smart Inbox item per matching financier
      await db.inboxItem.create({
        data: {
          tenantGtid: m.financierGtid,
          tradeId,
          category: "NEW_OFFER",
          priority: 50 + Math.round(m.matchScore / 2),
          title: `New financing RFQ match (score ${m.matchScore}) — ${borrower.legalName}`,
          description: `Request ${requestId} for $${(+amountUsd).toLocaleString()} ${financingType.replace(/_/g, " ")} financing. Match score ${m.matchScore}/100. Click to view full disclosure.`,
          ctaLabel: "View RFQ",
          deadline: biddingWindowEndsAt,
        },
            }) as any;
      const log = await db.financingRfqLog.create({
        data: { requestId: financingRequest.id, financierGtid: m.financierGtid, matchScore: m.matchScore, deliveredVia: "INBOX", status: "DELIVERED" },
            }) as any;
            rfqLogs.push({ financierGtid: m.financierGtid, legalName: m.legalName, matchScore: m.matchScore, logId: log.id }) as any;
    }

    // Update status to BIDDING_OPEN after broadcast
        await db.financingRequest.update({ where: { id: financingRequest.id }, data: { status: "BIDDING_OPEN" } }) as any;

    return NextResponse.json({
      ok: true,
      requestId: financingRequest.requestId,
      id: financingRequest.id,
      creditIntelligence: creditIntel,
      rfqBroadcast: {
        matchesFound: matches.length,
        financiers: rfqLogs,
        biddingWindowEndsAt,
      },
        }) as any;
  } catch (e: any) {
    logger.error("[financing/request]", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}

// GET — list financing requests for a borrower
export async function GET(req: NextRequest) {
  const borrowerGtid = req.nextUrl.searchParams.get("borrowerGtid");
    if (!borrowerGtid) return NextResponse.json({ error: "borrowerGtid required" }, { status: 400 }) as any;
  const requests = await db.financingRequest.findMany({
    where: { borrowerGtid },
    include: {
      bids: { include: { financier: true } },
      trade: { include: { buyer: true, seller: true } },
      agreements: { include: { annexes: true } },
      repayments: true,
    },
    orderBy: { createdAt: "desc" },
    }) as any;
    return NextResponse.json({ requests }) as any;
}
