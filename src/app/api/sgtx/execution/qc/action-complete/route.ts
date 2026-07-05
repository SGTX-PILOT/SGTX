// 3B.6.4.2 — Mark action plan complete (seller) + verify (inspector/buyer) → release hold
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { completeActionPlan } from "@/lib/sgtx/execution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionPlanId, completedBy } = body;
    if (!actionPlanId || !completedBy) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await completeActionPlan({ actionPlanId, completedBy });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, holdReleased: result.holdReleased });
  } catch (e: any) {
    logger.error("[execution/qc/action-complete]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
