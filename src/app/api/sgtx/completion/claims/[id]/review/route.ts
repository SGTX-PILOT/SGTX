// @ts-nocheck
// §2 Claims — review (OPEN → UNDER_REVIEW). Body: { reviewer }
// POST /api/sgtx/completion/claims/[id]/review
import { NextResponse } from "next/server";
import { reviewClaim } from "@/lib/sgtx/claim";
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.reviewer) {
      return NextResponse.json(
        { error: "reviewer required" },
        { status: 400 },
      );
    }
    const claim = await reviewClaim(id, body.reviewer);
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]/review] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
