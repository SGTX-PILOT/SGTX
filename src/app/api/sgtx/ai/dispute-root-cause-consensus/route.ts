import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputeRootCauseConsensus } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/dispute-root-cause-consensus
// Multi-model consensus version of dispute root cause (3 models: glm-4-plus + glm-4-air + glm-4-flash).
// Three models analyze independently; root causes merged; agreement score computed.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { disputeId, ustn, disputeType, summary, evidence } = body;
  if (!disputeId || !disputeType) {
    return NextResponse.json({ error: "disputeId + disputeType required" }, { status: 400 });
  }

  let trade: any = null;
  if (ustn) {
    trade = await db.trade.findUnique({ where: { ustn }, include: { buyer: true, seller: true } }).catch(() => null);
  }

  try {
    const result = await disputeRootCauseConsensus({
      type: disputeType,
      description: summary || "",
      trade,
      evidence: evidence || [],
    });

    // Persist to dispute record if exists
    if (disputeId) {
      await db.dispute.update({
        where: { id: disputeId },
        data: { aiRootCause: result.content },
      }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      content: result.content,
      rootCauses: result.content,
      aiSummary: result.content,
      ustn,
      disputeId,
      disputeType,
      evidenceCount: evidence?.length || 0,
      provider: result.provider,
      model: result.model,
      authority: result.authority,
      consensus: result.consensus,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
