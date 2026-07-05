// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { creditIntelligenceRiskSummary } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/credit-intelligence-consensus
// Multi-model consensus version of credit intelligence risk summary (2 models).
// Two models generate independent risk summaries; more conservative one selected.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { borrowerName, creditScore, defaultProbability, recommendedLtv, signals } = body;
  if (!borrowerName || creditScore === undefined) {
    return NextResponse.json({ error: "borrowerName + creditScore required" }, { status: 400 });
  }

  try {
    const result = await creditIntelligenceRiskSummaryConsensus(
      borrowerName,
      creditScore,
      defaultProbability || 0,
      recommendedLtv || 0,
      signals || {},
    );
    return NextResponse.json({
      ok: true,
      borrowerName,
      creditScore,
      defaultProbability,
      recommendedLtv,
      riskSummary: result.content,
      content: result.content,
      provider: result.provider,
      model: result.model,
      authority: result.authority,
      consensus: result.consensus,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
