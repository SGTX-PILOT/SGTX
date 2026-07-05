import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// GET /api/sgtx/milestones?ustn=...
// Returns all milestones / timeline events for a trade + current shipment status.
// Milestone list adapts based on transport mode — RoRo trades get ROLL_ON/ROLL_OFF
// instead of CONTAINER_LOADED, plus corridor-specific guidance.

const CONTAINER_MILESTONES = [
  "CONTAINER_LOADED",
  "DEPARTED",
  "IN_TRANSIT",
  "ARRIVED",
  "CUSTOMS_CLEARED",
  "DELIVERED",
];

const RORO_MILESTONES = [
  "ROLL_ON",
  "DEPARTED",
  "IN_TRANSIT",
  "ARRIVED",
  "ROLL_OFF",
  "CUSTOMS_CLEARED",
  "DELIVERED",
];

const MILESTONE_TO_SHIPMENT_STATUS: Record<string, string> = {
  CONTAINER_LOADED: "LOADED",
  ROLL_ON: "LOADED",
  DEPARTED: "DEPARTED",
  IN_TRANSIT: "IN_TRANSIT",
  ARRIVED: "ARRIVED",
  ROLL_OFF: "ARRIVED",
  CUSTOMS_CLEARED: "RELEASED",
  DELIVERED: "DELIVERED",
};

const MILESTONE_LABELS: Record<string, string> = {
  CONTAINER_LOADED: "Container Sealed & Loaded",
  ROLL_ON: "Cargo Rolled Onto Vessel",
  DEPARTED: "Vessel Departed",
  IN_TRANSIT: "In Transit",
  ARRIVED: "Vessel Arrived at Destination",
  ROLL_OFF: "Cargo Rolled Off Vessel",
  CUSTOMS_CLEARED: "Customs Cleared",
  DELIVERED: "Delivered to Buyer",
};

const MILESTONE_GUIDANCE: Record<string, string> = {
  CONTAINER_LOADED: "Seller confirms containers are sealed and loaded onto the vessel/truck at the origin port.",
  ROLL_ON: "RoRo terminal confirms cargo (vehicles/machinery) has been driven onto the vessel. Vessel schedule booking must be confirmed first.",
  DEPARTED: "Carrier confirms the vessel/truck has departed the origin port.",
  IN_TRANSIT: "Cargo is in transit. AIS tracking active for vessel shipments.",
  ARRIVED: "Carrier confirms arrival at the destination port.",
  ROLL_OFF: "RoRo terminal confirms cargo has been driven off the vessel at the destination port.",
  CUSTOMS_CLEARED: "Customs broker confirms the import/export declaration has been cleared by customs. Requires assigned customs broker.",
  DELIVERED: "Buyer confirms receipt of cargo at the final delivery address.",
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

    // Determine if this is a RoRo trade
    const isRoRo = trade.transportMode === "RO_RO";
    const milestoneList = isRoRo ? RORO_MILESTONES : CONTAINER_MILESTONES;

    // Build milestone list with CONFIRMED/PENDING status per shipment
    const milestoneTimeline = milestoneList.map((milestone) => {
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
        label: MILESTONE_LABELS[milestone] || milestone.replace(/_/g, " "),
        status: allConfirmed ? "CONFIRMED" : "PENDING",
        expectedShipmentStatus: expectedStatus,
        confirmedAt: matchingEvents[0]?.completedAt || null,
        confirmedByGtid: matchingEvents[0]?.actorGtid || null,
        shipmentStatuses,
        guidance: MILESTONE_GUIDANCE[milestone] || undefined,
        requiresCustomsBroker: milestone === "CUSTOMS_CLEARED",
      };
    });

    // Include customs broker assignment status (Part 3.13)
    let customsBrokerStatus: any = null;
    try {
      customsBrokerStatus = {
        buyerBrokerGtid: (trade as any).buyerCustomsBrokerGtid || null,
        sellerBrokerGtid: (trade as any).sellerCustomsBrokerGtid || null,
        buyerBrokerAssignedAt: (trade as any).buyerCustomsBrokerAssignedAt || null,
        sellerBrokerAssignedAt: (trade as any).sellerCustomsBrokerAssignedAt || null,
        bothAssigned: !!((trade as any).buyerCustomsBrokerGtid && (trade as any).sellerCustomsBrokerGtid),
      };
    } catch {}

    return NextResponse.json({
      ok: true,
      ustn,
      tradeStatus: trade.status,
      phase: trade.phase,
      isRoRo,
      transportMode: trade.transportMode,
      customsBrokerStatus,
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
    logger.error("[milestones] error:", e);
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
