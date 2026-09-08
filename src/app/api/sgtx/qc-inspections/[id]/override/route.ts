// @ts-nocheck
// SGTX v17 §12.5 — Conditional QC: override route (MULTISIG required)
//
// POST /api/sgtx/qc-inspections/[id]/override
//   Body: { overrideReason, overrideBy, newResult, governorSignature,
//           originalAiDetection?, photoHashes? }
//   Overrides the inspection's result. Requires:
//     - governorSignature: 16+ char hex string signed by the Platform Governor
//     - overrideReason: 20+ chars justification
//   Auto-creates a QcOverrideFlag row + a Dispute (type QC_OVERRIDE) for the
//   audit trail. Inspector licence revocation is a separate governor audit
//   step (call revokeInspectorLicence separately if misuse is detected).
//
// GET  /api/sgtx/qc-inspections/[id]/override
//   Returns the override history (QcOverrideFlag rows) for this inspection.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  overrideQcResult,
  revokeInspectorLicence,
} from "@/lib/sgtx/qc/conditional-qc";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const {
      overrideReason,
      overrideBy,
      newResult,
      governorSignature,
      originalAiDetection,
      photoHashes,
      revokeLicence,
      revocationReason,
    } = body ?? {};

    if (!overrideReason || !overrideBy || !newResult || !governorSignature) {
      return NextResponse.json(
        {
          error:
            "overrideReason, overrideBy, newResult, and governorSignature are all required.",
        },
        { status: 400 },
      );
    }
    if (!["PASS", "FAIL", "CONDITIONAL_PASS"].includes(newResult)) {
      return NextResponse.json(
        { error: 'newResult must be "PASS", "FAIL", or "CONDITIONAL_PASS"' },
        { status: 400 },
      );
    }

    const result = await overrideQcResult({
      inspectionId: id,
      overrideReason,
      overrideBy,
      newResult,
      governorSignature,
      originalAiDetection,
      photoHashes,
    });

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.reason, code: result.code },
        { status },
      );
    }

    // Optional: revoke the inspector's licence in the same call.
    let licenceRevocation: any = null;
    if (revokeLicence) {
      const rev = await revokeInspectorLicence({
        inspectorGtid: overrideBy,
        reason: revocationReason || overrideReason,
        revokedBy: "SGTX-PLATFORM-GOVERNOR",
      });
      licenceRevocation = rev;
    }

    return NextResponse.json({
      ok: true,
      overridden: result.overridden,
      new_status: result.newStatus,
      override_id: result.overrideId,
      signed_by: result.signedBy,
      licence_revoked: result.licenceRevoked,
      reason: result.reason,
      licence_revocation: licenceRevocation,
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/override POST]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const flags = await db.qcOverrideFlag.findMany({
      where: { inspectionId: id },
      orderBy: { flaggedAt: "desc" },
    });
    return NextResponse.json({
      ok: true,
      inspection_id: id,
      count: flags.length,
      overrides: flags.map((f: any) => ({
        id: f.id,
        ustn: f.ustn,
        original_ai_detection: f.originalAiDetection,
        inspector_classification: f.inspectorClassification,
        inspector_reason: f.inspectorReason,
        timestamp: f.timestamp?.toISOString?.() ?? f.timestamp ?? null,
        photo_hashes: (() => { try { return JSON.parse(f.photoHashes || "[]"); } catch { return []; } })(),
        flagged_at: f.flaggedAt?.toISOString?.() ?? f.flaggedAt ?? null,
      })),
    });
  } catch (e: any) {
    logger.error("[qc-inspections/[id]/override GET]", e);
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}
