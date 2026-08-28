// @ts-nocheck
/**
 * SGTX Customs Gateway — Process Government Event API
 * POST /api/sgtx/customs-gateway/events/process
 *   Body: { rawEvent: any, adapterId: string }
 *   Returns: { ok, event: CustomsEvent }
 *
 * Runs the 10-step processGovernmentEvent pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { processGovernmentEvent } from "@/lib/sgtx/customs-gateway/event-processing";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    if (!body.rawEvent || typeof body.rawEvent !== "object") {
      return NextResponse.json(
        { ok: false, error: "rawEvent (object) is required" },
        { status: 400 },
      );
    }
    if (!body.adapterId || typeof body.adapterId !== "string") {
      return NextResponse.json(
        { ok: false, error: "adapterId (string) is required" },
        { status: 400 },
      );
    }

    const event = await processGovernmentEvent(body.rawEvent, body.adapterId);
    return NextResponse.json({ ok: true, event });
  } catch (err: any) {
    logger.error("[api/customs-gateway/events/process] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
