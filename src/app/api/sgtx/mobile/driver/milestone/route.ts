// @ts-nocheck
// SGTX v17 §16.8.12 — LSP Driver App · milestone confirm endpoint
// POST /api/sgtx/mobile/driver/milestone
//   body: {
//     shipmentId: string,
//     milestone: string,                // PICKUP|LOADING|DEPARTURE|IN_TRANSIT|ARRIVAL|CUSTOMS_CLEARANCE|DELIVERY
//     location: { lat: number, lng: number, accuracy?: number },
//     photoHash?: string,               // SHA-256 of attached photo
//     driverGtid?: string               // for audit-trail (confirmedByGtid)
//   }
//   → 200 { ok, confirmed: boolean, nextMilestone?: { type, label, sequence }, reason?: string }

import { NextRequest, NextResponse } from "next/server";
import { confirmMilestone } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const { shipmentId, milestone, location, photoHash, driverGtid } = body;
    if (!shipmentId || !milestone) {
      return NextResponse.json(
        { ok: false, error: "shipmentId + milestone required" },
        { status: 400 },
      );
    }
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return NextResponse.json(
        { ok: false, error: "location.lat + location.lng required" },
        { status: 400 },
      );
    }
    const result = await confirmMilestone(
      String(shipmentId),
      String(milestone).toUpperCase(),
      location,
      photoHash ? String(photoHash) : undefined,
      driverGtid ? String(driverGtid) : undefined,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("mobile.driver.milestone.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "confirm failed" }, { status: 500 });
  }
}
