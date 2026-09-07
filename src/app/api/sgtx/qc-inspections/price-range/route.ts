// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/sgtx/qc-inspections/price-range
// ═══════════════════════════════════════════════════════════════════════════════
//
// Get an anonymised historical price range for a QC inspection capability
// in a given country. v17 §6 Step 6 — the buyer sees the price range as
// low/mid/high with provider names anonymised ("Provider A", "Provider B",
// ...). No per-provider price breakdown — that would be a pricing-driven
// ranking signal, which is forbidden by the Non-Marketplace Principle.
//
// Returns `{ low, mid, high, sample_count, anonymised: true, currency }`
// when the historical sample count is ≥ 3. Otherwise returns the
// DEFAULT_QC_INSPECTION_PRICE_BAND_USD fallback estimate for the capability.
//
// NON-MARKETPLACE GUARDRAILS:
//   • The response does NOT include provider names.
//   • The response does NOT include per-provider prices.
//
// Query params:
//   capability_code — required. E.g. "PRE_SHIPMENT_QC", "LOADING_SUPERVISION".
//   country_code     — required. ISO 3166-1 alpha-2.
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import {
  getAnonymisedPriceRange,
  priceQcInspection,
  DEFAULT_QC_INSPECTION_PRICE_BAND_USD,
  type QcInspectionType,
} from "@/lib/sgtx/lab-qc";

const _db = (freshDb ?? db) as typeof db;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const capabilityCode = req.nextUrl.searchParams.get("capability_code");
    const countryCode = req.nextUrl.searchParams.get("country_code");

    if (!capabilityCode) {
      return NextResponse.json(
        { error: "capability_code is required (e.g. 'PRE_SHIPMENT_QC')" },
        { status: 400 },
      );
    }
    if (!countryCode) {
      return NextResponse.json(
        { error: "country_code is required (ISO 3166-1 alpha-2)" },
        { status: 400 },
      );
    }

    const cap = capabilityCode.toUpperCase() as QcInspectionType;
    const historical = await getAnonymisedPriceRange(cap, countryCode);

    if (historical) {
      return NextResponse.json({
        low: historical.low,
        mid: historical.mid,
        high: historical.high,
        sample_count: historical.sample_count,
        anonymised: true,
        currency: historical.currency,
        anonymised_providers: historical.anonymised_providers,
        source: "historical_anonymised",
      });
    }

    // Fallback to default price band when insufficient historical samples.
    const estimate = await priceQcInspection(cap, countryCode);
    return NextResponse.json({
      low: estimate.estimated_low,
      mid: estimate.estimated_mid,
      high: estimate.estimated_high,
      sample_count: 0,
      anonymised: true,
      currency: estimate.currency,
      source: "default_band",
      note: "Insufficient historical samples (< 3). Showing default price band reference. Request a quote from a specific QC provider for an actual price.",
      fallback_band:
        DEFAULT_QC_INSPECTION_PRICE_BAND_USD[cap] ?? null,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/price-range GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
