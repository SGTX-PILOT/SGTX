// @ts-nocheck
// POST /api/sgtx/rail/[id]/transit — create a transit segment with customs
// guarantee against a rail booking.
//
// Body: { originTerminal?: string, destinationTerminal?: string,
//        transitCountries?: string[], transitGuaranteeType?: "TIR"|"CIM"|"BANK_GUARANTEE"|"CUSTOMS_BOND",
//        guaranteeReference?: string, startedAt?: Date, completedAt?: Date, status?: string }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createTransitSegment, TRANSIT_GUARANTEE_TYPES } from "@/lib/sgtx/rail";

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
    const result = await createTransitSegment({ ...body, bookingId: id });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/[id]/transit/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export { TRANSIT_GUARANTEE_TYPES };
