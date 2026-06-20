import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseFeeLock } from "@/lib/sgtx/payment/fealock";

// POST /api/sgtx/settlement/approve - Phase 6 Settlement Approval
// Body: { ustn, approverGtid, stage ("STAGE1"|"STAGE2") }
// Updates: FeeLock -> RELEASED (releaseFeeLock from fealock.ts)
//          Trade.status -> "SETTLED" when both stages complete
// Creates: Activity log "SETTLEMENT_APPROVED" + Smart Inbox to both parties (priority 80)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, approverGtid, stage } = body;

    if (!ustn || !approverGtid || !stage) {
      return NextResponse.json(
        { error: "ustn, approverGtid, stage required" },
        { status: 400 },
      );
    }
    if (!["STAGE1", "STAGE2"].includes(stage)) {
      return NextResponse.json(
        { error: "stage must be STAGE1 or STAGE2" },
        { status: 400 },
      );
    }

    // Find the trade
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true, shipments: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Validate approver is a trade party
    const isBuyer = approverGtid === trade.buyerGtid;
    const isSeller = approverGtid === trade.sellerGtid;
    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "approverGtid must match buyer or seller of this trade" },
        { status: 403 },
      );
    }
    const approverName = isBuyer ? (trade.buyer?.legalName || "Buyer") : (trade.seller?.legalName || "Seller");

    // Stage 1 settlement: requires trade to be IN_EXECUTION (post milestones)
    // Stage 2 settlement: requires trade to have completed DELIVERED milestone
    if (stage === "STAGE1" && trade.status !== "IN_EXECUTION" && trade.status !== "CONTRACT_SIGNED") {
      return NextResponse.json(
        { error: `Stage 1 settlement requires IN_EXECUTION status (currently ${trade.status})` },
        { status: 409 },
      );
    }
    if (stage === "STAGE2" && trade.status !== "DELIVERED" && trade.status !== "IN_EXECUTION") {
      return NextResponse.json(
        { error: `Stage 2 settlement requires DELIVERED status (currently ${trade.status})` },
        { status: 409 },
      );
    }

    // Release FeeLock for this USTN
    let feeLockStatus = "NONE";
    try {
      const released = await releaseFeeLock(ustn);
      feeLockStatus = released.status;
    } catch (feeErr: any) {
      // If FeeLock doesn't exist or already released, continue (idempotent)
      console.warn("[settlement/approve] FeeLock release skipped:", feeErr?.message);
      feeLockStatus = "NONE_OR_ALREADY_RELEASED";
    }

    // Track settlement approvals via Activity log
    // Stage 1 approval
    const stage1Approved = await db.activity.findFirst({
      where: {
        tradeId: trade.id,
        action: "SETTLEMENT_APPROVED",
        metadata: { contains: "STAGE1" },
      },
    });

    const stage2Approved = await db.activity.findFirst({
      where: {
        tradeId: trade.id,
        action: "SETTLEMENT_APPROVED",
        metadata: { contains: "STAGE2" },
      },
    });

    // Create Activity log for this stage approval
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: approverGtid,
        action: "SETTLEMENT_APPROVED",
        type: "SUCCESS",
        description: `${approverName} (${approverGtid}) approved ${stage} settlement for USTN ${ustn}. FeeLock status: ${feeLockStatus}.`,
        metadata: JSON.stringify({ stage, feeLockStatus }),
      },
    });

    // Timeline event
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: 6,
        label: `Settlement Approved: ${stage}`,
        description: `${approverName} approved ${stage} settlement. FeeLock ${feeLockStatus}.`,
        actorGtid: approverGtid,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Determine if both stages are now complete
    const stage1Complete = stage === "STAGE1" || !!stage1Approved;
    const stage2Complete = stage === "STAGE2" || !!stage2Approved;
    const bothComplete = stage1Complete && stage2Complete;

    let tradeStatus = trade.status;
    if (bothComplete) {
      // Mark trade as SETTLED
      await db.trade.update({
        where: { id: trade.id },
        data: { status: "SETTLED", phase: 6 },
      });
      tradeStatus = "SETTLED";

      // Smart Inbox to both parties (priority 80)
      const settleMsg = "Settlement approved - trade complete";
      await Promise.all([
        db.inboxItem.create({
          data: {
            tenantGtid: trade.buyerGtid,
            tradeId: trade.id,
            category: "NEGOTIATION",
            priority: 80,
            title: `Settlement complete - ${ustn.slice(0, 24)}...`,
            description: settleMsg,
            ctaLabel: "View Trade",
          },
        }),
        db.inboxItem.create({
          data: {
            tenantGtid: trade.sellerGtid,
            tradeId: trade.id,
            category: "NEGOTIATION",
            priority: 80,
            title: `Settlement complete - ${ustn.slice(0, 24)}...`,
            description: settleMsg,
            ctaLabel: "View Trade",
          },
        }),
      ]);
    } else {
      // Smart Inbox to counterparty (priority 70) - partial settlement approval
      const counterpartyGtid = isBuyer ? trade.sellerGtid : trade.buyerGtid;
      await db.inboxItem.create({
        data: {
          tenantGtid: counterpartyGtid,
          tradeId: trade.id,
          category: "NEGOTIATION",
          priority: 70,
          title: `${stage} settlement approved - awaiting ${bothComplete ? "" : "other stage"}`,
          description: `${approverName} approved ${stage} settlement for USTN ${ustn}. ${bothComplete ? "Trade complete." : "Awaiting other stage approval."}`,
          ctaLabel: "View Trade",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      ustn,
      stage,
      tradeStatus,
      feeLockStatus,
      bothStagesComplete: bothComplete,
      message: bothComplete
        ? "Settlement approved - trade complete"
        : `${stage} settlement approved - awaiting ${stage === "STAGE1" ? "STAGE2" : "STAGE1"} approval`,
    });
  } catch (e: any) {
    console.error("[settlement/approve] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
