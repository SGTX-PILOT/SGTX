// @ts-nocheck
// GET /api/sgtx/air/bookings/{id} — fetch an air booking.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "booking id required" }, { status: 400 });
    }
    const booking = await db.airCargoBooking.findUnique({ where: { id } });
    if (!booking) {
      return NextResponse.json({ error: "booking not found" }, { status: 404 });
    }
    const hydrated = {
      ...booking,
      specialHandling: (() => { try { return booking.specialHandling ? JSON.parse(booking.specialHandling) : []; } catch { return []; } })(),
      deliveryWindow: (() => { try { return booking.deliveryWindow ? JSON.parse(booking.deliveryWindow) : null; } catch { return null; } })(),
    };
    return NextResponse.json({ booking: hydrated });
  } catch (err: any) {
    logger.error("[api/air/bookings/[id]] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
