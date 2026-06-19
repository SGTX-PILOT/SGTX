import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// SGTX Predictive Insights (Blueprint Part 19)
// GET /api/sgtx/trade-memory/insights — list insights for a tenant/USTN.
//
// Query params:
//   ?tenantGtid=...  filter by tenant GTID
//   ?ustn=...        filter by USTN
//   ?limit=50        default 50, capped at 500
//
// Returns newest-first ordering.

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tenantGtid = sp.get("tenantGtid") || undefined;
    const ustn = sp.get("ustn") || undefined;

    const rawLimit = Number.parseInt(sp.get("limit") || "50", 10);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 50;

    if (!tenantGtid && !ustn) {
      return NextResponse.json(
        { error: "Provide at least one filter: tenantGtid or ustn" },
        { status: 400 },
      );
    }

    const where: Record<string, unknown> = {};
    if (tenantGtid) where.tenantGtid = tenantGtid;
    if (ustn) where.ustn = ustn;

    const insights = await db.predictiveInsight.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ insights });
  } catch (e: any) {
    console.error("[trade-memory/insights] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list predictive insights" },
      { status: 500 },
    );
  }
}
