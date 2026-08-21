// @ts-nocheck
// POST /api/sgtx/road/corridors/{id}/validate — validate corridor
import { NextRequest, NextResponse } from "next/server";
import { validateCorridor } from "@/lib/sgtx/road-corridor";
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
    const result = await validateCorridor(id);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/road/corridors/[id]/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
