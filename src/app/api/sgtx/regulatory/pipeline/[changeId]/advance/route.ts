// @ts-nocheck
// §4 Change Approval Pipeline — POST advance pipeline (one step forward)
// POST /api/sgtx/regulatory/pipeline/[changeId]/advance  body: { actor, notes? }
import { NextResponse } from "next/server";
import { advancePipeline } from "@/lib/sgtx/change-approval";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
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
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.actor || typeof body.actor !== "string") {
      return NextResponse.json({ error: "actor required" }, { status: 400 });
    }
    const result = await advancePipeline(changeId, body.actor, body.notes);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "cannot advance", result },
        { status: 400 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/[changeId]/advance] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
