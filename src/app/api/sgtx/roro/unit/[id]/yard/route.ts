// @ts-nocheck
// POST /api/sgtx/roro/unit/[id]/yard — assign / update a unit's yard position (Art 64).
//
// Body:
//   { zone, block, row, slot, deck?, position? }
//
// Returns:
//   { yard: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { assignYardPosition } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing unit id" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const yard = await assignYardPosition(
      id,
      String(body.zone || ""),
      String(body.block || ""),
      String(body.row || ""),
      String(body.slot || ""),
      body.deck ? String(body.deck) : undefined,
      body.position ? String(body.position) : undefined,
    );
    if (!yard) {
      return NextResponse.json(
        { error: "Failed to assign yard position — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ yard }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/unit/[id]/yard POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
