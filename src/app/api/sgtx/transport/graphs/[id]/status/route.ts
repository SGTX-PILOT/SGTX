// @ts-nocheck
// §1 Transport Graph — transition graph status
// POST /api/sgtx/transport/graphs/[id]/status  body: { newStatus }
import { NextResponse } from "next/server";
import { transitionGraphStatus } from "@/lib/sgtx/transport-graph";
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
    if (!body?.newStatus) {
      return NextResponse.json(
        { error: "newStatus required" },
        { status: 400 },
      );
    }
    const result = await transitionGraphStatus(id, body.newStatus);
    if (result && result.ok === false) {
      const status = result.error === "GRAPH_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: result.error, detail: result }, { status });
    }
    return NextResponse.json({ graph: result });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]/status] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
