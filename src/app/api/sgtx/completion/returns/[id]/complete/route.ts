// @ts-nocheck
// §3 Returns — complete (PROCESSED → COMPLETED). No body.
// POST /api/sgtx/completion/returns/[id]/complete
import { NextResponse } from "next/server";
import { completeReturn } from "@/lib/sgtx/returns";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const record = await completeReturn(id);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]/complete] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
