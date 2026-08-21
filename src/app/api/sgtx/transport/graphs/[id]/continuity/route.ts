// @ts-nocheck
// §1 Transport Graph — validate continuity
// GET /api/sgtx/transport/graphs/[id]/continuity
import { NextResponse } from "next/server";
import { validateGraphContinuity } from "@/lib/sgtx/transport-graph";
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
    const continuity = await validateGraphContinuity(id);
    return NextResponse.json({ continuity });
  } catch (err: any) {
    logger.error("[api/transport/graphs/[id]/continuity] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
