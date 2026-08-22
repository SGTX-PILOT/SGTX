// @ts-nocheck
// §9 Trade Lane Readiness — GET by laneId (TLR-YYYYMMDD-NNNNN)
// GET /api/sgtx/integrations/trade-lanes/by-lane-id/[laneId]
import { NextResponse } from "next/server";
import { getTradeLaneByLane } from "@/lib/sgtx/trade-lane-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ laneId: string }> },
) {
  try {
    const { laneId } = await params;
    if (!laneId) {
      return NextResponse.json({ error: "laneId required" }, { status: 400 });
    }
    const lane = await getTradeLaneByLane(laneId);
    if (!lane) {
      return NextResponse.json(
        { error: "trade lane not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ lane });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/trade-lanes/by-lane-id/[laneId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
