// SGTX Multimodal Shipment API — chain creation
// POST /api/sgtx/execution/multimodal
//
// Creates a chain of `Shipment` legs (sea → rail → road, air → road, etc.)
// for a single USTN. Each leg is a separate Shipment row linked via
// `parentShipmentId` and ordered by `legSequence` (1, 2, 3...). Mode-specific
// fields (awbNumber/flightNumber for AIR, cmrNumber/truckLicensePlate for
// ROAD, railConsignmentNote/trainNumber for RAIL) are persisted alongside
// the shared origin/dest/etd/eta envelope.
//
// Body:
//   {
//     ustn: string,
//     tradeId: string,
//     legs: [{
//       transportMode: "SEA" | "AIR" | "ROAD" | "RAIL" | "INLAND_WATER" | "MULTIMODAL",
//       originPort: string,
//       destPort: string,
//       vesselName?: string, vesselImo?: string,
//       awbNumber?: string, flightNumber?: string,
//       airportOfDeparture?: string, airportOfDestination?: string,
//       cmrNumber?: string, truckLicensePlate?: string, trailerLicensePlate?: string,
//       railConsignmentNote?: string, trainNumber?: string, wagonNumber?: string,
//       carrierGtid?: string,
//       etd?: string (ISO), eta?: string (ISO),
//     }, ...]
//   }
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/** Allowed transport modes (mirrors Shipment.transportMode enum string). */
const VALID_MODES = new Set([
  "SEA",
  "AIR",
  "ROAD",
  "RAIL",
  "INLAND_WATER",
  "MULTIMODAL",
]);

/** Shape of a single leg in the POST body. */
interface MultimodalLegInput {
  transportMode: string;
  originPort: string;
  destPort: string;
  vesselName?: string;
  vesselImo?: string;
  awbNumber?: string;
  flightNumber?: string;
  airportOfDeparture?: string;
  airportOfDestination?: string;
  cmrNumber?: string;
  truckLicensePlate?: string;
  trailerLicensePlate?: string;
  railConsignmentNote?: string;
  trainNumber?: string;
  wagonNumber?: string;
  carrierGtid?: string;
  etd?: string;
  eta?: string;
}

/** Create one Shipment row per leg, linked into a chain. */
async function createChain(
  ustn: string,
  tradeId: string,
  legs: MultimodalLegInput[],
) {
  const created: any[] = [];
  let parentShipmentId: string | null = null;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const sequence = i + 1;
    const data: any = {
      tradeId,
      ustn,
      sequence,
      legSequence: sequence,
      parentShipmentId,
      transportMode: leg.transportMode,
      originPort: leg.originPort,
      destPort: leg.destPort,
      vesselName: leg.vesselName || null,
      vesselImo: leg.vesselImo || null,
      awbNumber: leg.awbNumber || null,
      flightNumber: leg.flightNumber || null,
      airportOfDeparture: leg.airportOfDeparture || null,
      airportOfDestination: leg.airportOfDestination || null,
      cmrNumber: leg.cmrNumber || null,
      truckLicensePlate: leg.truckLicensePlate || null,
      trailerLicensePlate: leg.trailerLicensePlate || null,
      railConsignmentNote: leg.railConsignmentNote || null,
      trainNumber: leg.trainNumber || null,
      wagonNumber: leg.wagonNumber || null,
      carrierGtid: leg.carrierGtid || null,
      etd: leg.etd ? new Date(leg.etd) : null,
      eta: leg.eta ? new Date(leg.eta) : null,
      status: "PLANNED",
    };

    const shipment = await db.shipment.create({ data });
    created.push(shipment);
    parentShipmentId = shipment.id;
  }

  return created;
}

/**
 * POST /api/sgtx/execution/multimodal
 * Creates a multimodal shipment chain. Returns the created legs in order.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      ustn?: string;
      tradeId?: string;
      legs?: MultimodalLegInput[];
    } | null;

    if (!body) {
      return NextResponse.json(
        { error: "invalid JSON body" },
        { status: 400 },
      );
    }
    if (!body.ustn || !body.tradeId || !Array.isArray(body.legs)) {
      return NextResponse.json(
        { error: "missing required fields (ustn, tradeId, legs[])" },
        { status: 400 },
      );
    }
    if (body.legs.length === 0) {
      return NextResponse.json(
        { error: "at least one leg required" },
        { status: 400 },
      );
    }
    for (const [i, leg] of body.legs.entries()) {
      if (!leg.transportMode || !VALID_MODES.has(leg.transportMode)) {
        return NextResponse.json(
          {
            error: `leg ${i + 1}: invalid transportMode "${leg.transportMode}"`,
          },
          { status: 400 },
        );
      }
      if (!leg.originPort || !leg.destPort) {
        return NextResponse.json(
          { error: `leg ${i + 1}: originPort and destPort required` },
          { status: 400 },
        );
      }
    }

    // Validate the trade exists.
    const trade = await db.trade.findUnique({
      where: { ustn: body.ustn },
      select: { id: true, ustn: true },
    });
    if (!trade || trade.id !== body.tradeId) {
      return NextResponse.json(
        { error: "trade not found for ustn/tradeId" },
        { status: 404 },
      );
    }

    const created = await createChain(
      body.ustn,
      body.tradeId,
      body.legs,
    );

    // Publish a Brain decision event so the orchestrator's learning loop,
    // shadow pipeline, and dataset collector all capture this multimodal
    // shipment chain creation even though the operation itself is dispatched
    // directly by the lib. Wrapped in try/catch so a publish failure never
    // breaks the main op.
    try {
      await eventBus.publish(
        "brain.decision.made",
        "execution.multimodal-create",
        {
          capability: "execution.multimodal-create",
          inputSummary: {
            ustn: body.ustn,
            tradeId: body.tradeId,
            legCount: created.length,
            modes: body.legs.map((l) => l.transportMode),
          },
          success: true,
          timestamp: Date.now(),
        },
        { source: "execution-multimodal-route" },
      );
    } catch (publishErr) {
      logger.warn("[multimodal POST] brain.decision.made publish failed", {
        error: publishErr instanceof Error ? publishErr.message : String(publishErr),
      });
    }

    return NextResponse.json(
      {
        ok: true,
        ustn: body.ustn,
        tradeId: body.tradeId,
        legCount: created.length,
        chain: created,
      },
      { status: 201 },
    );
  } catch (e: any) {
    logger.error("[multimodal POST]", e);
    return NextResponse.json(
      { error: e?.message || "internal_error" },
      { status: 500 },
    );
  }
}
