// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { governorPrescreenConsensus } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/governor-prescreen-consensus
// Multi-model consensus version of governor prescreen (2 models: glm-4-plus + glm-4-air).
// When models disagree on verdict, most conservative wins (DENY > CONDITIONAL > ALLOW).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { counterpartyGtid, commodity, originCountry, destCountry, hsCode, incoterm, totalValue, transportMode, insuranceRequirement, settlementStructure, tradeCriticality } = body;
  if (!commodity || !originCountry || !destCountry) {
    return NextResponse.json({ error: "commodity, originCountry, destCountry required" }, { status: 400 });
  }
  try {
    const result = await governorPrescreenConsensus({
      commodity,
      hsCode: hsCode || "0000.00",
      buyerCountry: destCountry,
      sellerCountry: originCountry,
      value: totalValue || 50000,
      incoterm,
      transportMode,
      insuranceRequirement,
      settlementStructure,
      tradeCriticality,
      sellerGtid: counterpartyGtid,
    });
    return NextResponse.json({
      ok: true,
      verdict: result.verdict,
      conditions: result.conditions,
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
