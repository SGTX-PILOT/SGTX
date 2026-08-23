// @ts-nocheck
// §67 Obligation Graph — get the full dependency graph for a USTN
// GET /api/sgtx/constitutional/obligations/graph?ustn=X
import { NextResponse } from "next/server";
import { getDependencyGraph } from "@/lib/sgtx/obligation-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const graph = await getDependencyGraph(ustn);
    return NextResponse.json({
      graph,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
    });
  } catch (err: any) {
    logger.error("[api/constitutional/obligations/graph] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
