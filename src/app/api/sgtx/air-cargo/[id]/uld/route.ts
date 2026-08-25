// @ts-nocheck
// POST /api/sgtx/air-cargo/[id]/uld — register / assign a ULD to a booking
//
// Body:
//   { uldNumber: "AKE12345MS", uldType: "AKE", pieceIds?: string[], tareWeightKg?, maxPayloadKg? }
//
// Upserts the ULD by uldNumber. If the ULD already exists, attaches it to the
// booking and overwrites its `contents` JSON with the new pieceIds array.
//
// Response: { ok, uld }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { assignUld, ULD_TYPES } from "@/lib/sgtx/air-cargo";

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
    if (!body?.uldNumber || !body?.uldType) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields: uldNumber, uldType",
          validUldTypes: ULD_TYPES,
        },
        { status: 400 },
      );
    }
    const result = await assignUld(
      bookingId,
      String(body.uldNumber),
      String(body.uldType).toUpperCase(),
      Array.isArray(body.pieceIds) ? body.pieceIds : [],
      {
        tareWeightKg: body?.tareWeightKg,
        maxPayloadKg: body?.maxPayloadKg,
      },
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 200 },
      );
    }
    return NextResponse.json({ ok: true, uld: result.uld });
  } catch (e: any) {
    logger.error("[air-cargo/[id]/uld] error", { error: e?.message || String(e) });
    return NextResponse.json(
      { ok: false, error: e?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
