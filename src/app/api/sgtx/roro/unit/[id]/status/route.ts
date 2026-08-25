// @ts-nocheck
// POST /api/sgtx/roro/unit/[id]/status — transition a unit's status per Art 74.
//
// Body: { newStatus: string }
//
// Returns:
//   { ok: true, unit: {...} }
//   { ok: false, error: string, allowedNext?: string[] }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { updateUnitStatus } from "@/lib/sgtx/roro";

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
    const newStatus = String(body?.newStatus || "").toUpperCase();
    if (!newStatus) {
      return NextResponse.json(
        { error: "newStatus is required" },
        { status: 400 },
      );
    }

    const result = await updateUnitStatus(id, newStatus);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, allowedNext: result.allowedNext || [] },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, unit: result.unit });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/unit/[id]/status POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
