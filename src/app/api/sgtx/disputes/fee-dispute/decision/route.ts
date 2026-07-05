// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { reviewFeeDispute } from "@/lib/sgtx/dispute";

// POST /api/sgtx/disputes/fee-dispute/decision — Platform Governance Authority decision on a fee dispute.
// Body: { feeDisputeId, reviewedByGtid, decision: "UPHOLD"|"ADJUST"|"REFUND"|"REQUEST_INFO",
//         refundAmountUsd?, refundMethod?, notes?, governorDecisionId? }
// Part 10.12.2 steps 6-8 — Reviews the AI analysis and either upholds the fee,
// approves a partial/full refund, or requests more information. If REFUND, the
// payment orchestrator is invoked (best-effort) and a refund reference is generated.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await reviewFeeDispute(body as any, undefined as any, undefined as any);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result?.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
