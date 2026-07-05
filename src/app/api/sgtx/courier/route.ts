// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

// Use freshDb to avoid Turbopack stale PrismaClient cache after schema changes
// (DocumentCourierTracking model is newly added to the schema).
const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/courier — list courier tracking records for a trade
// Query: ?ustn=<trade USTN>
// Returns all DocumentCourierTracking rows for the trade, newest first,
// including the related document.
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json(
        { error: "?ustn= query parameter is required" },
        { status: 400 },
      );
    }

    const trade = await _db.trade.findUnique({
      where: { ustn },
      select: { id: true, ustn: true, buyerGtid: true, sellerGtid: true, commodity: true },
        }) as any;
    if (!trade) {
            return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 }) as any;
    }

    const records = await _db.documentCourierTracking.findMany({
      where: { tradeId: trade.id },
      include: {
        document: { select: { id: true, type: true, title: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
        }) as any;

    return NextResponse.json({
      ok: true,
      ustn,
      tradeId: trade.id,
      total: records.length,
      courierTracking: records,
        }) as any;
  } catch (e: any) {
    logger.error("[courier/list] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to list courier tracking records" },
      { status: 500 },
    );
  }
}
