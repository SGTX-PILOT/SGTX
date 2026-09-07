// @ts-nocheck
// POST /api/sgtx/financing/pre-clearance/reject
// v17 §7 — CFR Phase A step 3 (alt): Financier rejects the CFR request.
//
// Auth: JWT (financier only). The middleware injects `x-tenant-gtid` after
// verifying the session token; we read it here and confirm it matches the
// financierGtid on the CFR row.
//
// Body: { cfr_id, reason }
//   • reason is mandatory and must be ≥ 20 characters (v17 §7 — financiers
//     must give the borrower an actionable rationale, not a one-liner).
//
// Response: { cfr_id, status: "REJECTED", rejected_at, reason }
//
// Side effects:
//   • Sets status=REJECTED, respondedAt=now.
//   • Persists rejectionReason + rejectedAt in the CfrMetadata JSON.
//   • Sends a Smart Inbox notification to the borrower.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  CFR_STATUSES,
  parseCfrMetadata,
  stringifyCfrMetadata,
} from "@/lib/sgtx/financing/cfr";

export const dynamic = "force-dynamic";

/** Minimum length for a CFR rejection reason (v17 §7 — actionable feedback). */
const MIN_REASON_LENGTH = 20;

export async function POST(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const financierGtid =
      req.headers.get("x-tenant-gtid") ||
      req.headers.get("x-tenant-gtid".toLowerCase());

    if (!financierGtid) {
      return NextResponse.json(
        { error: "Authentication required (missing x-tenant-gtid header)." },
        { status: 401 },
      );
    }

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const cfrId = body?.cfr_id || body?.cfrId || body?.preClearanceId;
    const reason =
      (typeof body?.reason === "string" && body.reason) ||
      (typeof body?.rejection_reason === "string" && body.rejection_reason) ||
      "";

    if (!cfrId) {
      return NextResponse.json(
        { error: "cfr_id is required." },
        { status: 400 },
      );
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      return NextResponse.json(
        {
          error: `reason is required and must be at least ${MIN_REASON_LENGTH} characters (give the borrower actionable feedback).`,
        },
        { status: 400 },
      );
    }

    // ── Load CFR ───────────────────────────────────────────────────────────
    const cfr = await db.financingPreClearanceRequest.findUnique({
      where: { id: cfrId },
    });
    if (!cfr) {
      return NextResponse.json(
        { error: `CFR ${cfrId} not found.` },
        { status: 404 },
      );
    }

    // ── Authorization ────────────────────────────────────────────────────────
    if (cfr.financierGtid !== financierGtid) {
      return NextResponse.json(
        { error: "Not authorized — only the assigned financier may reject this CFR." },
        { status: 403 },
      );
    }

    // ── State guard: only REQUESTED or REVIEWED may be rejected ───────────
    const ALLOWED = [CFR_STATUSES.REQUESTED, CFR_STATUSES.REVIEWED];
    if (!ALLOWED.includes(cfr.status as any)) {
      return NextResponse.json(
        {
          error: `CFR is in state ${cfr.status} — cannot be rejected.`,
          cfr_id: cfr.id,
          status: cfr.status,
        },
        { status: 409 },
      );
    }

    // ── Reject ──────────────────────────────────────────────────────────────
    const rejectedAt = new Date();
    const meta = parseCfrMetadata(cfr.conditions);
    meta.rejectionReason = reason.trim();
    meta.rejectedAt = rejectedAt.toISOString();
    meta.reviewedBy = financierGtid;

    const updated = await db.financingPreClearanceRequest.update({
      where: { id: cfr.id },
      data: {
        status: CFR_STATUSES.REJECTED,
        respondedAt: rejectedAt,
        conditions: stringifyCfrMetadata(meta),
      },
    });

    // ── Smart Inbox notification to the borrower ────────────────────────────
    await db.inboxItem.create({
      data: {
        tenantGtid: cfr.borrowerGtid,
        category: "FINANCING_PRE_CLEARANCE",
        priority: 70,
        title: "Financing pre-clearance request declined",
        description:
          `Your financier has declined the Conditional Financing Reference request. ` +
          `Reason: ${reason.trim()} ` +
          `You may submit a new CFR request to a different financier or address the feedback and reapply.`,
        ctaLabel: "View in Money",
        dismissed: false,
      },
    }).catch(() => {
      /* non-fatal */
    });

    logger.info("cfr.rejected", {
      cfrId: updated.id,
      financierGtid,
      borrowerGtid: cfr.borrowerGtid,
      reason: reason.trim(),
    });

    return NextResponse.json({
      ok: true,
      cfr_id: updated.id,
      status: updated.status,
      rejected_at: rejectedAt.toISOString(),
      reason: reason.trim(),
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/reject] error:", e);
    return NextResponse.json(
      { error: "CFR rejection failed", detail: e?.message },
      { status: 500 },
    );
  }
}
