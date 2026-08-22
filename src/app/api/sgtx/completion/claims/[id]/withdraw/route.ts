// @ts-nocheck
// §2 Claims — withdraw (any non-terminal → WITHDRAWN). Body: { reason }
// POST /api/sgtx/completion/claims/[id]/withdraw
import { NextResponse } from "next/server";
import { withdrawClaim } from "@/lib/sgtx/claim";
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
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const claim = await withdrawClaim(id, body.reason);
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]/withdraw] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
