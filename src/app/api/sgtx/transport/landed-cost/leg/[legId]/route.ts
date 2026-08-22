// @ts-nocheck
// §4 Landed Cost — breakdowns for a leg
// GET /api/sgtx/transport/landed-cost/leg/[legId]
import { NextResponse } from "next/server";
import { getLandedCostByLeg } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const breakdowns = await getLandedCostByLeg(legId);
    return NextResponse.json({ breakdowns });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/leg/[legId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
