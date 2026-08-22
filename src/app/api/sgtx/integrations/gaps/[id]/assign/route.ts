// @ts-nocheck
// §4 Gap Analysis — POST assign owner + next action + due date
// POST /api/sgtx/integrations/gaps/[id]/assign  body: { owner, nextAction, dueDate? }
import { NextResponse } from "next/server";
import { assignGapOwner } from "@/lib/sgtx/gap-analysis";
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
    if (!body.owner) {
      return NextResponse.json({ error: "owner required" }, { status: 400 });
    }
    if (!body.nextAction) {
      return NextResponse.json(
        { error: "nextAction required" },
        { status: 400 },
      );
    }
    const dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
    const gap = await assignGapOwner(id, body.owner, body.nextAction, dueDate);
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/[id]/assign] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
