// @ts-nocheck
// GET  /api/sgtx/road-corridor/vehicle — list vehicles (filter by ownerGtid)
// POST /api/sgtx/road-corridor/vehicle — register a vehicle
//
// Blueprint v13.1 FINAL — Article 46 (Road Vehicle Authorization). Validates
// vehicle registration, capacity, insurance, roadworthiness, DG/reefer capability.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  registerVehicle,
  listVehicles,
} from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ownerGtid = url.searchParams.get("ownerGtid") || undefined;
    const vehicles = await listVehicles(ownerGtid);
    return NextResponse.json({ vehicles, count: vehicles.length });
  } catch (e: any) {
    logger.error("[api/road-corridor/vehicle] GET list failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const vehicle = await registerVehicle(body || {});
    if (!vehicle) {
      return NextResponse.json(
        { error: "Failed to register vehicle (check required fields: vehicleRegistration, vehicleType [TRUCK|TRAILER|TRACTOR])" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, vehicle }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor/vehicle] POST register failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
