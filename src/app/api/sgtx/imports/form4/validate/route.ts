// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: validate Form 4 requirement
 * ============================================================================
 * POST /api/sgtx/imports/form4/validate
 *   Body: { hs_code, dest_country, importer_gtid }
 *   Returns: { ok, required, reason, permit_id, dest_country }
 *
 * Returns whether a Form 4 (Egyptian GOEIC import permit) is required for
 * the (HS code, destination country, importer) tuple, and whether the
 * importer already holds a stored permit reference (read from the importer's
 * most recent CustomsDeclaration etaXml bundle's `form4PermitId` field).
 *
 * For non-Egypt destinations the function returns `required: false` with a
 * note that the caller should consult the local restricted-goods registry
 * (production would consult each country's GOEIC-equivalent).
 */

import { NextRequest, NextResponse } from "next/server";
import { validateForm4Requirement } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body) {
      return NextResponse.json({ ok: false, error: "Body is required" }, { status: 400 });
    }
    const hsCode = body.hs_code || body.hsCode;
    const destCountry = body.dest_country || body.destCountry;
    const importerGtid = body.importer_gtid || body.importerGtid;
    if (!hsCode) {
      return NextResponse.json({ ok: false, error: "hs_code is required" }, { status: 400 });
    }
    if (!destCountry) {
      return NextResponse.json({ ok: false, error: "dest_country is required" }, { status: 400 });
    }
    if (!importerGtid) {
      return NextResponse.json({ ok: false, error: "importer_gtid is required" }, { status: 400 });
    }
    const result = await validateForm4Requirement(hsCode, destCountry, importerGtid);
    return NextResponse.json({
      ok: true,
      required: result.required,
      reason: result.reason,
      permit_id: result.permitId,
      dest_country: result.destCountry,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/form4/validate] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("HS_CODE_REQUIRED")
      || err?.message?.startsWith("DEST_COUNTRY_REQUIRED")
      || err?.message?.startsWith("IMPORTER_GTID_REQUIRED")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
