import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/workflow/advance - Convenience endpoint that advances a trade to the next phase.
// Body: { ustn, action, ...action-specific fields }
//
// ACTION_TO_PHASE maps each workflow action to its target Trade.phase. Phase numbers follow
// the blueprint 9-phase model:
//   0 = Foundation (pre-trade onboarding, KYB, GTID issuance)
//   1 = Initiation  (trade request submission)        — CREATE_TRADE
//   2 = Quote       (seller builds quote/packing)     — SUBMIT_QUOTE
//   3 = Contracting (QES signatures, contract lock)   — ACCEPT_QUOTE, LOCK_CONTRACT
//   4 = Financing   (RFQ → bids → agreement)          — SIGN_FINANCING
//   5 = Execution   (shipments, milestones, lab, QC)  — CONFIRM_MILESTONE
//   6 = Settlement  (invoice, FX, PSP split)          — APPROVE_SETTLEMENT
//   7 = Distressed  (declaration + triage)            — DECLARE_DISTRESSED
//   8 = Dispute     (filing + resolution)             — FILE_DISPUTE
//
// NOTE: LOCK_CONTRACT (3→3), CONFIRM_MILESTONE (5→5), and APPROVE_SETTLEMENT (6→6) intentionally
// remain at the same phase — contract locking, milestone confirmation, and settlement approval
// all happen WITHIN their respective phases rather than advancing to the next one. They are kept
// in the map so callers can route through this convenience endpoint consistently.
//
// Returns: { ok, currentPhase, nextPhase, tradeStatus, innerResponse }
const ACTION_TO_PHASE: Record<string, { from: number; to: number; innerPath?: string; skipUstn?: boolean }> = {
  CREATE_TRADE:       { from: 0, to: 1, innerPath: "/trade-request",       skipUstn: true },
  SUBMIT_QUOTE:       { from: 1, to: 2, innerPath: "/quote/submit" },
  ACCEPT_QUOTE:       { from: 2, to: 3, innerPath: "/quote/accept" },
  LOCK_CONTRACT:      { from: 3, to: 3, innerPath: "/contract/lock" },
  SIGN_FINANCING:     { from: 3, to: 4, innerPath: "/financing/sign" },
  CONFIRM_MILESTONE:  { from: 5, to: 5, innerPath: "/milestone/confirm" },
  APPROVE_SETTLEMENT: { from: 6, to: 6, innerPath: "/settlement/approve" },
  DECLARE_DISTRESSED: { from: 5, to: 7, innerPath: "/distressed/declare" },
  FILE_DISPUTE:       { from: 0, to: 8, innerPath: "/disputes/file" },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, action } = body;

    if (!action) {
      return NextResponse.json({ error: "action required" }, { status: 400 });
    }
    const validActions = Object.keys(ACTION_TO_PHASE);
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(", ")}` },
        { status: 400 },
      );
    }
    const phaseMap = ACTION_TO_PHASE[action];
    // CREATE_TRADE doesn't require an existing USTN — the inner endpoint generates one.
    if (!phaseMap.skipUstn && !ustn) {
      return NextResponse.json({ error: "ustn required for action: " + action }, { status: 400 });
    }

    // Find trade to confirm it exists and to capture phase (skipped for CREATE_TRADE)
    let trade: { phase: number; id: string } | null = null;
    if (!phaseMap.skipUstn && ustn) {
      trade = await db.trade.findUnique({ where: { ustn }, select: { phase: true, id: true } });
      if (!trade) {
        return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
      }
    }

    // Build the inner request - call the phase-specific API
    const base = `${req.nextUrl.origin}/api/sgtx`;
    let innerUrl = "";
    let innerBody: any = { ...body };
    if (ustn) innerBody.ustn = ustn;

    switch (action) {
      case "CREATE_TRADE":
        // Forward the full trade-request body to /api/sgtx/trade-request.
        // The inner endpoint generates the USTN and sets phase=1 (M1 fix).
        innerUrl = `${base}/trade-request`;
        innerBody = body; // pass through verbatim — trade-request has its own schema
        break;
      case "SUBMIT_QUOTE":
        innerUrl = `${base}/quote/submit`;
        break;
      case "ACCEPT_QUOTE":
        innerUrl = `${base}/quote/accept`;
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
      case "SIGN_FINANCING":
        innerUrl = `${base}/financing/sign`;
        // financing/sign requires agreementId + signerGtid + role
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
      case "DECLARE_DISTRESSED":
        innerUrl = `${base}/distressed/declare`;
        break;
      case "FILE_DISPUTE":
        innerUrl = `${base}/disputes/file`;
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
          currentPhase: trade?.phase ?? 0,
          error: innerJson.error || `Inner API ${action} failed`,
        },
        { status: innerRes.status },
      );
    }

    // L6 fix — Ensure the trade's phase actually advances to the target. The inner endpoints
    // (financing/sign, distressed/declare, disputes/file, etc.) set the phase themselves per
    // the M1-M4 fixes, but we update here as a safety net using Math.max to avoid regressions.
    // For CREATE_TRADE the USTN is generated by the inner endpoint — extract from response.
    const resolvedUstn = ustn || innerJson.ustn;
    if (resolvedUstn && phaseMap.to > 0) {
      try {
        const tradeRow = await db.trade.findUnique({
          where: { ustn: resolvedUstn },
          select: { phase: true },
        });
        if (tradeRow && tradeRow.phase < phaseMap.to) {
          await db.trade.update({
            where: { ustn: resolvedUstn },
            data: { phase: phaseMap.to },
          });
        }
      } catch (phaseErr) {
        logger.error("[workflow/advance] phase update error (non-blocking)", {
          error: phaseErr instanceof Error ? phaseErr.message : String(phaseErr),
        });
      }
    }

    // Re-fetch the trade to capture the updated phase/status
    const updatedTrade = resolvedUstn
      ? await db.trade.findUnique({ where: { ustn: resolvedUstn }, select: { phase: true, status: true } })
      : null;

    return NextResponse.json({
      ok: true,
      action,
      ustn: resolvedUstn ?? ustn,
      currentPhase: updatedTrade?.phase ?? phaseMap.to,
      nextPhase: phaseMap.to,
      tradeStatus: updatedTrade?.status ?? innerJson.tradeStatus ?? innerJson.status,
      message: innerJson.message,
      innerResponse: innerJson,
    });
  } catch (e: any) {
    logger.error("[workflow/advance] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
