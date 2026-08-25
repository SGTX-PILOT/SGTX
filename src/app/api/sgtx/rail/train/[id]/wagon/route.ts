// @ts-nocheck
// POST /api/sgtx/rail/train/[id]/wagon — add a wagon to a train.
//
// Body: { wagonNumber: "W-001", wagonType?: "FLAT"|"BOX"|"TANK"|"HOPPER"|"REFRIGERATED",
//        tareWeightKg?: number, maxPayloadKg?: number, lengthM?: number,
//        positionInTrain?: number, bookingId?: string, status?: string }
//
// If bookingId is supplied, the wagon is created with status="LOADED"
// (the assignWagonToBooking lib function is NOT called here — callers
// wanting to also record a LOADED status event should call
// /api/sgtx/rail/[bookingId]/status separately).

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { addWagon, WAGON_TYPES } from "@/lib/sgtx/rail";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "Missing id path parameter" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const result = await addWagon({ ...body, trainId: id });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/train/[id]/wagon/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export { WAGON_TYPES };
