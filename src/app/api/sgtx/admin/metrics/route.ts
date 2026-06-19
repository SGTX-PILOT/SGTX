import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/admin/metrics — Admin metrics dashboard (blueprint Part 13.2.16 + 27.14)
export async function GET() {
  try {
    const [
      tenants, trades, activeTrades, disputes, inboxItems,
      financingRequests, incidents, threats, tasks, feedback,
      consents, dsrRequests, distressedListings, palletDetails,
      tradeMemoryEvents, predictiveInsights, anomalies, slaMetrics,
    ] = await Promise.all([
      db.tenant.count(),
      db.trade.count(),
      db.trade.count({ where: { status: { in: ["INITIATED", "QUOTED", "NEGOTIATING", "CONTRACT_SIGNED", "IN_EXECUTION"] } } }),
      db.dispute.count(),
      db.inboxItem.count({ where: { dismissed: false } }),
      db.financingRequest.count(),
      db.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
      db.threatFinding.count({ where: { status: "OPEN" } }),
      db.task.count({ where: { status: "OPEN" } }),
      db.feedbackTicket.count({ where: { status: "OPEN" } }),
      db.consentRecord.count(),
      db.dsrRequest.count({ where: { status: "PENDING" } }),
      db.distressedCargoListing.count({ where: { status: "ACTIVE" } }),
      db.palletDetail.count(),
      db.tradeMemoryEvent.count(),
      db.predictiveInsight.count(),
      db.anomalyDetectionLog.count({ where: { resolvedAt: null } }),
      db.slaMetric.count(),
    ]);

    // Recent decisions
    const recentDecisions = await db.governorDecision.count();
    const aiInferences = await db.governorDecision.count(); // proxy

    return NextResponse.json({
      platform: {
        tenants, trades, activeTrades, disputes, pendingInbox: inboxItems,
        financingRequests, recentDecisions, aiInferences,
      },
      security: {
        openIncidents: incidents, openThreats: threats,
      },
      operations: {
        openTasks: tasks, openFeedback: feedback,
      },
      compliance: {
        consents, pendingDsrRequests: dsrRequests,
      },
      logistics: {
        distressedListings, palletDetails,
      },
      intelligence: {
        tradeMemoryEvents, predictiveInsights, openAnomalies: anomalies,
      },
      monitoring: {
        slaMetrics,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
