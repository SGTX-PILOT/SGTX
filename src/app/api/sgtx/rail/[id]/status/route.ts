// @ts-nocheck
// POST /api/sgtx/rail/[id]/status — record a tracking milestone (status event)
// against a rail booking.
//
// Body: { eventType: "BOOKED" | "LOADED" | ..., terminal?: string, remarks?: string }
// Valid event types: see RAIL_EVENT_TYPES in src/lib/sgtx/rail.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordStatusEvent, RAIL_EVENT_TYPES } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id path parameter" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const eventType = body.eventType;
    if (!eventType) {
      return NextResponse.json({ ok: false, error: "eventType is required", validTypes: [...RAIL_EVENT_TYPES] }, { status: 400 });
    }
    const result = await recordStatusEvent(id, eventType, body.terminal, body.remarks);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/[id]/status/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}
