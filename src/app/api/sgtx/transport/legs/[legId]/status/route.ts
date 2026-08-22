// @ts-nocheck
// §1 Transport Leg — update leg status
// POST /api/sgtx/transport/legs/[legId]/status  body: { newStatus, actualDeparture?, actualArrival? }
import { NextResponse } from "next/server";
import { updateLegStatus } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.newStatus) {
      return NextResponse.json(
        { error: "newStatus required" },
        { status: 400 },
      );
    }
    const actualDeparture = body.actualDeparture
      ? new Date(body.actualDeparture)
      : undefined;
    const actualArrival = body.actualArrival
      ? new Date(body.actualArrival)
      : undefined;
    const result = await updateLegStatus(
      legId,
      body.newStatus,
      actualDeparture,
      actualArrival,
    );
    if (result && result.ok === false) {
      const status = result.error === "LEG_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error, detail: result }, { status });
    }
    return NextResponse.json({ leg: result });
  } catch (err: any) {
    logger.error("[api/transport/legs/[legId]/status] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
