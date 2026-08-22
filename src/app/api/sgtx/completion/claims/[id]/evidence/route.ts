// @ts-nocheck
// §2 Claims — add evidence. Body: { evidence }
// POST /api/sgtx/completion/claims/[id]/evidence
import { NextResponse } from "next/server";
import { addEvidence } from "@/lib/sgtx/claim";
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
    if (!body.evidence) {
      return NextResponse.json(
        { error: "evidence required" },
        { status: 400 },
      );
    }
    const claim = await addEvidence(id, body.evidence);
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]/evidence] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
