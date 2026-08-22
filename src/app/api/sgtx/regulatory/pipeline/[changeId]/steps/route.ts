// @ts-nocheck
// §4 Change Approval Pipeline — GET pipeline steps (all 7 ChangePipelineStep rows ordered)
// GET /api/sgtx/regulatory/pipeline/[changeId]/steps
import { NextResponse } from "next/server";
import { getPipelineSteps } from "@/lib/sgtx/change-approval";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ changeId: string }> },
) {
  try {
    const { changeId } = await params;
    if (!changeId) {
      return NextResponse.json(
        { error: "changeId required" },
        { status: 400 },
      );
    }
    const steps = await getPipelineSteps(changeId);
    return NextResponse.json({ steps });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/[changeId]/steps] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
