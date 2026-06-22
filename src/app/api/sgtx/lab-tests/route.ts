import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

// Use freshDb to avoid Turbopack stale PrismaClient cache after schema changes.
const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/lab-tests — list lab tests for a trade OR for a lab portal
// Query: ?ustn=    OR    ?labGtid=
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const labGtid = req.nextUrl.searchParams.get("labGtid");

    if (!ustn && !labGtid) {
      return NextResponse.json(
        { error: "Provide ?ustn= or ?labGtid= query parameter" },
        { status: 400 },
      );
    }

    let where: any = {};
    const include = { lab: true, trade: { include: { buyer: true, seller: true } } };

    if (ustn) {
      const trade = await _db.trade.findUnique({ where: { ustn }, select: { id: true } });
      if (!trade) {
        return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
      }
      where = { tradeId: trade.id };
    } else if (labGtid) {
      where = { labGtid };
    }

    const labTests = await _db.labTest.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      labTests,
      total: labTests.length,
      filter: ustn ? { ustn } : { labGtid },
    });
  } catch (e: any) {
    console.error("[lab-tests/list] error:", e);
    return NextResponse.json({ error: e.message || "Failed to list lab tests" }, { status: 500 });
  }
}
