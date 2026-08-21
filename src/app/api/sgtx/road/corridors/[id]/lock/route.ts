// @ts-nocheck
// POST /api/sgtx/road/corridors/{id}/lock — lock corridor (immutable after lock)
import { NextRequest, NextResponse } from "next/server";
import { lockCorridor } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "corridor id required" }, { status: 400 });
    }
    const result = await lockCorridor(id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Corridor must be in CORRIDOR_VALIDATED status to lock" },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/road/corridors/[id]/lock] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
