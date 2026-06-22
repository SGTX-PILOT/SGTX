import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clauseForgeConsensus } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/clause-forge-consensus
// Multi-model consensus version of clause forge (2 models: glm-4-plus + glm-4-air).
// Two models draft the clause independently; longer/more detailed one is selected.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { article, ustn } = body;
  if (!article || !ustn) {
    return NextResponse.json({ error: "article + ustn required" }, { status: 400 });
  }

  const trade = await db.trade.findUnique({
    where: { ustn },
    include: { buyer: true, seller: true },
  });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  try {
    const result = await clauseForgeConsensus(article, trade);
    return NextResponse.json({
      ok: true,
      article,
      clause: result.content,
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
