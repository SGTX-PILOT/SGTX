// @ts-nocheck
// POST /api/sgtx/air/dg/validate
// Body: { unNumber, dgClass, division?, packingGroup?, quantity, unit,
//         packageType?, aircraftType?, airline?, origin, destination }
// Validates a DG declaration against IATA DGR rules.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateDangerousGoods } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.unNumber || !body?.dgClass) {
      return NextResponse.json(
        { error: "unNumber and dgClass required" },
        { status: 400 },
      );
    }
    const result = validateDangerousGoods({
      unNumber: body.unNumber,
      dgClass: body.dgClass,
      division: body.division,
      packingGroup: body.packingGroup,
      quantity: Number(body.quantity) || 0,
      unit: body.unit,
      packageType: body.packageType,
      aircraftType: body.aircraftType,
      airline: body.airline,
      origin: body.origin,
      destination: body.destination,
    });
    logger.info("[api/air/dg/validate] POST validated", {
      un: body.unNumber,
      valid: result.valid,
      stage: result.stage,
      issueCount: result.issues.length,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/air/dg/validate] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
