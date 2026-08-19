// POST /api/sgtx/trade-events/record — Append a new event to the trade event
// hash-chain graph.
//
// Body:
//   {
//     ustn?,                    // null for system-wide events
//     eventType,                // TRADE_REQUESTED | SGTX_FEE_PAID | ...
//     description?,
//     metadata?: object,        // any JSON-serializable object
//     actorGtid?,
//     source?                   // SYSTEM | USER | API | WEBHOOK | CRON (default "API")
//   }
//
// On success, the engine computes the eventHash from the previousHash + the
// event payload + createdAt, persists the row, and returns the full record.
//
// Response:
//   { ok, event: { id, ustn, eventType, eventHash, previousHash, createdAt, ... } }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordTradeEvent } from "@/lib/sgtx/trade-events";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn = null,
      eventType,
      description,
      metadata,
      actorGtid,
      source = "API",
    } = body || {};

    if (!eventType) {
      return NextResponse.json({ error: "eventType is required" }, { status: 400 });
    }

    // Serialize metadata defensively — the engine will JSON.stringify it
    let serializedMeta: Record<string, any> | null = null;
    if (metadata && typeof metadata === "object") {
      try {
        serializedMeta = metadata;
      } catch {
        serializedMeta = null;
      }
    }

    const event = await recordTradeEvent({
      ustn,
      eventType,
      description,
      metadata: serializedMeta,
      actorGtid,
      source,
    });

    if (!event) {
      return NextResponse.json(
        { ok: false, error: "Failed to record trade event" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, event });
  } catch (e: any) {
    logger.error("[trade-events/record] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
