// @ts-nocheck
// §4 Post-Clearance — reject (IN_REVIEW → REJECTED). Body: { reason }
// POST /api/sgtx/completion/post-clearance/[id]/reject
import { NextResponse } from "next/server";
import { rejectAction } from "@/lib/sgtx/post-clearance";
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
    const action = await rejectAction(id, body.reason);
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/[id]/reject] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
