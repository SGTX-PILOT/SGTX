// @ts-nocheck
// §2 Provider Relationship — GET single relationship
// GET /api/sgtx/transport/providers/relationships/[id]
import { NextResponse } from "next/server";
import { getProviderRelationship } from "@/lib/sgtx/provider-relationship";
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
    const relationship = await getProviderRelationship(id);
    if (!relationship) {
      return NextResponse.json(
        { error: "relationship not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ relationship });
  } catch (err: any) {
    logger.error("[api/transport/providers/relationships/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
