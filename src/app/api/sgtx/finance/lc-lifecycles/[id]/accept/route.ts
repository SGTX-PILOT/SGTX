// @ts-nocheck
// §3 LC Lifecycle — accept LC (DISCREPANCY/ACCEPTANCE → ACCEPTED)
// POST /api/sgtx/finance/lc-lifecycles/[id]/accept
import { NextResponse } from "next/server";
import { acceptLc } from "@/lib/sgtx/lc-engine";
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
    const lifecycle = await acceptLc(id);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles/[id]/accept] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
