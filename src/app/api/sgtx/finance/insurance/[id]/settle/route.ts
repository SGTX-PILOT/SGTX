// @ts-nocheck
// §6 Insurance — settle claim. Body: { settlementAmountUsd }
// POST /api/sgtx/finance/insurance/[id]/settle
import { NextResponse } from "next/server";
import { settleClaim } from "@/lib/sgtx/insurance-lifecycle";
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
    if (!(Number(body?.settlementAmountUsd) >= 0)) {
      return NextResponse.json(
        { error: "settlementAmountUsd must be non-negative" },
        { status: 400 },
      );
    }
    const lifecycle = await settleClaim(id, Number(body.settlementAmountUsd));
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/settle] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
