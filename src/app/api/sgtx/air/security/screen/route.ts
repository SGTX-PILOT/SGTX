// @ts-nocheck
// POST /api/sgtx/air/security/screen
// Body: { shipmentId, ustn?, screeningType, facility, operator, result }
// Records a security screening event. Promotes shipment securityStatus.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordSecurityScreening } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.shipmentId && !body?.ustn) {
      return NextResponse.json(
        { error: "shipmentId or ustn required" },
        { status: 400 },
      );
    }
    if (!body?.screeningType || !body?.facility || !body?.operator || !body?.result) {
      return NextResponse.json(
        { error: "screeningType, facility, operator, result are required" },
        { status: 400 },
      );
    }

    const result = await recordSecurityScreening({
      shipmentId: body.shipmentId,
      ustn: body.ustn,
      screeningType: body.screeningType,
      facility: body.facility,
      operator: body.operator,
      result: body.result,
    });

    if (!result?.ok) {
      return NextResponse.json(
        { error: result?.error || "screening failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({ record: result.record });
  } catch (err: any) {
    logger.error("[api/air/security/screen] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
