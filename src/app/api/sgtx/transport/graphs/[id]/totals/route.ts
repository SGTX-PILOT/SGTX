// @ts-nocheck
// §1 Transport Graph — estimated totals
// GET /api/sgtx/transport/graphs/[id]/totals
import { NextResponse } from "next/server";
import { computeEstimatedTotals } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "graph id required" }, { status: 400 });
    }
    const totals = await computeEstimatedTotals(id);
    return NextResponse.json({ totals });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]/totals] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
