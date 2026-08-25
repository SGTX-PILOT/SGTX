// @ts-nocheck
// GET /api/sgtx/road-corridor/[id] — fetch a corridor by id, with legs

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRoadCorridor } from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const corridor = await getRoadCorridor(id);
    if (!corridor) {
      return NextResponse.json({ error: "Corridor not found" }, { status: 404 });
    }
    return NextResponse.json({ corridor });
  } catch (e: any) {
    logger.error("[api/road-corridor/[id]] GET failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
