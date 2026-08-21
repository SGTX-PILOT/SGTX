// @ts-nocheck
// POST /api/sgtx/air/bookings/{id}/cancel
// Cancels a booking. Body: { reason? }
// Allowed from: REQUESTED | QUOTED | HELD | CONFIRMED | WAITLISTED.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "booking id required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const booking = await db.airCargoBooking.findUnique({ where: { id } });
    if (!booking) {
      return NextResponse.json({ error: "booking not found" }, { status: 404 });
    }
    if (booking.status === "CANCELLED") {
      return NextResponse.json({ booking, alreadyCancelled: true });
    }
    const allowedCurrent = ["REQUESTED", "QUOTED", "HELD", "CONFIRMED", "WAITLISTED"];
    if (!allowedCurrent.includes(booking.status)) {
      return NextResponse.json(
        { error: `cannot cancel booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    const updated = await db.airCargoBooking.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });
    logger.info("[api/air/bookings/[id]/cancel] cancelled", {
      bookingId: id,
      reason: body?.reason,
    });
    return NextResponse.json({
      booking: updated,
      reason: body?.reason || null,
    });
  } catch (err: any) {
    logger.error("[api/air/bookings/[id]/cancel] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
