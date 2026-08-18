// GET /api/sgtx/valuation/disputes?ustn=X
//
// List valuation disputes for a USTN, ordered by most recent first.
//
// Query params:
//   ?ustn=USTN-...         (required)
//   ?status=PENDING        (optional — filter by status)
//
// Response:
//   { ustn, disputes: [...], count }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const status = url.searchParams.get("status");

    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const where: any = { ustn };
    if (status) where.status = status.toUpperCase();

    let disputes: any[] = [];
    try {
      disputes = await db.valuationDispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    } catch (e: any) {
      logger.error("[valuation/disputes] query failed", { ustn, error: e?.message || String(e) });
      return NextResponse.json({ error: "Query failed (see server logs)" }, { status: 500 });
    }

    return NextResponse.json({ ustn, disputes, count: disputes.length });
  } catch (e: any) {
    logger.error("[valuation/disputes] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
