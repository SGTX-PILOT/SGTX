// @ts-nocheck
// POST /api/sgtx/roro/unit/[id]/inspection — record a pre-load / post-discharge / claim inspection.
//
// Body (any subset):
//   { inspectionType: "PRE_LOAD"|"POST_DISCHARGE"|"CLAIM",
//     inspectorName?, inspectionTime?, mileage?, fuelLevel?, batteryLevel?,
//     keysPresent?, tireCondition?, glassCondition?, mirrorCondition?,
//     exteriorCondition?, interiorCondition?,
//     preExistingDamage?: [{location, description, severity}],
//     newDamage?: [{location, description, severity}],
//     photos?: [url], videos?: [url],
//     aiDamageAssessment?: {...} }
//
// Per Art 67: the `aiDamageAssessment` field stores A2 POSSIBLE_DAMAGE outputs
// separately from the human-confirmed `newDamage` array. The AI never determines
// liability; only an authorized inspector's `newDamage` entries are authoritative.
//
// Returns:
//   { inspection: {...} } | { error: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordInspection } from "@/lib/sgtx/roro";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing unit id" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const inspection = await recordInspection(id, body);
    if (!inspection) {
      return NextResponse.json(
        { error: "Failed to record inspection — see server logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ inspection }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/sgtx/roro/unit/[id]/inspection POST] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
