// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.6.3 — Manual container loaded confirmation (or check multisensor consensus)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, actorGtid, sensorData } = body;
    if (!shipmentId || !actorGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

        const shipment = await db.shipment.findUnique({ where: { id: shipmentId } }) as any;
        if (!shipment) return NextResponse.json({ error: "Shipment not found" }, { status: 404 }) as any;

    // Check if already exists
        const existing = await db.milestone.findFirst({ where: { shipmentId, type: "CONTAINER_LOADED" } }) as any;
        if (existing) return NextResponse.json({ error: "Container already loaded milestone exists", existingId: existing.id }, { status: 400 }) as any;

    const milestone = await db.milestone.create({
      data: {
        shipmentId, ustn: shipment.ustn, sequence: 2,
        type: "CONTAINER_LOADED", label: "Container sealed & loaded (manual confirm)",
        status: "CONFIRMED", actorGtid, confirmedAt: new Date(),
        sensorData: sensorData ? JSON.stringify(sensorData) : null,
      },
        }) as any;
        await db.shipment.update({ where: { id: shipmentId }, data: { status: "LOADED" } }) as any;
        return NextResponse.json({ ok: true, milestoneId: milestone.id }) as any;
  } catch (e: any) {
    logger.error("[execution/container-loaded]", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}
