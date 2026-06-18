import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { disputeRootCause } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/dispute-root-cause  { disputeId: string }
export async function POST(req: NextRequest) {
  const { disputeId } = await req.json();
  if (!disputeId) return NextResponse.json({ error: "disputeId required" }, { status: 400 });

  const dispute = await db.dispute.findUnique({ where: { id: disputeId }, include: { trade: { include: { buyer: true, seller: true } } } });
  if (!dispute) return NextResponse.json({ error: "dispute not found" }, { status: 404 });

  const result = await disputeRootCause({ type: dispute.type, description: dispute.description, trade: dispute.trade });
  // persist the AI root cause
  await db.dispute.update({ where: { id: disputeId }, data: { aiRootCause: result.content } });
  return NextResponse.json(result);
}
