// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPolicyImpact } from "@/lib/sgtx/constitutional-policies";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/constitutional-policies/[id]/impact — simulate the impact of a proposed change.
// Body: { proposedChange: { field, newValue, oldValue?, reason } }
//   → { simulationId, simulatedAt, affectedTrades, affectedTenants, estimatedCostUsd, riskLevel, riskReasons }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "policy id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.proposedChange) {
    return NextResponse.json({ error: "proposedChange required" }, { status: 400 });
  }
  try {
    const result = await getPolicyImpact(id, body.proposedChange);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message.includes("not found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    logger.error("[api/constitutional-policies/impact] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "simulate failed" }, { status: 400 });
  }
}
