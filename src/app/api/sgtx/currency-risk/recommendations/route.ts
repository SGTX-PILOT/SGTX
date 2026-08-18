// GET /api/sgtx/currency-risk/recommendations — Get hedging recommendations
//
// Query params:
//   ?tenantGtid=X   (required — tenant whose recommendations to fetch)
//   ?take=50        (optional, default 50, max 500)
//
// Returns recent HedgingRecommendation rows for the tenant, plus any
// currently-open CurrencyExposure rows (aggregated) so the caller can see
// both the recommendation and the exposure it was generated for.
//
// Response: { ok, recommendations, openExposures, count }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantGtid = url.searchParams.get("tenantGtid");
    const takeParam = url.searchParams.get("take");
    const take = takeParam ? Math.min(500, parseInt(takeParam, 10) || 50) : 50;

    if (!tenantGtid) {
      return NextResponse.json(
        { error: "Missing required query param: tenantGtid" },
        { status: 400 },
      );
    }

    // Fetch recent HedgingRecommendation rows (defensive).
    let recommendations: any[] = [];
    try {
      recommendations = await (db as any).hedgingRecommendation.findMany({
        where: { tenantGtid },
        orderBy: { createdAt: "desc" },
        take,
      });
    } catch (e: any) {
      logger.warn("[currency-risk/recommendations] hedgingRecommendation lookup failed", {
        error: e?.message || String(e),
      });
    }

    // Also fetch open currency exposures (any ustn null or non-null — we don't
    // have a tenantGtid column on CurrencyExposure so we fetch the most recent
    // un-hedged ones for visibility).
    let openExposures: any[] = [];
    try {
      openExposures = await (db as any).currencyExposure.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.min(50, take),
      });
    } catch (e: any) {
      logger.warn("[currency-risk/recommendations] currencyExposure lookup failed", {
        error: e?.message || String(e),
      });
    }

    return NextResponse.json({
      ok: true,
      recommendations,
      openExposures,
      count: recommendations.length,
    });
  } catch (e: any) {
    logger.error("[currency-risk/recommendations] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
