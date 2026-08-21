// @ts-nocheck
// POST /api/sgtx/road/borders/{id}/arrive
// Body: { corridorId, gps: { lat, lng } }
// Records border arrival (§16). Updates corridor status to ARRIVED_BORDER.
import { NextRequest, NextResponse } from "next/server";
import { recordBorderArrival } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "border id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.corridorId || !body?.gps?.lat || !body?.gps?.lng) {
      return NextResponse.json(
        { error: "corridorId and gps.{lat,lng} required" },
        { status: 400 },
      );
    }
    const result = await recordBorderArrival(body.corridorId, id, body.gps);
    return NextResponse.json({ borderId: id, ...result });
  } catch (err: any) {
    logger.error("[api/road/borders/[id]/arrive] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
