import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/milestones?ustn=...
// Returns all milestones / timeline events for a trade + current shipment status
const ALL_MILESTONES = [
  "CONTAINER_LOADED",
  "DEPARTED",
  "IN_TRANSIT",
  "ARRIVED",
  "CUSTOMS_CLEARED",
  "DELIVERED",
];

const MILESTONE_TO_SHIPMENT_STATUS: Record<string, string> = {
  CONTAINER_LOADED: "LOADED",
  DEPARTED: "DEPARTED",
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED: "ARRIVED",
  CUSTOMS_CLEARED: "RELEASED",
  DELIVERED: "DELIVERED",
};

export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        shipments: { orderBy: { sequence: "asc" } },
        timeline: { orderBy: { createdAt: "asc" } },
        activities: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Build milestone list with CONFIRMED/PENDING status per shipment
    const milestoneTimeline = ALL_MILESTONES.map((milestone) => {
      const expectedStatus = MILESTONE_TO_SHIPMENT_STATUS[milestone];
      // Per-shipment confirmation status (multi-shipment aware)
      const shipmentStatuses = trade.shipments.map((s) => ({
        shipmentSequence: s.sequence,
        shipmentStatus: s.status,
        confirmed: shipmentStatusReached(s.status, expectedStatus),
      }));
      // Aggregate: milestone is CONFIRMED if ALL shipments have reached it
      const allConfirmed =
        trade.shipments.length > 0 && shipmentStatuses.every((s) => s.confirmed);

      // Find the timeline event(s) for this milestone
      const matchingEvents = trade.timeline.filter(
        (t) => t.label === `Milestone: ${milestone.replace(/_/g, " ")}`,
      );

      return {
        milestone,
        label: milestone.replace(/_/g, " "),
        status: allConfirmed ? "CONFIRMED" : "PENDING",
        expectedShipmentStatus: expectedStatus,
        confirmedAt: matchingEvents[0]?.completedAt || null,
        confirmedByGtid: matchingEvents[0]?.actorGtid || null,
        shipmentStatuses,
      };
    });

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: trade.status,
      phase: trade.phase,
      shipments: trade.shipments.map((s) => ({
        id: s.id,
        sequence: s.sequence,
        status: s.status,
        originPort: s.originPort,
        destPort: s.destPort,
        vesselName: s.vesselName,
        containerNo: s.containerNo,
        etd: s.etd,
        eta: s.eta,
        departedAt: s.departedAt,
        arrivedAt: s.arrivedAt,
        releasedAt: s.releasedAt,
      })),
      milestoneTimeline,
      timelineEvents: trade.timeline,
      activities: trade.activities.filter((a) => a.action === "CONFIRMED_MILESTONE"),
    });
  } catch (e: any) {
    console.error("[milestones] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Order of shipment statuses to determine if a milestone is reached
const STATUS_ORDER: Record<string, number> = {
  PLANNED: 0,
  LOADED: 1,
  DEPARTED: 2,
  IN_TRANSIT: 3,
  ARRIVED: 4,
  RELEASED: 5,
  DELIVERED: 6,
};

function shipmentStatusReached(currentStatus: string, targetStatus: string): boolean {
  const current = STATUS_ORDER[currentStatus] ?? 0;
  const target = STATUS_ORDER[targetStatus] ?? 0;
  return current >= target;
}
