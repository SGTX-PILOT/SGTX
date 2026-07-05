import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// GET /api/sgtx/trade/list — list all trades (used by GOV portal trade-flow monitor)
// Optional query params:
//   ?status=INITIATED       — filter by status (comma-separated for multiple)
//   ?limit=50               — max results (default 50, max 200)
//   ?tenant=GTID            — restrict to trades where the tenant is buyer or seller
//                             (GOV portal passes its own GTID but is typically not a
//                              trade party, so when no matches exist the route returns
//                              all trades for monitoring purposes)
export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get("status");
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const tenant = req.nextUrl.searchParams.get("tenant");

    const limit = Math.min(Math.max(parseInt(limitRaw || "50", 10) || 50, 1), 200);

    const where: any = {};
    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (tenant) {
      where.OR = [{ buyerGtid: tenant }, { sellerGtid: tenant }];
    }

    const trades = await db.trade.findMany({
      where,
      include: {
        buyer: true,
        seller: true,
        shipments: { orderBy: { sequence: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      trades,
      total: trades.length,
    });
  } catch (e: any) {
    logger.error("[trade/list] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
