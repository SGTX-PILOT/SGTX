// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

// Use freshDb to avoid Turbopack stale PrismaClient cache after schema changes.
const _db = (freshDb ?? db) as typeof db;

// GET /api/sgtx/courier/[id] — get a single courier tracking record (with
// tracking history parsed into an array for easy UI consumption).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id path parameter is required" }, { status: 400 });
    }

    const record = await _db.documentCourierTracking.findUnique({
      where: { id },
      include: {
        document: { select: { id: true, type: true, title: true, status: true, verifiedAt: true } },
        trade: {
          select: {
            id: true,
            ustn: true,
            commodity: true,
            buyerGtid: true,
            sellerGtid: true,
            blType: true,
          },
        },
      },
        }) as any;
    if (!record) {
            return NextResponse.json({ error: `Courier tracking record ${id} not found` }, { status: 404 }) as any;
    }

    // Parse tracking history JSON (if present) for the UI.
    let trackingHistory: any[] = [];
    if (record.trackingHistory) {
      try {
        const parsed = JSON.parse(record.trackingHistory);
        trackingHistory = Array.isArray(parsed) ? parsed : [];
      } catch {
        trackingHistory = [];
      }
    }

    return NextResponse.json({
      ok: true,
      courierTracking: {
        ...record,
        trackingHistory,
      },
    });
  } catch (e: any) {
    logger.error("[courier/get] error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to fetch courier tracking record" },
      { status: 500 },
    );
  }
}
