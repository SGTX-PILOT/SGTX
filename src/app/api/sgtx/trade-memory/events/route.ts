import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// SGTX Trade Memory Layer (Blueprint Part 19)
// GET /api/sgtx/trade-memory/events — query trade memory events.
//
// Query params (any combination):
//   ?ustn=...           filter by USTN
//   ?tenantGtid=...     filter by tenant GTID
//   ?category=...       filter by category (LOGISTICS_DELAY | CUSTOMS_HOLD | ...)
//   ?limit=50           default 50, capped at 500
//
// Returns newest-first ordering.

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const ustn = sp.get("ustn") || undefined;
    const tenantGtid = sp.get("tenantGtid") || undefined;
    const category = sp.get("category") || undefined;

    const rawLimit = Number.parseInt(sp.get("limit") || "50", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 50;

    if (!ustn && !tenantGtid && !category) {
      return NextResponse.json(
        { error: "Provide at least one filter: ustn, tenantGtid, or category" },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = {};
    if (ustn) where.ustn = ustn;
    if (tenantGtid) where.tenantGtid = tenantGtid;
    if (category) where.category = category;

    const events = await db.tradeMemoryEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Decode JSON metadata for caller convenience.
    const decoded = events.map((e) => {
      let metadata: unknown = null;
      if (e.eventMetadata) {
        try {
          metadata = JSON.parse(e.eventMetadata);
        } catch {
          metadata = e.eventMetadata;
        }
      }
      return { ...e, eventMetadata: metadata };
    });

    return NextResponse.json({ events: decoded });
  } catch (e: any) {
    console.error("[trade-memory/events] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to query trade memory events" },
      { status: 500 },
    );
  }
}
