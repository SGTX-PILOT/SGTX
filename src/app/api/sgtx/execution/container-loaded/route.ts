// 3B.6.3 — Manual container loaded confirmation (or check multisensor consensus)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, actorGtid, sensorData } = body;
    if (!shipmentId || !actorGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 });

    // Check if already exists
    const existing = await db.milestone.findFirst({ where: { shipmentId, type: "CONTAINER_LOADED" } });
    if (existing) return NextResponse.json({ error: "Container already loaded milestone exists", existingId: existing.id }, { status: 400 });

    const milestone = await db.milestone.create({
      data: {
        shipmentId, ustn: shipment.ustn, sequence: 2,
        type: "CONTAINER_LOADED", label: "Container sealed & loaded (manual confirm)",
        status: "CONFIRMED", actorGtid, confirmedAt: new Date(),
        sensorData: sensorData ? JSON.stringify(sensorData) : null,
      },
    });
    await db.shipment.update({ where: { id: shipmentId }, data: { status: "LOADED" } });
    return NextResponse.json({ ok: true, milestoneId: milestone.id });
  } catch (e: any) {
    console.error("[execution/container-loaded]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
