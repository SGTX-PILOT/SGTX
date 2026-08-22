// @ts-nocheck
// §2 Trade Finance — settle case
// POST /api/sgtx/finance/cases/[id]/settle
import { NextResponse } from "next/server";
import { settleCase } from "@/lib/sgtx/trade-finance";
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
    const financingCase = await settleCase(id);
    return NextResponse.json({ case: financingCase });
  } catch (err: any) {
    logger.error("[api/finance/cases/[id]/settle] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
