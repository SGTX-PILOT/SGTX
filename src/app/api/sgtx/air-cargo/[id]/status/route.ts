// @ts-nocheck
// POST /api/sgtx/air-cargo/[id]/status — record a milestone status event
//
// Body:
//   { eventType: "RCS"|"DEP"|"ARR"|"RCF"|"NFD"|"DLV", airport?: "CAI", remarks?, flightId? }
//
// Response: { ok, event } on success. The booking's status is also bumped
// (best-effort) to mirror the latest milestone — RCS→ACCEPTED, DEP→DEPARTED,
// ARR/RCF/NFD→ARRIVED, DLV→DELIVERED.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordStatusEvent, AIR_STATUS_EVENT_TYPES } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "Missing booking id path parameter" },
        { status: 400 },
      );
    }
    const body = await req.json();
    const eventType = body?.eventType;
    if (!eventType) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: eventType", valid: AIR_STATUS_EVENT_TYPES },
        { status: 400 },
      );
    }
    const result = await recordStatusEvent(
      bookingId,
      String(eventType).toUpperCase(),
      body?.airport,
      body?.remarks,
      body?.flightId,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, event: result.event });
  } catch (e: any) {
    logger.error("[air-cargo/[id]/status] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
