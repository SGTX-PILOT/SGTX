// @ts-nocheck
// §4 Landed Cost — compute landed cost from all available sources.
// POST /api/sgtx/transport/landed-cost/compute  body: LandedCostInput
import { NextResponse } from "next/server";
import { computeLandedCost } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    // At least one source identifier should be provided.
    if (
      !body.ustn &&
      !body.tradeId &&
      !body.graphId &&
      !body.legId &&
      !body.quoteId
    ) {
      return NextResponse.json(
        {
          error:
            "at least one of ustn, tradeId, graphId, legId, or quoteId is required",
        },
        { status: 400 },
      );
    }
    const result = await computeLandedCost(body);
    if (!result || !result.breakdown) {
      return NextResponse.json(
        { error: "computeLandedCost returned no breakdown", result },
        { status: 500 },
      );
    }
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/compute] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
