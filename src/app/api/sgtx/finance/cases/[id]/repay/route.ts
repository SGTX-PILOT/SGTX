// @ts-nocheck
// §2 Trade Finance — repay. Body: { amountUsd }
// POST /api/sgtx/finance/cases/[id]/repay
import { NextResponse } from "next/server";
import { repay } from "@/lib/sgtx/trade-finance";
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
    if (!(Number(body?.amountUsd) > 0)) {
      return NextResponse.json(
        { error: "amountUsd must be positive" },
        { status: 400 },
      );
    }
    const financingCase = await repay(id, Number(body.amountUsd));
    return NextResponse.json({ case: financingCase });
  } catch (err: any) {
    logger.error("[api/finance/cases/[id]/repay] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
