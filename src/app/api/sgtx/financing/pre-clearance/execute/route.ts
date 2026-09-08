// @ts-nocheck
// POST /api/sgtx/financing/pre-clearance/execute
// v17 §7 — CFR Phase B: convert an ISSUED CFR into a formal Financing
// Request after the contract is locked.
//
// Auth: JWT (borrower only). The middleware injects `x-tenant-gtid`; we read
// it here and confirm it matches the borrowerGtid on the CFR row.
//
// Body:
//   {
//     cfr_id,
//     contract_lock_evidence: string   // hash / signature reference / document
//                                       // id proving the contract is locked
//   }
// Response:
//   { cfr_id, status: "EXECUTED", financing_request_id, executed_at }
//
// Side effects (delegated to `convertCfrToFinancingRequest` in the CFR lib):
//   • Validates: CFR is valid (G3U13), trade is LOCKED, buyer financing still
//     required, borrower is still the trade's buyer.
//   • Creates a FinancingRequest row seeded from the issued terms.
//   • Marks the CFR as EXECUTED; stores executedAt, financingRequestId, and
//     contractLockEvidence in the CfrMetadata JSON.
//   • Sends a Smart Inbox notification to the borrower confirming the
//     conversion.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { convertCfrToFinancingRequest } from "@/lib/sgtx/financing/cfr";

export const dynamic = "force-dynamic";

/** Minimum length for the contract lock evidence (hash or reference). */
const MIN_EVIDENCE_LENGTH = 8;

export async function POST(req: NextRequest) {
  try {
    // ── Auth: borrower GTID from middleware-injected header ────────────────
    const borrowerGtid =
      req.headers.get("x-tenant-gtid") ||
      req.headers.get("x-tenant-gtid".toLowerCase());

    if (!borrowerGtid) {
      return NextResponse.json(
        { error: "Authentication required (missing x-tenant-gtid header)." },
        { status: 401 },
      );
    }

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const cfrId = body?.cfr_id || body?.cfrId || body?.preClearanceId;
    const contractLockEvidence =
      (typeof body?.contract_lock_evidence === "string" && body.contract_lock_evidence) ||
      (typeof body?.contractLockEvidence === "string" && body.contractLockEvidence) ||
      "";

    if (!cfrId) {
      return NextResponse.json(
        { error: "cfr_id is required." },
        { status: 400 },
      );
    }
    if (contractLockEvidence.trim().length < MIN_EVIDENCE_LENGTH) {
      return NextResponse.json(
        {
          error: `contract_lock_evidence is required (hash, signature reference, or document id; min ${MIN_EVIDENCE_LENGTH} chars).`,
        },
        { status: 400 },
      );
    }

    // ── Authorization: only the CFR's borrower may execute it ─────────────
    const cfr = await db.financingPreClearanceRequest.findUnique({
      where: { id: cfrId },
    });
    if (!cfr) {
      return NextResponse.json(
        { error: `CFR ${cfrId} not found.` },
        { status: 404 },
      );
    }
    if (cfr.borrowerGtid !== borrowerGtid) {
      return NextResponse.json(
        { error: "Not authorized — only the borrower may execute this CFR." },
        { status: 403 },
      );
    }

    // ── Phase B conversion (lib performs all G3U13 + contract-lock checks) ─
    let conversion: { financingRequestId: string; financingRequestInternalId: string };
    try {
      conversion = await convertCfrToFinancingRequest(cfrId, contractLockEvidence.trim());
    } catch (e: any) {
      // Map validation failures to 409 (state conflict) — the request itself
      // is well-formed, but the CFR/trade state does not permit execution.
      const msg = e?.message || "CFR conversion failed.";
      const status =
        /not found/i.test(msg) ? 404 :
        /not authorized|does not match/i.test(msg) ? 403 :
        409;
      return NextResponse.json(
        { error: msg, cfr_id: cfrId },
        { status },
      );
    }

    // ── Smart Inbox notification: confirm conversion to the borrower ───────
    await db.inboxItem.create({
      data: {
        tenantGtid: cfr.borrowerGtid,
        category: "FINANCING_PRE_CLEARANCE",
        priority: 80,
        title: `CFR executed → Financing Request ${conversion.financingRequestId}`,
        description:
          `Your Conditional Financing Reference has been converted to a formal ` +
          `Financing Request (${conversion.financingRequestId}). The financier will ` +
          `now be notified to confirm the indicative terms and proceed to disbursement.`,
        ctaLabel: "View Financing Request",
        dismissed: false,
      },
    }).catch(() => {
      /* non-fatal */
    });

    logger.info("cfr.executed", {
      cfrId,
      financingRequestId: conversion.financingRequestId,
      financingRequestInternalId: conversion.financingRequestInternalId,
      borrowerGtid: cfr.borrowerGtid,
      contractLockEvidence: contractLockEvidence.trim(),
    });

    return NextResponse.json({
      ok: true,
      cfr_id: cfrId,
      status: "EXECUTED",
      financing_request_id: conversion.financingRequestId,
      financing_request_internal_id: conversion.financingRequestInternalId,
      executed_at: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/execute] error:", e);
    return NextResponse.json(
      { error: "CFR execution failed", detail: e?.message },
      { status: 500 },
    );
  }
}
