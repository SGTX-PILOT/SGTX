// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { approveSpecialRate } from "@/lib/sgtx/special-rate-manager";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/special-rate-manager/[id]/approve — record one approval/rejection.
// Body: { approverGtid, decision?: "APPROVE" | "REJECT" }
//   → { ok, approved, approvalsCount, active, request }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "rateId required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.approverGtid) {
    return NextResponse.json({ error: "approverGtid required" }, { status: 400 });
  }
  const decision = body.decision === "REJECT" ? "REJECT" : "APPROVE";
  try {
    const result = await approveSpecialRate(id, body.approverGtid, decision);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/special-rate-manager/approve] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "approve failed" }, { status: 400 });
  }
}
