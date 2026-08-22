// @ts-nocheck
// §5 Guarantees — call (draw on the guarantee). Body: { callAmountUsd, callReason }
// POST /api/sgtx/finance/guarantees/[id]/call
import { NextResponse } from "next/server";
import { callGuarantee } from "@/lib/sgtx/guarantee-engine";
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
    if (!(Number(body?.callAmountUsd) > 0)) {
      return NextResponse.json(
        { error: "callAmountUsd must be positive" },
        { status: 400 },
      );
    }
    if (!body?.callReason) {
      return NextResponse.json(
        { error: "callReason required" },
        { status: 400 },
      );
    }
    const guarantee = await callGuarantee(
      id,
      Number(body.callAmountUsd),
      body.callReason,
    );
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]/call] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
