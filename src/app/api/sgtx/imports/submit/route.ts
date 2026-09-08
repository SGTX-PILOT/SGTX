// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: submit declaration to customs
 * ============================================================================
 * POST /api/sgtx/imports/submit
 *   Body: { declaration_id }
 *   Returns: { ok, submitted, declaration_id, batch_id, tracking_id,
 *              blocking_reason, external_decl_id, acid }
 *
 * Submits the import declaration to the destination country's customs
 * authority. For Egypt this calls the existing Nafeza adapter
 * (submitDeclaration) to file the ACI (Advance Cargo Information)
 * declaration and obtain the ACID. The local payment batch is created (if
 * not already present) and submitted to the PSP. A tracking ID is returned
 * for status polling.
 *
 * Blocked when Form 4 is required but no permit has been attached — the
 * caller must PATCH the declaration with form4_permit_id first.
 *
 * Idempotent — re-calling on an already-submitted declaration returns the
 * existing tracking ID without re-submitting to Nafeza.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitImportDeclaration } from "@/lib/sgtx/imports";
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
    const result = await submitImportDeclaration(body.declaration_id);

    // 422 when blocked (Form 4 permit missing).
    const status = !result.submitted && result.blockingReason ? 422 : 200;
    return NextResponse.json({
      ok: result.submitted,
      submitted: result.submitted,
      declaration_id: result.declarationId,
      batch_id: result.batchId,
      tracking_id: result.trackingId,
      blocking_reason: result.blockingReason,
      external_decl_id: result.externalDeclId,
      acid: result.acid,
    }, { status });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/submit] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND")
      || err?.message?.startsWith("DECLARATION_ID_REQUIRED")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
