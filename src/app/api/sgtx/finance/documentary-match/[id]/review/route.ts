// @ts-nocheck
// §4 Documentary Matching — review match. Body: { reviewedBy, notes? }
// POST /api/sgtx/finance/documentary-match/[id]/review
import { NextResponse } from "next/server";
import { reviewMatch } from "@/lib/sgtx/documentary-matching";
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
    if (!body?.reviewedBy) {
      return NextResponse.json(
        { error: "reviewedBy required" },
        { status: 400 },
      );
    }
    const match = await reviewMatch(id, body.reviewedBy, body.notes || undefined);
    return NextResponse.json({ match });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match/[id]/review] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
