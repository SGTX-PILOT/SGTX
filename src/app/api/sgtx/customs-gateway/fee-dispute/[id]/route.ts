// @ts-nocheck
/**
 * SGTX Customs Gateway — Fee Dispute get + transition API
 * ===========================================================================
 * GET   /api/sgtx/customs-gateway/fee-dispute/[id]
 *   Returns: { ok, dispute, validTransitions }
 *
 * PATCH /api/sgtx/customs-gateway/fee-dispute/[id]
 *   Body: { action: "respond" | "resolve" | "escalate", ...payload }
 *     - respond:  { action: "respond", brokerGtid, response, evidence }
 *     - resolve:  { action: "resolve", resolution, governorDecisionId }   (§43)
 *     - escalate: { action: "escalate", reason }                          (§43)
 *   Returns: { ok, dispute }
 *
 * L0: transitions validated against the state machine; consequential
 * outcomes (resolve, escalate) require the Governor.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDispute,
  respondToDispute,
  resolveDispute,
  escalateDispute,
  getValidDisputeTransitions,
  isValidDisputeTransition,
  requiresGovernorForTransition,
} from "@/lib/sgtx/customs-gateway/fee-dispute";
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
    return NextResponse.json({
      ok: true,
      dispute,
      validTransitions: getValidDisputeTransitions(dispute.state),
    });
  } catch (err: any) {
    logger.error("[api/fee-dispute/[id]] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const body = await req.json();
    const action = String(body?.action || "").toLowerCase();
    const current = await getDispute(id);
    if (!current) {
      return NextResponse.json({ ok: false, error: "Dispute not found" }, { status: 404 });
    }

    if (action === "respond") {
      // §20: Broker response — NOT a consequential action (no Governor required).
      if (!body?.brokerGtid || !body?.response) {
        return NextResponse.json(
          { ok: false, error: "brokerGtid and response are required for respond" },
          { status: 400 },
        );
      }
      if (!isValidDisputeTransition(current.state, "BROKER_RESPONDING")) {
        return NextResponse.json({
          ok: false,
          error: `Invalid transition: ${current.state} → BROKER_RESPONDING`,
          validTransitions: getValidDisputeTransitions(current.state),
        }, { status: 400 });
      }
      const dispute = await respondToDispute(
        id,
        body.brokerGtid,
        body.response,
        Array.isArray(body.evidence) ? body.evidence : [],
      );
      return NextResponse.json({ ok: true, dispute, governorApprovalRequired: false });
    }

    if (action === "resolve") {
      // §43: Consequential — Governor MUST approve.
      if (!body?.resolution || !body?.governorDecisionId) {
        return NextResponse.json(
          { ok: false, error: "resolution and governorDecisionId are required for resolve (§43)" },
          { status: 400 },
        );
      }
      const targetState = String(body.resolution).toUpperCase();
      if (!["UPHELD", "REJECTED", "PARTIALLY_UPHELD", "CLOSED"].includes(targetState)) {
        return NextResponse.json(
          { ok: false, error: `Invalid resolution: ${body.resolution}` },
          { status: 400 },
        );
      }
      if (!isValidDisputeTransition(current.state, targetState)) {
        return NextResponse.json({
          ok: false,
          error: `Invalid transition: ${current.state} → ${targetState}`,
          validTransitions: getValidDisputeTransitions(current.state),
        }, { status: 400 });
      }
      try {
        const dispute = await resolveDispute(id, body.resolution, body.governorDecisionId);
        return NextResponse.json({ ok: true, dispute, governorApprovalRequired: true });
      } catch (resolveErr: any) {
        return NextResponse.json(
          { ok: false, error: resolveErr?.message || "Governor denied resolution" },
          { status: 403 },
        );
      }
    }

    if (action === "escalate") {
      // §43: Consequential — Governor decides inline (escalateDispute calls governorDecide).
      if (!body?.reason) {
        return NextResponse.json(
          { ok: false, error: "reason is required for escalate" },
          { status: 400 },
        );
      }
      if (!isValidDisputeTransition(current.state, "ESCALATED")) {
        return NextResponse.json({
          ok: false,
          error: `Invalid transition: ${current.state} → ESCALATED`,
          validTransitions: getValidDisputeTransitions(current.state),
        }, { status: 400 });
      }
      try {
        const dispute = await escalateDispute(id, body.reason);
        return NextResponse.json({ ok: true, dispute, governorApprovalRequired: true });
      } catch (escErr: any) {
        return NextResponse.json(
          { ok: false, error: escErr?.message || "Governor denied escalation" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action: ${action}. Valid: respond, resolve, escalate.` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/fee-dispute/[id]] PATCH failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
