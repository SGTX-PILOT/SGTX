// @ts-nocheck
// GET  /api/sgtx/roro/[id]/unit — list units in a RoRo shipment
// POST /api/sgtx/roro/[id]/unit — add a RoRo unit (VIN-level) to a shipment
//
// Body (POST):
//   { vin?, unitType?, make?, model?, year?, registrationNumber?, weightKg?,
//     lengthCm?, widthCm?, heightCm?, fuelType?, batteryCharged?,
//     runningStatus?, hsCode?, originCountry?, destinationCountry? }
//
// Returns:
//   GET  → { units: [...], count: N }
//   POST → { unit: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { addRoRoUnit } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }
    const units = await (db as any).roRoUnit.findMany({
      where: { shipmentId: id },
      orderBy: { createdAt: "asc" },
      include: {
        yard: true,
        inspections: { orderBy: { inspectionTime: "desc" }, take: 5 },
        gateEvents: { orderBy: { eventTime: "desc" }, take: 5 },
      },
    });
    return NextResponse.json({ units: units || [], count: units?.length || 0 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/[id]/unit GET] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const unit = await addRoRoUnit(id, body);
    if (!unit) {
      return NextResponse.json(
        { error: "Failed to add RoRo unit — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ unit }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/[id]/unit POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
