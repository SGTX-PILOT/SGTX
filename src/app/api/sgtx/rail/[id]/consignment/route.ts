// @ts-nocheck
// POST /api/sgtx/rail/[id]/consignment — create a CIM/SMGS consignment note
// against a rail booking.
//
// Body: { consignmentNoteNumber: "CIM-...", noteType?: "CIM"|"SMGS",
//        shipper?: string, consignee?: string, goodsDescription?: string,
//        hsCode?: string, grossWeightKg?: number, packageCount?: number,
//        specialConditions?: string[] }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createConsignment, CONSIGNMENT_NOTE_TYPES } from "@/lib/sgtx/rail";

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
    const result = await createConsignment({ ...body, bookingId: id });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (e: any) {
    logger.error("[rail/[id]/consignment/POST] failed", { error: e?.message || String(e) });
    return NextResponse.json({ ok: false, error: e?.message || "Internal server error" }, { status: 500 });
  }
}

export { CONSIGNMENT_NOTE_TYPES };
