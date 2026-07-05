import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/workflow/advance - Convenience endpoint that advances a trade to the next phase.
// Body: { ustn, action, ...action-specific fields }
// action values:
//   ACCEPT_QUOTE       -> POST /api/sgtx/quote/accept     (Phase 2 -> 3)
//   LOCK_CONTRACT      -> POST /api/sgtx/contract/lock    (Phase 3 finalize)
//   CONFIRM_MILESTONE  -> POST /api/sgtx/milestone/confirm (Phase 5)
//   APPROVE_SETTLEMENT -> POST /api/sgtx/settlement/approve (Phase 6)
// Returns: { ok, currentPhase, nextPhase, tradeStatus, innerResponse }
const ACTION_TO_PHASE: Record<string, { from: number; to: number }> = {
  ACCEPT_QUOTE: { from: 2, to: 3 },
  LOCK_CONTRACT: { from: 3, to: 3 },
  CONFIRM_MILESTONE: { from: 5, to: 5 },
  APPROVE_SETTLEMENT: { from: 6, to: 6 },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, action } = body;

    if (!ustn || !action) {
      return NextResponse.json({ error: "ustn and action required" }, { status: 400 });
    }
    const validActions = Object.keys(ACTION_TO_PHASE);
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 },
      );
    }

    // Find trade to confirm it exists and to capture phase
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Build the inner request - call the phase-specific API
    const base = `${req.nextUrl.origin}/api/sgtx`;
    let innerUrl = "";
    let innerBody: any = { ustn };

    switch (action) {
      case "ACCEPT_QUOTE":
        innerUrl = `${base}/quote/accept`;
        if (body.deliveryPort) innerBody.deliveryPort = body.deliveryPort;
        break;
      case "LOCK_CONTRACT":
        innerUrl = `${base}/contract/lock`;
        innerBody = {
          ustn,
          buyerSigned: body.buyerSigned ?? true,
          sellerSigned: body.sellerSigned ?? true,
          feePaid: body.feePaid ?? true,
          releaseAcknowledged: body.releaseAcknowledged ?? true,
        };
        break;
      case "CONFIRM_MILESTONE":
        innerUrl = `${base}/milestone/confirm`;
        if (!body.milestone) {
          return NextResponse.json(
            { error: "CONFIRM_MILESTONE requires 'milestone' field" },
            { status: 400 },
          );
        }
        innerBody = {
          ustn,
          milestone: body.milestone,
          confirmedByGtid: body.confirmedByGtid,
          metadata: body.metadata,
        };
        break;
      case "APPROVE_SETTLEMENT":
        innerUrl = `${base}/settlement/approve`;
        if (!body.approverGtid || !body.stage) {
          return NextResponse.json(
            { error: "APPROVE_SETTLEMENT requires 'approverGtid' and 'stage'" },
            { status: 400 },
          );
        }
        innerBody = {
          ustn,
          approverGtid: body.approverGtid,
          stage: body.stage,
        };
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Call the inner route directly (server-to-server via fetch)
    const innerRes = await fetch(innerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(innerBody),
    });
    const innerJson = await innerRes.json();

    if (!innerRes.ok) {
      return NextResponse.json(
        {
          ok: false,
          action,
          ustn,
          currentPhase: trade.phase,
          error: innerJson.error || `Inner API ${action} failed`,
        },
        { status: innerRes.status },
      );
    }

    // Re-fetch the trade to capture the updated phase/status
    const updatedTrade = await db.trade.findUnique({ where: { ustn } });
    const phaseMap = ACTION_TO_PHASE[action];

    return NextResponse.json({
      ok: true,
      action,
      ustn,
      currentPhase: updatedTrade?.phase ?? phaseMap.to,
      nextPhase: phaseMap.to,
      tradeStatus: updatedTrade?.status ?? innerJson.tradeStatus,
      message: innerJson.message,
      innerResponse: innerJson,
    });
  } catch (e: any) {
    logger.error("[workflow/advance] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
