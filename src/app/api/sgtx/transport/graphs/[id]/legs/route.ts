// @ts-nocheck
// §1 Transport Graph — add a leg to a graph
// POST /api/sgtx/transport/graphs/[id]/legs  body: AddLegInput (without graphId)
import { NextResponse } from "next/server";
import { addLeg } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "graph id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.mode || !body.originLocation) {
      return NextResponse.json(
        { error: "mode and originLocation are required" },
        { status: 400 },
      );
    }
    const leg = await addLeg(id, body);
    if (leg && leg.ok === false) {
      const status = leg.error === "GRAPH_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: leg.error }, { status });
    }
    return NextResponse.json({ leg });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]/legs] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
