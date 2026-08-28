// @ts-nocheck
/**
 * SGTX Customs Gateway — Events API
 * GET /api/sgtx/customs-gateway/events?ustn=<USTN>
 *   Returns: CustomsEvent[] for the given USTN (oldest first)
 * GET /api/sgtx/customs-gateway/events?adapterId=<ID>
 *   Returns: CustomsEvent[] for the given adapter (oldest first)
 * GET /api/sgtx/customs-gateway/events
 *   Returns: the list of canonical customs event types + sample subjects
 */

import { NextRequest, NextResponse } from "next/server";
import { getEventsByUSTN, getEventsByAdapter, CANONICAL_CUSTOMS_EVENT_TYPES } from "@/lib/sgtx/customs-gateway/event-processing";
import { CUSTOMS_EVENT_TYPES, getCustomsSubject } from "@/lib/sgtx/customs-gateway/nats-subjects";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustn = searchParams.get("ustn");
    const adapterId = searchParams.get("adapterId");

    if (ustn) {
      const events = await getEventsByUSTN(ustn);
      return NextResponse.json({ ok: true, ustn, count: events.length, events });
    }
    if (adapterId) {
      const events = await getEventsByAdapter(adapterId);
      return NextResponse.json({ ok: true, adapterId, count: events.length, events });
    }

    // Default — list canonical event types + NATS subject examples.
    const sampleSubjects = CUSTOMS_EVENT_TYPES.map((t) =>
      getCustomsSubject("us", t, "GTID-AB12CD34"),
    );
    return NextResponse.json({
      ok: true,
      canonicalEventTypes: CANONICAL_CUSTOMS_EVENT_TYPES,
      natsEventTypes: CUSTOMS_EVENT_TYPES,
      sampleSubjects,
      usage: {
        listByUstn: "GET /api/sgtx/customs-gateway/events?ustn=<USTN>",
        listByAdapter: "GET /api/sgtx/customs-gateway/events?adapterId=<ID>",
      },
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/events] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
