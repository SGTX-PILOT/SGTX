import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { predictDisputeRisk } from "@/lib/sgtx/ai/dispute-risk";

// Phase 5 - Physical Execution - Milestone Confirmation
// milestone values: CONTAINER_LOADED | DEPARTED | IN_TRANSIT | ARRIVED | CUSTOMS_CLEARED | DELIVERED
const MILESTONE_TO_SHIPMENT_STATUS: Record<string, string> = {
  CONTAINER_LOADED: "LOADED",
  DEPARTED: "DEPARTED",
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED: "ARRIVED",
  CUSTOMS_CLEARED: "RELEASED",
  DELIVERED: "DELIVERED",
};

const MILESTONE_PHASE = 5;

// POST /api/sgtx/milestone/confirm - Confirms a shipment milestone
// Body: { ustn, milestone, confirmedByGtid, metadata? }
// Updates: Shipment.status to match milestone, creates TimelineEvent + Activity log,
//          Smart Inbox to counterparty (priority 70)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, milestone, confirmedByGtid, metadata } = body;

    if (!ustn || !milestone || !confirmedByGtid) {
      return NextResponse.json(
        { error: "ustn, milestone, confirmedByGtid required" },
        { status: 400 },
      );
    }
    const validMilestones = Object.keys(MILESTONE_TO_SHIPMENT_STATUS);
    if (!validMilestones.includes(milestone)) {
      return NextResponse.json(
        { error: `milestone must be one of: ${validMilestones.join(", ")}` },
        { status: 400 },
      );
    }

    // Find the trade + shipments
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: { buyer: true, seller: true, shipments: true },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }
    if (trade.status !== "CONTRACT_SIGNED" && trade.status !== "IN_EXECUTION") {
      return NextResponse.json(
        { error: `Trade status ${trade.status} - milestone confirmation requires CONTRACT_SIGNED or IN_EXECUTION` },
        { status: 409 },
      );
    }

    // Determine counterparty — any trade participant (buyer, seller, or logistics provider) can confirm milestones
    const isBuyer = confirmedByGtid === trade.buyerGtid;
    const isSeller = confirmedByGtid === trade.sellerGtid;
    const isLogistics = !isBuyer && !isSeller; // LSP, SHIP, CBR, etc.
    const counterpartyGtid = isBuyer ? trade.sellerGtid : trade.buyerGtid;
    let confirmerName: string;
    if (isBuyer) confirmerName = trade.buyer?.legalName || "Buyer";
    else if (isSeller) confirmerName = trade.seller?.legalName || "Seller";
    else {
      // Look up the logistics provider's name
      const provider = await db.tenant.findUnique({ where: { gtid: confirmedByGtid } });
      confirmerName = provider?.legalName || "Logistics Provider";
    }

    const shipmentStatus = MILESTONE_TO_SHIPMENT_STATUS[milestone];

    // Update all shipments on this trade to the new status (single-shipment trades)
    // For multi-shipment, the metadata.shipmentSequence selects the specific shipment
    const shipmentFilter: any = { tradeId: trade.id };
    if (metadata?.shipmentSequence) {
      shipmentFilter.sequence = Number(metadata.shipmentSequence);
    }
    const shipmentUpdateData: any = { status: shipmentStatus };
    if (milestone === "DEPARTED") shipmentUpdateData.departedAt = new Date();
    if (milestone === "ARRIVED") shipmentUpdateData.arrivedAt = new Date();
    if (milestone === "CUSTOMS_CLEARED" || milestone === "DELIVERED") shipmentUpdateData.releasedAt = new Date();

    const updatedShipments = await db.shipment.updateMany({
      where: shipmentFilter,
      data: shipmentUpdateData,
    });

    // Update trade status to IN_EXECUTION if first milestone
    if (trade.status === "CONTRACT_SIGNED") {
      await db.trade.update({
        where: { id: trade.id },
        data: { status: "IN_EXECUTION", phase: MILESTONE_PHASE },
      });
    }

    // Create TimelineEvent for the milestone
    await db.timelineEvent.create({
      data: {
        tradeId: trade.id,
        phase: MILESTONE_PHASE,
        label: `Milestone: ${milestone.replace(/_/g, " ")}`,
        description: `${confirmerName} confirmed milestone ${milestone.replace(/_/g, " ")}. Shipment status: ${shipmentStatus}.`,
        actorGtid: confirmedByGtid,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Activity log
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: confirmedByGtid,
        action: "CONFIRMED_MILESTONE",
        type: "SUCCESS",
        description: `${confirmerName} (${confirmedByGtid}) confirmed milestone ${milestone} for USTN ${ustn}. Shipment status updated to ${shipmentStatus}.${metadata ? ` Metadata: ${JSON.stringify(metadata)}` : ""}`,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    // Smart Inbox to counterparty (priority 70)
    await db.inboxItem.create({
      data: {
        tenantGtid: counterpartyGtid,
        tradeId: trade.id,
        category: "SHIPMENT_ALERT",
        priority: 70,
        title: `Milestone confirmed: ${milestone.replace(/_/g, " ")} - ${ustn.slice(0, 24)}...`,
        description: `Milestone confirmed: ${milestone.replace(/_/g, " ")}. Shipment is now ${shipmentStatus.replace(/_/g, " ")}. Confirmed by ${confirmerName}.`,
        ctaLabel: "View Shipment",
      },
    });

    // ── SGTX BRAIN — Pre-emptive Dispute Risk Assessment ──────────────
    // Milestone confirmation is the highest-signal event in the trade
    // lifecycle. Invoke the Brain to predict the probability of a future
    // dispute being filed and surface a preventive alert to the
    // counterparty. This is ADVISORY ONLY — it never blocks the
    // confirmation. All Brain failures degrade to a no-op so legitimate
    // trades always flow through.
    let disputeRiskAssessment: { probability: number; riskLevel: string; signals: number } | null = null;
    try {
      const risk = await predictDisputeRisk({
        ustn,
        milestone,
        confirmedByGtid,
      });

      // Persist a Brain-assessment Activity row (audit trail) regardless of
      // whether an alert was generated — operators need to see that the
      // Brain evaluated every milestone confirmation.
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: confirmedByGtid,
          action: "BRAIN_DISPUTE_RISK_ASSESSMENT",
          type:
            risk.riskLevel === "high"
              ? "WARNING"
              : risk.riskLevel === "medium"
                ? "INFO"
                : "INFO",
          description:
            `SGTX Brain assessed dispute risk for USTN ${ustn} at milestone ${milestone}: ` +
            `${(risk.probability * 100).toFixed(0)}% probability (${risk.riskLevel}). ` +
            `Signals: ${risk.signals.map((s) => s.signal).join(", ") || "none"}. ` +
            `Recommended: ${risk.recommendedActions.slice(0, 1).join(" ")}`,
          metadata: JSON.stringify({
            brainModule: risk.brainModule,
            probability: risk.probability,
            riskLevel: risk.riskLevel,
            signals: risk.signals,
            recommendedActions: risk.recommendedActions,
            assessedAt: risk.assessedAt,
            alertRaised: !!risk.preventInboxAlert,
          }),
        },
      });

      // If the Brain flagged elevated risk (>0.4), surface a preventive
      // Smart-Inbox alert to the counterparty (the party NOT confirming
      // the milestone). Use the same InboxItem pattern as the milestone
      // notification above. Severity scales: warning for medium, critical
      // for high.
      if (risk.preventInboxAlert) {
        await db.inboxItem.create({
          data: {
            tenantGtid: risk.preventInboxAlert.recipientGtid,
            tradeId: trade.id,
            category: "COMPLIANCE",
            priority: risk.preventInboxAlert.severity === "critical" ? 90 : 80,
            title: risk.preventInboxAlert.title,
            description: risk.preventInboxAlert.body,
            ctaLabel: "Review Trade",
          },
        });
      }

      disputeRiskAssessment = {
        probability: risk.probability,
        riskLevel: risk.riskLevel,
        signals: risk.signals.length,
      };
    } catch (brainErr: any) {
      // Brain failure must NEVER block a milestone confirmation. Log and move on.
      logger.error("[milestone/confirm] Brain dispute-risk assessment failed (non-blocking):", brainErr);
    }

    return NextResponse.json({
      ok: true,
      ustn,
      milestone,
      shipmentStatus,
      updatedShipmentsCount: updatedShipments.count,
      tradeStatus: "IN_EXECUTION",
      disputeRisk: disputeRiskAssessment,
    });
  } catch (e: any) {
    logger.error("[milestone/confirm] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
