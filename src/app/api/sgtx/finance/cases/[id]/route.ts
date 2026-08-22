// @ts-nocheck
// §2 Trade Finance — GET single case by database id
// GET /api/sgtx/finance/cases/[id]
import { NextResponse } from "next/server";
import { getFinancingCase } from "@/lib/sgtx/trade-finance";
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
    const financingCase = await getFinancingCase(id);
    if (!financingCase) {
      return NextResponse.json(
        { error: "case not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ case: financingCase });
  } catch (err: any) {
    logger.error("[api/finance/cases/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
