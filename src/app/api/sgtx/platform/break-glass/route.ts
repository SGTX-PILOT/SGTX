// GET /api/sgtx/platform/break-glass — list break-glass events (with filters)
//
// Query params:
//   ?status=ACTIVE|RESOLVED|EXPIRED   (default: all)
//   ?targetGtid=SGTX-...              (filter by tenant)
//   ?severity=HIGH|CRITICAL
//   ?limit=100                        (max 500)
//
// Returns: { events: [...], total, activeCount, resolvedCount }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const targetGtid = sp.get("targetGtid");
  const severity = sp.get("severity");
  const limit = Math.max(1, Math.min(500, parseInt(sp.get("limit") || "100", 10)));

  const where: any = {};
  if (status && ["ACTIVE", "RESOLVED", "EXPIRED"].includes(status)) where.status = status;
  if (targetGtid) where.targetGtid = targetGtid;
  if (severity && ["HIGH", "CRITICAL"].includes(severity)) where.severity = severity;

  const events = await _db.breakGlassEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Compute status counts across ALL events (ignore filters) for the summary header.
  const all = await _db.breakGlassEvent.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = { ACTIVE: 0, RESOLVED: 0, EXPIRED: 0 };
  for (const g of all) counts[g.status] = g._count._all;

  return NextResponse.json({
    ok: true,
    events,
    total: events.length,
    activeCount: counts.ACTIVE,
    resolvedCount: counts.RESOLVED,
    expiredCount: counts.EXPIRED,
  });
}
