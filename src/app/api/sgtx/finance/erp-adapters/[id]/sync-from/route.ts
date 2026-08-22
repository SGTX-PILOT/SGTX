// @ts-nocheck
// §8 ERP Adapters — sync from ERP. Body: { categories? }
// POST /api/sgtx/finance/erp-adapters/[id]/sync-from
import { NextResponse } from "next/server";
import { syncFromErp } from "@/lib/sgtx/erp-adapter";
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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const categories = Array.isArray(body?.categories) ? body.categories : undefined;
    const result = await syncFromErp(id, categories);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters/[id]/sync-from] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
