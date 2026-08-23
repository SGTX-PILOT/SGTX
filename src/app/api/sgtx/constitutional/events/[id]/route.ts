// @ts-nocheck
// §12.2 Event Spine — GET a single event by eventId
// GET /api/sgtx/constitutional/events/[id]
import { NextResponse } from "next/server";
import { getEvent } from "@/lib/sgtx/event-spine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const event = await getEvent(id);
    if (!event) {
      return NextResponse.json(
        { error: "event not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ event });
  } catch (err: any) {
    logger.error("[api/constitutional/events/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
