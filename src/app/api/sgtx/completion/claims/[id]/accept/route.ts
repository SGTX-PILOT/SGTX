// @ts-nocheck
// §2 Claims — accept (UNDER_REVIEW → ACCEPTED). Body: { resolutionAmountUsd, notes }
// POST /api/sgtx/completion/claims/[id]/accept
import { NextResponse } from "next/server";
import { acceptClaim } from "@/lib/sgtx/claim";
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
    if (body.resolutionAmountUsd == null || isNaN(Number(body.resolutionAmountUsd))) {
      return NextResponse.json(
        { error: "resolutionAmountUsd must be a number" },
        { status: 400 },
      );
    }
    const claim = await acceptClaim(
      id,
      Number(body.resolutionAmountUsd),
      body.notes,
    );
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]/accept] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
