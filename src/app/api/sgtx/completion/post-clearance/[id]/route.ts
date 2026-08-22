// @ts-nocheck
// §4 Post-Clearance Actions — GET by database id
// GET /api/sgtx/completion/post-clearance/[id]
import { NextResponse } from "next/server";
import { getAction } from "@/lib/sgtx/post-clearance";
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
    const action = await getAction(id);
    if (!action) {
      return NextResponse.json(
        { error: "post-clearance action not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ action });
  } catch (err: any) {
    logger.error("[api/completion/post-clearance/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
