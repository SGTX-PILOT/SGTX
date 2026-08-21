// @ts-nocheck
// §2 Provider Relationship — update relationship status
// POST /api/sgtx/transport/providers/relationships/[id]/status  body: { newStatus }
import { NextResponse } from "next/server";
import { updateProviderRelationshipStatus } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.newStatus) {
      return NextResponse.json(
        { error: "newStatus required" },
        { status: 400 },
      );
    }
    const result = await updateProviderRelationshipStatus(id, body.newStatus);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "update failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ relationship: result });
  } catch (err: any) {
    logger.error(
      "[api/transport/providers/relationships/[id]/status] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
