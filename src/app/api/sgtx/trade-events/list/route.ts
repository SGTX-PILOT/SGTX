// GET /api/sgtx/trade-events/list?ustn=X — List TradeEvent rows for a USTN
// in ascending chronological order (oldest first). Optionally filter by
// eventType. Includes the `verify` query param to run chain verification
// alongside the list.
//
// Query:
//   ustn         — required (empty string for system-wide events with ustn=null)
//   eventType?  — filter
//   take?       — default 100, max 1000
//   verify?     — "true" to also run verifyEventChain() and include the result
//
// Response:
//   { ok, ustn, count, events, verification? }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { verifyEventChain } from "@/lib/sgtx/trade-events";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ustnRaw = searchParams.get("ustn");
    // Treat empty string as explicit null (system-wide events)
    const ustn = ustnRaw === null ? null : ustnRaw;
    if (ustn === null) {
      return NextResponse.json(
        { error: "ustn is required (pass empty string for system-wide events)" },
        { status: 400 },
      );
    }

    const eventType = searchParams.get("eventType") ?? undefined;
    const takeRaw = Number(searchParams.get("take") ?? 100);
    const take = Math.min(Math.max(1, isNaN(takeRaw) ? 100 : takeRaw), 1000);
    const verify = searchParams.get("verify") === "true";

    let events: any[] = [];
    try {
      events = await db.tradeEvent.findMany({
        where: {
          ustn: ustn || null, // empty string → null
          ...(eventType ? { eventType } : {}),
        },
        orderBy: { createdAt: "asc" },
        take,
      });
    } catch (e: any) {
      logger.error("[trade-events/list] DB query failed", {
        ustn,
        error: e?.message,
      });
      return NextResponse.json(
        { ok: false, ustn, count: 0, events: [], error: "Database query failed" },
        { status: 200 },
      );
    }

    let verification: any = undefined;
    if (verify) {
      try {
        verification = await verifyEventChain(ustn || null);
      } catch (e: any) {
        logger.warn("[trade-events/list] chain verification failed", {
          ustn,
          error: e?.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ustn,
      count: events.length,
      events,
      ...(verification ? { verification } : {}),
    });
  } catch (e: any) {
    logger.error("[trade-events/list] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
