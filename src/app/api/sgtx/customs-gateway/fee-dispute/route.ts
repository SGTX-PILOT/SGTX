// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute list + create API
 * ===========================================================================
 * GET  /api/sgtx/customs-gateway/fee-dispute
 *   Query: ?ustn=<USTN>&brokerGtid=<GTID>&state=<STATE>&violationType=<T>&limit=<N>
 *   Returns: { ok, count, disputes[] }
 *
 * POST /api/sgtx/customs-gateway/fee-dispute
 *   Body:  { ustn, brokerGtid, chargeId, violationType, disputedAmount,
 *            currency, reason, traderGtid?, originalQuote?, newCharge?, evidence? }
 *   Returns: { ok, dispute }
 *
 * L0: Automated detection — creates a dispute case + preserves evidence +
 * notifies trader + broker via Smart Inbox + records audit + appends Loom
 * event. CRITICAL violations auto-escalate to the Governor.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createDisputeCase,
  listDisputes,
  DISPUTE_STATES,
  FEE_VIOLATION_TYPES,
} from "@/lib/sgtx/customs-gateway/fee-dispute";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = {
      ustn: searchParams.get("ustn") || undefined,
      brokerGtid: searchParams.get("brokerGtid") || undefined,
      state: searchParams.get("state") || undefined,
      violationType: searchParams.get("violationType") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 100,
    };
    const disputes = await listDisputes(filter);
    return NextResponse.json({
      ok: true,
      count: disputes.length,
      disputes,
      disputeStates: DISPUTE_STATES,
      violationTypes: FEE_VIOLATION_TYPES,
    });
  } catch (err: any) {
    logger.error("[api/fee-dispute] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.brokerGtid || !body?.violationType) {
      return NextResponse.json(
        { ok: false, error: "ustn, brokerGtid, and violationType are required" },
        { status: 400 },
      );
    }
    if (!FEE_VIOLATION_TYPES.includes(body.violationType)) {
      return NextResponse.json(
        { ok: false, error: `Invalid violationType: ${body.violationType}`, validTypes: FEE_VIOLATION_TYPES },
        { status: 400 },
      );
    }
    const dispute = await createDisputeCase({
      ustn: body.ustn,
      brokerGtid: body.brokerGtid,
      chargeId: body.chargeId || "",
      violationType: body.violationType,
      disputedAmount: Number(body.disputedAmount || 0),
      currency: body.currency || "USD",
      reason: body.reason || `Fee dispute: ${body.violationType}`,
      traderGtid: body.traderGtid,
      originalQuote: body.originalQuote,
      newCharge: body.newCharge,
      evidence: body.evidence,
    });
    return NextResponse.json({ ok: true, dispute }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/fee-dispute] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
