// @ts-nocheck
// §4 Change Approval Pipeline — GET can advance? (blockers + nextStep)
// GET /api/sgtx/regulatory/pipeline/[changeId]/can-advance
import { NextResponse } from "next/server";
import { canAdvance } from "@/lib/sgtx/change-approval";
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
    const result = await canAdvance(changeId);
    if (!result) {
      return NextResponse.json(
        { error: "change not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/[changeId]/can-advance] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
