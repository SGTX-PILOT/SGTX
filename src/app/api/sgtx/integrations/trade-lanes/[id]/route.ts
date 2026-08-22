// @ts-nocheck
// §9 Trade Lane Readiness — GET by DB id
// GET /api/sgtx/integrations/trade-lanes/[id]
import { NextResponse } from "next/server";
import { getTradeLaneReadiness } from "@/lib/sgtx/trade-lane-readiness";
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
    const lane = await getTradeLaneReadiness(id);
    if (!lane) {
      // Fall back to lookup by laneId (TLR-YYYYMMDD-NNNNN).
      const { getTradeLaneByLane } = await import(
        "@/lib/sgtx/trade-lane-readiness"
      );
      const byLane = await getTradeLaneByLane(id);
      if (!byLane) {
        return NextResponse.json(
          { error: "trade lane not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ lane: byLane });
    }
    return NextResponse.json({ lane });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/trade-lanes/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
