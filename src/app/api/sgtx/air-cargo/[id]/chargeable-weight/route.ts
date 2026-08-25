// @ts-nocheck
// GET /api/sgtx/air-cargo/[id]/chargeable-weight
//
// Computes the chargeable weight for a booking (max of actual gross weight
// and volumetric weight per IATA standard) and persists the result to the
// AirChargeableWeight table (upsert by bookingId).
//
// Query params:
//   ?ratePerKg=12.50   optional rate per kg for total charge calculation
//   ?currency=USD      optional currency (default USD)
//
// Response: { ok, ...weightFields, explanation }

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { calculateChargeableWeight } from "@/lib/sgtx/air-cargo";

export const dynamic = "force-dynamic";

export async function GET(
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
    const url = new URL(req.url);
    const rateParam = url.searchParams.get("ratePerKg");
    const currency = url.searchParams.get("currency") || undefined;
    const ratePerKg = rateParam != null ? parseFloat(rateParam) : undefined;

    const result = await calculateChargeableWeight(bookingId, { ratePerKg, currency });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[air-cargo/[id]/chargeable-weight] error", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Internal server error",
        actualWeightKg: 0,
        volumetricWeightKg: 0,
        chargeableWeightKg: 0,
        pieceCount: 0,
      },
      { status: 500 },
    );
  }
}
