// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/sgtx/lab-tests/mandatory
// ═══════════════════════════════════════════════════════════════════════════════
//
// Get the MANDATORY / RECOMMENDED / OPTIONAL lab test tiers for a commodity
// (HS code) + origin/destination route. v17 §6 Step 5 — the buyer sees the
// tiered test list and MUST lock the mandatory tier for perishable
// commodities.
//
// The mandatory tier is RIA-driven (Regulation Import Authority). The
// destination country's import regulator publishes a list of mandatory
// tests. For v17 Phase 1 (Agricultural Exports MVP), the engine encodes
// EU + Codex + Egypt NFSA requirements.
//
// Returns:
//   {
//     mandatory:  LabTestType[],   // LOCKED for perishable commodities
//     recommended: LabTestType[], // buyer may opt out
//     optional:    LabTestType[], // buyer-added extras
//     is_perishable: boolean,
//     matched_entry: MandatoryLabTestEntry | null,
//     hs_code: string | null,
//     source_regulations: string[] // RIA references for the mandatory tier
//   }
//
// Query params:
//   hs_code        — required. HS code (4-10 digits, dots allowed).
//   origin_country — optional. ISO 3166-1 alpha-2.
//   dest_country   — optional. ISO 3166-1 alpha-2.
//
// NON-MARKETPLACE GUARDRAILS:
//   • The response does NOT include provider names. It is a tiered test
//     catalogue only. Provider selection is a separate explicit step.
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getLabTestTiersForCommodity } from "@/lib/sgtx/lab-qc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hsCode = req.nextUrl.searchParams.get("hs_code");
    const originCountry = req.nextUrl.searchParams.get("origin_country");
    const destCountry = req.nextUrl.searchParams.get("dest_country");

    if (!hsCode) {
      return NextResponse.json(
        {
          error:
            "hs_code is required (4-10 digit HS code, dots allowed — e.g. '0811.10')",
        },
        { status: 400 },
      );
    }

    const tiers = getLabTestTiersForCommodity(hsCode, originCountry, destCountry);

    return NextResponse.json({
      mandatory: tiers.mandatory,
      recommended: tiers.recommended,
      optional: tiers.optional,
      is_perishable: tiers.is_perishable,
      matched_entry: tiers.matched_entry,
      hs_code: hsCode,
      // The RIA-driven source regulations that justify the mandatory tier
      // (e.g. "EU Regulation (EC) 396/2005 — Pesticide MRLs"). Returned so
      // the buyer can see WHY a test is mandatory.
      source_regulations: tiers.matched_entry?.source_regulations ?? [],
      non_marketplace: true,
      // Perishable-lock note: when is_perishable=true, the mandatory tier
      // is LOCKED — the buyer cannot remove mandatory tests from the
      // selection set. The wizard must enforce this client-side AND the
      // validate endpoint will reject any submission that drops them.
      perishable_lock: tiers.is_perishable && tiers.mandatory.length > 0,
      filters: {
        hs_code: hsCode,
        origin_country: originCountry?.toUpperCase() ?? null,
        dest_country: destCountry?.toUpperCase() ?? null,
      },
    });
  } catch (e: any) {
    logger.error("[lab-tests/mandatory GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
