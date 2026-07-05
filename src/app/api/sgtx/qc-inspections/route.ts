import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

// Use freshDb to avoid Turbopack stale PrismaClient cache after schema changes.
const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/qc-inspections — list QC inspections for a trade OR for a QC portal
// Query: ?ustn=    OR    ?qcGtid=
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const qcGtid = req.nextUrl.searchParams.get("qcGtid");

    if (!ustn && !qcGtid) {
      return NextResponse.json(
        { error: "Provide ?ustn= or ?qcGtid= query parameter" },
        { status: 400 },
      );
    }

    let where: any = {};
    const include = { qc: true, trade: { include: { buyer: true, seller: true } } };

    if (ustn) {
      const trade = await _db.trade.findUnique({ where: { ustn }, select: { id: true } });
      if (!trade) {
        return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
      }
      where = { tradeId: trade.id };
    } else if (qcGtid) {
      where = { qcGtid };
    }

    const inspections = await _db.qcInspection.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      qcInspections: inspections,
      total: inspections.length,
      filter: ustn ? { ustn } : { qcGtid },
    });
  } catch (e: any) {
    logger.error("[qc-inspections/list] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to list QC inspections" },
      { status: 500 },
    );
  }
}
