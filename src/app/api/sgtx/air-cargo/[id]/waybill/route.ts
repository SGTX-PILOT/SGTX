// @ts-nocheck
// POST /api/sgtx/air-cargo/[id]/waybill — create a MAWB / HAWB for a booking
//
// Body:
//   { waybillType: "MAWB"|"HAWB", shipper?, consignee?, waybillNumber? }
//
// If waybillNumber is omitted, an 11-digit IATA AWB number is generated
// (with mod-11 check digit). For MAWB the booking's mawbNumber field is also
// stamped (best-effort).
//
// Response: { ok, waybill }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createAirWaybill, WAYBILL_TYPES } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json(
        { ok: false, error: "Missing booking id path parameter" },
        { status: 400 },
      );
    }
    const body = await req.json();
    const waybillType = body?.waybillType;
    if (!waybillType) {
      return NextResponse.json(
        { ok: false, error: "Missing required field: waybillType", valid: WAYBILL_TYPES },
        { status: 400 },
      );
    }
    const result = await createAirWaybill(
      bookingId,
      String(waybillType).toUpperCase(),
      body?.shipper,
      body?.consignee,
      body?.waybillNumber,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, waybill: result.waybill });
  } catch (e: any) {
    logger.error("[air-cargo/[id]/waybill] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
