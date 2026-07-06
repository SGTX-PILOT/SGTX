import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// GET /api/sgtx/customs-declaration/list
//
// Lists customs declarations for the regulator (GOV) oversight view, with
// optional filters. The CBR portal already receives its assigned declarations
// via /api/sgtx/dashboard (filtered by brokerGtid); this endpoint serves the
// GOV customs tab which needs visibility into ALL declarations regardless of
// broker.
//
// Query params (all optional):
//   ?status=SUBMITTED       — single status or comma-separated list
//   ?broker=GTID             — restrict to a broker
//   ?regime=EXPORT|IMPORT    — restrict to a regime
//   ?limit=100               — max results (default 100, capped at 500)
//
// Returns: { ok, declarations, total }
export async function GET(req: NextRequest) {
  try {
    const status  = req.nextUrl.searchParams.get("status");
    const broker  = req.nextUrl.searchParams.get("broker");
    const regime  = req.nextUrl.searchParams.get("regime");
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitRaw || "100", 10) || 100, 1), 500);

    const where: any = {};
    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (broker) where.brokerGtid = broker;
    if (regime) where.regime = regime.toUpperCase();

    const declarations = await db.customsDeclaration.findMany({
      where,
      include: {
        trade: { include: { seller: true, buyer: true } },
        broker: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ ok: true, declarations, total: declarations.length });
  } catch (e: any) {
    logger.error("[customs-declaration/list] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to list customs declarations" }, { status: 500 });
  }
}
