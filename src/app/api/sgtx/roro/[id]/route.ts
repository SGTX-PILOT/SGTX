// @ts-nocheck
// GET /api/sgtx/roro/[id] — fetch a RoRoShipment with all relations
// (units, bookings, yard, gate events, inspections, B/Ls).
//
// Returns:
//   { shipment: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getRoRoShipment } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing shipment id" },
        { status: 400 },
      );
    }
    const shipment = await getRoRoShipment(id);
    if (!shipment) {
      return NextResponse.json(
        { error: "RoRo shipment not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ shipment });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/[id] GET] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
