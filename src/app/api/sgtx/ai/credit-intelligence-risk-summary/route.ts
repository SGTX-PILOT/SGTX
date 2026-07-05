// AI Agent — A2 Credit Intelligence Risk Summary (standalone wrapper around orchestrator fn)
// Spec ref: Phase 4 / Part 3B.5 — plain-language risk narrative shown to financier.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { creditIntelligenceRiskSummary } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, borrowerGtid, creditScore, defaultProbability, recommendedLtv, signals, borrowerName } = body;

    // Prefer live data from a financing request when requestId is supplied
    let bName = borrowerName as string | undefined;
    let cs = typeof creditScore === "number" ? creditScore : undefined;
    let dp = typeof defaultProbability === "number" ? defaultProbability : undefined;
    let ltv = typeof recommendedLtv === "number" ? recommendedLtv : undefined;
    let sigs = signals;

    if (requestId) {
      const fr = await db.financingRequest.findUnique({
        where: { id: requestId },
        include: { borrower: true },
      });
      if (!fr) return NextResponse.json({ error: "Financing request not found" }, { status: 404 });
      bName = bName || fr.borrower?.legalName;
      cs = cs ?? (fr.creditScore ?? undefined);
      dp = dp ?? (fr.defaultProbability ?? undefined);
      ltv = ltv ?? (fr.recommendedLtv ?? undefined);
      if (!sigs && fr.creditIntelligence) {
        try {
          const parsed = JSON.parse(fr.creditIntelligence);
          sigs = parsed.signals;
          if (cs === undefined) cs = parsed.creditScore;
          if (dp === undefined) dp = parsed.defaultProbability;
          if (ltv === undefined) ltv = parsed.recommendedLtv;
        } catch { /* ignore */ }
      }
    } else if (borrowerGtid && (cs === undefined || sigs === undefined)) {
      // Recompute on the fly if only borrowerGtid is supplied
      const { computeCreditIntelligence } = await import("@/lib/sgtx/financing");
      const tenant = await db.tenant.findUnique({ where: { gtid: borrowerGtid } });
      if (!tenant) return NextResponse.json({ error: "Borrower tenant not found" }, { status: 404 });
      bName = bName || tenant.legalName;
      const ci = await computeCreditIntelligence(borrowerGtid, { coldChain: false, multiShipment: false, commodityHs: "0000.00.00" });
      cs = cs ?? ci.creditScore;
      dp = dp ?? ci.defaultProbability;
      ltv = ltv ?? ci.recommendedLtv;
      sigs = sigs ?? ci.signals;
    }

    if (cs === undefined || dp === undefined || ltv === undefined) {
      return NextResponse.json({ error: "Insufficient credit data — supply requestId, or {borrowerGtid}, or {creditScore, defaultProbability, recommendedLtv, signals}" }, { status: 400 });
    }

    const r = await creditIntelligenceRiskSummary(bName || "Borrower", cs, dp, ltv, sigs || {});
    return NextResponse.json({
      borrowerName: bName || null,
      creditScore: cs,
      defaultProbability: dp,
      recommendedLtv: ltv,
      riskSummary: r.content,
      provider: r.provider,
      model: r.model,
      fallbackUsed: r.fallbackUsed,
      authority: "A2",
    });
  } catch (e: any) {
    logger.error("[ai/credit-intelligence-risk-summary]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — convenience wrapper
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  const borrowerGtid = req.nextUrl.searchParams.get("borrowerGtid");
  if (!requestId && !borrowerGtid) {
    return NextResponse.json({ error: "requestId or borrowerGtid required" }, { status: 400 });
  }
  const body: any = {};
  if (requestId) body.requestId = requestId;
  if (borrowerGtid) body.borrowerGtid = borrowerGtid;
  return POST({ json: async () => body } as unknown as NextRequest);
}
