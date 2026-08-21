// @ts-nocheck
// POST /api/sgtx/air/bookings/{id}/confirm
// Confirms a booking: transitions status REQUESTED -> CONFIRMED (or WAITLISTED -> CONFIRMED).
// Generates a bookingReference if none is set. Records confirmedAt timestamp.
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
    const allowedCurrent = ["REQUESTED", "QUOTED", "HELD", "WAITLISTED"];
    if (!allowedCurrent.includes(booking.status)) {
      return NextResponse.json(
        { error: `cannot confirm booking in status ${booking.status}` },
        { status: 400 },
      );
    }
    const bookingReference =
      booking.bookingReference ||
      body?.bookingReference ||
      `BK-${Date.now().toString(36).toUpperCase()}`;
    const updated = await db.airCargoBooking.update({
      where: { id },
      data: {
        status: "CONFIRMED",
        bookingReference,
        confirmedAt: new Date(),
      },
    });
    logger.info("[api/air/bookings/[id]/confirm] confirmed", {
      bookingId: id,
      bookingReference,
    });
    return NextResponse.json({ booking: updated });
  } catch (err: any) {
    logger.error("[api/air/bookings/[id]/confirm] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
