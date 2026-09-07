// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/sgtx/lab-tests/providers
// ═══════════════════════════════════════════════════════════════════════════════
//
// List LAB providers that cover the given country (optionally for a specific
// capability code). Geography-aware per v17 §6 Step 5 — only providers
// with `ProviderPortCoverage` in the requested country are returned.
//
// NON-MARKETPLACE GUARDRAILS (HARD ENFORCED):
//   • The response is sorted DETERMINISTICALLY by GTID (alphabetical).
//     NO ranking, NO scoring, NO "best match", NO "you might also like".
//   • The caller MUST explicitly select a provider GTID from the list.
//   • `anonymised: false` — provider names are shown (this is the explicit
//     selection step, not the anonymised price-range step).
//
// Query params:
//   country_code    — ISO 3166-1 alpha-2 (e.g. "EG", "DE"). Required.
//   capability_code — optional. When supplied, only providers with this
//                     capability in their `serviceCapabilities` AND a
//                     matching `ProviderPortCoverage` row are returned.
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { findLabProvidersForCountry } from "@/lib/sgtx/lab-qc";

// Use freshDb to avoid Turbopack stale PrismaClient cache after schema changes.
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

    const providers = await findLabProvidersForCountry(
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
      // `anonymised: false` because this is the explicit selection step.
      // Provider names are shown so the buyer can pick a known counterpart.
      anonymised: false,
      filters: {
        country_code: countryCode.toUpperCase(),
        capability_code: capabilityCode ? capabilityCode.toUpperCase() : null,
      },
    });
  } catch (e: any) {
    logger.error("[lab-tests/providers GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
