// @ts-nocheck
// §1 Country Activation — GET workflow progress (completedSteps / progressPct / remainingSteps)
// GET /api/sgtx/regulatory/activation/[id]/progress
import { NextResponse } from "next/server";
import { getWorkflowProgress } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const progress = await getWorkflowProgress(id);
    if (!progress) {
      return NextResponse.json(
        { error: "workflow not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ progress });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/[id]/progress] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
