// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getPolicyVersionHistory } from "@/lib/sgtx/constitutional-policies";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/constitutional-policies/[id]/history — version history of a policy.
//   → { versions: [{ version, changedAt, changedBy, changeSummary, action, proposedChange, approvedBy }], count }
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "policy id required" }, { status: 400 });
  try {
    const result = await getPolicyVersionHistory(id);
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/constitutional-policies/history] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
