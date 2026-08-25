// @ts-nocheck
// POST /api/sgtx/road-corridor/shipment/[id]/border-crossing — record a border crossing event
//
// Blueprint v13.1 FINAL — Articles 43 + 44. A border crossing represents the
// physical arrival + customs clearance at a country boundary (e.g. Egypt→Jordan
// at Nuweiba/Aqaba, Jordan→Saudi at Haditha, Saudi→UAE at Al-Batha).
//
// Side-effects in the lib:
//   • If shipment was IN_TRANSIT and the border arrives → auto AT_BORDER
//   • If shipment was AT_BORDER and the border clears → auto CLEARED

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { recordBorderCrossing } from "@/lib/sgtx/road-corridor/mvp";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing shipment id" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    if (!body?.borderName || !body?.country) {
      return NextResponse.json(
        { error: "borderName and country are required" },
        { status: 400 },
      );
    }
    const border = await recordBorderCrossing(id, body);
    if (!border) {
      return NextResponse.json(
        { error: "Failed to record border crossing (invalid crossingType or DB error)" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, border }, { status: 201 });
  } catch (e: any) {
    logger.error("[api/road-corridor/shipment/[id]/border-crossing] POST failed", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
