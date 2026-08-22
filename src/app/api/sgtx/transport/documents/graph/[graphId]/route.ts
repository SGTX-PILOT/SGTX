// @ts-nocheck
// §5 Transport Documents — all documents for a graph (direct + via legs).
// GET /api/sgtx/transport/documents/graph/[graphId]
import { NextResponse } from "next/server";
import { getDocumentsForGraph } from "@/lib/sgtx/transport-documents";
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
    const documents = await getDocumentsForGraph(graphId);
    return NextResponse.json({ documents });
  } catch (err: any) {
    logger.error("[api/transport/documents/graph/[graphId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
