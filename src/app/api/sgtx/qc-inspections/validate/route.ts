// @ts-nocheck — defensive; Prisma schema drift handled at runtime.
//
// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/sgtx/qc-inspections/validate
// ═══════════════════════════════════════════════════════════════════════════════
//
// Validate the QC inspection requirements for a trade. v17 §6 Step 6 —
// geography-aware: the QC provider assigned to the trade must cover the
// relevant country (destination for DESTINATION_QC, origin for the others).
//
// Returns:
//   {
//     valid: boolean,
//     missing: QcInspectionType[],     // mandatory QC types not present
//     warnings: string[],                // non-blocking (incl. coverage)
//     is_perishable: boolean,
//     hs_code: string | null,
//     matched_entry: MandatoryQcInspectionEntry | null,
//     qc_mandatory: boolean
//   }
//
// Body:
//   { trade_id: string }  // OR { ustn: string }
//
// NON-MARKETPLACE GUARDRAILS:
//   • The validation never recommends specific providers.
//   • Warnings never suggest "you might also like"; they only report
//     compliance/coverage gaps.
//
// Auth: middleware enforces a valid session JWT.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { validateQcRequirements } from "@/lib/sgtx/lab-qc";

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

    const result = await validateQcRequirements(resolvedTradeId!);

    return NextResponse.json({
      valid: result.valid,
      missing: result.missing,
      warnings: result.warnings,
      is_perishable: result.is_perishable,
      hs_code: result.hs_code,
      matched_entry: result.matched_entry,
      qc_mandatory: result.qc_mandatory,
      non_marketplace: true,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/validate POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
