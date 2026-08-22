// @ts-nocheck
// §4 Post-Clearance — review (OPEN → IN_REVIEW). Body: { reviewer }
// POST /api/sgtx/completion/post-clearance/[id]/review
import { NextResponse } from "next/server";
import { reviewAction } from "@/lib/sgtx/post-clearance";
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
    const action = await reviewAction(id, body.reviewer);
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/[id]/review] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
