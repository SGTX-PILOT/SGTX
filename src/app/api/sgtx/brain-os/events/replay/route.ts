import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { eventBus } from "@/lib/sgtx/brain-os/core/event-bus";
import type { BrainEventType } from "@/lib/sgtx/brain-os/core/types";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

// POST /api/sgtx/brain-os/events/replay
// Replays events from the in-memory event log (ring buffer). Used by:
//   • module recovery (newly-registered module can replay past events)
//   • admin forensic review
//   • integration tests
//
// Body:
//   { fromTimestamp?: string (ISO 8601), types?: BrainEventType[] }
//
// Returns:
//   { replayed: number, fromTimestamp, types }
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const body = await req.json().catch(() => ({} as any));
    const fromTimestamp: string | undefined =
      typeof body?.fromTimestamp === "string" ? body.fromTimestamp : undefined;
    const types: BrainEventType[] | undefined = Array.isArray(body?.types)
      ? body.types
      : undefined;

    const replayed = await eventBus.replay(fromTimestamp, types);

    return NextResponse.json({
      ok: true,
      replayed,
      fromTimestamp: fromTimestamp ?? null,
      types: types ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[brain-os/events/replay POST] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Event replay failed" },
      { status: 500 },
    );
  }
}
