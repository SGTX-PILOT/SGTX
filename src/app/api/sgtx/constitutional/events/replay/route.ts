// @ts-nocheck
// §86 Event Spine — replay mode: reconstruct state from event history
// POST /api/sgtx/constitutional/events/replay?ustn=X
import { NextResponse } from "next/server";
import { replayFromHistory } from "@/lib/sgtx/event-spine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const replay = await replayFromHistory(ustn);
    return NextResponse.json({ replay });
  } catch (err: any) {
    logger.error("[api/constitutional/events/replay] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
