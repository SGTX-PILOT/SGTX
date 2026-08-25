// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

const CATEGORY_CRITICALITY: Record<string, number> = {
  DISPUTE: 100, COMPLIANCE: 90, REGULATORY_OVERSIGHT: 85, NEW_OFFER: 70,
  NEGOTIATION: 60, GENERAL: 40,
};

export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    if (!tenantGtid) return NextResponse.json({ ok: false, error: "tenantGtid required" }, { status: 400 });
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
    const items = await db.inboxItem.findMany({
      where: { tenantGtid }, orderBy: { priority: "desc" }, take: limit * 2,
    });
    const now = Date.now();
    const scored = items.map((item: any) => {
      const ageMs = now - new Date(item.createdAt).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      let urgencyScore = 25;
      if (ageHours < 1) urgencyScore = 100;
      else if (ageHours < 6) urgencyScore = 75;
      else if (ageHours < 24) urgencyScore = 50;
      const criticalityScore = CATEGORY_CRITICALITY[item.category] || 50;
      const smartPriority = (item.priority * 0.4) + (50 * 0.3) + (urgencyScore * 0.2) + (criticalityScore * 0.1);
      return { ...item, smartPriority: Math.round(smartPriority * 10) / 10, ageHours: Math.round(ageHours * 10) / 10 };
    }).sort((a: any, b: any) => b.smartPriority - a.smartPriority).slice(0, limit);
    return NextResponse.json({ ok: true, items: scored, count: scored.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, items: [], count: 0 }, { status: 500 });
  }
}
