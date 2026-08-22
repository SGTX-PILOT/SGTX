// @ts-nocheck
// §6 Insurance — GET single lifecycle by database id
// GET /api/sgtx/finance/insurance/[id]
import { NextResponse } from "next/server";
import { getInsuranceLifecycle } from "@/lib/sgtx/insurance-lifecycle";
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
    const lifecycle = await getInsuranceLifecycle(id);
    if (!lifecycle) {
      return NextResponse.json(
        { error: "insurance lifecycle not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
