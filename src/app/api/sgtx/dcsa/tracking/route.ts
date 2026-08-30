// @ts-nocheck
// DCSA Track & Trace API — record and query tracking events
import { NextRequest, NextResponse } from "next/server";
import { recordTrackingEvent, getTrackingEvents } from "@/lib/sgtx/dcsa";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filters: any = {};
    const ustn = searchParams.get("ustn");
    const containerId = searchParams.get("containerId");
    const bookingId = searchParams.get("bookingId");
    const eventType = searchParams.get("eventType");
    const limit = searchParams.get("limit");
    if (ustn) filters.ustn = ustn;
    if (containerId) filters.containerId = containerId;
    if (bookingId) filters.bookingId = bookingId;
    if (eventType) filters.eventType = eventType;
    if (limit) filters.limit = parseInt(limit);
    const events = await getTrackingEvents(filters);
    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    logger.error("[api/dcsa/tracking] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = await recordTrackingEvent(body);
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    logger.error("[api/dcsa/tracking] POST failed", { error: err?.message });
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
