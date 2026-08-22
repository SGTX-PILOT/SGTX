// @ts-nocheck
// §3 Returns — ship (OPEN → IN_TRANSIT). Body: { transportMode }
// POST /api/sgtx/completion/returns/[id]/ship
import { NextResponse } from "next/server";
import { shipReturn } from "@/lib/sgtx/returns";
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
    if (!body.transportMode) {
      return NextResponse.json(
        { error: "transportMode required" },
        { status: 400 },
      );
    }
    const record = await shipReturn(id, body.transportMode);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]/ship] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
