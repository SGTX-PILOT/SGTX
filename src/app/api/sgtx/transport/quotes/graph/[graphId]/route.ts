// @ts-nocheck
// §3 Logistics Quote V2 — list all quotes for a graph.
// GET /api/sgtx/transport/quotes/graph/[graphId]
import { NextResponse } from "next/server";
import { getQuotesForGraph } from "@/lib/sgtx/logistics-quote-v2";
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
    const quotes = await getQuotesForGraph(graphId);
    return NextResponse.json({ quotes });
  } catch (err: any) {
    logger.error("[api/transport/quotes/graph/[graphId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
