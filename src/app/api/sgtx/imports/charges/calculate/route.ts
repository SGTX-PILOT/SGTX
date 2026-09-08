// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: calculate import charges
 * ============================================================================
 * POST /api/sgtx/imports/charges/calculate
 *   Body: { declaration_id }
 *   Returns: { ok, declaration_id, duty_usd, vat_usd, excise_usd,
 *              other_charges_usd, total_payable_usd, breakdown }
 *
 * Recomputes the full landed-duty + tax + port + broker breakdown for an
 * existing import declaration using the live G-02 tariff-engine (WITS /
 * hardcoded MFN / FTA preferential / anti-dumping) and G-18 tax-engine
 * (excise). Refreshes the totals back into the declaration JSON bundle.
 *
 * Idempotent.
 */

import { NextRequest, NextResponse } from "next/server";
import { calculateImportCharges } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.declaration_id) {
      return NextResponse.json(
        { ok: false, error: "declaration_id is required" },
        { status: 400 },
      );
    }
    const charges = await calculateImportCharges(body.declaration_id);
    return NextResponse.json({
      ok: true,
      declaration_id: charges.declarationId,
      duty_usd: charges.dutyUsd,
      vat_usd: charges.vatUsd,
      excise_usd: charges.exciseUsd,
      other_charges_usd: charges.otherChargesUsd,
      total_payable_usd: charges.totalPayableUsd,
      breakdown: charges.breakdown,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/charges/calculate] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND")
      || err?.message?.startsWith("DECLARATION_ID_REQUIRED")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
