// @ts-nocheck
// §4 Gap Analysis — POST resolve gap (→ status=CONNECTED)
// POST /api/sgtx/integrations/gaps/[id]/resolve  body: { resolvedBy, notes }
import { NextResponse } from "next/server";
import { resolveGap } from "@/lib/sgtx/gap-analysis";
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
    if (!body.resolvedBy) {
      return NextResponse.json(
        { error: "resolvedBy required" },
        { status: 400 },
      );
    }
    if (!body.notes) {
      return NextResponse.json({ error: "notes required" }, { status: 400 });
    }
    const gap = await resolveGap(id, body.resolvedBy, body.notes);
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/[id]/resolve] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
