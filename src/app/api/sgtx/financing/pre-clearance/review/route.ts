// @ts-nocheck
// POST /api/sgtx/financing/pre-clearance/review
// v17 §7 — CFR Phase A step 2: Financier reviews a CFR request.
//
// Auth: JWT (financier only). The middleware injects `x-tenant-gtid` after
// verifying the session token; we read it here and confirm it matches the
// financierGtid on the CFR row.
//
// Body: { cfr_id }
// Response: { cfr_id, status: "REVIEWED", trade_digest, borrower_trust_passport, reviewed_at }
//
// Side effects:
//   • Marks the CFR status as REVIEWED (only if currently REQUESTED).
//   • Stamps reviewedAt + reviewedBy into the CfrMetadata JSON (conditions col).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  CFR_STATUSES,
  parseCfrMetadata,
  stringifyCfrMetadata,
  getBorrowerTrustPassport,
} from "@/lib/sgtx/financing/cfr";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ── Auth: financier GTID from middleware-injected header ────────────────
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

    if (!cfrId) {
      return NextResponse.json(
        { error: "cfr_id is required." },
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

    // ── Authorization: only the assigned financier may review ───────────────
    if (cfr.financierGtid !== financierGtid) {
      return NextResponse.json(
        { error: "Not authorized — only the assigned financier may review this CFR." },
        { status: 403 },
      );
    }

    // ── Idempotency: allow REVIEWED → REVIEWED re-review; reject from
    //    terminal states (ISSUED/REJECTED/EXECUTED/EXPIRED) ─────────────────
    const ALLOWED_FOR_REVIEW = [
      CFR_STATUSES.REQUESTED,
      CFR_STATUSES.REVIEWED,
    ];
    if (!ALLOWED_FOR_REVIEW.includes(cfr.status as any)) {
      return NextResponse.json(
        {
          error: `CFR is in terminal state ${cfr.status} — cannot be re-reviewed.`,
          cfr_id: cfr.id,
          status: cfr.status,
        },
        { status: 409 },
      );
    }

    // ── Compile the response payload ──────────────────────────────────────
    let tradeDigest: Record<string, any> = {};
    try {
      tradeDigest = cfr.tradeDigest ? JSON.parse(cfr.tradeDigest) : {};
    } catch {
      tradeDigest = {};
    }

    const borrowerTrustPassport = await getBorrowerTrustPassport(
      cfr.borrowerGtid,
    );

    // ── Persist REVIEWED state ─────────────────────────────────────────────
    const reviewedAt = new Date();
    const meta = parseCfrMetadata(cfr.conditions);
    meta.reviewedAt = reviewedAt.toISOString();
    meta.reviewedBy = financierGtid;

    const updated = await db.financingPreClearanceRequest.update({
      where: { id: cfr.id },
      data: {
        status: CFR_STATUSES.REVIEWED,
        respondedAt: reviewedAt,
        conditions: stringifyCfrMetadata(meta),
      },
    });

    logger.info("cfr.reviewed", {
      cfrId: cfr.id,
      financierGtid,
      borrowerGtid: cfr.borrowerGtid,
    });

    return NextResponse.json({
      ok: true,
      cfr_id: updated.id,
      status: updated.status,
      trade_digest: tradeDigest,
      borrower_trust_passport: borrowerTrustPassport,
      reviewed_at: reviewedAt.toISOString(),
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/review] error:", e);
    return NextResponse.json(
      { error: "CFR review failed", detail: e?.message },
      { status: 500 },
    );
  }
}
