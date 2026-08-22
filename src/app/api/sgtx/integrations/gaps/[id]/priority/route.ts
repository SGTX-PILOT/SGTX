// @ts-nocheck
// §4 Gap Analysis — POST priority override
// POST /api/sgtx/integrations/gaps/[id]/priority  body: { priority, reason? }
import { NextResponse } from "next/server";
import { updateGapPriority } from "@/lib/sgtx/gap-analysis";
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
    if (body.priority === undefined || body.priority === null) {
      return NextResponse.json({ error: "priority required" }, { status: 400 });
    }
    const priority = Number(body.priority);
    if (!Number.isFinite(priority)) {
      return NextResponse.json(
        { error: "priority must be a number" },
        { status: 400 },
      );
    }
    const gap = await updateGapPriority(id, priority, body.reason);
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/[id]/priority] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
