// @ts-nocheck
// §8 ERP Adapters — health
// GET /api/sgtx/finance/erp-adapters/[id]/health
import { NextResponse } from "next/server";
import { getErpHealth } from "@/lib/sgtx/erp-adapter";
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
    const health = await getErpHealth(id);
    return NextResponse.json({ health });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters/[id]/health] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
