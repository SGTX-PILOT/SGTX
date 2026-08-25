// @ts-nocheck
// GET /api/sgtx/roro/unit/[id] — fetch a RoRo unit with yard, inspections, gate events.
//
// Returns:
//   { unit: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRoRoUnit } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing unit id" }, { status: 400 });
    }
    const unit = await getRoRoUnit(id);
    if (!unit) {
      return NextResponse.json({ error: "RoRo unit not found" }, { status: 404 });
    }
    return NextResponse.json({ unit });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/unit/[id] GET] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
