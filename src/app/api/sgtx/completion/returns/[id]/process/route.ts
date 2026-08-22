// @ts-nocheck
// §3 Returns — process (RECEIVED → PROCESSED). Body: { notes }
// POST /api/sgtx/completion/returns/[id]/process
import { NextResponse } from "next/server";
import { processReturn } from "@/lib/sgtx/returns";
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
    if (!body.notes) {
      return NextResponse.json(
        { error: "notes required (describe the processing action)" },
        { status: 400 },
      );
    }
    const record = await processReturn(id, body.notes);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]/process] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
