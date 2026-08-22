// @ts-nocheck
// §9 Trade Lane Readiness — blockers for a lane
// GET /api/sgtx/integrations/trade-lanes/[id]/blockers
// Treats the URL param as a laneId (TLR-YYYYMMDD-NNNNN) since getLaneBlockers
// internally looks up by laneId. Falls back gracefully if not found.
import { NextResponse } from "next/server";
import { getLaneBlockers } from "@/lib/sgtx/trade-lane-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "laneId required" }, { status: 400 });
    }
    const blockers = await getLaneBlockers(id);
    return NextResponse.json({ laneId: id, blockers, count: blockers.length });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/trade-lanes/[id]/blockers] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
