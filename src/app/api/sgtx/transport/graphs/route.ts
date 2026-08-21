// @ts-nocheck
// §1 Transport Graph — list (GET) + create (POST)
// GET  /api/sgtx/transport/graphs?status=X&primaryMode=Y&isMultimodal=true&ustn=Z&tradeId=W
// POST /api/sgtx/transport/graphs  body: CreateGraphInput
import { NextResponse } from "next/server";
import { listTransportGraphs, createTransportGraph } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const primaryMode = url.searchParams.get("primaryMode") || undefined;
    const isMultimodalRaw = url.searchParams.get("isMultimodal");
    const ustn = url.searchParams.get("ustn") || undefined;
    const tradeId = url.searchParams.get("tradeId") || undefined;
    const filters: any = {};
    if (status) filters.status = status;
    if (primaryMode) filters.primaryMode = primaryMode;
    if (isMultimodalRaw !== null) {
      filters.isMultimodal = isMultimodalRaw === "true";
    }
    if (ustn) filters.ustn = ustn;
    if (tradeId) filters.tradeId = tradeId;
    const graphs = await listTransportGraphs(filters);
    return NextResponse.json({ graphs });
  } catch (err: any) {
    logger.error("[api/transport/graphs] GET failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const graph = await createTransportGraph(body);
    if (graph && graph.ok === false) {
      return NextResponse.json(
        { error: graph.error || "createTransportGraph failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ graph });
  } catch (err: any) {
    logger.error("[api/transport/graphs] POST failed", { error: err?.message });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
