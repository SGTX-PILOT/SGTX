// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/lab-tests/validate
// ═══════════════════════════════════════════════════════════════════════════════
//
// Validate the lab test requirements for a trade. v17 §6 Step 5 — for
// perishable commodities, MANDATORY lab tests must be locked (the buyer
// cannot remove them).
//
// The validation reads the Trade row + its LabTest rows + TradeLabRequirement
// rows and cross-references against the MANDATORY_LAB_TESTS table for the
// trade's HS code.
//
// Returns:
//   {
//     valid: boolean,
//     missing_mandatory: LabTestType[],  // mandatory tests not present
//     warnings: string[],                 // non-blocking
//     is_perishable: boolean,
//     hs_code: string | null,
//     matched_entry: MandatoryLabTestEntry | null,
//     mandatory_tests: LabTestType[],
//     recommended_tests: LabTestType[]
//   }
//
// Body:
//   { trade_id: string }  // OR { ustn: string } — either is accepted
//
// NON-MARKETPLACE GUARDRAILS:
//   • The validation never recommends specific providers.
//   • The validation never suggests "you might also like".
//   • Warnings are limited to compliance/regulatory concerns, never
//     marketplace pricing signals.
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { validateLabRequirements } from "@/lib/sgtx/lab-qc";

const _db = (freshDb ?? db) as typeof db;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tradeId: string | undefined = body.trade_id;
    const ustn: string | undefined = body.ustn;

    if (!tradeId && !ustn) {
      return NextResponse.json(
        { error: "trade_id or ustn is required" },
        { status: 400 },
      );
    }

    let resolvedTradeId = tradeId;
    if (!resolvedTradeId && ustn) {
      const trade = await _db.trade.findUnique({
        where: { ustn },
        select: { id: true },
      });
      if (!trade) {
        return NextResponse.json(
          { error: `Trade not found for USTN ${ustn}` },
          { status: 404 },
        );
      }
      resolvedTradeId = trade.id;
    }

    const result = await validateLabRequirements(resolvedTradeId!);

    return NextResponse.json({
      valid: result.valid,
      missing_mandatory: result.missing_mandatory,
      warnings: result.warnings,
      is_perishable: result.is_perishable,
      hs_code: result.hs_code,
      matched_entry: result.matched_entry,
      mandatory_tests: result.mandatory_tests,
      recommended_tests: result.recommended_tests,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[lab-tests/validate POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
