// @ts-nocheck
// §3 LC Lifecycle — GET by database id
// GET /api/sgtx/finance/lc-lifecycles/[id]
import { NextResponse } from "next/server";
import { getLcLifecycle } from "@/lib/sgtx/lc-engine";
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
    const lifecycle = await getLcLifecycle(id);
    if (!lifecycle) {
      return NextResponse.json(
        { error: "lc lifecycle not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
