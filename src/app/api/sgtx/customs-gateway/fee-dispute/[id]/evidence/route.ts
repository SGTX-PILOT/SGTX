// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute Evidence API
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/fee-dispute/[id]/evidence
 *   Returns: { ok, evidence } — the full §41 / §71 evidence package for
 *   this dispute (original quote, accepted fee, changed fee, supporting
 *   invoices, government references, service record, communications,
 *   user acceptance, broker response, Governor decisions, Loom hashes).
 *
 * Query: ?package=1 — returns the full USTN-wide evidence package
 *   across all disputes for this USTN (§71).
 *
 * L0: this endpoint READS evidence — it never mutates the original fee
 * record, quote, or evidence (§69 — append-only or versioned).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDispute } from "@/lib/sgtx/customs-gateway/fee-dispute/index";
import { gatherEvidence, generateEvidencePackage, verifyFeeIntegrity } from "@/lib/sgtx/customs-gateway/fee-dispute/evidence";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const dispute = await getDispute(id);
    if (!dispute) {
      return NextResponse.json({ ok: false, error: "Dispute not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const includePackage = searchParams.get("package") === "1";
    const includeIntegrity = searchParams.get("integrity") === "1";

    const evidence = await gatherEvidence(id);
    const response: any = { ok: true, disputeId: id, evidence };

    if (includePackage) {
      response.ustnPackage = await generateEvidencePackage(dispute.ustn);
    }
    if (includeIntegrity) {
      response.integrityReport = await verifyFeeIntegrity(dispute.ustn);
    }
    return NextResponse.json(response);
  } catch (err: any) {
    logger.error("[api/fee-dispute/[id]/evidence] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
