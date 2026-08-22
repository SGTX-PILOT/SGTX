// @ts-nocheck
// §4 Landed Cost — GET breakdown by id
// GET /api/sgtx/transport/landed-cost/[id]
import { NextResponse } from "next/server";
import { getLandedCostBreakdown } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const breakdown = await getLandedCostBreakdown(id);
    if (!breakdown) {
      return NextResponse.json(
        { error: "breakdown not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ breakdown });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
