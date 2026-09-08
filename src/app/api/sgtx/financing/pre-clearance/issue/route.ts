// @ts-nocheck
// POST /api/sgtx/financing/pre-clearance/issue
// v17 §7 — CFR Phase A step 3: Financier issues a Conditional Financing
// Reference (CFR) — a conditional, time-bounded (90-day) approval.
//
// Auth: JWT (financier only). The middleware injects `x-tenant-gtid` after
// verifying the session token; we read it here and confirm it matches the
// financierGtid on the CFR row.
//
// Body:
//   {
//     cfr_id,
//     conditions: string[],                 // free-text conditions list
//     apr_indicative: number|null,          // e.g. 7.5
//     max_amount: number|null,              // USD cap
//     tenor_days: number|null,              // e.g. 90
//     collateral_required: string|null,     // GOODS|WAREHOUSE_RECEIPT|RECEIVABLES|NONE
//     note_to_borrower: string|null
//   }
// Response:
//   { cfr_id, status: "ISSUED", cfr_reference, issued_at, expires_at, conditions }
//
// Side effects:
//   • Generates a unique cfr_reference (CFR-yyyyMMddHHmmss-XXXXXX).
//   • Sets status=ISSUED, respondedAt=now, validityUntil=now+90 days.
//   • Persists the issued terms in:
//       - conditionalAmountMax (max_amount), conditionalApr (apr_indicative) —
//         legacy columns kept for back-compat with /respond.
//       - conditions column — JSON-encoded CfrMetadata with the full issued
//         terms (tenorDays, collateralRequired, noteToBorrower, etc.).
//   • Sends a Smart Inbox notification to the borrower.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  CFR_STATUSES,
  CFR_VALIDITY_DAYS,
  getCfrExpiryDate,
  generateCfrReference,
  parseCfrMetadata,
  stringifyCfrMetadata,
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
    const conditions: string[] = Array.isArray(body?.conditions)
      ? body.conditions.map((c: any) => String(c)).filter((s: string) => s.length > 0)
      : [];
    const aprIndicative =
      typeof body?.apr_indicative === "number"
        ? body.apr_indicative
        : typeof body?.apr === "number"
          ? body.apr
          : null;
    const maxAmount =
      typeof body?.max_amount === "number"
        ? body.max_amount
        : typeof body?.conditionalAmountMax === "number"
          ? body.conditionalAmountMax
          : null;
    const tenorDays =
      typeof body?.tenor_days === "number"
        ? body.tenor_days
        : typeof body?.tenorDays === "number"
          ? body.tenorDays
          : null;
    const collateralRequired =
      typeof body?.collateral_required === "string"
        ? body.collateral_required
        : typeof body?.collateral === "string"
          ? body.collateral
          : null;
    const noteToBorrower =
      typeof body?.note_to_borrower === "string"
        ? body.note_to_borrower
        : typeof body?.note === "string"
          ? body.note
          : null;

    if (!cfrId) {
      return NextResponse.json(
        { error: "cfr_id is required." },
        { status: 400 },
      );
    }
    if (maxAmount === null || !(maxAmount > 0)) {
      return NextResponse.json(
        { error: "max_amount must be a positive number." },
        { status: 400 },
      );
    }
    if (aprIndicative !== null && (aprIndicative < 0 || aprIndicative > 100)) {
      return NextResponse.json(
        { error: "apr_indicative must be between 0 and 100 (percent)." },
        { status: 400 },
      );
    }
    if (tenorDays !== null && !(tenorDays >= 1 && tenorDays <= 365)) {
      return NextResponse.json(
        { error: "tenor_days must be between 1 and 365." },
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
        { error: "Not authorized — only the assigned financier may issue this CFR." },
        { status: 403 },
      );
    }

    // ── State guard: only REQUESTED or REVIEWED may be issued ───────────────
    const ALLOWED = [CFR_STATUSES.REQUESTED, CFR_STATUSES.REVIEWED];
    if (!ALLOWED.includes(cfr.status as any)) {
      return NextResponse.json(
        {
          error: `CFR is in state ${cfr.status} — cannot be issued.`,
          cfr_id: cfr.id,
          status: cfr.status,
        },
        { status: 409 },
      );
    }

    // ── Issue ────────────────────────────────────────────────────────────────
    const issuedAt = new Date();
    const expiresAt = getCfrExpiryDate(issuedAt); // issuedAt + 90 days
    const cfrReference = generateCfrReference();

    const meta = parseCfrMetadata(cfr.conditions);
    meta.conditions = conditions;
    meta.aprIndicative = aprIndicative;
    meta.maxAmount = maxAmount;
    meta.tenorDays = tenorDays;
    meta.collateralRequired = collateralRequired;
    meta.noteToBorrower = noteToBorrower;
    meta.issuedAt = issuedAt.toISOString();
    meta.expiresAt = expiresAt.toISOString();
    meta.reviewedBy = financierGtid;

    const updated = await db.financingPreClearanceRequest.update({
      where: { id: cfr.id },
      data: {
        status: CFR_STATUSES.ISSUED,
        cfrReference,
        conditionalAmountMax: maxAmount,
        conditionalApr: aprIndicative,
        validityUntil: expiresAt,
        respondedAt: issuedAt,
        conditions: stringifyCfrMetadata(meta),
      },
    });

    // ── Smart Inbox notification to the borrower ────────────────────────────
    // InboxItem.priority is Int (50 default; 90 = high, 30 = low).
    const aprText = aprIndicative !== null ? `${aprIndicative}% APR (indicative)` : "APR TBD at formal execution";
    const tenorText = tenorDays !== null ? `${tenorDays} days tenor` : "tenor TBD";
    await db.inboxItem.create({
      data: {
        tenantGtid: cfr.borrowerGtid,
        category: "FINANCING_PRE_CLEARANCE",
        priority: 90,
        title: `CFR issued: ${cfrReference}`,
        description:
          `Your financier has issued a Conditional Financing Reference. ` +
          `Maximum amount: $${maxAmount.toLocaleString()}. ${aprText}. ${tenorText}. ` +
          `Valid for ${CFR_VALIDITY_DAYS} days (expires ${expiresAt.toISOString().slice(0, 10)}). ` +
          `Exercise the CFR after contract lock to convert it to a formal Financing Request.`,
        ctaLabel: "View in Money",
        dismissed: false,
      },
    }).catch(() => {
      /* non-fatal — notification failure must not block issuance */
    });

    logger.info("cfr.issued", {
      cfrId: updated.id,
      cfrReference,
      financierGtid,
      borrowerGtid: cfr.borrowerGtid,
      maxAmount,
      aprIndicative,
      tenorDays,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({
      ok: true,
      cfr_id: updated.id,
      cfr_reference: cfrReference,
      status: updated.status,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      validity_days: CFR_VALIDITY_DAYS,
      conditions: {
        max_amount: maxAmount,
        apr_indicative: aprIndicative,
        tenor_days: tenorDays,
        collateral_required: collateralRequired,
        note_to_borrower: noteToBorrower,
        conditions: conditions,
      },
    });
  } catch (e: any) {
    logger.error("[financing/pre-clearance/issue] error:", e);
    return NextResponse.json(
      { error: "CFR issue failed", detail: e?.message },
      { status: 500 },
    );
  }
}
