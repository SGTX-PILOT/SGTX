import { NextRequest, NextResponse } from "next/server";
import { runCausalAnalysis } from "@/lib/sgtx/dispute";
import { db } from "@/lib/db";

// POST /api/sgtx/disputes/causal — Trigger the causal inference engine for a dispute (Part 10.4).
// Body: { disputeId }
// The causal inference engine (A2/A3 DoWhy + EconML) analyses the dispute's
// timeline, sensor data, QC overrides, broker history, and produces root cause
// attribution with contribution percentages + a Groq plain-language summary.
// Results are persisted on the dispute (aiRootCause) and returned to the caller.
export async function POST(req: NextRequest) {
  try {
    const { disputeId } = await req.json();
    if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });
    const result = await runCausalAnalysis(disputeId);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/sgtx/disputes/causal?disputeId=... — fetch the latest causal attribution
// for the dispute (from CausalAttribution table).
export async function GET(req: NextRequest) {
  const disputeId = req.nextUrl.searchParams.get("disputeId");
  if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });
  const attribution = await db.causalAttribution.findFirst({
    where: { disputeId, entityType: "dispute" },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, attribution });
}
