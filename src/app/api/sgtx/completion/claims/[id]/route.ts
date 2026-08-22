// @ts-nocheck
// §2 Claims — GET by database id
// GET /api/sgtx/completion/claims/[id]
import { NextResponse } from "next/server";
import { getClaim } from "@/lib/sgtx/claim";
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
    const claim = await getClaim(id);
    if (!claim) {
      return NextResponse.json({ error: "claim not found" }, { status: 404 });
    }
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
