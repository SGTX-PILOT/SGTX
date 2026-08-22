// @ts-nocheck
// §2 Regulatory Changes — POST assign Governor decision (constitutional gate)
// POST /api/sgtx/regulatory/changes/[id]/assign-governor  body: { governorDecisionId }
import { NextResponse } from "next/server";
import {
  assignGovernorDecision,
  getRegulatoryChange,
  getChangeByChangeId,
} from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.governorDecisionId || typeof body.governorDecisionId !== "string") {
      return NextResponse.json(
        { error: "governorDecisionId required" },
        { status: 400 },
      );
    }
    let changeId = id;
    const byCuid = await getRegulatoryChange(id);
    if (byCuid?.changeId) {
      changeId = byCuid.changeId;
    } else {
      const byBusinessId = await getChangeByChangeId(id);
      if (byBusinessId?.changeId) changeId = byBusinessId.changeId;
    }
    const change = await assignGovernorDecision(changeId, body.governorDecisionId);
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/changes/[id]/assign-governor] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
