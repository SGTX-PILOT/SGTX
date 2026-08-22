// @ts-nocheck
// §3 Returns — GET by database id
// GET /api/sgtx/completion/returns/[id]
import { NextResponse } from "next/server";
import { getReturn } from "@/lib/sgtx/returns";
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
    const record = await getReturn(id);
    if (!record) {
      return NextResponse.json({ error: "return not found" }, { status: 404 });
    }
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
