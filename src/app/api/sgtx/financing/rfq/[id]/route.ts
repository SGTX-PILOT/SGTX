// 3B.5.4 — Full Disclosure RFQ Detail Page (financier view)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { creditIntelligenceRiskSummary } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const financierGtid = req.nextUrl.searchParams.get("financierGtid");

  const request = await db.financingRequest.findUnique({
    where: { id },
    include: {
      borrower: true,
      trade: {
        include: {
          buyer: true,
          seller: true,
          shipments: true,
          documents: true,
          activities: { take: 20, orderBy: { createdAt: "desc" } },
          labTests: true,
          qcInspections: true,
          customsDecls: true,
          invoices: true,
          disputes: true,
        },
      },
      bids: { include: { financier: true } },
      rfqLogs: { where: { financierGtid: financierGtid || undefined } },
    },
  });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // Mark RFQ as VIEWED for this financier
  if (financierGtid) {
    await db.financingRfqLog.updateMany({
      where: { requestId: id, financierGtid, status: "DELIVERED" },
      data: { status: "VIEWED" },
    });
  }

  // Compute borrower historical performance (disclosed to financier)
  const borrowerTrades = await db.trade.findMany({
    where: { OR: [{ buyerGtid: request.borrowerGtid }, { sellerGtid: request.borrowerGtid }] },
    select: { id: true, status: true, tradeValueUsd: true, healthScore: true, createdAt: true },
  });
  const borrowerFinancingHistory = await db.financingRequest.findMany({
    where: { borrowerGtid: request.borrowerGtid },
    include: { repayments: true },
  });
  const borrowerDisputes = await db.dispute.findMany({
    where: { OR: [{ trade: { buyerGtid: request.borrowerGtid } }, { trade: { sellerGtid: request.borrowerGtid } }] },
  });

  const historical = {
    totalTrades: borrowerTrades.length,
    settledTrades: borrowerTrades.filter((t) => t.status === "SETTLED").length,
    totalTradeValue: borrowerTrades.reduce((s, t) => s + (t.tradeValueUsd || 0), 0),
    disputeRate: borrowerTrades.length > 0 ? borrowerDisputes.length / borrowerTrades.length : 0,
    avgHealthScore: borrowerTrades.length > 0 ? Math.round(borrowerTrades.reduce((s, t) => s + (t.healthScore || 0), 0) / borrowerTrades.length) : 0,
    financing: {
      totalRequests: borrowerFinancingHistory.length,
      totalFinanced: borrowerFinancingHistory.reduce((s, f) => s + f.amountUsd, 0),
      onTimeRepayments: borrowerFinancingHistory.filter((f) => f.status === "REPAID").length,
      defaults: borrowerFinancingHistory.filter((f) => f.status === "REJECTED").length,
    },
  };

  // Parse credit intelligence
  let creditIntel: any = null;
  if (request.creditIntelligence) {
    try { creditIntel = JSON.parse(request.creditIntelligence); } catch { creditIntel = null; }
  }

  // AI risk summary (A2) — generate on demand
  let aiRiskSummary: string | null = null;
  if (req.nextUrl.searchParams.get("includeAi") === "true" && creditIntel) {
    try {
      const r = await creditIntelligenceRiskSummary(
        request.borrower.legalName,
        creditIntel.creditScore,
        creditIntel.defaultProbability,
        creditIntel.recommendedLtv,
        creditIntel.signals
      );
      aiRiskSummary = r.content;
    } catch (e) { /* ignore AI failure */ }
  }

  return NextResponse.json({
    request,
    trade: request.trade,
    borrower: request.borrower,
    documents: request.trade.documents,
    historical,
    creditIntelligence: creditIntel,
    aiRiskSummary,
    existingBids: request.bids.length,
    myBid: financierGtid ? request.bids.find((b) => b.financierGtid === financierGtid) : null,
    biddingWindowEndsAt: request.biddingWindowEndsAt,
    feeRate: 0.0025,
  });
}
