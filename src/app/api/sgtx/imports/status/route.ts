// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: check import status
 * ============================================================================
 * GET /api/sgtx/imports/status?declaration_id=X
 *   Returns: { ok, declaration_id, declaration_no, status, clearance_stage,
 *              payments_status, estimated_clearance, external_decl_id, acid,
 *              tracking_id, payments: [{ leg_id, payee, amount, state }] }
 *
 * Refreshes the clearance stage from the destination customs authority
 * (Nafeza for Egypt) and the per-leg payment states from the PSP, then
 * returns the consolidated status.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkImportStatus } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const declarationId = searchParams.get("declaration_id");
    if (!declarationId) {
      return NextResponse.json(
        { ok: false, error: "declaration_id query parameter is required" },
        { status: 400 },
      );
    }
    const status = await checkImportStatus(declarationId);
    return NextResponse.json({
      ok: true,
      declaration_id: status.declarationId,
      declaration_no: status.declarationNo,
      status: status.status,
      clearance_stage: status.clearanceStage,
      payments_status: status.paymentsStatus,
      estimated_clearance: status.estimatedClearance,
      external_decl_id: status.externalDeclId,
      acid: status.acid,
      tracking_id: status.trackingId,
      payments: status.payments,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/status] GET failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND")
      ? 404
      : err?.message?.startsWith("DECLARATION_ID_REQUIRED")
      ? 400
      : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
