// @ts-nocheck
// §3 Returns — receive (IN_TRANSIT → RECEIVED). No body.
// POST /api/sgtx/completion/returns/[id]/receive
import { NextResponse } from "next/server";
import { receiveReturn } from "@/lib/sgtx/returns";
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
    const record = await receiveReturn(id);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]/receive] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
