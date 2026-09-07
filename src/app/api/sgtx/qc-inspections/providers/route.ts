// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/sgtx/qc-inspections/providers
// ═══════════════════════════════════════════════════════════════════════════════
//
// List QC providers that cover the given country (optionally for a specific
// capability code). Geography-aware per v17 §6 Step 6 — only providers
// with `ProviderPortCoverage` in the requested country are returned.
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • The response is sorted DETERMINISTICALLY by GTID (alphabetical).
//     NO ranking, NO scoring, NO "best match", NO "you might also like".
//   • The caller MUST explicitly select a provider GTID from the list.
//
// Query params:
//   country_code    — ISO 3166-1 alpha-2. Required.
//   capability_code — optional. E.g. "PRE_SHIPMENT_QC", "LOADING_SUPERVISION".
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { findQcProvidersForCountry } from "@/lib/sgtx/lab-qc";

const _db = (freshDb ?? db) as typeof db;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const countryCode = req.nextUrl.searchParams.get("country_code");
    const capabilityCode = req.nextUrl.searchParams.get("capability_code");

    if (!countryCode) {
      return NextResponse.json(
        {
          error:
            "country_code is required (ISO 3166-1 alpha-2, e.g. 'EG', 'DE')",
        },
        { status: 400 },
      );
    }

    const providers = await findQcProvidersForCountry(
      countryCode,
      capabilityCode,
    );

    return NextResponse.json({
      providers,
      count: providers.length,
      // *** NON-MARKETPLACE GUARDRAIL ***
      // The list is sorted DETERMINISTICALLY by GTID (alphabetical) — never
      // ranked, never scored, never recommended. The caller MUST explicitly
      // select a provider GTID from this list.
      sort: "deterministic_alphabetical_by_gtid",
      non_marketplace: true,
      anonymised: false,
      filters: {
        country_code: countryCode.toUpperCase(),
        capability_code: capabilityCode ? capabilityCode.toUpperCase() : null,
      },
    });
  } catch (e: any) {
    logger.error("[qc-inspections/providers GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
