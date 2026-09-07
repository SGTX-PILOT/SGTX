// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/sgtx/lab-tests/price-range
// ═══════════════════════════════════════════════════════════════════════════════
//
// Get an anonymised historical price range for a lab test capability in a
// given country. v17 §6 Step 5 — the buyer sees the price range as
// low/mid/high with provider names anonymised ("Provider A", "Provider B",
// ...). No per-provider price breakdown — that would be a pricing-driven
// ranking signal, which is forbidden by the Non-Marketplace Principle.
//
// Returns `{ low, mid, high, sample_count, anonymised: true, currency }`
// when the historical sample count is ≥ 3. Otherwise returns
// `{ low, mid, high, anonymised: true, currency, sample_count: <n>,
//    fallback: "default_band" }` with the DEFAULT_LAB_TEST_PRICE_BAND_USD
// estimate for the capability.
//
// NON-MARKETPLACE GUARDRAILS:
//   • The response does NOT include provider names.
//   • The response does NOT include per-provider prices.
//   • The `anonymised_providers` field is included for transparency only —
//     it is a list of "Provider A", "Provider B", ... labels used in the
//     historical sample. The caller should NOT display this as a per-provider
//     list.
//
// Query params:
//   capability_code — required. E.g. "PESTICIDE_RESIDUE", "MICROBIOLOGICAL".
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
  priceLabTest,
  DEFAULT_LAB_TEST_PRICE_BAND_USD,
  type LabTestType,
} from "@/lib/sgtx/lab-qc";

const _db = (freshDb ?? db) as typeof db;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const capabilityCode = req.nextUrl.searchParams.get("capability_code");
    const countryCode = req.nextUrl.searchParams.get("country_code");

    if (!capabilityCode) {
      return NextResponse.json(
        { error: "capability_code is required (e.g. 'PESTICIDE_RESIDUE')" },
        { status: 400 },
      );
    }
    if (!countryCode) {
      return NextResponse.json(
        { error: "country_code is required (ISO 3166-1 alpha-2)" },
        { status: 400 },
      );
    }

    const cap = capabilityCode.toUpperCase() as LabTestType;
    const historical = await getAnonymisedPriceRange(cap, countryCode);

    if (historical) {
      return NextResponse.json({
        low: historical.low,
        mid: historical.mid,
        high: historical.high,
        sample_count: historical.sample_count,
        anonymised: true,
        currency: historical.currency,
        // The anonymised_providers field is included for transparency. It
        // is a list of "Provider A", "Provider B", ... labels used in the
        // historical sample. The caller SHOULD NOT display per-provider
        // prices — that would constitute a marketplace ranking signal.
        anonymised_providers: historical.anonymised_providers,
        source: "historical_anonymised",
      });
    }

    // Fallback to default price band when insufficient historical samples.
    const estimate = await priceLabTest(cap, countryCode);
    return NextResponse.json({
      low: estimate.estimated_low,
      mid: estimate.estimated_mid,
      high: estimate.estimated_high,
      sample_count: 0,
      anonymised: true,
      currency: estimate.currency,
      source: "default_band",
      // Non-marketplace note: the default band is a coarse reference
      // estimate, NOT a competitive quote. The buyer must request an
      // actual quote from a specific lab (selected explicitly via GTID).
      note: "Insufficient historical samples (< 3). Showing default price band reference. Request a quote from a specific lab for an actual price.",
      fallback_band:
        DEFAULT_LAB_TEST_PRICE_BAND_USD[cap] ?? null,
    });
  } catch (e: any) {
    logger.error("[lab-tests/price-range GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
