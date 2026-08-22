// @ts-nocheck
// §3 LC Lifecycle — waive discrepancy. Body: { discrepancyIndex, waivedBy }
// POST /api/sgtx/finance/lc-lifecycles/[id]/waive-discrepancy
import { NextResponse } from "next/server";
import { waiveDiscrepancy } from "@/lib/sgtx/lc-engine";
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
    if (body?.discrepancyIndex == null) {
      return NextResponse.json(
        { error: "discrepancyIndex required" },
        { status: 400 },
      );
    }
    if (!body?.waivedBy) {
      return NextResponse.json(
        { error: "waivedBy required" },
        { status: 400 },
      );
    }
    const lifecycle = await waiveDiscrepancy(
      id,
      Number(body.discrepancyIndex),
      body.waivedBy,
    );
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error(
      "[api/finance/lc-lifecycles/[id]/waive-discrepancy] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
