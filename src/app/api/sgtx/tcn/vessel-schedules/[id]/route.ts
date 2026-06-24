import { NextRequest, NextResponse } from "next/server";
import { getSchedule, checkCapacity } from "@/lib/sgtx/tcn/vessel-schedule";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

/**
 * GET /api/sgtx/tcn/vessel-schedules/[id]
 *
 * Returns a single RoRo vessel schedule (by scheduleId or Prisma id) plus
 * its current capacity breakdown (trailer / vehicle / reefer slots still
 * available after confirmed bookings).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await featureGateResponse("roro_corridors");
  if (gate) return gate;

  try {
    const { id } = await params;
    const schedule = await getSchedule(id);
    if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    const capacity = await checkCapacity(schedule.scheduleId);
    return NextResponse.json({ ok: true, schedule, capacity });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
