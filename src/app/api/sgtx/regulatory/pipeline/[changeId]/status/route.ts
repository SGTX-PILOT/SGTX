// @ts-nocheck
// §4 Change Approval Pipeline — GET pipeline status (currentStatus + 7 steps + canAdvance + blockers)
// GET /api/sgtx/regulatory/pipeline/[changeId]/status
import { NextResponse } from "next/server";
import { getPipelineStatus } from "@/lib/sgtx/change-approval";
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
    const status = await getPipelineStatus(changeId);
    if (!status) {
      return NextResponse.json(
        { error: "change not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ status });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/[changeId]/status] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
