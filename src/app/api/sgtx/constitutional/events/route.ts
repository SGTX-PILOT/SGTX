// @ts-nocheck
// §12-18 Event Spine — POST (appendEvent) + GET (getEventHistory)
// POST /api/sgtx/constitutional/events        body: full AppendEventInput
// GET  /api/sgtx/constitutional/events?ustn=X
import { NextResponse } from "next/server";
import { appendEvent, getEventHistory } from "@/lib/sgtx/event-spine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.eventType) {
      return NextResponse.json(
        { error: "eventType required in body" },
        { status: 400 },
      );
    }
    const ev = await appendEvent(body);
    if (!ev) {
      return NextResponse.json(
        { error: "appendEvent failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ event: ev });
  } catch (err: any) {
    logger.error("[api/constitutional/events] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const history = await getEventHistory(ustn);
    return NextResponse.json({ events: history, count: history.length });
  } catch (err: any) {
    logger.error("[api/constitutional/events] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
