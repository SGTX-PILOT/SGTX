// POST /api/sgtx/compliance-calendar/complete — Mark an event as completed
//
// Body:
//   { eventId: string, completedAt?: string (ISO) }
//
// Idempotent — re-marking an already-completed event returns success without
// mutating the row.
//
// Response: { ok, eventId, status, completedAt }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { markEventCompleted } from "@/lib/sgtx/compliance-calendar";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventId, completedAt } = body || {};

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing required field: eventId" },
        { status: 400 },
      );
    }

    const completionDate = completedAt ? new Date(completedAt) : new Date();
    if (isNaN(completionDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid completedAt — must be a valid ISO date string" },
        { status: 400 },
      );
    }

    const result = await markEventCompleted(eventId, completionDate);

    if (!result) {
      return NextResponse.json(
        { ok: false, error: `Event ${eventId} not found or persistence failed` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      eventId: result.id,
      status: result.status,
      completedAt: result.completedAt,
    });
  } catch (e: any) {
    logger.error("[compliance-calendar/complete] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
