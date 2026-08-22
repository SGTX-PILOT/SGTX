// @ts-nocheck
// §3 Returns — cancel (any non-terminal → CANCELLED). Body: { reason }
// POST /api/sgtx/completion/returns/[id]/cancel
import { NextResponse } from "next/server";
import { cancelReturn } from "@/lib/sgtx/returns";
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
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const record = await cancelReturn(id, body.reason);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]/cancel] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
