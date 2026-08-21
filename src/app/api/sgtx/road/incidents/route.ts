// @ts-nocheck
// POST /api/sgtx/road/incidents
// Body: { ustn, corridorId?, incidentType, description?, lat?, lng?, vehicleId?,
//         driverId?, severity?, photoHashes?, iotData?, governmentReferences?,
//         insuranceInfo?, aiEscalationLevel? }
// Creates a road incident (RoadIncident model).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "ACCIDENT",
  "BREAKDOWN",
  "CARGO_DAMAGE",
  "THEFT",
  "DRIVER_DETENTION",
  "CUSTOMS_SEIZURE",
  "SEAL_TAMPERING",
  "BORDER_CLOSURE",
  "EXTREME_WEATHER",
  "TEMPERATURE_EXCURSION",
  "ROUTE_DEVIATION",
  "DOCUMENTATION_PROBLEM",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn || !body?.incidentType) {
      return NextResponse.json(
        { error: "ustn and incidentType required" },
        { status: 400 },
      );
    }
    if (!VALID_TYPES.has(String(body.incidentType).toUpperCase())) {
      return NextResponse.json(
        { error: `invalid incidentType: ${body.incidentType}` },
        { status: 400 },
      );
    }
    const incident = await db.roadIncident.create({
      data: {
        ustn: body.ustn,
        corridorId: body.corridorId || null,
        incidentType: String(body.incidentType).toUpperCase(),
        description: body.description || null,
        latitude: body.lat ?? body.latitude ?? null,
        longitude: body.lng ?? body.longitude ?? null,
        vehicleId: body.vehicleId || null,
        driverId: body.driverId || null,
        severity: (body.severity || "MEDIUM").toUpperCase(),
        status: "OPEN",
        photoHashes: body.photoHashes ? JSON.stringify(body.photoHashes) : null,
        iotData: body.iotData ? JSON.stringify(body.iotData) : null,
        governmentReferences: body.governmentReferences
          ? JSON.stringify(body.governmentReferences)
          : null,
        insuranceInfo: body.insuranceInfo
          ? JSON.stringify(body.insuranceInfo)
          : null,
        aiEscalationLevel: body.aiEscalationLevel || null,
      },
    });
    logger.info("[api/road/incidents] POST created", {
      incidentId: incident.id,
      ustn: body.ustn,
      type: body.incidentType,
    });
    return NextResponse.json({ incident });
  } catch (err: any) {
    logger.error("[api/road/incidents] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
