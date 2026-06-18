// 3B.5.2 — Credit Intelligence (recompute on demand)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCreditIntelligence } from "@/lib/sgtx/financing";
import { creditIntelligenceRiskSummary } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  const borrowerGtid = req.nextUrl.searchParams.get("borrowerGtid");
  const includeAi = req.nextUrl.searchParams.get("includeAi") === "true";

  if (!requestId && !borrowerGtid) return NextResponse.json({ error: "requestId or borrowerGtid required" }, { status: 400 });

  let borrowerGtidFinal = borrowerGtid;
  let trade: any;
  if (requestId) {
    const req = await db.financingRequest.findUnique({
      where: { id: requestId },
      include: { trade: true, borrower: true },
    });
    if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    borrowerGtidFinal = req.borrowerGtid;
    trade = req.trade;
    // If already computed, return cached
    if (req.creditIntelligence) {
      let cached: any = null;
      try { cached = JSON.parse(req.creditIntelligence); } catch { /* ignore */ }
      let aiSummary: string | null = null;
      if (includeAi && cached) {
        try {
          const r = await creditIntelligenceRiskSummary(req.borrower.legalName, cached.creditScore, cached.defaultProbability, cached.recommendedLtv, cached.signals);
          aiSummary = r.content;
        } catch { /* ignore */ }
      }
      return NextResponse.json({ creditIntelligence: cached, aiRiskSummary: aiSummary, cached: true });
    }
  } else if (borrowerGtidFinal) {
    // Use a sample trade (or empty)
    trade = { coldChain: false, multiShipment: false, commodityHs: "0000.00.00" };
  }

  const creditIntel = await computeCreditIntelligence(borrowerGtidFinal!, trade);

  let aiSummary: string | null = null;
  if (includeAi) {
    try {
      const borrower = await db.tenant.findUnique({ where: { gtid: borrowerGtidFinal! } });
      const r = await creditIntelligenceRiskSummary(borrower?.legalName || borrowerGtidFinal!, creditIntel.creditScore, creditIntel.defaultProbability, creditIntel.recommendedLtv, creditIntel.signals);
      aiSummary = r.content;
    } catch { /* ignore */ }
  }

  // Persist to request if requestId provided
  if (requestId) {
    await db.financingRequest.update({
      where: { id: requestId },
      data: {
        creditScore: creditIntel.creditScore,
        defaultProbability: creditIntel.defaultProbability,
        recommendedLtv: creditIntel.recommendedLtv,
        creditIntelligence: JSON.stringify(creditIntel),
      },
    });
  }

  return NextResponse.json({ creditIntelligence: creditIntel, aiRiskSummary: aiSummary, cached: false });
}
