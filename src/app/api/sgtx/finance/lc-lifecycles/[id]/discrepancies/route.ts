// @ts-nocheck
// §3 LC Lifecycle — record discrepancies. Body: { discrepancies }
// POST /api/sgtx/finance/lc-lifecycles/[id]/discrepancies
import { NextResponse } from "next/server";
import { recordDiscrepancies } from "@/lib/sgtx/lc-engine";
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
    if (!Array.isArray(body?.discrepancies)) {
      return NextResponse.json(
        { error: "discrepancies must be an array" },
        { status: 400 },
      );
    }
    const lifecycle = await recordDiscrepancies(id, body.discrepancies);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error(
      "[api/finance/lc-lifecycles/[id]/discrepancies] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
