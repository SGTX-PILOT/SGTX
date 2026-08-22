// @ts-nocheck
// §1 Transport Graph — GET single (include legs)
// GET /api/sgtx/transport/graphs/[id]
import { NextResponse } from "next/server";
import { getTransportGraph } from "@/lib/sgtx/transport-graph";
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
    const graph = await getTransportGraph(id, true);
    if (!graph) {
      return NextResponse.json({ error: "graph not found" }, { status: 404 });
    }
    return NextResponse.json({ graph });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
