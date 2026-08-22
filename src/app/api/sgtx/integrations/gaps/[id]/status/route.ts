// @ts-nocheck
// §4 Gap Analysis — POST status update (CONNECTED/PARTIAL/MANUAL/MISSING/DEPRECATED)
// POST /api/sgtx/integrations/gaps/[id]/status  body: { newStatus, notes? }
import { NextResponse } from "next/server";
import { updateGapStatus } from "@/lib/sgtx/gap-analysis";
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
    if (!body.newStatus) {
      return NextResponse.json({ error: "newStatus required" }, { status: 400 });
    }
    const gap = await updateGapStatus(id, body.newStatus, body.notes);
    return NextResponse.json({ gap });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/[id]/status] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
