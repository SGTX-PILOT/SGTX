// @ts-nocheck
// §1 Transport Graph — progress summary
// GET /api/sgtx/transport/graphs/[id]/progress
import { NextResponse } from "next/server";
import { getGraphProgress } from "@/lib/sgtx/transport-graph";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "graph id required" }, { status: 400 });
    }
    const progress = await getGraphProgress(id);
    return NextResponse.json({ progress });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]/progress] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
