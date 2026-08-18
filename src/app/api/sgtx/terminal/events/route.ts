// GET /api/sgtx/terminal/events?ustn=X — list terminal events for a shipment
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || "";

    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const events = await (db as any).terminalEvent.findMany({
      where: { ustn },
      orderBy: { receivedAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      events: events || [],
      count: (events || []).length,
    });
  } catch (e: any) {
    logger.error("[terminal/events] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
