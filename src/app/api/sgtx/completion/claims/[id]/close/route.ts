// @ts-nocheck
// §2 Claims — close (terminal → closed). No body.
// POST /api/sgtx/completion/claims/[id]/close
import { NextResponse } from "next/server";
import { closeClaim } from "@/lib/sgtx/claim";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const claim = await closeClaim(id);
    return NextResponse.json({ claim });
  } catch (err: any) {
    logger.error("[api/completion/claims/[id]/close] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
