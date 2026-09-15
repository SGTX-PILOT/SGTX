// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { proposePolicyChange } from "@/lib/sgtx/constitutional-policies";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/constitutional-policies/[id]/propose — propose a policy change (multisig).
// Body: { proposedChange: { field, newValue, oldValue?, reason }, proposerGtid, reason }
//   → { ok, proposalId, requiresMultisig, requiredApprovals, authorizedApproverGtids }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "policy id required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.proposedChange || !body.proposerGtid || !body.reason) {
    return NextResponse.json(
      { error: "proposedChange, proposerGtid, reason required" },
      { status: 400 },
    );
  }
  try {
    const result = await proposePolicyChange(
      id,
      body.proposedChange,
      body.proposerGtid,
      body.reason,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message.includes("not found")) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    logger.error("[api/constitutional-policies/propose] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "propose failed" }, { status: 400 });
  }
}
