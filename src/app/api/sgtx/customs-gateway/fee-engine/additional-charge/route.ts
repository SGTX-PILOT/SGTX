// @ts-nocheck
/**
 * SGTX Customs Gateway — Additional Charge Request API (§16)
 * ===========================================================================
 * POST  /api/sgtx/customs-gateway/fee-engine/additional-charge
 *   Body:  { ustn, brokerGtid, reason, evidence, governmentReference,
 *            amount, currency, chargeType }
 *   Returns: { ok, request }
 *
 *   Workflow: Broker → SUBMITTED → SGTX_VALIDATED → TRADER_NOTIFIED →
 *   TRADER_ACCEPTED | TRADER_DISPUTED → GOVERNOR_REVIEW (if disputed) →
 *   GOVERNOR_APPROVED | GOVERNOR_DENIED → LOOM_RECORDED.
 *
 *   CRITICAL (§16): the system NEVER silently appends the amount to the
 *   trader's bill. The amount becomes binding only after TRADER_ACCEPTED or
 *   GOVERNOR_APPROVED — and even then, the actual settlement is performed
 *   by the payment engine (separate module). This route is non-custodial.
 *
 * PATCH /api/sgtx/customs-gateway/fee-engine/additional-charge
 *   Body:  { requestId, traderGtid, decision: "accept" | "dispute", note }
 *   Returns: { ok, request }
 *
 * GET   /api/sgtx/customs-gateway/fee-engine/additional-charge
 *   Query: ?ustn=<USTN>&brokerGtid=<GTID>&status=<S>
 *   Returns: { ok, count, requests[] }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requestAdditionalCharge,
  respondToAdditionalCharge,
  listAdditionalChargeRequests,
} from "@/lib/sgtx/customs-gateway/fee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = {
      ustn: searchParams.get("ustn") || undefined,
      brokerGtid: searchParams.get("brokerGtid") || undefined,
      status: searchParams.get("status") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 100,
    };
    const requests = await listAdditionalChargeRequests(filter);
    return NextResponse.json({ ok: true, count: requests.length, requests });
  } catch (err: any) {
    logger.error("[api/fee-engine/additional-charge] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json(
        { ok: false, error: "ustn is required" },
        { status: 400 },
      );
    }
    if (!body?.brokerGtid) {
      return NextResponse.json(
        { ok: false, error: "brokerGtid is required" },
        { status: 400 },
      );
    }
    if (!body?.reason) {
      return NextResponse.json(
        { ok: false, error: "reason is required" },
        { status: 400 },
      );
    }
    if (!body?.evidence) {
      return NextResponse.json(
        { ok: false, error: "evidence is required (§16 — no charge without supporting evidence)" },
        { status: 400 },
      );
    }
    if (!body?.amount || Number(body.amount) <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount must be positive" },
        { status: 400 },
      );
    }
    const request = await requestAdditionalCharge({
      ustn: body.ustn,
      brokerGtid: body.brokerGtid,
      reason: String(body.reason),
      evidence: String(body.evidence),
      governmentReference: body.governmentReference || null,
      amount: Number(body.amount),
      currency: body.currency || "USD",
      chargeType: body.chargeType || "OTHER",
    });
    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/fee-engine/additional-charge] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, traderGtid, decision, note } = body || {};
    if (!requestId) {
      return NextResponse.json(
        { ok: false, error: "requestId is required" },
        { status: 400 },
      );
    }
    if (!traderGtid) {
      return NextResponse.json(
        { ok: false, error: "traderGtid is required" },
        { status: 400 },
      );
    }
    if (decision !== "accept" && decision !== "dispute") {
      return NextResponse.json(
        { ok: false, error: "decision must be 'accept' or 'dispute'" },
        { status: 400 },
      );
    }
    const request = await respondToAdditionalCharge(
      requestId,
      traderGtid,
      decision === "accept" ? "ACCEPT" : "DISPUTE",
      String(note || ""),
    );
    return NextResponse.json({ ok: true, request });
  } catch (err: any) {
    logger.error("[api/fee-engine/additional-charge] PATCH failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
