import { NextRequest, NextResponse } from "next/server";
import { createBooking } from "@/lib/sgtx/tcn/vessel-schedule";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * POST /api/sgtx/tcn/vessel-schedules/book
 *
 * Body:
 *   { scheduleId, ustn, cargoDetails: { items?, type?, shipperGtid?, trailerSlots?, vehicleSlots?, reeferSlots?, note? } }
 *
 * Creates a RoRo booking on the specified vessel schedule, linked to the USTN.
 * Checks capacity before confirming. Returns a BookingConfirmation with the
 * booking reference, vessel name, ETD/ETA, ports, and slot allocation.
 */
export async function POST(req: NextRequest) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const { scheduleId, ustn, cargoDetails } = body as {
      scheduleId?: string;
      ustn?: string;
      cargoDetails?: {
        items?: number;
        type?: string;
        shipperGtid?: string;
        trailerSlots?: number;
        vehicleSlots?: number;
        reeferSlots?: number;
        note?: string;
      };
    };

    if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const confirmation = await createBooking(scheduleId, ustn, cargoDetails || {});
    return NextResponse.json({ ok: true, ...confirmation });
  } catch (e: any) {
    const status = /not found|Insufficient|not allowed/i.test(e.message) ? 400 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
