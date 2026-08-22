// @ts-nocheck
// §4 Landed Cost — latest breakdown for a graph
// GET /api/sgtx/transport/landed-cost/graph/[graphId]
import { NextResponse } from "next/server";
import { getLandedCostByGraph } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ graphId: string }> },
) {
  try {
    const { graphId } = await params;
    if (!graphId) {
      return NextResponse.json(
        { error: "graphId required" },
        { status: 400 },
      );
    }
    const breakdown = await getLandedCostByGraph(graphId);
    if (!breakdown) {
      return NextResponse.json(
        { error: "breakdown not found for graph" },
        { status: 404 },
      );
    }
    return NextResponse.json({ breakdown });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/graph/[graphId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
