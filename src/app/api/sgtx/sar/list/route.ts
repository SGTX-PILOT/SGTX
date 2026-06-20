import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/sar/list
// Blueprint Part 1.12.5 — list all SARs for compliance audit.
// Optional query: ?status=DRAFT|APPROVED_FOR_FILING|FILED|REJECTED
//                  ?detectionRule=volume_spike|circular_trade|...
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const detectionRule = sp.get("detectionRule");
  const limit = Math.min(Number(sp.get("limit") || "100"), 500);

  const where: any = {};
  if (status) where.draftStatus = status;
  if (detectionRule) where.detectionRule = detectionRule;

  const sars = await db.suspiciousActivityReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Summary counts for the compliance dashboard
  const all = await db.suspiciousActivityReport.groupBy({
    by: ["draftStatus"],
    _count: { _all: true },
  });

  const summary: Record<string, number> = {};
  for (const r of all) summary[r.draftStatus] = r._count._all;

  return NextResponse.json({
    sars,
    count: sars.length,
    summary,
    filters: { status, detectionRule, limit },
  });
}
