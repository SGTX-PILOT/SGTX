// @ts-nocheck
// §4 Post-Clearance — file appeal. Body: { reason }
// Creates a NEW APPEAL action linked back to the original via customsOperationId.
// POST /api/sgtx/completion/post-clearance/[id]/appeal
import { NextResponse } from "next/server";
import { fileAppeal } from "@/lib/sgtx/post-clearance";
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
    const action = await fileAppeal(id, body.reason);
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/[id]/appeal] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
