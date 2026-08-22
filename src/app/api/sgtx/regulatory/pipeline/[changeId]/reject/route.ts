// @ts-nocheck
// §4 Change Approval Pipeline — POST reject (off-ramp to REJECTED)
// POST /api/sgtx/regulatory/pipeline/[changeId]/reject  body: { actor, reason }
import { NextResponse } from "next/server";
import { rejectChange } from "@/lib/sgtx/change-approval";
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
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.actor || typeof body.actor !== "string") {
      return NextResponse.json({ error: "actor required" }, { status: 400 });
    }
    if (!body.reason || typeof body.reason !== "string") {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const result = await rejectChange(changeId, body.actor, body.reason);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/[changeId]/reject] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
